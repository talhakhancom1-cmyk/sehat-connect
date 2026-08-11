/**
 * AI configuration routes (admin-only).
 *
 * Endpoints:
 *   GET    /api/v1/ai-config          — get current config (API key masked)
 *   POST   /api/v1/ai-config          — create or update config
 *   POST   /api/v1/ai-config/test     — test the OpenAI API key
 *   DELETE /api/v1/ai-config          — deactivate AI config
 */
const express = require('express');
const { AiConfig } = require('../models');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { sanitizeError } = require('../lib/validate');
const { invalidateAiConfigCache } = require('../lib/openai');

const router = express.Router();

// All routes require authentication + admin role
router.use(authenticate, requireAdmin());

// GET /api/v1/ai-config — get current config (API key never exposed)
router.get('/', async (req, res) => {
  try {
    const config = await AiConfig.findOne({
      where: { is_active: true },
      order: [['updated_at', 'DESC']],
    });
    if (!config) {
      return res.json({ configured: false });
    }
    const json = config.toJSON();
    // Mask the API key — only show whether it's set and a prefix
    json.openai_api_key_set = !!json.openai_api_key;
    if (json.openai_api_key) {
      json.openai_api_key_prefix = json.openai_api_key.substring(0, 7) + '...';
    }
    delete json.openai_api_key;
    json.configured = true;
    res.json(json);
  } catch (error) {
    res.status(500).json({ error: sanitizeError(error) });
  }
});

// POST /api/v1/ai-config — create or update config
router.post('/', async (req, res) => {
  try {
    const { openai_api_key, openai_model, symptom_checker_enabled, daily_check_limit } = req.body;

    let config = await AiConfig.findOne({
      where: { is_active: true },
      order: [['updated_at', 'DESC']],
    });

    const updates = { updated_by_user_id: req.user.id };

    // Only update the API key if a new one is provided (non-empty)
    if (openai_api_key && openai_api_key.trim()) {
      updates.openai_api_key = openai_api_key.trim();
    }
    if (openai_model) updates.openai_model = openai_model;
    if (typeof symptom_checker_enabled === 'boolean') updates.symptom_checker_enabled = symptom_checker_enabled;
    if (typeof daily_check_limit === 'number' && daily_check_limit >= 1 && daily_check_limit <= 100) {
      updates.daily_check_limit = daily_check_limit;
    }

    if (config) {
      await config.update(updates);
    } else {
      config = await AiConfig.create({
        ...updates,
        is_active: true,
      });
    }

    // Invalidate the openai.js config cache so the new key is picked up immediately
    invalidateAiConfigCache();

    // Return with masked key
    const json = config.toJSON();
    json.openai_api_key_set = !!json.openai_api_key;
    if (json.openai_api_key) {
      json.openai_api_key_prefix = json.openai_api_key.substring(0, 7) + '...';
    }
    delete json.openai_api_key;
    json.configured = true;
    res.json(json);
  } catch (error) {
    res.status(500).json({ error: sanitizeError(error) });
  }
});

// POST /api/v1/ai-config/test — test the OpenAI API key
router.post('/test', async (req, res) => {
  try {
    let config = await AiConfig.findOne({
      where: { is_active: true },
      order: [['updated_at', 'DESC']],
    });

    // If a new key is provided in the test request, use it (don't save yet)
    let apiKey = req.body?.openai_api_key?.trim() || config?.openai_api_key;
    const model = req.body?.openai_model || config?.openai_model || 'gpt-4o-mini';

    if (!apiKey) {
      return res.json({ success: false, error: 'No OpenAI API key configured. Add a key first.' });
    }

    // Test with a minimal API call
    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: 'Say "ok"' }],
        max_tokens: 5,
      }),
    });

    if (resp.ok) {
      const data = await resp.json();
      res.json({ success: true, message: `OpenAI API key is valid. Model: ${model}. Test response: "${data.choices?.[0]?.message?.content || 'ok'}"` });
    } else {
      const errBody = await resp.json().catch(() => ({}));
      let errorMsg = errBody?.error?.message || `HTTP ${resp.status}`;
      if (resp.status === 401) errorMsg = 'Invalid API key. Check the key and try again.';
      if (resp.status === 429) errorMsg = 'Rate limited or no credits remaining. Check your OpenAI billing at platform.openai.com/settings/organization/billing';
      res.json({ success: false, error: errorMsg, status: resp.status });
    }
  } catch (error) {
    res.json({ success: false, error: `Network error: ${error.message}` });
  }
});

// DELETE /api/v1/ai-config — deactivate AI config
router.delete('/', async (req, res) => {
  try {
    const config = await AiConfig.findOne({
      where: { is_active: true },
      order: [['updated_at', 'DESC']],
    });
    if (config) {
      await config.update({ is_active: false });
    }
    invalidateAiConfigCache();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: sanitizeError(error) });
  }
});

module.exports = router;
