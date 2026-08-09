const express = require('express');
const { DoseEvent } = require('../models');
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
    const events = await DoseEvent.findAll({
      where,
      order: parseSort(req.query, ['taken_at', 'created_at'], 'taken_at', 'DESC'),
      limit: 500
    });
    const result = events.map(e => ({ ...e.toJSON(), created_date: e.created_at }));
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
    const event = await DoseEvent.create({
      medication_plan_id: body.medication_plan_id,
      prescription_id: body.prescription_id || null,
      patient_id: body.patient_id,
      patient_name: body.patient_name || null,
      doctor_id: body.doctor_id || null,
      taken_at: body.taken_at || new Date(),
      status: body.status || 'taken',
      source: body.source || 'patient',
      notes: body.notes || null
    });
    res.status(201).json({ ...event.toJSON(), created_date: event.created_at });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;
