const express = require('express');
const crypto = require('crypto');
const { IPS, IPSSourceRecord, MedicalRecord } = require('../models');
const { RECORD_CATEGORIES } = require('../constants/ehc');
const { authenticate } = require('../middleware/auth');
const { parseSort } = require('../lib/parseSort');
const { canAccessMedicalRecord, isAdmin } = require('../lib/ownership');

const router = express.Router();
const patientRouter = express.Router({ mergeParams: true });

const IPS_CATEGORY_KEYS = RECORD_CATEGORIES.map(c => c.key);

function buildSummary(patientId, patientName, records) {
  const sections = {};
  for (const key of IPS_CATEGORY_KEYS) {
    sections[key] = [];
  }
  for (const record of records) {
    const plain = record.toJSON();
    if (!sections[plain.category]) {
      sections[plain.category] = [];
    }
    sections[plain.category].push({
      id: plain.id,
      title: plain.title,
      date: plain.date,
      doctor_name: plain.doctor_name,
      hospital: plain.hospital,
      notes: plain.notes,
      provenance: plain.provenance,
      verification_status: plain.verification_status
    });
  }
  return {
    patient_id: patientId,
    patient_name: patientName,
    generated_at: new Date().toISOString(),
    sections
  };
}

patientRouter.post('/', authenticate, async (req, res) => {
  try {
    const { patientId } = req.params;
    // Ensure the caller is the patient or a doctor with a relationship (or admin)
    if (!isAdmin(req.user) && patientId !== req.user.id) {
      const allowed = await canAccessMedicalRecord({ patient_id: patientId }, req.user);
      if (!allowed) {
        return res.status(403).json({ error: 'Forbidden — you do not have access to this patient\'s records' });
      }
    }
    const body = req.body || {};
    const categories = Array.isArray(body.categories) && body.categories.length > 0
      ? body.categories
      : IPS_CATEGORY_KEYS;

    const records = await MedicalRecord.findAll({
      where: { patient_id: patientId, category: categories },
      order: [['date', 'DESC']]
    });

    const lastVersion = await IPS.findOne({
      where: { patient_id: patientId },
      order: [['version', 'DESC']]
    });
    const nextVersion = lastVersion ? lastVersion.version + 1 : 1;

    const summary = buildSummary(patientId, body.patient_name || null, records);

    const ips = await IPS.create({
      patient_id: patientId,
      patient_name: body.patient_name || null,
      version: nextVersion,
      status: 'active',
      language: body.language || 'en',
      summary_json: JSON.stringify(summary),
      generated_by_user_id: req.user.id,
      generated_at: new Date()
    });

    await Promise.all(records.map(record => IPSSourceRecord.create({
      ips_id: ips.id,
      medical_record_id: record.id,
      category: record.category
    })));

    res.status(201).json(ips);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

patientRouter.get('/', authenticate, async (req, res) => {
  try {
    const { patientId } = req.params;
    if (!isAdmin(req.user) && patientId !== req.user.id) {
      const allowed = await canAccessMedicalRecord({ patient_id: patientId }, req.user);
      if (!allowed) {
        return res.status(403).json({ error: 'Forbidden — you do not have access to this patient\'s IPS' });
      }
    }
    const list = await IPS.findAll({
      where: { patient_id: req.params.patientId },
      order: parseSort(req.query, ['version', 'created_at', 'date'], 'version', 'DESC')
    });
    res.json(list);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:ipsId', authenticate, async (req, res) => {
  try {
    const ips = await IPS.findByPk(req.params.ipsId);
    if (!ips) {
      return res.status(404).json({ error: 'IPS not found' });
    }
    if (!isAdmin(req.user) && ips.patient_id !== req.user.id) {
      const allowed = await canAccessMedicalRecord({ patient_id: ips.patient_id }, req.user);
      if (!allowed) {
        return res.status(403).json({ error: 'Forbidden — you do not have access to this IPS' });
      }
    }
    res.json(ips);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:ipsId/json', authenticate, async (req, res) => {
  try {
    const ips = await IPS.findByPk(req.params.ipsId);
    if (!ips) {
      return res.status(404).json({ error: 'IPS not found' });
    }
    const summary = ips.summary_json ? JSON.parse(ips.summary_json) : null;
    res.json({
      id: ips.id,
      patient_id: ips.patient_id,
      version: ips.version,
      status: ips.status,
      language: ips.language,
      generated_at: ips.generated_at,
      summary
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:ipsId/fhir', authenticate, async (req, res) => {
  try {
    const ips = await IPS.findByPk(req.params.ipsId);
    if (!ips) {
      return res.status(404).json({ error: 'IPS not found' });
    }
    const summary = ips.summary_json ? JSON.parse(ips.summary_json) : { sections: {} };
    const entries = [];
    for (const [category, records] of Object.entries(summary.sections || {})) {
      for (const record of records) {
        entries.push({
          fullUrl: `urn:uuid:${record.id}`,
          resource: {
            resourceType: 'Observation',
            id: record.id,
            category: [{ text: category }],
            code: { text: record.title },
            effectiveDateTime: record.date,
            note: record.notes ? [{ text: record.notes }] : undefined
          }
        });
      }
    }
    res.json({
      resourceType: 'Bundle',
      type: 'document',
      timestamp: ips.generated_at,
      entry: [
        {
          fullUrl: `urn:uuid:${ips.id}`,
          resource: {
            resourceType: 'Composition',
            id: ips.id,
            status: 'final',
            type: { text: 'International Patient Summary' },
            subject: { reference: `Patient/${ips.patient_id}` },
            date: ips.generated_at
          }
        },
        ...entries
      ]
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/:ipsId/share', authenticate, async (req, res) => {
  try {
    const ips = await IPS.findByPk(req.params.ipsId);
    if (!ips) {
      return res.status(404).json({ error: 'IPS not found' });
    }
    if (!isAdmin(req.user) && ips.patient_id !== req.user.id) {
      const allowed = await canAccessMedicalRecord({ patient_id: ips.patient_id }, req.user);
      if (!allowed) {
        return res.status(403).json({ error: 'Forbidden — you do not have access to this IPS' });
      }
    }
    const token = crypto.randomBytes(32).toString('hex');
    const expiresInHours = Number(req.body && req.body.expires_in_hours) || 72;
    const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000);
    await ips.update({ shared_token: token, shared_token_expires_at: expiresAt });
    res.json({
      ips_id: ips.id,
      token,
      expires_at: expiresAt,
      share_url: `/api/v1/ips/${ips.id}/json?token=${token}`
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/:ipsId/revoke', authenticate, async (req, res) => {
  try {
    const ips = await IPS.findByPk(req.params.ipsId);
    if (!ips) {
      return res.status(404).json({ error: 'IPS not found' });
    }
    if (!isAdmin(req.user) && ips.patient_id !== req.user.id) {
      const allowed = await canAccessMedicalRecord({ patient_id: ips.patient_id }, req.user);
      if (!allowed) {
        return res.status(403).json({ error: 'Forbidden — you do not have access to this IPS' });
      }
    }
    await ips.update({
      shared_token: null,
      shared_token_expires_at: null,
      status: 'revoked'
    });
    res.json(ips);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

module.exports = { router, patientRouter };
