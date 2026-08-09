const express = require('express');
const router = express.Router();
const { HealthCardToken, HealthCard, Delegation, MedicalRecord } = require('../models');
const { authenticate } = require('../middleware/auth');

// Custom function: getFamilySharedData
// Returns medical records and health cards delegated to the calling user by other
// household members (via active, non-expired Delegation grants).
router.post('/getFamilySharedData', authenticate, async (req, res) => {
  try {
    const types = Array.isArray(req.body?.types) && req.body.types.length ? req.body.types : ['records', 'healthCards'];
    const now = new Date();

    const delegations = await Delegation.findAll({
      where: { delegatee_user_id: req.user.id, status: 'active' }
    });
    const active = delegations.filter(d => !d.expires_at || new Date(d.expires_at) > now);

    let records = [];
    if (types.includes('records')) {
      const recordDelegations = active.filter(d => d.scope === 'record_view');
      const recordLists = await Promise.all(recordDelegations.map(async (d) => {
        const list = await MedicalRecord.findAll({ where: { patient_id: d.delegator_user_id }, limit: 200 });
        const categories = d.record_view_categories || [];
        const filtered = categories.length ? list.filter(r => categories.includes(r.category)) : list;
        return filtered.map(r => ({ ...r.toJSON(), created_date: r.created_at, shared_by: d.delegator_name }));
      }));
      const seen = new Set();
      records = recordLists.flat().filter(r => (seen.has(r.id) ? false : (seen.add(r.id), true)));
    }

    let healthCards = [];
    if (types.includes('healthCards')) {
      const cardDelegations = active.filter(d => d.scope === 'health_card_view');
      const cardLists = await Promise.all(cardDelegations.map(async (d) => {
        const list = await HealthCard.findAll({ where: { patient_id: d.delegator_user_id, status: 'active' }, limit: 100 });
        const types_ = d.health_card_types || [];
        const filtered = types_.length ? list.filter(c => types_.includes(c.card_type)) : list;
        return filtered.map(c => ({
          ...c.toJSON(),
          created_date: c.created_at,
          data: c.data_json ? JSON.parse(c.data_json) : null,
          shared_by: d.delegator_name
        }));
      }));
      const seen = new Set();
      healthCards = cardLists.flat().filter(c => (seen.has(c.id) ? false : (seen.add(c.id), true)));
    }

    res.json({ data: { records, healthCards } });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Custom function: verifyHealthCardToken
// Verifies an opaque single-purpose HealthCardToken and returns a data snapshot
// of the underlying HealthCard, enforcing max_views / expires_at.
router.post('/verifyHealthCardToken', authenticate, async (req, res) => {
  try {
    const { token } = req.body || {};
    if (!token) {
      return res.status(400).json({ error: 'Token is required' });
    }

    const cardToken = await HealthCardToken.findOne({ where: { token } });
    if (!cardToken) {
      return res.status(404).json({ error: 'Invalid or unknown token' });
    }
    if (cardToken.status !== 'active') {
      return res.status(410).json({ error: 'This token has been revoked or expired' });
    }
    if (cardToken.expires_at && new Date(cardToken.expires_at) < new Date()) {
      await cardToken.update({ status: 'expired' });
      return res.status(410).json({ error: 'This token has expired' });
    }
    if (cardToken.view_count >= cardToken.max_views) {
      await cardToken.update({ status: 'expired' });
      return res.status(410).json({ error: 'This token has reached its maximum number of views' });
    }

    const card = await HealthCard.findByPk(cardToken.card_id);
    if (!card || card.status !== 'active') {
      return res.status(404).json({ error: 'Health card not found or no longer active' });
    }

    const newViewCount = cardToken.view_count + 1;
    await cardToken.update({
      view_count: newViewCount,
      status: newViewCount >= cardToken.max_views ? 'expired' : 'active'
    });

    res.json({
      data: {
        card: {
          id: card.id,
          title: card.title,
          card_type: card.card_type,
          patient_name: card.patient_name,
          data_snapshot: card.data_json ? JSON.parse(card.data_json) : {}
        },
        token: {
          view_count: newViewCount,
          max_views: cardToken.max_views,
          expires_at: cardToken.expires_at
        }
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
