// Centralized appointment lifecycle state machine. Single source of truth for
// which status transitions are legal, used by both doctor and admin surfaces.

export const TRANSITIONS = {
  pending: ['confirmed', 'rejected', 'cancelled'],
  confirmed: ['in_progress', 'cancelled'],
  in_progress: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
  rejected: [],
};

export const canTransition = (current, next) =>
  (TRANSITIONS[current] || []).includes(next);

export const nextStatuses = (current) => TRANSITIONS[current] || [];

/**
 * Full validity check including the payment gate (confirmation requires paid).
 * Returns { ok: boolean, reason?: string }.
 */
export const transitionAllowed = (appointment, next) => {
  if (!appointment) return { ok: false, reason: 'No appointment' };
  if (!canTransition(appointment.status, next)) {
    return { ok: false, reason: `Cannot move from ${appointment.status} to ${next}` };
  }
  if (next === 'confirmed' && appointment.payment_status !== 'paid') {
    return { ok: false, reason: 'Patient must complete payment before confirmation' };
  }
  return { ok: true };
};