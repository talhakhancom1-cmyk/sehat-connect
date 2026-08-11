import { base44 } from '@/api/base44Client';

const ACCESS_WINDOW_DAYS = 7;
const ACCESS_WINDOW_MS = ACCESS_WINDOW_DAYS * 24 * 60 * 60 * 1000;

/**
 * Check if record access has expired for a given appointment date.
 * Access expires 7 days after the appointment date.
 */
export function isAccessExpired(appointmentDate) {
  if (!appointmentDate) return true;
  const apptDate = new Date(appointmentDate);
  const now = new Date();
  return (now.getTime() - apptDate.getTime()) > ACCESS_WINDOW_MS;
}

/**
 * Days remaining until record access expires for a given appointment date.
 * Returns 0 if already expired.
 */
export function daysUntilExpiry(appointmentDate) {
  if (!appointmentDate) return null;  // null = no expiry date available
  const apptDate = new Date(appointmentDate);
  if (isNaN(apptDate.getTime())) return null;  // invalid date string
  const now = new Date();
  const elapsed = now.getTime() - apptDate.getTime();
  const remaining = ACCESS_WINDOW_MS - elapsed;
  return Math.max(0, Math.ceil(remaining / (24 * 60 * 60 * 1000)));
}

/**
 * Async check: does a doctor have active access to a patient's records?
 * Requires a confirmed or completed appointment within the last 7 days.
 *
 * @returns { hasAccess, hasExpired, activeAppointment, expiredAppointment }
 */
export async function checkRecordAccess(doctorId, patientName) {
  try {
    const appointments = await base44.entities.Appointment.filter({
      doctor_id: doctorId,
      patient_name: patientName,
    });

    // 1. Consent-based access (preferred). Match the patient by user id, not name.
    const patientUserId = appointments.find(a => a.patient_id)?.patient_id;
    if (patientUserId) {
      const consents = await base44.entities.Consent.filter({
        recipient_user_id: doctorId,
        patient_id: patientUserId,
        status: 'active',
      });
      const now = Date.now();
      const activeConsent = consents.find(c => !c.expires_at || new Date(c.expires_at).getTime() > now);
      if (activeConsent) {
        const eligibleAppt = appointments.find(a => ['confirmed', 'completed'].includes(a.status));
        return {
          hasAccess: true,
          hasExpired: false,
          activeAppointment: eligibleAppt || null,
          expiredAppointment: null,
          consent: activeConsent,
          accessReason: 'consent',
        };
      }
    }

    // 2. Fallback: existing 7-day appointment-window logic (unchanged)
    const eligible = appointments.filter(a =>
      ['confirmed', 'completed'].includes(a.status)
    );

    if (eligible.length === 0) {
      return { hasAccess: false, hasExpired: false, activeAppointment: null, expiredAppointment: null };
    }

    eligible.sort((a, b) => new Date(b.appointment_date) - new Date(a.appointment_date));

    const active = eligible.find(a => !isAccessExpired(a.appointment_date));
    const expired = eligible.find(a => isAccessExpired(a.appointment_date));

    return {
      hasAccess: !!active,
      hasExpired: !active && !!expired,
      activeAppointment: active,
      expiredAppointment: expired,
    };
  } catch {
    return { hasAccess: false, hasExpired: false, activeAppointment: null, expiredAppointment: null };
  }
}

/**
 * Batch compute access status for all patients from an array of appointments.
 * Uses already-fetched appointment data — no additional API calls.
 *
 * @param {Array} appointments — appointments for the current doctor
 * @returns {Map<string, {hasAccess, hasExpired, activeAppointment, expiredAppointment}>}
 */
export function batchCheckAccess(appointments) {
  const result = new Map();

  const patientMap = new Map();
  appointments.forEach(a => {
    if (!a.patient_name) return;
    if (!patientMap.has(a.patient_name)) {
      patientMap.set(a.patient_name, []);
    }
    patientMap.get(a.patient_name).push(a);
  });

  patientMap.forEach((appts, patientName) => {
    const eligible = appts.filter(a => ['confirmed', 'completed'].includes(a.status));
    eligible.sort((a, b) => new Date(b.appointment_date) - new Date(a.appointment_date));

    const active = eligible.find(a => !isAccessExpired(a.appointment_date));
    const expired = eligible.find(a => isAccessExpired(a.appointment_date));

    result.set(patientName, {
      hasAccess: !!active,
      hasExpired: !active && !!expired,
      activeAppointment: active,
      expiredAppointment: expired,
    });
  });

  return result;
}