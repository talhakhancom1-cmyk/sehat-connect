const express = require('express');
const crypto = require('crypto');
const { HealthCard, HealthCardShare } = require('../models');
const { authenticate } = require('../middleware/auth');
const { parseSort } = require('../lib/parseSort');
const { canAccessHealthCard, isAdmin } = require('../lib/ownership');

const router = express.Router();
const patientRouter = express.Router({ mergeParams: true });

patientRouter.get('/', authenticate, async (req, res) => {
  try {
    const cards = await HealthCard.findAll({
      where: { patient_id: req.params.patientId },
      order: parseSort(req.query, ['created_at', 'updated_at'], 'created_at', 'DESC')
    });
    res.json(cards);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

patientRouter.post('/', authenticate, async (req, res) => {
  try {
    const body = req.body || {};
    if (!HealthCard.CARD_TYPES.includes(body.card_type)) {
      return res.status(400).json({ error: `card_type must be one of ${HealthCard.CARD_TYPES.join(', ')}` });
    }
    const card = await HealthCard.create({
      patient_id: req.params.patientId,
      patient_name: body.patient_name || null,
      card_type: body.card_type,
      title: body.title,
      data_json: body.data ? JSON.stringify(body.data) : null,
      status: 'active'
    });
    res.status(201).json(card);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// GET / — list health cards (supports ?patient_id= filter)
router.get('/', authenticate, async (req, res) => {
  try {
    const where = {};
    if (req.query.patient_id) {
      // Non-admins can only query their own patient_id
      where.patient_id = isAdmin(req.user) ? req.query.patient_id : req.user.id;
    }
    if (req.query.status) where.status = req.query.status;
    if (req.query.card_type) where.card_type = req.query.card_type;
    if (!where.patient_id && !isAdmin(req.user)) where.patient_id = req.user.id;
    const cards = await HealthCard.findAll({
      where,
      order: parseSort(req.query, ['created_at', 'updated_at'], 'created_at', 'DESC'),
      limit: 200
    });
    const result = cards.map(c => ({
      ...c.toJSON(),
      created_date: c.created_at,
      updated_date: c.updated_at,
      data: c.data_json ? JSON.parse(c.data_json) : null
    }));
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST / — create a health card (used by base44.entities.HealthCard.create)
router.post('/', authenticate, async (req, res) => {
  try {
    const body = req.body || {};
    const cardType = body.card_type;
    if (!cardType) {
      return res.status(400).json({ error: 'card_type is required' });
    }
    if (!HealthCard.CARD_TYPES.includes(cardType)) {
      return res.status(400).json({ error: `card_type must be one of ${HealthCard.CARD_TYPES.join(', ')}` });
    }
    const card = await HealthCard.create({
      patient_id: body.patient_id || req.user.id,
      patient_name: body.patient_name || null,
      card_type: cardType,
      title: body.title || null,
      data_json: body.data ? JSON.stringify(body.data) : (body.data_json || null),
      status: body.status || 'active'
    });
    res.status(201).json({
      ...card.toJSON(),
      created_date: card.created_at,
      updated_date: card.updated_at,
      data: card.data_json ? JSON.parse(card.data_json) : null
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.get('/:cardId', authenticate, async (req, res) => {
  try {
    const card = await HealthCard.findByPk(req.params.cardId);
    if (!card) {
      return res.status(404).json({ error: 'Health card not found' });
    }
    if (!canAccessHealthCard(card, req.user)) {
      return res.status(403).json({ error: 'Forbidden — you do not have access to this health card' });
    }
    res.json(card);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.patch('/:cardId', authenticate, async (req, res) => {
  try {
    const card = await HealthCard.findByPk(req.params.cardId);
    if (!card) {
      return res.status(404).json({ error: 'Health card not found' });
    }
    if (!canAccessHealthCard(card, req.user)) {
      return res.status(403).json({ error: 'Forbidden — you do not have access to this health card' });
    }
    const updates = { ...req.body };
    if (updates.card_type && !HealthCard.CARD_TYPES.includes(updates.card_type)) {
      return res.status(400).json({ error: `card_type must be one of ${HealthCard.CARD_TYPES.join(', ')}` });
    }
    if (updates.data) {
      updates.data_json = JSON.stringify(updates.data);
      delete updates.data;
    }
    delete updates.id;
    delete updates.patient_id;
    await card.update(updates);
    res.json(card);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// PUT /:cardId — update (used by base44.entities.HealthCard.update)
router.put('/:cardId', authenticate, async (req, res) => {
  try {
    const card = await HealthCard.findByPk(req.params.cardId);
    if (!card) {
      return res.status(404).json({ error: 'Health card not found' });
    }
    if (!canAccessHealthCard(card, req.user)) {
      return res.status(403).json({ error: 'Forbidden — you do not have access to this health card' });
    }
    const updates = { ...req.body };
    if (updates.card_type && !HealthCard.CARD_TYPES.includes(updates.card_type)) {
      return res.status(400).json({ error: `card_type must be one of ${HealthCard.CARD_TYPES.join(', ')}` });
    }
    if (updates.data) {
      updates.data_json = JSON.stringify(updates.data);
      delete updates.data;
    }
    delete updates.id;
    delete updates.patient_id;
    await card.update(updates);
    res.json({
      ...card.toJSON(),
      created_date: card.created_at,
      updated_date: card.updated_at,
      data: card.data_json ? JSON.parse(card.data_json) : null
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/:cardId/share', authenticate, async (req, res) => {
  try {
    const card = await HealthCard.findByPk(req.params.cardId);
    if (!card) {
      return res.status(404).json({ error: 'Health card not found' });
    }
    if (!canAccessHealthCard(card, req.user)) {
      return res.status(403).json({ error: 'Forbidden — you do not have access to this health card' });
    }
    const token = crypto.randomBytes(24).toString('hex');
    const expiresInHours = Number(req.body && req.body.expires_in_hours) || 168;
    const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000);

    await card.update({ shared_token: token, shared_token_expires_at: expiresAt });
    await HealthCardShare.create({
      health_card_id: card.id,
      token,
      expires_at: expiresAt,
      created_by_user_id: req.user.id
    });

    res.json({
      health_card_id: card.id,
      token,
      expires_at: expiresAt,
      qr_payload: `/api/v1/health-cards/${card.id}?token=${token}`
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/:cardId/revoke', authenticate, async (req, res) => {
  try {
    const card = await HealthCard.findByPk(req.params.cardId);
    if (!card) {
      return res.status(404).json({ error: 'Health card not found' });
    }
    if (!canAccessHealthCard(card, req.user)) {
      return res.status(403).json({ error: 'Forbidden — you do not have access to this health card' });
    }
    await card.update({ shared_token: null, shared_token_expires_at: null });
    await HealthCardShare.update(
      { revoked_at: new Date() },
      { where: { health_card_id: card.id, revoked_at: null } }
    );
    res.json({ message: 'Share revoked' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.delete('/:cardId', authenticate, async (req, res) => {
  try {
    const card = await HealthCard.findByPk(req.params.cardId);
    if (!card) {
      return res.status(404).json({ error: 'Health card not found' });
    }
    if (!canAccessHealthCard(card, req.user)) {
      return res.status(403).json({ error: 'Forbidden — you do not have access to this health card' });
    }
    await card.destroy();
    res.json({ message: 'Health card deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = { router, patientRouter };
