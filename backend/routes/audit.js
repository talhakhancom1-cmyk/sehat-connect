const express = require('express');
const { AuditEvent } = require('../models');
const { authenticate } = require('../middleware/auth');
const { ROLES } = require('../constants/ehc');
const { parseSort } = require('../lib/parseSort');

const router = express.Router();

// GET / and POST / — generic AuditEvent CRUD used by base44.entities.AuditEvent
// (the frontend maps this entity to /audit-events; this router is also mounted there).
router.get('/', authenticate, async (req, res) => {
  try {
    const { patient_id, action, target_type, actor_user_id, limit } = req.query || {};
    const where = {};
    const isAdmin = [ROLES.SUPER_ADMIN, ROLES.CLINIC_ADMIN, ROLES.COMPLIANCE_AUDITOR, ROLES.SUPPORT_AGENT].includes(req.user.role);
    if (patient_id) {
      if (patient_id !== req.user.id && !isAdmin) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      where.patient_id = patient_id;
    } else if (!isAdmin) {
      where.actor_user_id = req.user.id;
    }
    if (action) where.action = action;
    if (target_type) where.target_type = target_type;
    if (actor_user_id) where.actor_user_id = actor_user_id;

    const events = await AuditEvent.findAll({
      where,
      order: parseSort(req.query, ['created_at', 'action', 'target_type'], 'created_at', 'DESC'),
      limit: Math.min(Number(limit) || 200, 1000)
    });
    const result = events.map(e => ({ ...e.toJSON(), created_date: e.created_at }));
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/', authenticate, async (req, res) => {
  try {
    const body = req.body || {};
    const event = await AuditEvent.create({
      actor_user_id: body.actor_user_id || req.user.id,
      actor_role: body.actor_role || req.user.role,
      action: body.action,
      target_type: body.target_type || 'Unknown',
      target_id: body.target_id != null ? String(body.target_id) : 'unknown',
      patient_id: body.patient_id || null,
      detail: body.detail || null,
      before_state: body.before_state || null,
      after_state: body.after_state || null,
      consent_id: body.consent_id || null,
      actor_session_jti: req.tokenJti || null,
      actor_ip: req.ip || req.headers['x-forwarded-for'] || null,
      actor_user_agent: req.headers['user-agent'] || null,
      platform: body.platform || null
    });
    res.status(201).json({ ...event.toJSON(), created_date: event.created_at });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// GET /api/v1/audit/access-log
// Patients see who accessed their records; admins can query any patient.
router.get('/access-log', authenticate, async (req, res) => {
  try {
    const { patient_id, action, target_type, limit, offset } = req.query || {};
    const where = {};
    const isAdmin = [ROLES.SUPER_ADMIN, ROLES.CLINIC_ADMIN, ROLES.COMPLIANCE_AUDITOR, ROLES.SUPPORT_AGENT].includes(req.user.role);
    if (patient_id) {
      if (patient_id !== req.user.id && !isAdmin) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      where.patient_id = patient_id;
    } else if (!isAdmin) {
      where.patient_id = req.user.id;
    }
    if (action) where.action = action;
    if (target_type) where.target_type = target_type;

    const events = await AuditEvent.findAll({
      where,
      order: parseSort(req.query, ['created_at', 'action', 'target_type'], 'created_at', 'DESC'),
      limit: Math.min(Number(limit) || 200, 1000),
      offset: Number(offset) || 0
    });
    res.json(events);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/v1/audit/events/:id
router.get('/events/:id', authenticate, async (req, res) => {
  try {
    const event = await AuditEvent.findByPk(req.params.id);
    if (!event) return res.status(404).json({ error: 'Audit event not found' });
    const isAdmin = [ROLES.SUPER_ADMIN, ROLES.CLINIC_ADMIN, ROLES.COMPLIANCE_AUDITOR, ROLES.SUPPORT_AGENT].includes(req.user.role);
    if (event.patient_id && event.patient_id !== req.user.id && !isAdmin) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    res.json(event);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/v1/audit/actor/:actorUserId
// View actions performed by a specific actor (admin/compliance only)
router.get('/actor/:actorUserId', authenticate, async (req, res) => {
  try {
    const isAdmin = [ROLES.SUPER_ADMIN, ROLES.CLINIC_ADMIN, ROLES.COMPLIANCE_AUDITOR].includes(req.user.role);
    if (!isAdmin) return res.status(403).json({ error: 'Forbidden' });
    const events = await AuditEvent.findAll({
      where: { actor_user_id: req.params.actorUserId },
      order: parseSort(req.query, ['created_at', 'action'], 'created_at', 'DESC'),
      limit: 500
    });
    res.json(events);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
