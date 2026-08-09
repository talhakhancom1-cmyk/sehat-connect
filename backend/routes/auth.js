const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { User, Session, PasswordReset } = require('../models');

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

// POST /api/auth/forgot-password
// Generates a reset token and stores it. Returns the token in dev mode;
// in production, the token is only returned if no email service is configured.
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body || {};
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }
    const user = await User.findOne({ where: { email } });
    if (!user) {
      // Don't reveal whether the email exists — return success either way
      return res.json({ success: true, message: 'If the email exists, a reset link has been sent.' });
    }

    // Generate a secure random token
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    // Invalidate any previous reset tokens for this user
    if (PasswordReset) {
      await PasswordReset.update(
        { used: true },
        { where: { user_id: user.id, used: false } }
      );
      await PasswordReset.create({
        user_id: user.id,
        token,
        expires_at: expiresAt,
        used: false
      });
    }

    // TODO: Send email with reset link when email service is configured
    // For now, return the token so the frontend can build the reset URL
    if (process.env.NODE_ENV !== 'production' || !process.env.EMAIL_SERVICE) {
      return res.json({
        success: true,
        message: 'Reset token generated.',
        reset_token: token,
        reset_url: `/reset-password?token=${token}`
      });
    }

    // In production with email service, send email and don't return token
    // await sendEmail(user.email, 'Password Reset', `Click here: ${resetUrl}`);
    res.json({ success: true, message: 'If the email exists, a reset link has been sent.' });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/auth/reset-password
// Validates the reset token and updates the password
router.post('/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body || {};
    if (!token || !password) {
      return res.status(400).json({ error: 'Token and new password are required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    if (!PasswordReset) {
      return res.status(503).json({ error: 'Password reset is not available' });
    }

    const resetRecord = await PasswordReset.findOne({
      where: { token, used: false }
    });
    if (!resetRecord) {
      return res.status(400).json({ error: 'Invalid or expired reset token' });
    }
    if (new Date(resetRecord.expires_at) < new Date()) {
      await resetRecord.update({ used: true });
      return res.status(400).json({ error: 'Reset token has expired' });
    }

    const user = await User.findByPk(resetRecord.user_id);
    if (!user) {
      return res.status(400).json({ error: 'User not found' });
    }

    const password_hash = await bcrypt.hash(password, 12);
    await user.update({ password_hash });
    await resetRecord.update({ used: true });

    // Revoke all existing sessions for this user (force re-login)
    await Session.update(
      { is_revoked: true, revoked_at: new Date() },
      { where: { user_id: user.id, is_revoked: false } }
    );

    res.json({ success: true, message: 'Password reset successfully. Please login with your new password.' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/auth/change-password
// Authenticated password change (requires current password)
router.post('/change-password', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);

    const { currentPassword, newPassword } = req.body || {};
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current password and new password are required' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters' });
    }

    const user = await User.findByPk(decoded.id);
    if (!user || !user.password_hash) {
      return res.status(400).json({ error: 'User not found or no password set' });
    }

    const valid = await bcrypt.compare(currentPassword, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    const password_hash = await bcrypt.hash(newPassword, 12);
    await user.update({ password_hash });

    res.json({ success: true, message: 'Password changed successfully.' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/auth/verify-reset-token
// Checks if a reset token is valid (used by frontend before showing reset form)
router.post('/verify-reset-token', async (req, res) => {
  try {
    const { token } = req.body || {};
    if (!token) {
      return res.status(400).json({ error: 'Token is required' });
    }
    if (!PasswordReset) {
      return res.status(503).json({ error: 'Password reset is not available' });
    }
    const resetRecord = await PasswordReset.findOne({
      where: { token, used: false }
    });
    if (!resetRecord) {
      return res.status(400).json({ valid: false, error: 'Invalid or expired reset token' });
    }
    if (new Date(resetRecord.expires_at) < new Date()) {
      return res.status(400).json({ valid: false, error: 'Reset token has expired' });
    }
    res.json({ valid: true });
  } catch (error) {
    console.error('Verify reset token error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
