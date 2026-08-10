const express = require('express');
const { Op } = require('sequelize');
const { Encounter, Appointment, Doctor } = require('../models');
const { authenticate } = require('../middleware/auth');
const { ADMIN_ROLES } = require('../constants/ehc');
const { parseSort } = require('../lib/parseSort');

const router = express.Router();

function isAdmin(user) {
  return ADMIN_ROLES.includes(user.role);
}

// Resolves the Doctor row (if any) linked to this user, by user_id or email fallback.
async function findMyDoctorId(user) {
  const doctor = await Doctor.findOne({
    where: user.email ? { [Op.or]: [{ user_id: user.id }, { email: user.email }] } : { user_id: user.id }
  }).catch(() => null);
  return doctor ? doctor.id : null;
}

// GET /api/v1/encounters — top-level list, used by base44.entities.Encounter.filter(...)
// (the per-appointment CRUD lives at /api/appointments/:appointmentId/encounter)
router.get('/', authenticate, async (req, res) => {
  try {
    const where = {};
    if (req.query.appointment_id) where.appointment_id = req.query.appointment_id;
    if (req.query.status) where.status = req.query.status;

    if (isAdmin(req.user)) {
      if (req.query.doctor_id) where.doctor_id = req.query.doctor_id;
      if (req.query.patient_id) where.patient_id = req.query.patient_id;
    } else {
      // Non-admins only ever see encounters where they are the patient or the doctor,
      // regardless of what filter values were requested (prevents spoofing).
      const myDoctorId = await findMyDoctorId(req.user);
      const scoped = [{ patient_id: req.user.id }];
      if (myDoctorId) scoped.push({ doctor_id: myDoctorId });
      where[Op.or] = scoped;
    }

    const encounters = await Encounter.findAll({
      where,
      order: parseSort(req.query, ['encounter_date', 'created_at', 'updated_at'], 'encounter_date', 'DESC'),
      limit: 200
    });
    const result = encounters.map(e => ({ ...e.toJSON(), created_date: e.created_at }));
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id', authenticate, async (req, res) => {
  try {
    const encounter = await Encounter.findByPk(req.params.id);
    if (!encounter) return res.status(404).json({ error: 'Encounter not found' });
    if (!isAdmin(req.user)) {
      const myDoctorId = await findMyDoctorId(req.user);
      const isOwner = encounter.patient_id === req.user.id || (myDoctorId && encounter.doctor_id === myDoctorId);
      if (!isOwner) return res.status(403).json({ error: 'Forbidden' });
    }
    res.json({ ...encounter.toJSON(), created_date: encounter.created_at });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/v1/encounters — create a clinical encounter.
// The frontend (EncounterForm.jsx) calls base44.entities.Encounter.create()
// which routes here. The body includes appointment_id + clinical fields.
router.post('/', authenticate, async (req, res) => {
  try {
    const body = req.body || {};
    if (!body.appointment_id) {
      return res.status(400).json({ error: 'appointment_id is required' });
    }

    const appointment = await Appointment.findByPk(body.appointment_id);
    if (!appointment) {
      return res.status(404).json({ error: 'Appointment not found' });
    }

    // Authorization: only the doctor on this appointment (or admin) can write
    // the encounter. Patients cannot create encounters.
    if (!isAdmin(req.user)) {
      const myDoctorId = await findMyDoctorId(req.user);
      if (!myDoctorId || appointment.doctor_id !== myDoctorId) {
        return res.status(403).json({ error: 'Only the assigned doctor can create an encounter' });
      }
    }

    // Prevent duplicates — one encounter per appointment
    const existing = await Encounter.findOne({ where: { appointment_id: body.appointment_id } });
    if (existing) {
      return res.status(409).json({ error: 'Encounter already exists for this appointment', encounter: existing });
    }

    // Merge appointment defaults with body (body takes precedence for clinical fields)
    const encounter = await Encounter.create({
      appointment_id: body.appointment_id,
      patient_id: body.patient_id || appointment.patient_id,
      patient_name: body.patient_name || appointment.patient_name,
      patient_age: body.patient_age ?? appointment.patient_age ?? null,
      patient_gender: body.patient_gender || appointment.patient_gender || null,
      doctor_id: body.doctor_id || appointment.doctor_id,
      doctor_name: body.doctor_name || appointment.doctor_name,
      encounter_date: body.encounter_date || appointment.appointment_date,
      encounter_type: body.encounter_type || appointment.type || 'video',
      chief_complaint: body.chief_complaint,
      examination: body.examination,
      diagnosis: body.diagnosis,
      differential_diagnosis: body.differential_diagnosis,
      clinical_notes: body.clinical_notes,
      advice: body.advice,
      follow_up: body.follow_up,
      status: body.status || 'completed',
    });

    res.status(201).json({ ...encounter.toJSON(), created_date: encounter.created_at });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// PUT /api/v1/encounters/:id — update an encounter (e.g. edit clinical notes)
router.put('/:id', authenticate, async (req, res) => {
  try {
    const encounter = await Encounter.findByPk(req.params.id);
    if (!encounter) return res.status(404).json({ error: 'Encounter not found' });

    if (!isAdmin(req.user)) {
      const myDoctorId = await findMyDoctorId(req.user);
      if (!myDoctorId || encounter.doctor_id !== myDoctorId) {
        return res.status(403).json({ error: 'Only the assigned doctor can edit this encounter' });
      }
    }

    const allowed = ['chief_complaint', 'examination', 'diagnosis', 'differential_diagnosis',
                     'clinical_notes', 'advice', 'follow_up', 'status'];
    const updates = {};
    for (const f of allowed) {
      if (req.body[f] !== undefined) updates[f] = req.body[f];
    }
    await encounter.update(updates);
    res.json({ ...encounter.toJSON(), created_date: encounter.created_at });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;
