const { AuditEvent } = require('../models');

async function recordAudit({
  action,
  target_type,
  target_id,
  actor_user_id,
  actor_role,
  patient_id,
  detail,
  actor_session_jti,
  actor_ip,
  actor_user_agent,
  platform,
  consent_id,
  before_state,
  after_state
}) {
  try {
    return await AuditEvent.create({
      action,
      target_type,
      target_id,
      actor_user_id: actor_user_id || 'system',
      actor_role: actor_role || 'system',
      patient_id: patient_id || null,
      detail: detail || null,
      actor_session_jti: actor_session_jti || null,
      actor_ip: actor_ip || null,
      actor_user_agent: actor_user_agent || null,
      platform: platform || null,
      consent_id: consent_id || null,
      before_state: before_state || null,
      after_state: after_state || null
    });
  } catch (err) {
    console.error('[audit] failed to write event', action, target_type, err?.message);
    return null;
  }
}

function auditFromRequest(req, overrides = {}) {
  if (!req) return overrides;
  return {
    actor_user_id: req.user?.id,
    actor_role: req.user?.role,
    actor_session_jti: req.tokenJti,
    actor_ip: req.ip || req.headers?.['x-forwarded-for'],
    actor_user_agent: req.headers?.['user-agent'],
    platform: req.headers?.['x-ehc-platform'] || 'web',
    ...overrides
  };
}

module.exports = { recordAudit, auditFromRequest };
