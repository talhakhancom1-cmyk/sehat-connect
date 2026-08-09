// Shared medication-lifecycle helpers used by both doctor and patient UI.

// Parse a free-form duration like "7 days", "2 weeks", "1 month" into an end date.
const parseDurationDays = (duration) => {
  if (!duration) return null;
  const m = String(duration).toLowerCase().match(/(\d+)\s*(day|week|month)/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  const unit = m[2];
  if (unit === 'day') return n;
  if (unit === 'week') return n * 7;
  if (unit === 'month') return n * 30;
  return null;
};

export const computeEndDate = (startDate, duration) => {
  const days = parseDurationDays(duration);
  if (!days || !startDate) return null;
  const d = new Date(startDate);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

// Build MedicationPlan records (one per medication) from a signed prescription.
export const plansFromPrescription = (prescription, doctor) => {
  const today = new Date().toISOString().slice(0, 10);
  return (prescription.medications || []).map(med => ({
    prescription_id: prescription.id,
    appointment_id: prescription.appointment_id || null,
    encounter_id: prescription.encounter_id || null,
    patient_id: prescription.patient_id,
    patient_name: prescription.patient_name,
    doctor_id: prescription.doctor_id,
    doctor_name: prescription.doctor_name,
    medication_name: med.name,
    dosage: med.dosage || '',
    frequency: med.frequency || '',
    route: 'oral',
    duration: med.duration || '',
    start_date: today,
    end_date: computeEndDate(today, med.duration),
    instructions: med.instructions || '',
    status: 'active',
  }));
};

// Adherence from a list of DoseEvent records.
export const computeAdherence = (doseEvents) => {
  if (!doseEvents || !doseEvents.length) return { total: 0, taken: 0, rate: null };
  const total = doseEvents.length;
  const taken = doseEvents.filter(d => d.status === 'taken').length;
  const rate = Math.round((taken / total) * 100);
  return { total, taken, rate };
};

// Is a plan still active (not discontinued, not past end date)?
export const isPlanActive = (plan) => {
  if (!plan) return false;
  if (plan.status !== 'active') return false;
  if (plan.end_date) {
    return new Date(plan.end_date) >= new Date(new Date().toISOString().slice(0, 10));
  }
  return true;
};