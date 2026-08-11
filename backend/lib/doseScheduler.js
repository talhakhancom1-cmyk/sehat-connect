const { DoseEvent, MedicationPlan } = require('../models');
const ReminderPreference = require('../models/ReminderPreference');
const { Op } = require('sequelize');

// Parse frequency string into number of doses per day
// e.g. "twice daily" -> 2, "every 8 hours" -> 3, "once daily" -> 1, "three times daily" -> 3
function parseFrequencyPerDay(frequency) {
  if (!frequency) return 1;
  const f = frequency.toLowerCase();
  if (f.includes('once') || f.includes('1 time')) return 1;
  if (f.includes('twice') || f.includes('2 time')) return 2;
  if (f.includes('three') || f.includes('3 time')) return 3;
  if (f.includes('four') || f.includes('4 time')) return 4;
  const everyMatch = f.match(/every\s+(\d+)\s*hour/);
  if (everyMatch) return Math.floor(24 / parseInt(everyMatch[1], 10));
  return 1;
}

// Generate dose events for a medication plan
async function generateDoseEvents(plan, reminderTimes) {
  if (!plan || plan.status !== 'active') return [];

  const dosesPerDay = parseFrequencyPerDay(plan.frequency);
  const times = reminderTimes || { morning: '08:00', evening: '20:00' };

  // Map doses per day to time slots
  const timeKeys = ['morning', 'afternoon', 'evening'];
  const scheduleTimes = [];
  for (let i = 0; i < dosesPerDay && i < timeKeys.length; i++) {
    const time = times[timeKeys[i]];
    if (time) scheduleTimes.push(time);
  }
  // If more doses than configured times, spread them evenly
  while (scheduleTimes.length < dosesPerDay) {
    scheduleTimes.push('12:00'); // default noon
  }

  // Generate dose events for the next 7 days (or until end_date if sooner)
  const startDate = new Date(plan.start_date);
  const endDate = plan.end_date ? new Date(plan.end_date) : new Date(startDate.getTime() + 7 * 24 * 60 * 60 * 1000);
  const maxDate = new Date(startDate.getTime() + 7 * 24 * 60 * 60 * 1000); // Cap at 7 days
  const actualEndDate = endDate < maxDate ? endDate : maxDate;

  const events = [];
  const current = new Date(startDate);

  while (current <= actualEndDate) {
    for (const time of scheduleTimes) {
      const [hours, minutes] = time.split(':').map(Number);
      const doseTime = new Date(current);
      doseTime.setHours(hours, minutes, 0, 0);

      // Only create future doses
      if (doseTime > new Date()) {
        // Check if already exists (idempotency)
        const existing = await DoseEvent.findOne({
          where: {
            medication_plan_id: plan.id,
            patient_id: plan.patient_id,
            taken_at: doseTime,
            status: 'pending',
          },
        });
        if (!existing) {
          const event = await DoseEvent.create({
            medication_plan_id: plan.id,
            prescription_id: plan.prescription_id,
            patient_id: plan.patient_id,
            patient_name: plan.patient_name,
            doctor_id: plan.doctor_id,
            taken_at: doseTime,
            status: 'pending',
            source: 'system',
          });
          events.push(event);
        }
      }
    }
    current.setDate(current.getDate() + 1);
  }

  return events;
}

// Generate dose events for all active medication plans of a patient
async function generateDoseEventsForPatient(patientId) {
  const plans = await MedicationPlan.findAll({
    where: {
      patient_id: patientId,
      status: 'active',
      reminders_enabled: true,
    },
  });

  let pref = await ReminderPreference.findOne({ where: { patient_id: patientId } });
  const reminderTimes = pref?.reminder_times || { morning: '08:00', evening: '20:00' };

  let totalGenerated = 0;
  for (const plan of plans) {
    const events = await generateDoseEvents(plan, reminderTimes);
    totalGenerated += events.length;
  }
  return totalGenerated;
}

module.exports = { generateDoseEvents, generateDoseEventsForPatient, parseFrequencyPerDay };
