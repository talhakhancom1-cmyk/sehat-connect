const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { sequelize } = require('../config/database');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { parseSort } = require('../lib/parseSort');
const { pickFields } = require('../lib/pickFields');

// Fields an admin can set when creating/updating a user
const USER_WRITABLE_FIELDS = [
  'email', 'role', 'app_role', 'onboarded',
  'display_name', 'phone', 'address', 'city', 'country',
  'profile_pic_url', 'date_of_birth', 'age', 'gender',
  'blood_type', 'allergies', 'emergency_contact_name', 'emergency_contact_phone',
  'specialty', 'pmdc_number', 'consultation_fee', 'experience_years', 'bio',
  'verification_status'
];

// Get all users (admin only)
router.get('/', authenticate, requireAdmin(), async (req, res) => {
  try {
    const users = await User.findAll({
      order: parseSort(req.query, ['created_at', 'updated_at', 'email', 'full_name'], 'created_at', 'DESC'),
      limit: 100
    });
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get user by ID (self or admin)
router.get('/:id', authenticate, async (req, res) => {
  try {
    const isAdmin = ['clinic_admin', 'support_agent', 'compliance_auditor', 'super_admin'].includes(req.user.role);
    if (req.user.id !== req.params.id && !isAdmin) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const user = await User.findByPk(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create new user (admin only — regular registration goes through /api/auth/register)
router.post('/', authenticate, requireAdmin(), async (req, res) => {
  try {
    const user = await User.create(pickFields(req.body, USER_WRITABLE_FIELDS));
    res.status(201).json(user);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Update user (admin only — self-service profile updates go through /api/auth/me)
router.put('/:id', authenticate, requireAdmin(), async (req, res) => {
  try {
    const user = await User.findByPk(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    await user.update(pickFields(req.body, USER_WRITABLE_FIELDS));
    res.json(user);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Delete user (admin only)
router.delete('/:id', authenticate, requireAdmin(), async (req, res) => {
  try {
    const user = await User.findByPk(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    await user.destroy();
    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
