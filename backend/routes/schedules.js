const express = require('express');
const { Schedule, Doctor } = require('../models');
const { authenticate } = require('../middleware/auth');
const { parseSort } = require('../lib/parseSort');

const router = express.Router();

// GET /api/v1/schedules?doctor_id=xxx
router.get('/', authenticate, async (req, res) => {
  try {
    const where = {};
    if (req.query.doctor_id) where.doctor_id = req.query.doctor_id;
    const schedules = await Schedule.findAll({
      where,
      order: parseSort(req.query, ['updated_at', 'created_at'], 'updated_at', 'DESC'),
      limit: 50
    });
    res.json(schedules);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/v1/schedules/:id
router.get('/:id', authenticate, async (req, res) => {
  try {
    const schedule = await Schedule.findByPk(req.params.id);
    if (!schedule) return res.status(404).json({ error: 'Schedule not found' });
    res.json(schedule);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/v1/schedules
router.post('/', authenticate, async (req, res) => {
  try {
    const body = req.body || {};
    if (!body.doctor_id) return res.status(400).json({ error: 'doctor_id is required' });
    const schedule = await Schedule.create({
      doctor_id: body.doctor_id,
      doctor_name: body.doctor_name || null,
      max_patients_per_day: body.max_patients_per_day || 20,
      break_start: body.break_start || '01:00 PM',
      break_end: body.break_end || '02:00 PM',
      days: body.days || [],
      status: 'active'
    });
    res.status(201).json(schedule);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// PUT /api/v1/schedules/:id
router.put('/:id', authenticate, async (req, res) => {
  try {
    const schedule = await Schedule.findByPk(req.params.id);
    if (!schedule) return res.status(404).json({ error: 'Schedule not found' });
    const updates = { ...req.body };
    delete updates.id;
    await schedule.update(updates);
    res.json(schedule);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// DELETE /api/v1/schedules/:id
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const schedule = await Schedule.findByPk(req.params.id);
    if (!schedule) return res.status(404).json({ error: 'Schedule not found' });
    await schedule.destroy();
    res.json({ message: 'Schedule deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
