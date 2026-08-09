const express = require('express');
const { TrackingConfig } = require('../models');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { parseSort } = require('../lib/parseSort');

const router = express.Router();

// Public — pixel IDs are safe to expose and must load on every page (incl. pre-login)
router.get('/', async (req, res) => {
  try {
    const configs = await TrackingConfig.findAll({
      order: parseSort(req.query, ['created_at', 'updated_at'], 'created_at', 'DESC'),
      limit: 5
    });
    const result = configs.map(c => ({ ...c.toJSON(), created_date: c.created_at }));
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/', authenticate, requireAdmin(), async (req, res) => {
  try {
    const body = req.body || {};
    const config = await TrackingConfig.create({
      meta_pixel_id: body.meta_pixel_id || '',
      tiktok_pixel_id: body.tiktok_pixel_id || '',
      meta_enabled: body.meta_enabled !== false,
      tiktok_enabled: body.tiktok_enabled !== false,
      note: body.note || ''
    });
    res.status(201).json({ ...config.toJSON(), created_date: config.created_at });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.put('/:id', authenticate, requireAdmin(), async (req, res) => {
  try {
    const config = await TrackingConfig.findByPk(req.params.id);
    if (!config) return res.status(404).json({ error: 'Config not found' });
    await config.update(req.body);
    res.json({ ...config.toJSON(), created_date: config.created_at });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.delete('/:id', authenticate, requireAdmin(), async (req, res) => {
  try {
    const config = await TrackingConfig.findByPk(req.params.id);
    if (!config) return res.status(404).json({ error: 'Config not found' });
    await config.destroy();
    res.json({ message: 'Config deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
