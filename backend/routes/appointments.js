const express = require('express');
const { Op } = require('sequelize');
const router = express.Router();
const Appointment = require('../models/Appointment');
const Doctor = require('../models/Doctor');
const User = require('../models/User');
const { authenticate } = require('../middleware/auth');
const { ADMIN_ROLES } = require('../constants/ehc');
const { parseSort } = require('../lib/parseSort');
const { paginate, buildPaginatedResponse } = require('../lib/paginate');
const { pickFields } = require('../lib/pickFields');
const { sendNotification } = require('../lib/notificationDispatcher');

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

// Normalize appointment_date to "YYYY-MM-DD" so the frontend always gets a
// clean calendar date regardless of how PostgreSQL/Sequelize returns the timestamp.
// The actual time of the appointment lives in the `time_slot` field.
function normalizeDate(value) {
  if (!value) return value;
  // Handle Date objects from Sequelize — use ISO string which always contains 'T'
  if (value instanceof Date) {
    return value.toISOString().split('T')[0];
  }
  const str = String(value);
  // If it's already an ISO string (contains 'T'), split on it
  if (str.includes('T')) return str.split('T')[0];
  // If it's a Date.toString() format like "Mon Aug 10 2026 00:00:00 GMT+0000",
  // parse it back to a Date and extract the ISO date
  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().split('T')[0];
  }
  // Last resort — return as-is
  return str;
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
    // Enrich each appointment with profile pictures for both the doctor and
    // the patient so the frontend can render real uploaded photos instead of
    // falling back to random placeholders.
    const doctorIds = [...new Set(rows.map(a => a.doctor_id).filter(Boolean))];
    const patientIds = [...new Set(rows.map(a => a.patient_id).filter(Boolean))];
    const [doctors, patients] = await Promise.all([
      doctorIds.length ? Doctor.findAll({ where: { id: doctorIds } }).catch(() => []) : [],
      patientIds.length ? User.findAll({ where: { id: patientIds } }).catch(() => []) : [],
    ]);
    const doctorImageById = {};
    for (const d of doctors) doctorImageById[d.id] = d.profile_pic_url || null;
    const patientImageById = {};
    for (const p of patients) patientImageById[p.id] = p.profile_pic_url || null;
    const result = rows.map(a => ({
      ...a.toJSON(),
      appointment_date: normalizeDate(a.appointment_date),
      doctor_image: doctorImageById[a.doctor_id] || null,
      patient_image: patientImageById[a.patient_id] || null,
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
    const [doctor, patient] = await Promise.all([
      appointment.doctor_id ? Doctor.findByPk(appointment.doctor_id).catch(() => null) : null,
      appointment.patient_id ? User.findByPk(appointment.patient_id).catch(() => null) : null,
    ]);
    res.json({
      ...appointment.toJSON(),
      appointment_date: normalizeDate(appointment.appointment_date),
      doctor_image: doctor?.profile_pic_url || null,
      patient_image: patient?.profile_pic_url || null,
    });
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
      body.patient_name = req.user.display_name || req.user.full_name || req.user.email || 'Patient';
    }
    // Safeguard: auto-populate doctor_user_id from the Doctor table if the
    // frontend didn't send it (e.g. legacy booking flow or missing user_id).
    // Without this, conversations can't route messages to the doctor.
    if (body.doctor_id && !body.doctor_user_id) {
      const doctor = await Doctor.findByPk(body.doctor_id).catch(() => null);
      if (doctor && doctor.user_id) {
        body.doctor_user_id = doctor.user_id;
      }
    }
    const appointment = await Appointment.create(body);

    // Notify the doctor that a new appointment was booked.
    // Include the patient's name and appointment details for context.
    if (body.doctor_user_id) {
      const io = req.app.get('io');
      sendNotification({
        user_id: body.doctor_user_id,
        type: 'appointment_update',
        title: 'New Appointment Booked',
        body: `${body.patient_name || 'A patient'} booked a ${body.type || 'video'} appointment on ${normalizeDate(appointment.appointment_date)} at ${body.time_slot || '—'}.`,
        data: {
          appointment_id: appointment.id,
          doctor_id: body.doctor_id,
          patient_id: body.patient_id,
          patient_name: body.patient_name,
          appointment_date: normalizeDate(appointment.appointment_date),
          time_slot: body.time_slot,
          type: body.type,
        },
        priority: 'high',
      }, io).catch(() => {});
    }

    res.status(201).json({ ...appointment.toJSON(), appointment_date: normalizeDate(appointment.appointment_date) });
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
    const newStatus = req.body.status;
    await appointment.update(pickFields(req.body, allowedFields));

    // If the status changed, notify the other party with context.
    if (newStatus && newStatus !== appointment._previousDataValues.status) {
      const io = req.app.get('io');
      const isDoctorUpdating = !isPatientOwner && !isAdmin(req.user);
      const recipientId = isDoctorUpdating ? appointment.patient_id : appointment.doctor_user_id;
      const actorName = isDoctorUpdating
        ? `Dr. ${appointment.doctor_name}`
        : (appointment.patient_name || 'The patient');
      const statusMessages = {
        confirmed: 'confirmed your appointment',
        cancelled: 'cancelled the appointment',
        rejected: 'rejected the appointment',
        completed: 'marked the appointment as completed',
        in_progress: 'started the consultation',
      };
      const action = statusMessages[newStatus] || `updated the appointment to ${newStatus}`;
      if (recipientId) {
        sendNotification({
          user_id: recipientId,
          type: 'appointment_update',
          title: `Appointment ${newStatus}`,
          body: `${actorName} ${action} on ${normalizeDate(appointment.appointment_date)} at ${appointment.time_slot || '—'}.`,
          data: {
            appointment_id: appointment.id,
            doctor_name: appointment.doctor_name,
            patient_name: appointment.patient_name,
            appointment_date: normalizeDate(appointment.appointment_date),
            time_slot: appointment.time_slot,
            status: newStatus,
          },
          priority: newStatus === 'cancelled' || newStatus === 'rejected' ? 'high' : 'normal',
        }, io).catch(() => {});
      }
    }

    res.json({ ...appointment.toJSON(), appointment_date: normalizeDate(appointment.appointment_date) });
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
