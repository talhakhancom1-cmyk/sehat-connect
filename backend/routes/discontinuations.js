const express = require('express');
const { Discontinuation } = require('../models');
const { authenticate } = require('../middleware/auth');
const { ADMIN_ROLES } = require('../constants/ehc');
const { parseSort } = require('../lib/parseSort');

const router = express.Router();

function isAdmin(user) {
  return ADMIN_ROLES.includes(user.role);
}

router.get('/', authenticate, async (req, res) => {
  try {
    const where = isAdmin(req.user) ? {} : { patient_id: req.user.id };
    if (req.query.medication_plan_id) where.medication_plan_id = req.query.medication_plan_id;
    const items = await Discontinuation.findAll({
      where,
      order: parseSort(req.query, ['discontinued_at', 'created_at'], 'discontinued_at', 'DESC'),
      limit: 200
    });
    const result = items.map(d => ({ ...d.toJSON(), created_date: d.created_at }));
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/', authenticate, async (req, res) => {
  try {
    const body = { ...req.body };
    if (!isAdmin(req.user)) {
      body.patient_id = req.user.id;
    }
    if (!body.medication_plan_id) return res.status(400).json({ error: 'medication_plan_id is required' });
    const item = await Discontinuation.create({
      medication_plan_id: body.medication_plan_id,
      prescription_id: body.prescription_id || null,
      patient_id: body.patient_id,
      patient_name: body.patient_name || null,
      discontinued_by_id: body.discontinued_by_id || req.user.id,
      discontinued_by_name: body.discontinued_by_name || req.user.display_name,
      discontinued_by_role: body.discontinued_by_role || req.user.role,
      reason: body.reason || null,
      reason_detail: body.reason_detail || null,
      discontinued_at: body.discontinued_at || new Date()
    });
    res.status(201).json({ ...item.toJSON(), created_date: item.created_at });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;
