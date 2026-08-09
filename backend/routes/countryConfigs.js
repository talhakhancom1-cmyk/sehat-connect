const express = require('express');
const { CountryConfig } = require('../models');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { parseSort } = require('../lib/parseSort');

const router = express.Router();

router.get('/', authenticate, requireAdmin(), async (req, res) => {
  try {
    const configs = await CountryConfig.findAll({
      order: parseSort(req.query, ['created_at', 'updated_at', 'country'], 'created_at', 'DESC'),
      limit: 100
    });
    const result = configs.map(c => ({ ...c.toJSON(), created_date: c.created_at }));
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id', authenticate, requireAdmin(), async (req, res) => {
  try {
    const config = await CountryConfig.findByPk(req.params.id);
    if (!config) return res.status(404).json({ error: 'Config not found' });
    res.json({ ...config.toJSON(), created_date: config.created_at });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/', authenticate, requireAdmin(), async (req, res) => {
  try {
    const body = req.body || {};
    if (!body.country || !body.currency || !body.timezone) {
      return res.status(400).json({ error: 'country, currency, and timezone are required' });
    }
    const config = await CountryConfig.create(body);
    res.status(201).json({ ...config.toJSON(), created_date: config.created_at });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.put('/:id', authenticate, requireAdmin(), async (req, res) => {
  try {
    const config = await CountryConfig.findByPk(req.params.id);
    if (!config) return res.status(404).json({ error: 'Config not found' });
    const updates = { ...req.body };
    delete updates.id;
    await config.update(updates);
    res.json({ ...config.toJSON(), created_date: config.created_at });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.delete('/:id', authenticate, requireAdmin(), async (req, res) => {
  try {
    const config = await CountryConfig.findByPk(req.params.id);
    if (!config) return res.status(404).json({ error: 'Config not found' });
    await config.destroy();
    res.json({ message: 'Config deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
