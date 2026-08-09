const express = require('express');
const { HealthCardToken, HealthCard } = require('../models');
const { authenticate } = require('../middleware/auth');
const { parseSort } = require('../lib/parseSort');

const router = express.Router();

// GET / — list tokens (supports ?created_by_id_ref= filter)
router.get('/', authenticate, async (req, res) => {
  try {
    const where = {};
    if (req.query.created_by_id_ref) where.created_by_id_ref = req.query.created_by_id_ref;
    if (req.query.card_id) where.card_id = req.query.card_id;
    if (req.query.status) where.status = req.query.status;
    if (!Object.keys(where).length) where.created_by_id_ref = req.user.id;
    const tokens = await HealthCardToken.findAll({
      where,
      order: parseSort(req.query, ['created_at', 'updated_at', 'expires_at'], 'created_at', 'DESC'),
      limit: 200
    });
    const result = tokens.map(t => ({
      ...t.toJSON(),
      created_date: t.created_at,
      updated_date: t.updated_at
    }));
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /:id
router.get('/:id', authenticate, async (req, res) => {
  try {
    const token = await HealthCardToken.findByPk(req.params.id);
    if (!token) return res.status(404).json({ error: 'Token not found' });
    res.json({
      ...token.toJSON(),
      created_date: token.created_at,
      updated_date: token.updated_at
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST / — create a token
router.post('/', authenticate, async (req, res) => {
  try {
    const body = req.body || {};
    if (!body.card_id) return res.status(400).json({ error: 'card_id is required' });
    if (!body.token) return res.status(400).json({ error: 'token is required' });

    const token = await HealthCardToken.create({
      card_id: body.card_id,
      token: body.token,
      status: body.status || 'active',
      expires_at: body.expires_at || null,
      max_views: body.max_views || 1,
      view_count: 0,
      created_by_id_ref: body.created_by_id_ref || req.user.id,
      revoked_at: null
    });
    res.status(201).json({
      ...token.toJSON(),
      created_date: token.created_at,
      updated_date: token.updated_at
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// PUT /:id — update a token (e.g. revoke)
router.put('/:id', authenticate, async (req, res) => {
  try {
    const token = await HealthCardToken.findByPk(req.params.id);
    if (!token) return res.status(404).json({ error: 'Token not found' });
    const updates = { ...req.body };
    delete updates.id;
    await token.update(updates);
    res.json({
      ...token.toJSON(),
      created_date: token.created_at,
      updated_date: token.updated_at
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// DELETE /:id
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const token = await HealthCardToken.findByPk(req.params.id);
    if (!token) return res.status(404).json({ error: 'Token not found' });
    await token.destroy();
    res.json({ message: 'Token deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
