// Centralized audit helper — writes an AuditEvent for clinically meaningful
// reads/writes. Call this wherever the app reads or mutates clinical data
// (medical records, prescriptions, consent, encounters, health cards).
// True server-side interception of every SDK read requires the post-Base44
// migration; until then this is the authoritative app-layer audit entry point.

import { base44 } from "@/api/base44Client";
import { isAdmin, isDoctor } from "@/lib/useRole";

let _currentUser = null;

export const setAuditUser = (user) => {
  _currentUser = user || null;
};

const roleFor = (user) => {
  if (!user) return "system";
  const role = user.data?.role || user.role;
  const appRole = user.data?.app_role || user.app_role;
  if (isAdmin(role)) return "admin";
  if (isDoctor(role, appRole)) return "doctor";
  return "patient";
};

/**
 * Record a single audit event. Fire-and-forget; never throws into the calling
 * flow — a failed audit write is logged but must not break clinical UX.
 *
 * @param {object} p
 * @param {string} p.action        - one of AuditEvent.action values
 * @param {string} p.target_type   - one of AuditEvent.target_type values
 * @param {string} p.target_id     - id of the affected record
 * @param {string} [p.patient_id]  - patient whose data was touched (fast lookup)
 * @param {string} [p.detail]      - short human-readable note
 */
export const recordAudit = async ({
  action,
  target_type,
  target_id,
  patient_id,
  detail,
}) => {
  try {
    const actor = _currentUser || (await base44.auth.me().catch(() => null));
    await base44.entities.AuditEvent.create({
      action,
      target_type,
      target_id,
      patient_id: patient_id || null,
      actor_user_id: actor?.id || null,
      actor_role: roleFor(actor),
      detail: detail || null,
    });
  } catch (err) {
    // Audit must never break the clinical action it observes.
    console.warn("[audit] failed to write event", action, target_type, err?.message);
  }
};

/** Convenience: audit a clinical read (e.g. opening a patient's records). */
export const auditRead = (target_type, target_id, patient_id, detail) =>
  recordAudit({
    action: target_type === "Prescription" ? "prescription_view" : "record_view",
    target_type,
    target_id,
    patient_id,
    detail,
  });