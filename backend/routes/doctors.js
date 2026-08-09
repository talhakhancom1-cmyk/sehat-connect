const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const Doctor = require('../models/Doctor');
const { sequelize } = require('../config/database');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { ADMIN_ROLES } = require('../constants/ehc');
const { parseSort } = require('../lib/parseSort');
const { paginate, buildPaginatedResponse } = require('../lib/paginate');
const { pickFields } = require('../lib/pickFields');

// Fields that can be set on a Doctor profile
const DOCTOR_WRITABLE_FIELDS = [
  'user_id', 'full_name', 'email', 'phone', 'specialty', 'city', 'country',
  'address', 'bio', 'consultation_fee', 'experience_years', 'rating', 'total_reviews',
  'total_patients', 'is_online', 'verification_status', 'verification_notes',
  'verification_submitted_at', 'profile_pic_url', 'image_url',
  'pmdc_number', 'license_number', 'license_document_url', 'identity_document_url'
];

function isAdmin(user) {
  return ADMIN_ROLES.includes(user.role);
}

function isDoctorSelf(doctor, user) {
  return doctor.user_id === user.id || (doctor.email && user.email && doctor.email === user.email);
}

// GET /api/v1/doctors/suggest?q= — autocomplete endpoint (must be before /:id)
router.get('/suggest', authenticate, async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    if (q.length < 2) {
      return res.json({ suggestions: [] });
    }
    const like = `%${q}%`;
    const doctors = await Doctor.findAll({
      where: {
        [Op.or]: [
          { full_name: { [Op.iLike]: like } },
          { specialty: { [Op.iLike]: like } },
          { city: { [Op.iLike]: like } },
        ],
      },
      attributes: ['id', 'full_name', 'specialty', 'city', 'verification_status'],
      order: [['rating', 'DESC'], ['full_name', 'ASC']],
      limit: 10,
    });
    res.json({ suggestions: doctors });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all doctors — supports filtering by specialty, city, verification_status, email, user_id
// Plus full-text search via ?q= and pagination via ?page=&per_page=
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

    // Full-text search across full_name, specialty, bio, city
    const q = String(req.query.q || '').trim();
    if (q) {
      const like = `%${q}%`;
      where[Op.and] = [{
        [Op.or]: [
          { full_name: { [Op.iLike]: like } },
          { specialty: { [Op.iLike]: like } },
          { bio: { [Op.iLike]: like } },
          { city: { [Op.iLike]: like } },
        ],
      }];
    }

    const { offset, limit } = paginate(req);

    const { rows, count } = await Doctor.findAndCountAll({
      where,
      order: parseSort(req.query, ['created_at', 'updated_at', 'rating', 'consultation_fee', 'experience_years'], 'created_at', 'DESC'),
      offset,
      limit,
    });
    const result = rows.map(d => ({ ...d.toJSON(), created_date: d.created_at }));
    res.json(buildPaginatedResponse(req, result, count));
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
    const doctor = await Doctor.create(pickFields(req.body, DOCTOR_WRITABLE_FIELDS));
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
    // Non-admins can only update a subset of their own profile fields
    const allowedFields = isAdmin(req.user)
      ? DOCTOR_WRITABLE_FIELDS
      : ['full_name', 'phone', 'city', 'country', 'address', 'bio', 'profile_pic_url', 'image_url',
         'consultation_fee', 'experience_years', 'pmdc_number', 'license_number',
         'license_document_url', 'identity_document_url',
         'verification_notes', 'verification_submitted_at'];
    await doctor.update(pickFields(req.body, allowedFields));
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
