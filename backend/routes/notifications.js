const express = require('express');
const { Notification } = require('../models');
const { authenticate } = require('../middleware/auth');
const { parseSort } = require('../lib/parseSort');

const router = express.Router();

// GET /api/v1/notifications — return the current user's notifications
router.get('/', authenticate, async (req, res) => {
  try {
    const where = { user_id: req.user.id };
    if (req.query.read === 'true') where.read = true;
    if (req.query.read === 'false') where.read = false;
    if (req.query.type) where.type = req.query.type;
    const limit = Math.min(Number(req.query._limit) || 200, 500);
    const notifications = await Notification.findAll({
      where,
      order: parseSort(req.query, ['created_at', 'read_at', 'sent_at'], 'created_at', 'DESC'),
      limit
    });
    const result = notifications.map(n => ({ ...n.toJSON(), created_date: n.created_at }));
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/v1/notifications
router.post('/', authenticate, async (req, res) => {
  try {
    const body = req.body || {};
    const notification = await Notification.create({
      user_id: body.user_id || req.user.id,
      type: body.type || 'system',
      title: body.title,
      body: body.body || '',
      data: body.data || {},
      priority: body.priority || 'normal',
      read: false,
      expires_at: body.expires_at,
      sent_at: new Date()
    });
    res.status(201).json({ ...notification.toJSON(), created_date: notification.created_at });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// PUT /api/v1/notifications/:id
router.put('/:id', authenticate, async (req, res) => {
  try {
    const notification = await Notification.findByPk(req.params.id);
    if (!notification) {
      return res.status(404).json({ error: 'Notification not found' });
    }
    if (notification.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const updates = { ...req.body };
    delete updates.id;
    delete updates.user_id;
    if (updates.read === true) {
      updates.read_at = new Date();
    }
    await notification.update(updates);
    res.json(notification);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// DELETE /api/v1/notifications/:id
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const notification = await Notification.findByPk(req.params.id);
    if (!notification) {
      return res.status(404).json({ error: 'Notification not found' });
    }
    if (notification.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    await notification.destroy();
    res.json({ message: 'Notification deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/v1/notifications/mark-all-read
router.post('/mark-all-read', authenticate, async (req, res) => {
  try {
    await Notification.update(
      { read: true, read_at: new Date() },
      { where: { user_id: req.user.id, read: false } }
    );
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
