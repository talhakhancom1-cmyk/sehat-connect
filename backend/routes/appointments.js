const express = require('express');
const { Op } = require('sequelize');
const router = express.Router();
const Appointment = require('../models/Appointment');
const Doctor = require('../models/Doctor');
const { authenticate } = require('../middleware/auth');
const { ADMIN_ROLES } = require('../constants/ehc');
const { parseSort } = require('../lib/parseSort');
const { paginate, buildPaginatedResponse } = require('../lib/paginate');
const { pickFields } = require('../lib/pickFields');

// Fields that can be set on an Appointment
const APPOINTMENT_WRITABLE_FIELDS = [
  'patient_id', 'doctor_id', 'doctor_name', 'doctor_user_id',
  'patient_name', 'patient_age', 'patient_gender',
  'appointment_date', 'time_slot', 'type', 'status', 'reason', 'notes',
  'consultation_fee', 'payment_status', 'payment_method', 'symptoms'
];

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
    // Enrich each appointment with the doctor's profile picture so the frontend
    // can render the real uploaded photo (appointment.doctor_image) instead of
    // falling back to a random placeholder.
    const doctorIds = [...new Set(rows.map(a => a.doctor_id).filter(Boolean))];
    const doctors = doctorIds.length ? await Doctor.findAll({ where: { id: doctorIds } }).catch(() => []) : [];
    const doctorImageById = {};
    for (const d of doctors) doctorImageById[d.id] = d.profile_pic_url || null;
    const result = rows.map(a => ({
      ...a.toJSON(),
      doctor_image: doctorImageById[a.doctor_id] || null,
      created_date: a.created_at
    }));
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
    const doctor = appointment.doctor_id ? await Doctor.findByPk(appointment.doctor_id).catch(() => null) : null;
    res.json({ ...appointment.toJSON(), doctor_image: doctor?.profile_pic_url || null });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create new appointment — patient_id is always forced to the caller unless admin
router.post('/', authenticate, async (req, res) => {
  try {
    const body = pickFields(req.body, APPOINTMENT_WRITABLE_FIELDS);
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
    // Non-admins: the doctor can only update status/notes, never payment fields
    // (that would let a doctor fake-approve an unpaid appointment). The patient,
    // however, must be able to set payment_status/payment_method on their OWN
    // appointment — that's how PaymentDialog.jsx unblocks the doctor's confirm
    // gate after a (dummy) payment completes.
    const isPatientOwner = appointment.patient_id === req.user.id;
    const allowedFields = isAdmin(req.user)
      ? APPOINTMENT_WRITABLE_FIELDS
      : isPatientOwner
        ? ['status', 'notes', 'reason', 'symptoms', 'payment_status', 'payment_method']
        : ['status', 'notes', 'reason', 'symptoms'];
    await appointment.update(pickFields(req.body, allowedFields));
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
