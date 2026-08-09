/**
 * API Key authentication middleware.
 *
 * Verifies an API key sent via the `X-API-Key` header or `Authorization: ApiKey <key>`
 * against the stored SHA-256 hash, checks the requesting domain (Origin / Referer)
 * against the key's allowed_domains allowlist, and tracks usage stats.
 *
 * Usage:
 *   const { authenticateApiKey } = require('../middleware/apiKeyAuth');
 *   router.get('/public-data', authenticateApiKey, handler);
 *
 * The middleware sets req.apiKey to the ApiKey record (without the hash) on success.
 * If the key is invalid, expired, inactive, or the domain is not allowed, it returns 401/403.
 */
const crypto = require('crypto');
const { ApiKey } = require('../models');

/**
 * Extract the origin domain from the request.
 * Checks Origin header first, then Referer, then falls back to Host.
 */
function getRequestDomain(req) {
  // Origin header (set by browsers on cross-origin requests)
  let origin = req.headers.origin;
  if (origin) {
    try {
      const url = new URL(origin);
      return url.hostname;
    } catch {
      // fall through
    }
  }

  // Referer header
  const referer = req.headers.referer;
  if (referer) {
    try {
      const url = new URL(referer);
      return url.hostname;
    } catch {
      // fall through
    }
  }

  // Host header (same-origin requests)
  const host = req.headers.host;
  if (host) {
    return host.split(':')[0]; // strip port
  }

  return null;
}

/**
 * Check if a domain matches the allowed_domains list.
 * Supports wildcard "*" and exact domain matching.
 * Also supports subdomain matching: if "example.com" is in the list,
 * "app.example.com" is also allowed.
 */
function isDomainAllowed(requestDomain, allowedDomains) {
  if (!Array.isArray(allowedDomains) || allowedDomains.length === 0) {
    return false;
  }

  // Wildcard = allow all
  if (allowedDomains.includes('*')) {
    return true;
  }

  if (!requestDomain) {
    return false;
  }

  // Exact match
  if (allowedDomains.includes(requestDomain)) {
    return true;
  }

  // Subdomain match: if "example.com" is allowed, "sub.example.com" is also allowed
  for (const allowed of allowedDomains) {
    if (requestDomain.endsWith('.' + allowed)) {
      return true;
    }
  }

  return false;
}

/**
 * Check if the key has the required scope.
 * "*" means all scopes.
 */
function hasScope(apiKeyScopes, requiredScope) {
  if (!Array.isArray(apiKeyScopes)) return false;
  if (apiKeyScopes.includes('*')) return true;
  return apiKeyScopes.includes(requiredScope);
}

/**
 * Main middleware: authenticate an API key.
 * Optionally pass a required scope as the first argument.
 *
 *   authenticateApiKey                    — just verify the key + domain
 *   authenticateApiKey('read:doctors')    — also check the scope
 */
function authenticateApiKey(requiredScope = null) {
  return async (req, res, next) => {
    try {
      // Extract the key from headers
      let key = req.headers['x-api-key'];
      if (!key) {
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('ApiKey ')) {
          key = authHeader.split('ApiKey ')[1].trim();
        }
      }

      if (!key) {
        return res.status(401).json({
          error: 'API key required',
          hint: 'Send your API key via the X-API-Key header or Authorization: ApiKey <key>',
        });
      }

      // Hash the provided key and look it up
      const keyHash = crypto.createHash('sha256').update(key).digest('hex');
      const apiKey = await ApiKey.findOne({ where: { key_hash: keyHash } });

      if (!apiKey) {
        return res.status(401).json({ error: 'Invalid API key' });
      }

      // Check if key is active
      if (!apiKey.is_active) {
        return res.status(403).json({ error: 'API key has been deactivated' });
      }

      // Check expiry
      if (apiKey.expires_at && new Date(apiKey.expires_at) < new Date()) {
        return res.status(403).json({ error: 'API key has expired' });
      }

      // Check domain allowlist
      const requestDomain = getRequestDomain(req);
      if (!isDomainAllowed(requestDomain, apiKey.allowed_domains)) {
        return res.status(403).json({
          error: 'Domain not allowed',
          request_domain: requestDomain,
          hint: 'Add this domain to the API key\'s allowed_domains list in the admin panel.',
        });
      }

      // Check scope if required
      if (requiredScope && !hasScope(apiKey.scopes, requiredScope)) {
        return res.status(403).json({
          error: 'Insufficient scope',
          required: requiredScope,
          granted: apiKey.scopes,
        });
      }

      // Attach to request for downstream use
      req.apiKey = apiKey;
      req.apiKeyDomain = requestDomain;

      // Update usage stats (fire-and-forget, don't block the request)
      const updateData = {
        last_used_at: new Date(),
        last_used_ip: req.ip || req.headers['x-forwarded-for'] || null,
        last_used_origin: requestDomain,
        total_requests: (apiKey.total_requests || 0) + 1,
      };
      apiKey.update(updateData).catch(() => {});

      next();
    } catch (error) {
      console.error('API key auth error:', error);
      res.status(500).json({ error: 'Authentication error' });
    }
  };
}

module.exports = {
  authenticateApiKey,
  getRequestDomain,
  isDomainAllowed,
  hasScope,
};
