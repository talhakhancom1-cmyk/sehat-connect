const express = require('express');
const { Notification, Device } = require('../models');
const { authenticate } = require('../middleware/auth');
const { parseSort } = require('../lib/parseSort');
const { sendNotification } = require('../lib/notificationDispatcher');
const { paginate, buildPaginatedResponse } = require('../lib/paginate');

const router = express.Router();

// GET /api/v1/notifications — return the current user's notifications
router.get('/', authenticate, async (req, res) => {
  try {
    const where = { user_id: req.user.id };
    if (req.query.read === 'true') where.read = true;
    if (req.query.read === 'false') where.read = false;
    if (req.query.type) where.type = req.query.type;
    const { offset, limit } = paginate(req);
    const { rows, count } = await Notification.findAndCountAll({
      where,
      order: parseSort(req.query, ['created_at', 'read_at', 'sent_at'], 'created_at', 'DESC'),
      offset,
      limit
    });
    const result = rows.map(n => ({ ...n.toJSON(), created_date: n.created_at }));
    res.json(buildPaginatedResponse(req, result, count));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/v1/notifications
router.post('/', authenticate, async (req, res) => {
  try {
    const body = req.body || {};
    const io = req.app.get('io');
    const notification = await sendNotification({
      user_id: body.user_id || req.user.id,
      type: body.type || 'system',
      title: body.title,
      body: body.body || '',
      data: body.data || {},
      priority: body.priority || 'normal',
      expires_at: body.expires_at,
    }, io);
    res.status(201).json({ ...notification.toJSON(), created_date: notification.created_at });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// POST /api/v1/notifications/register-device — register a push token for the current user
router.post('/register-device', authenticate, async (req, res) => {
  try {
    const body = req.body || {};
    if (!body.device_type || !body.push_token) {
      return res.status(400).json({ error: 'device_type and push_token are required' });
    }
    const [device, created] = await Device.findOrCreate({
      where: { user_id: req.user.id, push_token: body.push_token },
      defaults: {
        user_id: req.user.id,
        device_type: body.device_type,
        push_token: body.push_token,
        voip_token: body.voip_token,
        os: body.os,
        os_version: body.os_version,
        app_version: body.app_version,
        browser: body.browser,
        last_active_at: new Date(),
        is_trusted: !!body.is_trusted,
      },
    });
    if (!created) {
      await device.update({
        last_active_at: new Date(),
        device_type: body.device_type,
        voip_token: body.voip_token || device.voip_token,
        is_revoked: false,
        revoked_at: null,
      });
    }
    res.json({ success: true, device_id: device.id });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// DELETE /api/v1/notifications/unregister-device — remove a push token
router.delete('/unregister-device', authenticate, async (req, res) => {
  try {
    const { push_token } = req.body || {};
    if (!push_token) {
      return res.status(400).json({ error: 'push_token is required' });
    }
    await Device.update(
      { is_revoked: true, revoked_at: new Date() },
      { where: { user_id: req.user.id, push_token } }
    );
    res.json({ success: true });
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
