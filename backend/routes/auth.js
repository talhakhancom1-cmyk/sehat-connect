const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { User, Session } = require('../models');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-jwt-secret-do-not-use-in-production';
const TOKEN_TTL = process.env.JWT_TTL || '7d';

function generateToken(user, jti) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role, app_role: user.app_role, jti },
    JWT_SECRET,
    { expiresIn: TOKEN_TTL }
  );
}

async function createSession(user, token, req) {
  try {
    const decoded = jwt.decode(token);
    if (!decoded?.jti) return null;
    const expiresAt = new Date((decoded.exp || 0) * 1000);
    return await Session.create({
      user_id: user.id,
      token_jti: decoded.jti,
      ip_address: req?.ip || req?.headers['x-forwarded-for'] || null,
      user_agent: req?.headers['user-agent'] || null,
      expires_at: expiresAt
    });
  } catch (error) {
    console.error('Session creation error:', error.message);
    return null;
  }
}

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    const user = await User.findOne({ where: { email } });
    if (!user || !user.password_hash) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    const jti = uuidv4();
    const token = generateToken(user, jti);
    await createSession(user, token, req);
    res.json({ token, user });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/auth/me
router.get('/me', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findByPk(decoded.id);
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }
    res.json(user);
  } catch (error) {
    console.error('Me error:', error);
    res.status(401).json({ error: 'Unauthorized' });
  }
});

// PUT /api/auth/me
router.put('/me', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findByPk(decoded.id);
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }
    await user.update(req.body);
    res.json(user);
  } catch (error) {
    console.error('Update me error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { email, password, fullName, role } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    const existing = await User.findOne({ where: { email } });
    if (existing) {
      return res.status(409).json({ error: 'Email already in use' });
    }
    const requestedRole = User.ROLE_VALUES.includes(role) ? role : User.ROLES.PATIENT;
    const password_hash = await bcrypt.hash(password, 10);
    const user = await User.create({
      email,
      password_hash,
      display_name: fullName || email,
      onboarded: true,
      role: requestedRole
    });
    const jti = uuidv4();
    const token = generateToken(user, jti);
    await createSession(user, token, req);
    res.json({ token, user });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/auth/logout
router.post('/logout', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      const decoded = jwt.decode(token);
      if (decoded?.jti) {
        await Session.update(
          { is_revoked: true, revoked_at: new Date() },
          { where: { token_jti: decoded.jti } }
        );
      }
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/auth/refresh
router.post('/refresh', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findByPk(decoded.id);
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    if (decoded.jti) {
      const session = await Session.findOne({ where: { token_jti: decoded.jti, is_revoked: false } });
      if (session) {
        await session.update({ is_revoked: true, revoked_at: new Date() });
      }
    }

    const jti = uuidv4();
    const newToken = generateToken(user, jti);
    await createSession(user, newToken, req);
    res.json({ token: newToken, user });
  } catch (error) {
    console.error('Refresh error:', error);
    res.status(401).json({ error: 'Unauthorized' });
  }
});

module.exports = router;
