const express = require('express');
const { Schedule, Doctor, Appointment } = require('../models');
const { Op } = require('sequelize');
const { authenticate } = require('../middleware/auth');
const { parseSort } = require('../lib/parseSort');
const { canAccessSchedule, isAdmin } = require('../lib/ownership');
const { validateNumericRange, validateTimeFormat, sanitizeError } = require('../lib/validate');

const router = express.Router();

// Convert "01:30 PM" to minutes since midnight
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

// Convert minutes since midnight to "01:30 PM" format
function minutesToSlot(mins) {
  let h = Math.floor(mins / 60);
  const m = mins % 60;
  const ap = h >= 12 ? 'PM' : 'AM';
  if (h > 12) h -= 12;
  if (h === 0) h = 12;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')} ${ap}`;
}

// Generate slots from a time range given a slot duration
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

// Check if a slot falls within a break window
function isSlotInBreak(slot, breakStart, breakEnd) {
  if (!breakStart || !breakEnd) return false;
  const s = slotToMinutes(slot);
  const bs = slotToMinutes(breakStart);
  const be = slotToMinutes(breakEnd);
  return s >= bs && s < be;
}

// GET /api/v1/schedules/available-slots?doctor_id=xxx&date=YYYY-MM-DD
// Returns available bookable slots for a specific doctor on a specific date,
// considering the doctor's schedule, breaks, and existing appointments.
router.get('/available-slots', authenticate, async (req, res) => {
  try {
    const { doctor_id, date } = req.query;
    if (!doctor_id || !date) {
      return res.status(400).json({ error: 'doctor_id and date are required' });
    }

    const schedule = await Schedule.findOne({
      where: { doctor_id, status: 'active' },
      order: [['updated_at', 'DESC']],
    });

    if (!schedule) {
      return res.json({ slots: [], schedule: null });
    }

    // Map date to day of week key
    const dayMap = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    const dayKey = dayMap[new Date(date).getDay()];

    const daySchedule = (schedule.days || []).find(d => d.day === dayKey);
    if (!daySchedule || !daySchedule.enabled) {
      return res.json({ slots: [], schedule: schedule.toJSON(), reason: 'Doctor not available on this day' });
    }

    // Get slots: either from time ranges (auto-generated) or manual slots
    const duration = schedule.slot_duration_minutes || 30;
    let slots = [];

    if (daySchedule.ranges && daySchedule.ranges.length > 0) {
      // Auto-generate from time ranges
      for (const range of daySchedule.ranges) {
        slots.push(...generateSlotsFromRange(range.start, range.end, duration));
      }
    } else {
      // Use manual slots
      slots = daySchedule.slots || [];
    }

    // Filter out break slots
    const breakStart = schedule.break_start;
    const breakEnd = schedule.break_end;
    const dayBreaks = Array.isArray(schedule.day_breaks) ? schedule.day_breaks : [];
    const dayBreak = dayBreaks.find(b => b.date === date);

    slots = slots.filter(slot => {
      if (isSlotInBreak(slot, breakStart, breakEnd)) return false;
      if (dayBreak && isSlotInBreak(slot, dayBreak.start, dayBreak.end)) return false;
      return true;
    });

    // Filter out already-booked slots
    const dayStart = new Date(date + 'T00:00:00');
    const dayEnd = new Date(date + 'T23:59:59');
    const bookedAppointments = await Appointment.findAll({
      where: {
        doctor_id,
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

    res.json({
      slots: availableSlots,
      booked_slots: bookedSlots,
      schedule: schedule.toJSON(),
      slot_duration_minutes: duration,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/v1/schedules?doctor_id=xxx
router.get('/', authenticate, async (req, res) => {
  try {
    const where = {};
    if (req.query.doctor_id) where.doctor_id = req.query.doctor_id;
    const schedules = await Schedule.findAll({
      where,
      order: parseSort(req.query, ['updated_at', 'created_at'], 'updated_at', 'DESC'),
      limit: 50
    });
    res.json(schedules);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/v1/schedules/:id
router.get('/:id', authenticate, async (req, res) => {
  try {
    const schedule = await Schedule.findByPk(req.params.id);
    if (!schedule) return res.status(404).json({ error: 'Schedule not found' });
    res.json(schedule);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/v1/schedules
router.post('/', authenticate, async (req, res) => {
  try {
    const body = req.body || {};
    if (!body.doctor_id) return res.status(400).json({ error: 'doctor_id is required' });
    // --- Server-side validation ---
    if (body.max_patients_per_day !== undefined && body.max_patients_per_day !== null && body.max_patients_per_day !== '') {
      const err = validateNumericRange(body.max_patients_per_day, 1, 100, 'max_patients_per_day');
      if (err) return res.status(400).json({ error: err });
    }
    if (body.slot_duration_minutes !== undefined && body.slot_duration_minutes !== null && body.slot_duration_minutes !== '') {
      const err = validateNumericRange(body.slot_duration_minutes, 5, 120, 'slot_duration_minutes');
      if (err) return res.status(400).json({ error: err });
    }
    if (body.break_start) {
      const err = validateTimeFormat(body.break_start, 'break_start');
      if (err) return res.status(400).json({ error: err });
    }
    if (body.break_end) {
      const err = validateTimeFormat(body.break_end, 'break_end');
      if (err) return res.status(400).json({ error: err });
    }
    // Ensure the doctor_id belongs to the current user (or admin)
    if (!isAdmin(req.user)) {
      const doctor = await Doctor.findOne({
        where: req.user.email
          ? { [Op.or]: [{ user_id: req.user.id }, { email: req.user.email }] }
          : { user_id: req.user.id }
      }).catch(() => null);
      if (!doctor || doctor.id !== body.doctor_id) {
        return res.status(403).json({ error: 'Forbidden — doctor_id must belong to the current user' });
      }
    }
    const schedule = await Schedule.create({
      doctor_id: body.doctor_id,
      doctor_name: body.doctor_name || null,
      max_patients_per_day: body.max_patients_per_day || 20,
      break_start: body.break_start || '01:00 PM',
      break_end: body.break_end || '02:00 PM',
      days: body.days || [],
      day_breaks: body.day_breaks || [],
      status: 'active'
    });
    res.status(201).json(schedule);
  } catch (error) {
    res.status(400).json({ error: sanitizeError(error) });
  }
});

// PUT /api/v1/schedules/:id
router.put('/:id', authenticate, async (req, res) => {
  try {
    const schedule = await Schedule.findByPk(req.params.id);
    if (!schedule) return res.status(404).json({ error: 'Schedule not found' });
    const allowed = await canAccessSchedule(schedule, req.user);
    if (!allowed) {
      return res.status(403).json({ error: 'Forbidden — you do not have access to this schedule' });
    }
    // --- Server-side validation (updates) ---
    const upd = req.body || {};
    if (upd.max_patients_per_day !== undefined && upd.max_patients_per_day !== null && upd.max_patients_per_day !== '') {
      const err = validateNumericRange(upd.max_patients_per_day, 1, 100, 'max_patients_per_day');
      if (err) return res.status(400).json({ error: err });
    }
    if (upd.slot_duration_minutes !== undefined && upd.slot_duration_minutes !== null && upd.slot_duration_minutes !== '') {
      const err = validateNumericRange(upd.slot_duration_minutes, 5, 120, 'slot_duration_minutes');
      if (err) return res.status(400).json({ error: err });
    }
    if (upd.break_start) {
      const err = validateTimeFormat(upd.break_start, 'break_start');
      if (err) return res.status(400).json({ error: err });
    }
    if (upd.break_end) {
      const err = validateTimeFormat(upd.break_end, 'break_end');
      if (err) return res.status(400).json({ error: err });
    }
    const updates = { ...req.body };
    delete updates.id;
    await schedule.update(updates);
    res.json(schedule);
  } catch (error) {
    res.status(400).json({ error: sanitizeError(error) });
  }
});

// DELETE /api/v1/schedules/:id
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const schedule = await Schedule.findByPk(req.params.id);
    if (!schedule) return res.status(404).json({ error: 'Schedule not found' });
    const allowed = await canAccessSchedule(schedule, req.user);
    if (!allowed) {
      return res.status(403).json({ error: 'Forbidden — you do not have access to this schedule' });
    }
    await schedule.destroy();
    res.json({ message: 'Schedule deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
