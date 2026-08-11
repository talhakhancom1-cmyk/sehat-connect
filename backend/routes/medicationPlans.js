const express = require('express');
const { MedicationPlan, Consent } = require('../models');
const { authenticate } = require('../middleware/auth');
const { ADMIN_ROLES } = require('../constants/ehc');
const { parseSort } = require('../lib/parseSort');

const router = express.Router();

function isAdmin(user) {
  return ADMIN_ROLES.includes(user.role);
}

router.get('/', authenticate, async (req, res) => {
  try {
    const where = {};
    if (req.query.patient_id) {
      if (isAdmin(req.user)) {
        where.patient_id = req.query.patient_id;
      } else if (req.user.role === 'doctor') {
        // Doctors can query by patient_id but only with an active consent
        const consent = await Consent.findOne({
          where: {
            patient_id: req.query.patient_id,
            recipient_user_id: req.user.id,
            status: 'active',
          },
        });
        if (!consent) {
          return res.status(403).json({ error: 'No active consent from this patient' });
        }
        where.patient_id = req.query.patient_id;
      } else {
        // Non-admins (patients) can only ever see their own plans, regardless of the query param.
        where.patient_id = req.user.id;
      }
    } else if (!isAdmin(req.user)) {
      if (req.user.role === 'doctor') {
        // Doctors without a patient_id filter see plans they prescribed
        where.doctor_id = req.user.id;
      } else {
        where.patient_id = req.user.id;
      }
    }
    if (req.query.doctor_id) where.doctor_id = req.query.doctor_id;
    if (req.query.status) where.status = req.query.status;
    const plans = await MedicationPlan.findAll({
      where,
      order: parseSort(req.query, ['start_date', 'created_at', 'updated_at', 'end_date'], 'start_date', 'DESC'),
      limit: 100
    });
    const result = plans.map(p => ({ ...p.toJSON(), created_date: p.created_at }));
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/medication-plans/generate-doses — generate pending dose events for the patient
router.post('/generate-doses', authenticate, async (req, res) => {
  try {
    const patientId = isAdmin(req.user) ? (req.body.patient_id || req.user.id) : req.user.id;
    const { generateDoseEventsForPatient } = require('../lib/doseScheduler');
    const count = await generateDoseEventsForPatient(patientId);
    res.json({ generated: count });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id', authenticate, async (req, res) => {
  try {
    const plan = await MedicationPlan.findByPk(req.params.id);
    if (!plan) return res.status(404).json({ error: 'Medication plan not found' });
    if (!isAdmin(req.user) && plan.patient_id !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    res.json({ ...plan.toJSON(), created_date: plan.created_at });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/', authenticate, async (req, res) => {
  try {
    const plan = await MedicationPlan.create(req.body);
    res.status(201).json({ ...plan.toJSON(), created_date: plan.created_at });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.put('/:id', authenticate, async (req, res) => {
  try {
    const plan = await MedicationPlan.findByPk(req.params.id);
    if (!plan) return res.status(404).json({ error: 'Medication plan not found' });
    if (!isAdmin(req.user) && plan.patient_id !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    await plan.update(req.body);
    res.json({ ...plan.toJSON(), created_date: plan.created_at });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// PUT /api/medication-plans/:id/reminders — toggle reminders for a specific medication
router.put('/:id/reminders', authenticate, async (req, res) => {
  try {
    const plan = await MedicationPlan.findByPk(req.params.id);
    if (!plan) return res.status(404).json({ error: 'Medication plan not found' });
    if (!isAdmin(req.user) && plan.patient_id !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const { reminders_enabled } = req.body;
    if (typeof reminders_enabled !== 'boolean') {
      return res.status(400).json({ error: 'reminders_enabled must be a boolean' });
    }
    await plan.update({ reminders_enabled });
    res.json({ ...plan.toJSON(), created_date: plan.created_at });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
