const jwt = require('jsonwebtoken');
const { User } = require('../models');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required');
}

async function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findByPk(decoded.id);
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }
    req.user = user;
    req.tokenJti = decoded.jti || null;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    return res.status(401).json({ error: 'Unauthorized' });
  }
}

function requireRole(roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    next();
  };
}

function requireAdmin() {
  return requireRole(['clinic_admin', 'support_agent', 'compliance_auditor', 'super_admin']);
}

// Require a specific granular permission (stored in user.permissions JSONB).
// Super admins bypass the check — they have all permissions implicitly.
function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    // Super admins have all permissions
    if (req.user.role === 'super_admin') return next();
    // Check the permissions JSON
    const perms = req.user.permissions || {};
    if (!perms[permission]) {
      return res.status(403).json({ error: `Missing permission: ${permission}` });
    }
    next();
  };
}

// Check if the current user is a full admin (super_admin or clinic_admin)
// vs a support agent with limited permissions.
function isFullAdmin(user) {
  return user.role === 'super_admin' || user.role === 'clinic_admin';
}

module.exports = {
  authenticate,
  requireRole,
  requireAdmin,
  requirePermission,
  isFullAdmin
};
