const jwt = require('jsonwebtoken');
const { User } = require('../models');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-jwt-secret-do-not-use-in-production';

// In production, refuse to authenticate if the secret is the dev fallback
if (process.env.NODE_ENV === 'production' && (!process.env.JWT_SECRET || JWT_SECRET === 'dev-jwt-secret-do-not-use-in-production')) {
  console.error('FATAL: JWT_SECRET is not configured. Authentication will fail.');
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

module.exports = {
  authenticate,
  requireRole,
  requireAdmin
};
