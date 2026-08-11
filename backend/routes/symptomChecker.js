const express = require('express');
const { SymptomSession, Doctor, Schedule, Appointment } = require('../models');
const { Op } = require('sequelize');
const { authenticate } = require('../middleware/auth');
const { sanitizeError } = require('../lib/validate');
const { moderateContent, chatCompletion, getAiConfig } = require('../lib/openai');

const router = express.Router();

// Rate limiting: configurable via admin panel (default 10 per user per day)
const sessionCounts = new Map(); // Simple in-memory rate limiter
async function checkRateLimit(userId) {
  const { dailyCheckLimit } = await getAiConfig();
  const today = new Date().toDateString();
  const key = `${userId}:${today}`;
  const count = sessionCounts.get(key) || 0;
  if (count >= dailyCheckLimit) return false;
  sessionCounts.set(key, count + 1);
  // Clean up old entries
  for (const [k] of sessionCounts) {
    if (!k.endsWith(today)) sessionCounts.delete(k);
  }
  return true;
}

// POST /api/symptom-checker/start — start a new symptom checker session
router.post('/start', authenticate, async (req, res) => {
  try {
    // Check if symptom checker is enabled
    const { symptomCheckerEnabled, dailyCheckLimit } = await getAiConfig();
    if (!symptomCheckerEnabled) {
      return res.status(503).json({ error: 'The symptom checker is currently disabled. Please consult a doctor directly.' });
    }

    if (!(await checkRateLimit(req.user.id))) {
      return res.status(429).json({ error: `You have reached the daily limit of ${dailyCheckLimit} symptom checks. Please try again tomorrow.` });
    }

    const { message } = req.body;
    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'Please describe your symptoms.' });
    }
    if (message.length > 2000) {
      return res.status(400).json({ error: 'Please keep your description under 2000 characters.' });
    }

    // Step 1: Run moderation
    const moderation = await moderateContent(message);
    if (moderation.flagged) {
      // Check for self-harm
      if (moderation.categories?.self_harm || moderation.categories?.self_harm_intent) {
        const session = await SymptomSession.create({
          patient_id: req.user.id,
          messages: [{ role: 'patient', content: message, timestamp: new Date().toISOString() }],
          status: 'flagged_moderation',
        });
        return res.json({
          session_id: session.id,
          response: 'If you are having thoughts of self-harm, please reach out for help immediately. You can contact a mental health crisis line such as the National Suicide Prevention Lifeline at 1-800-273-8255 (US) or your local emergency services. A mental health professional can provide the support you need. This is not a medical diagnosis. Please consult a doctor for proper evaluation.',
          urgency: 'urgent',
          specialty: 'Psychiatry',
          is_final: true,
          flagged: true,
        });
      }
      // Other moderation flags — reject politely
      return res.status(400).json({ error: 'Your input was flagged by our content moderation system. Please rephrase your message in a respectful manner.' });
    }

    // Step 2: Create session
    const session = await SymptomSession.create({
      patient_id: req.user.id,
      messages: [{ role: 'patient', content: message, timestamp: new Date().toISOString() }],
      exchange_count: 1,
    });

    // Step 3: Call OpenAI
    const result = await chatCompletion(session.messages);

    // Update session with AI response
    const updatedMessages = [
      ...session.messages,
      { role: 'assistant', content: result.response, timestamp: new Date().toISOString() },
    ];
    await session.update({
      messages: updatedMessages,
      urgency_level: result.urgency,
      suggested_specialty: result.specialty,
      status: result.is_final ? 'completed' : 'active',
    });

    res.json({
      session_id: session.id,
      response: result.response,
      urgency: result.urgency,
      specialty: result.specialty,
      is_final: result.is_final,
    });
  } catch (error) {
    res.status(500).json({ error: sanitizeError(error) });
  }
});

// POST /api/symptom-checker/:sessionId/message — continue a session
router.post('/:sessionId/message', authenticate, async (req, res) => {
  try {
    const { symptomCheckerEnabled } = await getAiConfig();
    if (!symptomCheckerEnabled) {
      return res.status(503).json({ error: 'The symptom checker is currently disabled.' });
    }
    const { message } = req.body;
    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'Please enter a message.' });
    }
    if (message.length > 2000) {
      return res.status(400).json({ error: 'Please keep your message under 2000 characters.' });
    }

    const session = await SymptomSession.findByPk(req.params.sessionId);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    if (session.patient_id !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    if (session.status === 'completed') {
      return res.status(400).json({ error: 'This session is already complete. Start a new symptom check.' });
    }
    if (session.status === 'flagged_moderation') {
      return res.status(400).json({ error: 'This session has been flagged. Please start a new one.' });
    }

    // Moderate the follow-up message
    const moderation = await moderateContent(message);
    if (moderation.flagged) {
      if (moderation.categories?.self_harm || moderation.categories?.self_harm_intent) {
        await session.update({ status: 'flagged_moderation' });
        return res.json({
          session_id: session.id,
          response: 'If you are having thoughts of self-harm, please reach out for help immediately. You can contact a mental health crisis line such as the National Suicide Prevention Lifeline at 1-800-273-8255 (US) or your local emergency services. This is not a medical diagnosis. Please consult a doctor for proper evaluation.',
          urgency: 'urgent',
          specialty: 'Psychiatry',
          is_final: true,
          flagged: true,
        });
      }
      return res.status(400).json({ error: 'Your input was flagged by our content moderation system.' });
    }

    // Add patient message
    const updatedMessages = [
      ...session.messages,
      { role: 'patient', content: message, timestamp: new Date().toISOString() },
    ];

    // Call OpenAI with full conversation
    const result = await chatCompletion(updatedMessages);

    // Add AI response
    updatedMessages.push({ role: 'assistant', content: result.response, timestamp: new Date().toISOString() });

    await session.update({
      messages: updatedMessages,
      urgency_level: result.urgency,
      suggested_specialty: result.specialty,
      status: result.is_final ? 'completed' : 'active',
      exchange_count: session.exchange_count + 1,
    });

    res.json({
      session_id: session.id,
      response: result.response,
      urgency: result.urgency,
      specialty: result.specialty,
      is_final: result.is_final,
    });
  } catch (error) {
    res.status(500).json({ error: sanitizeError(error) });
  }
});

// GET /api/symptom-checker/:sessionId/doctors — get matching doctors based on triage
router.get('/:sessionId/doctors', authenticate, async (req, res) => {
  try {
    const session = await SymptomSession.findByPk(req.params.sessionId);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    if (session.patient_id !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    // If urgent, skip doctor matching
    if (session.urgency_level === 'urgent') {
      return res.json({ urgent: true, doctors: [] });
    }

    if (!session.suggested_specialty) {
      return res.json({ urgent: false, doctors: [], specialty: null });
    }

    // Find verified doctors in the suggested specialty
    const doctors = await Doctor.findAll({
      where: {
        specialty: { [Op.iLike]: session.suggested_specialty },
        verification_status: 'verified',
      },
      limit: 10,
    });

    if (doctors.length === 0) {
      return res.json({
        urgent: false,
        doctors: [],
        specialty: session.suggested_specialty,
        fallback: true,
      });
    }

    // For each doctor, find their next available slot (today + next 2 days)
    const doctorsWithSlots = [];
    for (const doctor of doctors.slice(0, 5)) {
      const nextSlot = await findNextAvailableSlot(doctor.id);
      if (nextSlot) {
        doctorsWithSlots.push({
          id: doctor.id,
          full_name: doctor.full_name,
          specialty: doctor.specialty,
          profile_pic_url: doctor.profile_pic_url,
          consultation_fee: doctor.consultation_fee,
          city: doctor.city,
          next_available_date: nextSlot.date,
          next_available_slot: nextSlot.slot,
        });
      }
    }

    // Sort by earliest availability and take top 3
    doctorsWithSlots.sort((a, b) => {
      const aTime = new Date(a.next_available_date + ' ' + a.next_available_slot);
      const bTime = new Date(b.next_available_date + ' ' + b.next_available_slot);
      return aTime - bTime;
    });

    res.json({
      urgent: false,
      doctors: doctorsWithSlots.slice(0, 3),
      specialty: session.suggested_specialty,
      fallback: doctorsWithSlots.length === 0,
    });
  } catch (error) {
    res.status(500).json({ error: sanitizeError(error) });
  }
});

// Helper: find the next available slot for a doctor (today + next 2 days)
async function findNextAvailableSlot(doctorId) {
  const { Schedule, Appointment } = require('../models');
  const dayMap = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

  const schedule = await Schedule.findOne({
    where: { doctor_id: doctorId, status: 'active' },
    order: [['updated_at', 'DESC']],
  });

  if (!schedule) return null;

  // Check today + next 2 days
  for (let dayOffset = 0; dayOffset <= 2; dayOffset++) {
    const date = new Date();
    date.setDate(date.getDate() + dayOffset);
    const dateStr = date.toISOString().slice(0, 10);
    const dayKey = dayMap[date.getDay()];

    const daySchedule = (schedule.days || []).find(d => d.day === dayKey);
    if (!daySchedule || !daySchedule.enabled) continue;

    const duration = schedule.slot_duration_minutes || 30;
    let slots = [];

    if (daySchedule.ranges && daySchedule.ranges.length > 0) {
      for (const range of daySchedule.ranges) {
        slots.push(...generateSlotsFromRange(range.start, range.end, duration));
      }
    } else {
      slots = daySchedule.slots || [];
    }

    // Filter out break slots
    const breakStart = schedule.break_start;
    const breakEnd = schedule.break_end;
    const dayBreaks = Array.isArray(schedule.day_breaks) ? schedule.day_breaks : [];
    const dayBreak = dayBreaks.find(b => b.date === dateStr);

    slots = slots.filter(slot => {
      if (isSlotInBreak(slot, breakStart, breakEnd)) return false;
      if (dayBreak && isSlotInBreak(slot, dayBreak.start, dayBreak.end)) return false;
      return true;
    });

    // Filter out booked slots
    const dayStart = new Date(dateStr + 'T00:00:00');
    const dayEnd = new Date(dateStr + 'T23:59:59');
    const bookedAppointments = await Appointment.findAll({
      where: {
        doctor_id: doctorId,
        time_slot: { [Op.in]: slots },
        status: { [Op.notIn]: ['cancelled', 'rejected'] },
        [Op.or]: [
          { appointment_date: { [Op.gte]: dayStart, [Op.lte]: dayEnd } },
          { date: { [Op.gte]: dayStart, [Op.lte]: dayEnd } },
        ],
      },
      attributes: ['time_slot'],
    });
    const bookedSlots = bookedAppointments.map(a => a.time_slot).filter(Boolean);
    const availableSlots = slots.filter(s => !bookedSlots.includes(s));

    // For today, filter out past time slots
    if (dayOffset === 0) {
      const now = new Date();
      const currentMinutes = now.getHours() * 60 + now.getMinutes();
      const availableFiltered = availableSlots.filter(slot => {
        const slotMinutes = slotToMinutes(slot);
        return slotMinutes > currentMinutes;
      });
      if (availableFiltered.length > 0) {
        return { date: dateStr, slot: availableFiltered[0] };
      }
    } else if (availableSlots.length > 0) {
      return { date: dateStr, slot: availableSlots[0] };
    }
  }

  return null;
}

// Helper functions (same as in schedules.js)
function slotToMinutes(slot) {
  if (!slot) return -1;
  const m = slot.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return -1;
  let h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  const ap = m[3].toUpperCase();
  if (ap === 'PM' && h !== 12) h += 12;
  if (ap === 'AM' && h === 12) h = 0;
  return h * 60 + min;
}

function minutesToSlot(mins) {
  let h = Math.floor(mins / 60);
  const m = mins % 60;
  const ap = h >= 12 ? 'PM' : 'AM';
  if (h > 12) h -= 12;
  if (h === 0) h = 12;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')} ${ap}`;
}

function generateSlotsFromRange(startStr, endStr, durationMin) {
  const start = slotToMinutes(startStr);
  const end = slotToMinutes(endStr);
  if (start < 0 || end < 0 || end <= start) return [];
  const slots = [];
  for (let t = start; t + durationMin <= end; t += durationMin) {
    slots.push(minutesToSlot(t));
  }
  return slots;
}

function isSlotInBreak(slot, breakStart, breakEnd) {
  if (!breakStart || !breakEnd) return false;
  const s = slotToMinutes(slot);
  const bs = slotToMinutes(breakStart);
  const be = slotToMinutes(breakEnd);
  return s >= bs && s < be;
}

module.exports = router;
