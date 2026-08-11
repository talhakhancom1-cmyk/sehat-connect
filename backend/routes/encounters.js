const express = require('express');
const { Encounter, Appointment } = require('../models');
const { authenticate } = require('../middleware/auth');
const { canAccessEncounter, canAccessAppointment } = require('../lib/ownership');

const router = express.Router({ mergeParams: true });

// Sanitizes a date-like value into a valid Date or null.
// Guards against malformed strings like "Invalid date" reaching Postgres.
function sanitizeDate(value) {
  if (value === null || value === undefined || value === '') return null;
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return null;
  return d;
}

router.get('/', authenticate, async (req, res) => {
  try {
    const encounter = await Encounter.findOne({
      where: { appointment_id: req.params.appointmentId }
    });
    if (!encounter) {
      return res.status(404).json({ error: 'Encounter not found' });
    }
    const allowed = await canAccessEncounter(encounter, req.user);
    if (!allowed) {
      return res.status(403).json({ error: 'Forbidden — you do not have access to this encounter' });
    }
    res.json(encounter);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/', authenticate, async (req, res) => {
  try {
    const appointment = await Appointment.findByPk(req.params.appointmentId);
    if (!appointment) {
      return res.status(404).json({ error: 'Appointment not found' });
    }

    const canAccess = await canAccessAppointment(appointment, req.user);
    if (!canAccess) {
      return res.status(403).json({ error: 'Forbidden — you do not have access to this appointment' });
    }

    const existing = await Encounter.findOne({
      where: { appointment_id: req.params.appointmentId }
    });
    if (existing) {
      return res.status(409).json({ error: 'Encounter already exists for this appointment' });
    }

    // Validate encounter_date from the request body — fall back to the
    // appointment's date, then to "now" so we never send a malformed
    // timestamp string to Postgres.
    const encounterDate = sanitizeDate(req.body.encounter_date)
      || sanitizeDate(appointment.appointment_date)
      || new Date();

    const encounter = await Encounter.create({
      appointment_id: req.params.appointmentId,
      patient_id: appointment.patient_id,
      patient_name: appointment.patient_name,
      patient_age: appointment.patient_age,
      patient_gender: appointment.patient_gender,
      doctor_id: appointment.doctor_id,
      doctor_name: appointment.doctor_name,
      encounter_date: encounterDate,
      encounter_type: appointment.type,
      ...req.body,
      encounter_date: encounterDate, // re-set after spread so sanitized value wins
      status: req.body.status || 'draft'
    });
    res.status(201).json(encounter);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.patch('/complete', authenticate, async (req, res) => {
  try {
    const appointment = await Appointment.findByPk(req.params.appointmentId);
    if (!appointment) {
      return res.status(404).json({ error: 'Appointment not found' });
    }

    const encounter = await Encounter.findOne({
      where: { appointment_id: req.params.appointmentId }
    });
    if (!encounter) {
      return res.status(404).json({ error: 'Encounter not found' });
    }

    const canAccess = await canAccessEncounter(encounter, req.user);
    if (!canAccess) {
      return res.status(403).json({ error: 'Forbidden — you do not have access to this encounter' });
    }

    await appointment.update({ status: 'completed' });
    await encounter.update({ status: 'completed' });
    res.json({ appointment, encounter });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;
