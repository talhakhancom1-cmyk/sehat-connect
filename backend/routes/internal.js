/**
 * Internal service-to-service API.
 *
 * These endpoints are NOT under /api and are NOT authenticated with user JWTs.
 * They are protected by a separate INTERNAL_API_SECRET shared between the
 * app server (ehcserver) and the WebSocket/signaling server (afridiwins).
 *
 * The secret is sent as the `x-internal-secret` header and must match the
 * INTERNAL_API_SECRET environment variable on this server.
 *
 * Purpose: allow afridiwins to look up minimal user data (DND status,
 * display name, profile picture) for call signaling without needing direct
 * database access to ehcserver's PostgreSQL.
 */

const express = require('express');
const { User } = require('../models');

const router = express.Router();

const INTERNAL_API_SECRET = process.env.INTERNAL_API_SECRET;

// Middleware: verify the internal service secret.
function verifyInternalSecret(req, res, next) {
  if (!INTERNAL_API_SECRET) {
    return res.status(503).json({ error: 'Internal API not configured' });
  }
  const provided = req.headers['x-internal-secret'];
  if (!provided || provided !== INTERNAL_API_SECRET) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  next();
}

router.use(verifyInternalSecret);

/**
 * GET /internal/users/:id/call-status
 *
 * Returns ONLY the fields needed for call signaling:
 *   - do_not_disturb (boolean)
 *   - display_name (string|null)
 *   - profile_pic_url (string|null)
 *   - email (string|null) — used as fallback for caller name
 *   - role (string|null) — used for caller display
 *
 * Returns 404 if the user doesn't exist. No other fields are exposed.
 */
router.get('/users/:id/call-status', async (req, res) => {
  try {
    const user = await User.findByPk(req.params.id, {
      attributes: ['id', 'do_not_disturb', 'display_name', 'profile_pic_url', 'email', 'role'],
    });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({
      id: user.id,
      do_not_disturb: !!user.do_not_disturb,
      display_name: user.display_name || null,
      profile_pic_url: user.profile_pic_url || null,
      email: user.email || null,
      role: user.role || null,
    });
  } catch (error) {
    res.status(500).json({ error: 'Lookup failed' });
  }
});

/**
 * GET /internal/users/:id
 *
 * Returns the same minimal fields as call-status plus specialty.
 * Used for caller identity lookups during call initiation.
 */
router.get('/users/:id', async (req, res) => {
  try {
    const user = await User.findByPk(req.params.id, {
      attributes: ['id', 'do_not_disturb', 'display_name', 'profile_pic_url', 'email', 'role', 'specialty'],
    });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({
      id: user.id,
      do_not_disturb: !!user.do_not_disturb,
      display_name: user.display_name || null,
      profile_pic_url: user.profile_pic_url || null,
      email: user.email || null,
      role: user.role || null,
      specialty: user.specialty || null,
    });
  } catch (error) {
    res.status(500).json({ error: 'Lookup failed' });
  }
});

module.exports = router;
