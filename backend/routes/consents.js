const express = require('express');
const { Op } = require('sequelize');
const { Consent, ConsentScope, ConsentEvent } = require('../models');
const { RECORD_CATEGORIES, ADMIN_ROLES } = require('../constants/ehc');
const { authenticate } = require('../middleware/auth');
const { recordAudit, auditFromRequest } = require('../lib/audit');
const { parseSort } = require('../lib/parseSort');
const { canAccessConsent, isAdmin } = require('../lib/ownership');

const router = express.Router();

const VALID_PERMISSIONS = ['view', 'download', 'print', 'add_clinical_note', 'add_prescription', 'add_verified_record', 'refer_forward'];

function normalizeCategories(categories) {
  if (!Array.isArray(categories)) return [];
  return categories.map(c => {
    const key = String(c).toLowerCase().replace(/\s+/g, '_');
    const match = RECORD_CATEGORIES.find(cat => cat.key === key || cat.key === c);
    return match ? match.key : c;
  });
}

router.get('/', authenticate, async (req, res) => {
  try {
    const where = {};
    if (req.query.status) where.status = req.query.status;

    if (isAdmin(req.user)) {
      if (req.query.patient_id) where.patient_id = req.query.patient_id;
      if (req.query.recipient_user_id) where.recipient_user_id = req.query.recipient_user_id;
    } else {
      // Non-admins only ever see consents where they are the patient (grantor) or the recipient,
      // regardless of what filter values were requested (prevents spoofing/enumeration).
      where[Op.and] = [{ [Op.or]: [{ patient_id: req.user.id }, { recipient_user_id: req.user.id }] }];
    }

    const consents = await Consent.findAll({
      where,
      order: parseSort(req.query, ['granted_at', 'created_at', 'updated_at', 'expires_at'], 'created_at', 'DESC'),
      limit: 1000
    });
    const result = consents.map(c => ({
      ...c.toJSON(),
      categories: c.categories ? JSON.parse(c.categories) : [],
      permission_set: c.permission_set ? JSON.parse(c.permission_set) : [],
      created_date: c.created_at
    }));
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/', authenticate, async (req, res) => {
  try {
    const body = req.body || {};
    if (!body.patient_id || !body.recipient_user_id) {
      return res.status(400).json({ error: 'patient_id and recipient_user_id are required' });
    }

    // Only the patient (or an admin) can grant consent on their own behalf
    if (!isAdmin(req.user) && body.patient_id !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden — patient_id must match the current user' });
    }

    const categories = normalizeCategories(body.categories);
    const permissions = Array.isArray(body.permissions)
      ? body.permissions.filter(p => VALID_PERMISSIONS.includes(p))
      : ['view'];

    const consent = await Consent.create({
      patient_id: body.patient_id,
      patient_name: body.patient_name,
      recipient_user_id: body.recipient_user_id,
      recipient_name: body.recipient_name,
      categories: JSON.stringify(categories),
      permission_set: JSON.stringify(permissions),
      date_range_start: body.date_range_start,
      date_range_end: body.date_range_end,
      granted_at: new Date(),
      expires_at: body.expires_at,
      source_appointment_id: body.source_appointment_id,
      status: 'active'
    });

    await Promise.all(
      categories.map(category =>
        Promise.all(
          permissions.map(permission =>
            ConsentScope.create({
              consent_id: consent.id,
              category_key: category,
              permission
            })
          )
        )
      )
    );

    await ConsentEvent.create({
      consent_id: consent.id,
      event_type: 'granted',
      actor_user_id: req.user.id,
      actor_role: req.user.role,
      detail: `Granted consent with categories ${categories.join(', ')}`
    });

    await recordAudit(auditFromRequest(req, {
      action: 'consent_grant',
      target_type: 'Consent',
      target_id: consent.id,
      patient_id: body.patient_id,
      detail: `Granted consent to ${body.recipient_user_id} for ${categories.join(', ')}`
    }));

    res.status(201).json(consent);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/:id/revoke', authenticate, async (req, res) => {
  try {
    const consent = await Consent.findByPk(req.params.id);
    if (!consent) {
      return res.status(404).json({ error: 'Consent not found' });
    }

    if (!canAccessConsent(consent, req.user)) {
      return res.status(403).json({ error: 'Forbidden — only the patient who granted this consent can revoke it' });
    }

    await consent.update({ status: 'revoked', revoked_at: new Date() });
    await ConsentEvent.create({
      consent_id: consent.id,
      event_type: 'revoked',
      actor_user_id: req.user.id,
      actor_role: req.user.role,
      detail: 'Consent revoked'
    });

    await recordAudit(auditFromRequest(req, {
      action: 'consent_revoke',
      target_type: 'Consent',
      target_id: consent.id,
      patient_id: consent.patient_id,
      detail: 'Consent revoked'
    }));

    res.json(consent);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;
