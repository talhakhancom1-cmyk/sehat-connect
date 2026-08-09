const express = require('express');
const { Op } = require('sequelize');
const { Encounter, Doctor } = require('../models');
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

module.exports = router;
