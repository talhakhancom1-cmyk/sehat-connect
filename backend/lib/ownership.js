/**
 * Shared ownership/authorization helpers used across all route files.
 *
 * These functions check whether a user has the right to access or modify
 * a specific record. They are the server-side enforcement layer — the
 * frontend hiding UI elements is NOT sufficient for security.
 *
 * Pattern: every route that returns user-specific data must call one of
 * these checks (or an inline equivalent) before sending the response.
 */

const { User, Doctor, Appointment, Conversation, Household } = require('../models');

// Admin roles that can bypass ownership checks (with caveats for medical data)
const ADMIN_ROLES = ['clinic_admin', 'support_agent', 'compliance_auditor', 'super_admin'];

function isAdmin(user) {
  return user && ADMIN_ROLES.includes(user.role);
}

function isFullAdmin(user) {
  return user && (user.role === 'super_admin' || user.role === 'clinic_admin');
}

function isDoctor(user) {
  return user && (user.role === 'doctor' || user.app_role === 'doctor');
}

/**
 * Check if a user can access an appointment.
 * Admins can access all. Patients can access their own. Doctors can access
 * appointments where they are the doctor (matched by doctor_user_id or email).
 */
async function canAccessAppointment(appointment, user) {
  if (isAdmin(user)) return true;
  if (appointment.patient_id && appointment.patient_id === user.id) return true;
  if (appointment.doctor_user_id && appointment.doctor_user_id === user.id) return true;
  // Legacy: match by doctor entity email
  if (appointment.doctor_id) {
    const doctor = await Doctor.findByPk(appointment.doctor_id).catch(() => null);
    if (doctor && (doctor.user_id === user.id || (doctor.email && user.email && doctor.email === user.email))) {
      return true;
    }
  }
  return false;
}

/**
 * Check if a user is a member of a conversation.
 * Admins can access all conversations (but support_agent is restricted from medical data).
 */
function canAccessConversation(conversation, user) {
  if (isFullAdmin(user)) return true;
  if (!conversation) return false;
  const memberIds = parseMemberIds(conversation.member_ids);
  return memberIds.includes(user.id) || conversation.patient_id === user.id || conversation.doctor_id === user.id;
}

function parseMemberIds(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  try { return JSON.parse(value) || []; } catch { return []; }
}

/**
 * Check if a user can access a medical record.
 * - The patient who owns the record can access it.
 * - A doctor who has a legitimate relationship (appointment or conversation) can access it.
 * - Full admins can access it. Support agents CANNOT (medical data restriction).
 */
async function canAccessMedicalRecord(record, user) {
  if (isFullAdmin(user)) return true;
  if (user.role === 'support_agent') return false; // Support cannot see medical data

  // Patient owns the record
  if (record.patient_id && record.patient_id === user.id) return true;

  // Doctor: check if they have a legitimate relationship with this patient
  if (isDoctor(user)) {
    // Check if there's an appointment between this doctor and the record's patient
    if (record.patient_id) {
      const hasAppointment = await Appointment.findOne({
        where: {
          patient_id: record.patient_id,
          [require('sequelize').Op.or]: [
            { doctor_user_id: user.id },
          ],
        },
      }).catch(() => null);

      if (hasAppointment) return true;

      // Also check by doctor entity email match
      const doctorEntity = await Doctor.findOne({ where: { email: user.email } }).catch(() => null);
      if (doctorEntity) {
        const hasApptByEntity = await Appointment.findOne({
          where: { patient_id: record.patient_id, doctor_id: doctorEntity.id },
        }).catch(() => null);
        if (hasApptByEntity) return true;
      }
    }
  }

  return false;
}

/**
 * Check if a user can access a health card.
 * Patient owns it. Full admins can access. Support agents cannot.
 */
function canAccessHealthCard(card, user) {
  if (isFullAdmin(user)) return true;
  if (user.role === 'support_agent') return false;
  return card.patient_id && card.patient_id === user.id;
}

/**
 * Check if a user can access a prescription.
 * Patient owns it. Prescribing doctor can access. Full admins can access. Support cannot.
 */
async function canAccessPrescription(prescription, user) {
  if (isFullAdmin(user)) return true;
  if (user.role === 'support_agent') return false;
  if (prescription.patient_id && prescription.patient_id === user.id) return true;
  if (prescription.doctor_id && isDoctor(user)) {
    // Check if this doctor is the one who prescribed it
    const doctor = await Doctor.findOne({ where: { email: user.email } }).catch(() => null);
    if (doctor && prescription.doctor_id === doctor.id) return true;
    if (prescription.doctor_user_id && prescription.doctor_user_id === user.id) return true;
  }
  return false;
}

/**
 * Check if a user can access an encounter.
 * Patient and doctor on the appointment can access. Full admins can access. Support cannot.
 */
async function canAccessEncounter(encounter, user) {
  if (isFullAdmin(user)) return true;
  if (user.role === 'support_agent') return false;
  if (encounter.appointment_id) {
    const appt = await Appointment.findByPk(encounter.appointment_id).catch(() => null);
    if (appt) return canAccessAppointment(appt, user);
  }
  if (encounter.patient_id && encounter.patient_id === user.id) return true;
  return false;
}

/**
 * Check if a user can manage a household.
 * Must be head or member of the household.
 */
async function canAccessHousehold(household, user) {
  if (isAdmin(user)) return true;
  if (!household) return false;
  if (household.head_user_ids) {
    const headIds = parseMemberIds(household.head_user_ids);
    if (headIds.includes(user.id)) return true;
  }
  if (household.member_ids) {
    const memberIds = parseMemberIds(household.member_ids);
    if (memberIds.includes(user.id)) return true;
  }
  if (household.created_by_user_id && household.created_by_user_id === user.id) return true;
  return false;
}

/**
 * Check if a user can manage a delegation.
 * The delegator can manage it. Full admins can access.
 */
function canAccessDelegation(delegation, user) {
  if (isFullAdmin(user)) return true;
  if (!delegation) return false;
  return delegation.delegator_user_id === user.id;
}

/**
 * Check if a user can manage a consent.
 * The patient who granted it can manage it. Full admins can access.
 */
function canAccessConsent(consent, user) {
  if (isFullAdmin(user)) return true;
  if (!consent) return false;
  return consent.patient_id === user.id;
}

/**
 * Check if a user can manage a schedule.
 * The doctor who owns the schedule can manage it. Admins can access.
 */
async function canAccessSchedule(schedule, user) {
  if (isAdmin(user)) return true;
  if (!schedule) return false;
  if (schedule.doctor_id && isDoctor(user)) {
    const doctor = await Doctor.findOne({ where: { email: user.email } }).catch(() => null);
    if (doctor && schedule.doctor_id === doctor.id) return true;
    if (schedule.doctor_user_id && schedule.doctor_user_id === user.id) return true;
  }
  return false;
}

/**
 * Check if a user can access a file.
 * The user who uploaded it can access. Full admins can access.
 * UploadedFile model uses `owner_id`; RecordImportFile uses `uploaded_by_user_id`.
 */
function canAccessFile(file, user) {
  if (isFullAdmin(user)) return true;
  if (!file) return false;
  return file.owner_id === user.id || file.uploaded_by_user_id === user.id;
}

module.exports = {
  isAdmin,
  isFullAdmin,
  isDoctor,
  canAccessAppointment,
  canAccessConversation,
  canAccessMedicalRecord,
  canAccessHealthCard,
  canAccessPrescription,
  canAccessEncounter,
  canAccessHousehold,
  canAccessDelegation,
  canAccessConsent,
  canAccessSchedule,
  canAccessFile,
  parseMemberIds,
};
