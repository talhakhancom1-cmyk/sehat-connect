/**
 * API Key management routes (admin-only).
 *
 * Endpoints:
 *   GET    /api/v1/api-keys           — list all keys (key hash never exposed)
 *   POST   /api/v1/api-keys           — create a new key (full key returned ONCE)
 *   GET    /api/v1/api-keys/:id       — get a single key
 *   PUT    /api/v1/api-keys/:id       — update name, allowed_domains, scopes, is_active, expires_at
 *   DELETE /api/v1/api-keys/:id       — revoke + delete a key
 *   POST   /api/v1/api-keys/:id/rotate — generate a new key string for an existing key
 */
const express = require('express');
const crypto = require('crypto');
const { ApiKey } = require('../models');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { paginate, buildPaginatedResponse } = require('../lib/paginate');

const router = express.Router();

/**
 * Generate a new API key string.
 * Format: sk_live_<32 hex chars>_<16 hex chars>
 */
function generateApiKeyString() {
  const part1 = crypto.randomBytes(16).toString('hex');
  const part2 = crypto.randomBytes(8).toString('hex');
  return `sk_live_${part1}_${part2}`;
}

/**
 * Hash an API key string with SHA-256 for secure storage.
 */
function hashApiKey(key) {
  return crypto.createHash('sha256').update(key).digest('hex');
}

/**
 * Extract a display prefix from a full key (first 20 chars + …).
 */
function keyPrefix(key) {
  return key.substring(0, 20) + '…';
}

// All routes require authentication + admin role
router.use(authenticate, requireAdmin());

// GET /api/v1/api-keys — list all keys
router.get('/', async (req, res) => {
  try {
    const { offset, limit } = paginate(req);
    const { rows, count } = await ApiKey.findAndCountAll({
      order: [['created_at', 'DESC']],
      offset,
      limit,
    });
    // Never expose key_hash — only the prefix
    const result = rows.map((k) => {
      const json = k.toJSON();
      delete json.key_hash;
      return json;
    });
    res.json(buildPaginatedResponse(req, result, count));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/v1/api-keys/:id
router.get('/:id', async (req, res) => {
  try {
    const key = await ApiKey.findByPk(req.params.id);
    if (!key) {
      return res.status(404).json({ error: 'API key not found' });
    }
    const json = key.toJSON();
    delete json.key_hash;
    res.json(json);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/v1/api-keys — create a new key
// Body: { name, allowed_domains, scopes, rate_limit_per_minute, expires_at }
router.post('/', async (req, res) => {
  try {
    const body = req.body || {};
    if (!body.name || !body.name.trim()) {
      return res.status(400).json({ error: 'name is required' });
    }

    // Parse and validate allowed_domains
    let allowedDomains = body.allowed_domains;
    if (typeof allowedDomains === 'string') {
      allowedDomains = allowedDomains.split(',').map((d) => d.trim()).filter(Boolean);
    }
    if (!Array.isArray(allowedDomains)) {
      allowedDomains = [];
    }
    // Validate domain format
    for (const domain of allowedDomains) {
      if (domain !== '*' && !/^[a-zA-Z0-9]([a-zA-Z0-9-]*\.)+[a-zA-Z]{2,}$/.test(domain) && !/^[a-zA-Z0-9]([a-zA-Z0-9-]*\.)+[a-zA-Z]{2,}$/.test(domain)) {
        return res.status(400).json({ error: `Invalid domain format: "${domain}". Use format like "example.com" or "app.example.com", or "*" for all.` });
      }
    }

    // Parse scopes
    let scopes = body.scopes;
    if (typeof scopes === 'string') {
      scopes = scopes.split(',').map((s) => s.trim()).filter(Boolean);
    }
    if (!Array.isArray(scopes) || scopes.length === 0) {
      scopes = ['*'];
    }

    const fullKey = generateApiKeyString();
    const keyRecord = await ApiKey.create({
      name: body.name.trim(),
      key_hash: hashApiKey(fullKey),
      key_prefix: keyPrefix(fullKey),
      allowed_domains: allowedDomains,
      scopes,
      rate_limit_per_minute: body.rate_limit_per_minute || 60,
      created_by_user_id: req.user.id,
      is_active: true,
      expires_at: body.expires_at || null,
    });

    // Return the full key ONCE — it's never retrievable again
    const json = keyRecord.toJSON();
    delete json.key_hash;
    json.full_key = fullKey;
    json.warning = 'Save this key securely. It will not be shown again.';

    res.status(201).json(json);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// PUT /api/v1/api-keys/:id — update key metadata (not the key itself)
router.put('/:id', async (req, res) => {
  try {
    const key = await ApiKey.findByPk(req.params.id);
    if (!key) {
      return res.status(404).json({ error: 'API key not found' });
    }

    const updates = {};
    const body = req.body || {};

    if (body.name !== undefined) {
      if (!body.name || !body.name.trim()) {
        return res.status(400).json({ error: 'name cannot be empty' });
      }
      updates.name = body.name.trim();
    }

    if (body.allowed_domains !== undefined) {
      let domains = body.allowed_domains;
      if (typeof domains === 'string') {
        domains = domains.split(',').map((d) => d.trim()).filter(Boolean);
      }
      if (!Array.isArray(domains)) domains = [];
      updates.allowed_domains = domains;
    }

    if (body.scopes !== undefined) {
      let scopes = body.scopes;
      if (typeof scopes === 'string') {
        scopes = scopes.split(',').map((s) => s.trim()).filter(Boolean);
      }
      if (!Array.isArray(scopes) || scopes.length === 0) scopes = ['*'];
      updates.scopes = scopes;
    }

    if (body.is_active !== undefined) {
      updates.is_active = !!body.is_active;
    }

    if (body.expires_at !== undefined) {
      updates.expires_at = body.expires_at || null;
    }

    if (body.rate_limit_per_minute !== undefined) {
      updates.rate_limit_per_minute = parseInt(body.rate_limit_per_minute, 10) || 60;
    }

    await key.update(updates);
    const json = key.toJSON();
    delete json.key_hash;
    res.json(json);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// POST /api/v1/api-keys/:id/rotate — generate a new key string
router.post('/:id/rotate', async (req, res) => {
  try {
    const key = await ApiKey.findByPk(req.params.id);
    if (!key) {
      return res.status(404).json({ error: 'API key not found' });
    }

    const fullKey = generateApiKeyString();
    await key.update({
      key_hash: hashApiKey(fullKey),
      key_prefix: keyPrefix(fullKey),
      total_requests: 0,
      last_used_at: null,
      last_used_ip: null,
      last_used_origin: null,
    });

    const json = key.toJSON();
    delete json.key_hash;
    json.full_key = fullKey;
    json.warning = 'Save this new key securely. The old key is no longer valid.';

    res.json(json);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// DELETE /api/v1/api-keys/:id — permanently delete a key
router.delete('/:id', async (req, res) => {
  try {
    const key = await ApiKey.findByPk(req.params.id);
    if (!key) {
      return res.status(404).json({ error: 'API key not found' });
    }
    await key.destroy();
    res.json({ success: true, message: 'API key deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
