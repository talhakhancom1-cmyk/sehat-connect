const express = require('express');
const { Op } = require('sequelize');
const { DoseEvent, Consent } = require('../models');
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

// GET /api/dose-events/adherence?patient_id=xxx — get adherence summary for a patient
// Doctors can only access this if they have an active consent with the patient
router.get('/adherence', authenticate, async (req, res) => {
  try {
    const { patient_id } = req.query;
    if (!patient_id) return res.status(400).json({ error: 'patient_id is required' });

    if (!isAdmin(req.user)) {
      if (req.user.role === 'doctor') {
        // Check for active consent
        const consent = await Consent.findOne({
          where: {
            patient_id,
            recipient_user_id: req.user.id,
            status: 'active',
          },
        });
        if (!consent) {
          return res.status(403).json({ error: 'No active consent from this patient' });
        }
      } else if (req.user.id !== patient_id) {
        return res.status(403).json({ error: 'Forbidden' });
      }
    }

    // Calculate adherence for the last 7 days
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const events = await DoseEvent.findAll({
      where: {
        patient_id,
        taken_at: { [Op.gte]: sevenDaysAgo },
      },
    });

    const total = events.length;
    const taken = events.filter(e => e.status === 'taken').length;
    const skipped = events.filter(e => e.status === 'skipped').length;
    const missed = events.filter(e => e.status === 'missed').length;
    const pending = events.filter(e => e.status === 'pending').length;
    const rate = total > 0 ? Math.round((taken / total) * 100) : null;

    res.json({ total, taken, skipped, missed, pending, rate, period: '7d' });
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

// PUT /api/dose-events/:id/status — mark a dose as taken or skipped
router.put('/:id/status', authenticate, async (req, res) => {
  try {
    const event = await DoseEvent.findByPk(req.params.id);
    if (!event) return res.status(404).json({ error: 'Dose event not found' });
    if (!isAdmin(req.user) && event.patient_id !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const { status } = req.body;
    if (!['taken', 'skipped'].includes(status)) {
      return res.status(400).json({ error: 'Status must be "taken" or "skipped"' });
    }
    await event.update({
      status,
      taken_at: status === 'taken' ? new Date() : event.taken_at,
      source: 'patient'
    });
    res.json({ ...event.toJSON(), created_date: event.created_at });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
