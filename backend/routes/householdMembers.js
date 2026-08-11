const express = require('express');
const { HouseholdMember, Household } = require('../models');
const { authenticate } = require('../middleware/auth');
const { parseSort } = require('../lib/parseSort');
const { canAccessHousehold, isAdmin } = require('../lib/ownership');
const { validateEmail, validateEnum, sanitizeError } = require('../lib/validate');

const MEMBER_TYPES = ['head_of_household', 'adult_family_member', 'dependent_minor', 'adult_dependent'];
const MEMBER_STATUSES = ['invited', 'active', 'revoked', 'left', 'expired', 'declined'];
const MEMBER_ROLES = ['head', 'member', 'admin'];

const router = express.Router();

// GET / — list members (supports ?household_id= filter)
router.get('/', authenticate, async (req, res) => {
  try {
    const where = {};
    if (req.query.status) where.status = req.query.status;
    // Non-admins can only see members of households they belong to
    if (!isAdmin(req.user)) {
      const memberships = await HouseholdMember.findAll({
        where: { user_id: req.user.id, status: 'active' },
        attributes: ['household_id']
      });
      const myHouseholdIds = memberships.map(m => m.household_id);
      if (req.query.household_id) {
        if (!myHouseholdIds.includes(req.query.household_id)) {
          return res.json([]);
        }
        where.household_id = req.query.household_id;
      } else {
        where.household_id = myHouseholdIds.length ? { [require('sequelize').Op.in]: myHouseholdIds } : '__NO_MATCH__';
      }
    } else {
      if (req.query.household_id) where.household_id = req.query.household_id;
    }
    if (req.query.user_id) where.user_id = req.query.user_id;
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

    // Check the user has authority over the household (head/member or admin)
    const household = await Household.findByPk(body.household_id);
    if (!household) return res.status(404).json({ error: 'Household not found' });
    const allowed = await canAccessHousehold(household, req.user);
    if (!allowed) {
      return res.status(403).json({ error: 'Forbidden — you are not a member of this household' });
    }

    // --- Server-side validation ---
    if (body.user_email !== undefined && body.user_email !== null && body.user_email !== '') {
      if (!validateEmail(body.user_email)) {
        return res.status(400).json({ error: 'user_email format is invalid' });
      }
    }
    if (body.role !== undefined && body.role !== null && body.role !== '') {
      const err = validateEnum(body.role, MEMBER_ROLES, 'role');
      if (err) return res.status(400).json({ error: err });
    }
    if (body.member_type !== undefined && body.member_type !== null && body.member_type !== '') {
      const err = validateEnum(body.member_type, MEMBER_TYPES, 'member_type');
      if (err) return res.status(400).json({ error: err });
    }
    if (body.status !== undefined && body.status !== null && body.status !== '') {
      const err = validateEnum(body.status, MEMBER_STATUSES, 'status');
      if (err) return res.status(400).json({ error: err });
    }

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
    res.status(400).json({ error: sanitizeError(error) });
  }
});

// PUT /:id — update a member
router.put('/:id', authenticate, async (req, res) => {
  try {
    const member = await HouseholdMember.findByPk(req.params.id);
    if (!member) return res.status(404).json({ error: 'Member not found' });
    // Check the caller is a member of the same household (or admin)
    const household = await Household.findByPk(member.household_id);
    if (!household) return res.status(404).json({ error: 'Household not found' });
    const allowed = await canAccessHousehold(household, req.user);
    if (!allowed) {
      return res.status(403).json({ error: 'Forbidden — you are not a member of this household' });
    }
    // --- Server-side validation (updates) ---
    const upd = req.body || {};
    if (upd.user_email !== undefined && upd.user_email !== null && upd.user_email !== '') {
      if (!validateEmail(upd.user_email)) {
        return res.status(400).json({ error: 'user_email format is invalid' });
      }
    }
    if (upd.role !== undefined && upd.role !== null && upd.role !== '') {
      const err = validateEnum(upd.role, MEMBER_ROLES, 'role');
      if (err) return res.status(400).json({ error: err });
    }
    if (upd.member_type !== undefined && upd.member_type !== null && upd.member_type !== '') {
      const err = validateEnum(upd.member_type, MEMBER_TYPES, 'member_type');
      if (err) return res.status(400).json({ error: err });
    }
    if (upd.status !== undefined && upd.status !== null && upd.status !== '') {
      const err = validateEnum(upd.status, MEMBER_STATUSES, 'status');
      if (err) return res.status(400).json({ error: err });
    }
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
    res.status(400).json({ error: sanitizeError(error) });
  }
});

// DELETE /:id
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const member = await HouseholdMember.findByPk(req.params.id);
    if (!member) return res.status(404).json({ error: 'Member not found' });
    // Check the caller is a member of the same household (or admin)
    const household = await Household.findByPk(member.household_id);
    if (!household) return res.status(404).json({ error: 'Household not found' });
    const allowed = await canAccessHousehold(household, req.user);
    if (!allowed) {
      return res.status(403).json({ error: 'Forbidden — you are not a member of this household' });
    }
    await member.destroy();
    res.json({ message: 'Member removed' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
