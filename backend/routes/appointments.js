const express = require('express');
const { Op } = require('sequelize');
const router = express.Router();
const Appointment = require('../models/Appointment');
const Doctor = require('../models/Doctor');
const { authenticate } = require('../middleware/auth');
const { ADMIN_ROLES } = require('../constants/ehc');
const { parseSort } = require('../lib/parseSort');
const { paginate, buildPaginatedResponse } = require('../lib/paginate');

function isAdmin(user) {
  return ADMIN_ROLES.includes(user.role);
}

// Returns true if the user is the patient or the doctor on this appointment (or an admin).
async function canAccessAppointment(appointment, user) {
  if (isAdmin(user)) return true;
  if (appointment.patient_id && appointment.patient_id === user.id) return true;
  if (appointment.doctor_user_id && appointment.doctor_user_id === user.id) return true;
  const doctor = await Doctor.findByPk(appointment.doctor_id).catch(() => null);
  if (doctor && (doctor.user_id === user.id || (doctor.email && user.email && doctor.email === user.email))) {
    return true;
  }
  return false;
}

// Get appointments — scoped to the requesting patient/doctor, admins see all.
// Also supports optional query filters (status, type, payment_status, date) which are
// ANDed on top of the ownership scope so a non-admin can never spoof another user's data.
router.get('/', authenticate, async (req, res) => {
  try {
    const andConditions = [];

    if (!isAdmin(req.user)) {
      // Find the Doctor row (if any) linked to this user, to also match legacy
      // appointments whose doctor_user_id wasn't populated at booking time.
      const myDoctor = await Doctor.findOne({
        where: req.user.email ? { email: req.user.email } : { user_id: req.user.id }
      }).catch(() => null);

      const ownership = [{ patient_id: req.user.id }, { doctor_user_id: req.user.id }];
      if (myDoctor) ownership.push({ doctor_id: myDoctor.id });
      andConditions.push({ [Op.or]: ownership });
    } else {
      // Admins may explicitly filter by patient_id/doctor_id.
      if (req.query.patient_id) andConditions.push({ patient_id: req.query.patient_id });
      if (req.query.doctor_id) andConditions.push({ doctor_id: req.query.doctor_id });
    }

    if (req.query.status) andConditions.push({ status: req.query.status });
    if (req.query.type) andConditions.push({ type: req.query.type });
    if (req.query.payment_status) andConditions.push({ payment_status: req.query.payment_status });

    const where = andConditions.length ? { [Op.and]: andConditions } : {};
    const { offset, limit } = paginate(req);

    const { rows, count } = await Appointment.findAndCountAll({
      where,
      order: parseSort(req.query, ['appointment_date', 'created_at', 'updated_at', 'status'], 'appointment_date', 'DESC'),
      offset,
      limit
    });
    const result = rows.map(a => ({ ...a.toJSON(), created_date: a.created_at }));
    res.json(buildPaginatedResponse(req, result, count));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get appointment by ID
router.get('/:id', authenticate, async (req, res) => {
  try {
    const appointment = await Appointment.findByPk(req.params.id);
    if (!appointment) {
      return res.status(404).json({ error: 'Appointment not found' });
    }
    if (!(await canAccessAppointment(appointment, req.user))) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    res.json(appointment);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create new appointment — patient_id is always forced to the caller unless admin
router.post('/', authenticate, async (req, res) => {
  try {
    const body = { ...req.body };
    if (!isAdmin(req.user)) {
      body.patient_id = req.user.id;
    }
    const appointment = await Appointment.create(body);
    res.status(201).json(appointment);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Update appointment — only the patient/doctor on it, or an admin
router.put('/:id', authenticate, async (req, res) => {
  try {
    const appointment = await Appointment.findByPk(req.params.id);
    if (!appointment) {
      return res.status(404).json({ error: 'Appointment not found' });
    }
    if (!(await canAccessAppointment(appointment, req.user))) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    await appointment.update(req.body);
    res.json(appointment);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Delete appointment (admin only — not used by the frontend today)
router.delete('/:id', authenticate, async (req, res) => {
  try {
    if (!isAdmin(req.user)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const appointment = await Appointment.findByPk(req.params.id);
    if (!appointment) {
      return res.status(404).json({ error: 'Appointment not found' });
    }
    await appointment.destroy();
    res.json({ message: 'Appointment deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
