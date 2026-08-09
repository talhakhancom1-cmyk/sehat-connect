const express = require('express');
const router = express.Router();
const Doctor = require('../models/Doctor');
const { sequelize } = require('../config/database');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { ADMIN_ROLES } = require('../constants/ehc');
const { parseSort } = require('../lib/parseSort');

function isAdmin(user) {
  return ADMIN_ROLES.includes(user.role);
}

function isDoctorSelf(doctor, user) {
  return doctor.user_id === user.id || (doctor.email && user.email && doctor.email === user.email);
}

// Get all doctors — supports filtering by specialty, city, verification_status, email, user_id
router.get('/', authenticate, async (req, res) => {
  try {
    // Check if database is connected
    try {
      await sequelize.authenticate();
    } catch (error) {
      return res.status(503).json({
        error: 'Database not connected',
        message: 'PostgreSQL is not connected. Please setup PostgreSQL.',
        setupInstructions: 'See env.example for database configuration'
      });
    }

    const where = {};
    if (req.query.specialty) where.specialty = req.query.specialty;
    if (req.query.city) where.city = req.query.city;
    if (req.query.verification_status) where.verification_status = req.query.verification_status;
    if (req.query.email) where.email = req.query.email;
    if (req.query.user_id) where.user_id = req.query.user_id;

    const limit = Math.min(Number(req.query._limit) || 100, 500);

    const doctors = await Doctor.findAll({
      where,
      order: parseSort(req.query, ['created_at', 'updated_at', 'rating', 'consultation_fee', 'experience_years'], 'created_at', 'DESC'),
      limit
    });
    const result = doctors.map(d => ({ ...d.toJSON(), created_date: d.created_at }));
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get doctor by ID
router.get('/:id', authenticate, async (req, res) => {
  try {
    const doctor = await Doctor.findByPk(req.params.id);
    if (!doctor) {
      return res.status(404).json({ error: 'Doctor not found' });
    }
    res.json(doctor);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create new doctor (admin only — onboarding creates Doctor rows via the model directly)
router.post('/', authenticate, requireAdmin(), async (req, res) => {
  try {
    const doctor = await Doctor.create(req.body);
    res.status(201).json(doctor);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Update doctor — the doctor themself, or an admin
router.put('/:id', authenticate, async (req, res) => {
  try {
    const doctor = await Doctor.findByPk(req.params.id);
    if (!doctor) {
      return res.status(404).json({ error: 'Doctor not found' });
    }
    if (!isAdmin(req.user) && !isDoctorSelf(doctor, req.user)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    await doctor.update(req.body);
    res.json(doctor);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Delete doctor (admin only — not used by the frontend today)
router.delete('/:id', authenticate, requireAdmin(), async (req, res) => {
  try {
    const doctor = await Doctor.findByPk(req.params.id);
    if (!doctor) {
      return res.status(404).json({ error: 'Doctor not found' });
    }
    await doctor.destroy();
    res.json({ message: 'Doctor deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
