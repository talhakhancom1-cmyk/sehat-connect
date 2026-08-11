/**
 * Internal API client for cross-server user lookups.
 *
 * On the WebSocket/signaling server (afridiwins), the database does NOT
 * contain the same users as the main app server (ehcserver). This client
 * fetches minimal user data (DND status, display name, profile picture)
 * from ehcserver's internal API over HTTPS.
 *
 * Configuration (environment variables on afridiwins):
 *   - INTERNAL_API_BASE   e.g. https://ehcserver.webfrat.com
 *   - INTERNAL_API_SECRET shared secret for service-to-service auth
 *
 * If INTERNAL_API_BASE is not set, falls back to local database lookup
 * (for single-server deployments or local development).
 */

const { User } = require('../models');

const INTERNAL_API_BASE = process.env.INTERNAL_API_BASE || '';
const INTERNAL_API_SECRET = process.env.INTERNAL_API_SECRET || '';

// Simple in-memory cache with short TTL to avoid repeated HTTPS calls
// for the same user within a few seconds (e.g. during call setup).
const cache = new Map();
const CACHE_TTL_MS = 5000; // 5 seconds

function getCached(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return entry.value;
}

function setCached(key, value) {
  cache.set(key, { ts: Date.now(), value });
  // Cap cache size
  if (cache.size > 500) {
    const firstKey = cache.keys().next().value;
    cache.delete(firstKey);
  }
}

/**
 * Fetch user call-status from the remote internal API.
 * Falls back to local DB lookup if INTERNAL_API_BASE is not configured.
 *
 * Returns: { id, do_not_disturb, display_name, profile_pic_url, email, role }
 * or null if the user doesn't exist.
 */
async function getUserCallStatus(userId) {
  if (!userId) return null;

  // Try cache first
  const cached = getCached(userId);
  if (cached) return cached;

  // If no remote API configured, fall back to local DB
  if (!INTERNAL_API_BASE || !INTERNAL_API_SECRET) {
    const user = await User.findByPk(userId, {
      attributes: ['id', 'do_not_disturb', 'display_name', 'profile_pic_url', 'email', 'role', 'specialty'],
    }).catch(() => null);
    const result = user ? {
      id: user.id,
      do_not_disturb: !!user.do_not_disturb,
      display_name: user.display_name || null,
      profile_pic_url: user.profile_pic_url || null,
      email: user.email || null,
      role: user.role || null,
      specialty: user.specialty || null,
    } : null;
    if (result) setCached(userId, result);
    return result;
  }

  // Call the remote internal API
  try {
    const url = `${INTERNAL_API_BASE}/internal/users/${userId}/call-status`;
    const response = await fetch(url, {
      headers: { 'x-internal-secret': INTERNAL_API_SECRET },
      signal: AbortSignal.timeout(3000), // 3s timeout — don't block call setup
    });
    if (response.status === 404) {
      setCached(userId, null);
      return null;
    }
    if (!response.ok) {
      console.error(`[internal-client] lookup failed for ${userId}: HTTP ${response.status}`);
      return null;
    }
    const data = await response.json();
    setCached(userId, data);
    return data;
  } catch (err) {
    console.error(`[internal-client] lookup error for ${userId}:`, err.message || err);
    return null;
  }
}

/**
 * Fetch caller identity info (name, photo, role, specialty) for ringing.
 * Uses the same internal API but the /internal/users/:id endpoint which
 * includes specialty.
 */
async function getCallerIdentity(userId) {
  if (!userId) return null;

  const cached = getCached(`caller:${userId}`);
  if (cached) return cached;

  if (!INTERNAL_API_BASE || !INTERNAL_API_SECRET) {
    const user = await User.findByPk(userId, {
      attributes: ['id', 'display_name', 'profile_pic_url', 'email', 'role', 'specialty'],
    }).catch(() => null);
    const result = user ? {
      id: user.id,
      display_name: user.display_name || null,
      profile_pic_url: user.profile_pic_url || null,
      email: user.email || null,
      role: user.role || null,
      specialty: user.specialty || null,
    } : null;
    if (result) setCached(`caller:${userId}`, result);
    return result;
  }

  try {
    const url = `${INTERNAL_API_BASE}/internal/users/${userId}`;
    const response = await fetch(url, {
      headers: { 'x-internal-secret': INTERNAL_API_SECRET },
      signal: AbortSignal.timeout(3000),
    });
    if (response.status === 404) {
      setCached(`caller:${userId}`, null);
      return null;
    }
    if (!response.ok) {
      console.error(`[internal-client] caller lookup failed for ${userId}: HTTP ${response.status}`);
      return null;
    }
    const data = await response.json();
    setCached(`caller:${userId}`, data);
    return data;
  } catch (err) {
    console.error(`[internal-client] caller lookup error for ${userId}:`, err.message || err);
    return null;
  }
}

module.exports = {
  getUserCallStatus,
  getCallerIdentity,
};
