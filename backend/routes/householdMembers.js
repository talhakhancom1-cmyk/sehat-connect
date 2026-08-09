const express = require('express');
const { HouseholdMember } = require('../models');
const { authenticate } = require('../middleware/auth');
const { parseSort } = require('../lib/parseSort');

const router = express.Router();

// GET / — list members (supports ?household_id= filter)
router.get('/', authenticate, async (req, res) => {
  try {
    const where = {};
    if (req.query.household_id) where.household_id = req.query.household_id;
    if (req.query.user_id) where.user_id = req.query.user_id;
    if (req.query.status) where.status = req.query.status;
    const members = await HouseholdMember.findAll({
      where,
      order: parseSort(req.query, ['added_at', 'created_at', 'updated_at'], 'added_at', 'DESC'),
      limit: 200
    });
    const result = members.map(m => ({
      ...m.toJSON(),
      added_at: m.added_at || m.created_at,
      created_date: m.created_at,
      updated_date: m.updated_at
    }));
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /:id
router.get('/:id', authenticate, async (req, res) => {
  try {
    const member = await HouseholdMember.findByPk(req.params.id);
    if (!member) return res.status(404).json({ error: 'Member not found' });
    res.json({
      ...member.toJSON(),
      added_at: member.added_at || member.created_at,
      created_date: member.created_at
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST / — create a member
router.post('/', authenticate, async (req, res) => {
  try {
    const body = req.body || {};
    if (!body.household_id) return res.status(400).json({ error: 'household_id is required' });
    if (!body.user_id) return res.status(400).json({ error: 'user_id is required' });

    const member = await HouseholdMember.create({
      household_id: body.household_id,
      household_name: body.household_name || null,
      user_id: body.user_id,
      user_name: body.user_name || null,
      user_email: body.user_email || null,
      role: body.role || 'member',
      member_type: body.member_type || body.role === 'head' ? 'head_of_household' : 'adult_family_member',
      status: body.status || 'active',
      added_by: body.added_by || req.user.id,
      added_at: body.added_at || new Date(),
      joined_at: body.joined_at || new Date()
    });
    res.status(201).json({
      ...member.toJSON(),
      added_at: member.added_at || member.created_at,
      created_date: member.created_at
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// PUT /:id — update a member
router.put('/:id', authenticate, async (req, res) => {
  try {
    const member = await HouseholdMember.findByPk(req.params.id);
    if (!member) return res.status(404).json({ error: 'Member not found' });
    const updates = { ...req.body };
    delete updates.id;
    if (updates.member_type && body.role === 'head') updates.member_type = 'head_of_household';
    await member.update(updates);
    res.json({
      ...member.toJSON(),
      added_at: member.added_at || member.created_at,
      created_date: member.created_at
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// DELETE /:id
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const member = await HouseholdMember.findByPk(req.params.id);
    if (!member) return res.status(404).json({ error: 'Member not found' });
    await member.destroy();
    res.json({ message: 'Member removed' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
