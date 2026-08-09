const express = require('express');
const { Encounter, Appointment } = require('../models');
const { authenticate } = require('../middleware/auth');

const router = express.Router({ mergeParams: true });

router.get('/', authenticate, async (req, res) => {
  try {
    const encounter = await Encounter.findOne({
      where: { appointment_id: req.params.appointmentId }
    });
    if (!encounter) {
      return res.status(404).json({ error: 'Encounter not found' });
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

    const existing = await Encounter.findOne({
      where: { appointment_id: req.params.appointmentId }
    });
    if (existing) {
      return res.status(409).json({ error: 'Encounter already exists for this appointment' });
    }

    const encounter = await Encounter.create({
      appointment_id: req.params.appointmentId,
      patient_id: appointment.patient_id,
      patient_name: appointment.patient_name,
      patient_age: appointment.patient_age,
      patient_gender: appointment.patient_gender,
      doctor_id: appointment.doctor_id,
      doctor_name: appointment.doctor_name,
      encounter_date: appointment.appointment_date,
      encounter_type: appointment.type,
      ...req.body,
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

    await appointment.update({ status: 'completed' });
    await encounter.update({ status: 'completed' });
    res.json({ appointment, encounter });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;
