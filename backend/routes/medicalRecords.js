const express = require('express');
const router = express.Router();
const MedicalRecord = require('../models/MedicalRecord');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { ADMIN_ROLES } = require('../constants/ehc');
const { parseSort } = require('../lib/parseSort');

function isAdmin(user) {
  return ADMIN_ROLES.includes(user.role);
}

// Get medical records — scoped to the owning patient, admins see all.
// created_by_id isn't a real column on this model (frontend sends it as a legacy filter
// that never mapped to anything); it's ignored here in favor of the real patient_id scope.
router.get('/', authenticate, async (req, res) => {
  try {
    const where = isAdmin(req.user) ? {} : { patient_id: req.user.id };
    if (isAdmin(req.user) && req.query.patient_id) where.patient_id = req.query.patient_id;
    if (req.query.category) where.category = req.query.category;
    if (req.query.provenance) where.provenance = req.query.provenance;
    const limit = Math.min(Number(req.query._limit) || 100, 500);
    const records = await MedicalRecord.findAll({
      where,
      order: parseSort(req.query, ['date', 'created_at', 'updated_at'], 'date', 'DESC'),
      limit
    });
    const result = records.map(r => ({ ...r.toJSON(), created_date: r.created_at }));
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get medical record by ID — owner or admin
router.get('/:id', authenticate, async (req, res) => {
  try {
    const record = await MedicalRecord.findByPk(req.params.id);
    if (!record) {
      return res.status(404).json({ error: 'Medical record not found' });
    }
    if (!isAdmin(req.user) && record.patient_id !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    res.json(record);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create new medical record — patient_id is always forced to the caller unless admin
router.post('/', authenticate, async (req, res) => {
  try {
    const body = { ...req.body };
    if (!isAdmin(req.user)) {
      body.patient_id = req.user.id;
    }
    const record = await MedicalRecord.create(body);
    res.status(201).json(record);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Update medical record (admin only — not used by the frontend today)
router.put('/:id', authenticate, requireAdmin(), async (req, res) => {
  try {
    const record = await MedicalRecord.findByPk(req.params.id);
    if (!record) {
      return res.status(404).json({ error: 'Medical record not found' });
    }
    await record.update(req.body);
    res.json(record);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Delete medical record (admin only — not used by the frontend today)
router.delete('/:id', authenticate, requireAdmin(), async (req, res) => {
  try {
    const record = await MedicalRecord.findByPk(req.params.id);
    if (!record) {
      return res.status(404).json({ error: 'Medical record not found' });
    }
    await record.destroy();
    res.json({ message: 'Medical record deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
