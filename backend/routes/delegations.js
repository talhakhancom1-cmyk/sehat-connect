const express = require('express');
const { Delegation } = require('../models');
const { authenticate } = require('../middleware/auth');
const { parseSort } = require('../lib/parseSort');

const router = express.Router();

// GET / — list delegations
router.get('/', authenticate, async (req, res) => {
  try {
    const where = {};
    if (req.query.household_id) where.household_id = req.query.household_id;
    if (req.query.delegator_user_id) where.delegator_user_id = req.query.delegator_user_id;
    if (req.query.delegatee_user_id) where.delegatee_user_id = req.query.delegatee_user_id;
    if (req.query.status) where.status = req.query.status;
    if (req.query.scope) where.scope = req.query.scope;
    const delegations = await Delegation.findAll({
      where,
      order: parseSort(req.query, ['granted_at', 'created_at', 'updated_at', 'expires_at'], 'granted_at', 'DESC'),
      limit: 200
    });
    const result = delegations.map(d => ({
      ...d.toJSON(),
      granted_at: d.granted_at || d.created_at,
      created_date: d.created_at,
      updated_date: d.updated_at
    }));
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /:id
router.get('/:id', authenticate, async (req, res) => {
  try {
    const delegation = await Delegation.findByPk(req.params.id);
    if (!delegation) return res.status(404).json({ error: 'Delegation not found' });
    res.json({
      ...delegation.toJSON(),
      granted_at: delegation.granted_at || delegation.created_at,
      created_date: delegation.created_at
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST / — create a delegation
router.post('/', authenticate, async (req, res) => {
  try {
    const body = req.body || {};
    if (!body.delegator_user_id) return res.status(400).json({ error: 'delegator_user_id is required' });
    if (!body.delegatee_user_id) return res.status(400).json({ error: 'delegatee_user_id is required' });
    if (!body.scope) return res.status(400).json({ error: 'scope is required' });

    const delegation = await Delegation.create({
      household_id: body.household_id || null,
      delegator_user_id: body.delegator_user_id,
      delegator_name: body.delegator_name || null,
      delegatee_user_id: body.delegatee_user_id,
      delegatee_name: body.delegatee_name || null,
      scope: body.scope,
      record_view_categories: body.record_view_categories || [],
      status: body.status || 'active',
      granted_at: body.granted_at || new Date(),
      expires_at: body.expires_at || null,
      revoked_at: body.revoked_at || null
    });
    res.status(201).json({
      ...delegation.toJSON(),
      granted_at: delegation.granted_at || delegation.created_at,
      created_date: delegation.created_at
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// PUT /:id — update (e.g. revoke)
router.put('/:id', authenticate, async (req, res) => {
  try {
    const delegation = await Delegation.findByPk(req.params.id);
    if (!delegation) return res.status(404).json({ error: 'Delegation not found' });
    const updates = { ...req.body };
    delete updates.id;
    await delegation.update(updates);
    res.json({
      ...delegation.toJSON(),
      granted_at: delegation.granted_at || delegation.created_at,
      created_date: delegation.created_at
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// DELETE /:id
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const delegation = await Delegation.findByPk(req.params.id);
    if (!delegation) return res.status(404).json({ error: 'Delegation not found' });
    await delegation.destroy();
    res.json({ message: 'Delegation deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
