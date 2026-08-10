const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const User = require('../models/User');
const { AuditLog } = require('../models');
const { sequelize } = require('../config/database');
const { authenticate, requireAdmin, requireRole, requirePermission, isFullAdmin } = require('../middleware/auth');
const { parseSort } = require('../lib/parseSort');
const { pickFields } = require('../lib/pickFields');
const { sendEmail } = require('../lib/emailService');

// Fields an admin can set when creating/updating a user
const USER_WRITABLE_FIELDS = [
  'email', 'role', 'app_role', 'onboarded',
  'display_name', 'phone', 'address', 'city', 'country',
  'profile_pic_url', 'date_of_birth', 'age', 'gender',
  'blood_type', 'allergies', 'emergency_contact_name', 'emergency_contact_phone',
  'specialty', 'pmdc_number', 'consultation_fee', 'experience_years', 'bio',
  'verification_status'
];

// Get all users (admin only)
router.get('/', authenticate, requireAdmin(), async (req, res) => {
  try {
    const users = await User.findAll({
      order: parseSort(req.query, ['created_at', 'updated_at', 'email', 'full_name'], 'created_at', 'DESC'),
      limit: 100
    });
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get user by ID (self or admin)
router.get('/:id', authenticate, async (req, res) => {
  try {
    const isAdmin = ['clinic_admin', 'support_agent', 'compliance_auditor', 'super_admin'].includes(req.user.role);
    if (req.user.id !== req.params.id && !isAdmin) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const user = await User.findByPk(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create new user (admin only — regular registration goes through /api/auth/register)
router.post('/', authenticate, requireAdmin(), async (req, res) => {
  try {
    const user = await User.create(pickFields(req.body, USER_WRITABLE_FIELDS));
    res.status(201).json(user);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Update user (admin only — self-service profile updates go through /api/auth/me)
router.put('/:id', authenticate, requireAdmin(), async (req, res) => {
  try {
    const user = await User.findByPk(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    await user.update(pickFields(req.body, USER_WRITABLE_FIELDS));
    res.json(user);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// POST /api/users/:id/reset-password — admin resets a user's password
// Generates a secure random temp password, emails it to the user,
// sets must_change_password = true, and logs to audit trail.
router.post('/:id/reset-password', authenticate, requirePermission('can_reset_passwords'), async (req, res) => {
  try {
    const target = await User.findByPk(req.params.id);
    if (!target) {
      return res.status(404).json({ error: 'User not found' });
    }
    // Prevent resetting other admins' passwords (only super_admin can do that)
    if (isFullAdmin(target) && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Only super admins can reset other admin passwords' });
    }
    // Prevent self-reset through this endpoint (use change-password instead)
    if (target.id === req.user.id) {
      return res.status(400).json({ error: 'Use the change-password feature to change your own password' });
    }

    // Generate a secure 16-character temporary password
    const tempPassword = crypto.randomBytes(12).toString('base64url').slice(0, 16);
    const password_hash = await bcrypt.hash(tempPassword, 10);

    await target.update({
      password_hash,
      must_change_password: true,
    });

    // Revoke all existing sessions for this user (force re-login)
    const { Session } = require('../models');
    if (Session) {
      await Session.update(
        { is_revoked: true, revoked_at: new Date() },
        { where: { user_id: target.id, is_revoked: false } }
      );
    }

    // Email the temporary password to the user
    const emailResult = await sendEmail({
      to: target.email,
      subject: 'Your password has been reset — Sehat Connect',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #4f46e5;">Password Reset</h2>
          <p>An administrator has reset your Sehat Connect account password.</p>
          <p>Your temporary password is:</p>
          <p style="text-align: center; margin: 20px 0;">
            <span style="font-size: 24px; font-weight: bold; letter-spacing: 2px; color: #4f46e5; background: #f3f4f6; padding: 12px 24px; border-radius: 8px;">${tempPassword}</span>
          </p>
          <p style="color: #dc2626; font-weight: bold;">You must change this password after logging in.</p>
          <p>Log in at <a href="${req.headers.origin || req.headers.referer || 'https://ehcserver.webfrat.com'}">${req.headers.origin || req.headers.referer || 'https://ehcserver.webfrat.com'}</a> with your email and the temporary password above.</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
          <p style="color: #999; font-size: 12px;">If you did not expect this, please contact support immediately. This action was performed by: ${req.user.email}</p>
        </div>
      `,
    });

    // Log to audit trail
    await AuditLog.log(req, 'password_reset', { id: target.id, email: target.email }, {
      email_sent: emailResult.success,
      email_error: emailResult.success ? null : emailResult.error,
    });

    if (!emailResult.success) {
      return res.json({
        success: true,
        warning: `Password was reset but email could not be sent: ${emailResult.error}. Provide the temporary password to the user manually.`,
        temp_password: tempPassword, // Only shown if email failed
      });
    }

    res.json({ success: true, message: `Temporary password emailed to ${target.email}` });
  } catch (error) {
    console.error('Admin password reset error:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/users/:id/audit-log — get audit log entries for a specific user
router.get('/:id/audit-log', authenticate, requireAdmin(), async (req, res) => {
  try {
    const logs = await AuditLog.findAll({
      where: { target_id: req.params.id },
      order: [['created_at', 'DESC']],
      limit: 50,
    });
    res.json(logs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PATCH /api/users/:id/permissions — update granular permissions (super_admin only)
router.patch('/:id/permissions', authenticate, requireRole(['super_admin']), async (req, res) => {
  try {
    const target = await User.findByPk(req.params.id);
    if (!target) {
      return res.status(404).json({ error: 'User not found' });
    }
    const allowedPermissions = [
      'can_view_users', 'can_reset_passwords', 'can_impersonate',
      'can_view_tickets', 'can_view_medical_data'
    ];
    const newPerms = {};
    for (const key of allowedPermissions) {
      if (req.body[key] !== undefined) {
        newPerms[key] = !!req.body[key];
      }
    }
    const merged = { ...(target.permissions || {}), ...newPerms };
    await target.update({ permissions: merged });

    await AuditLog.log(req, 'permission_change', { id: target.id, email: target.email }, {
      permissions_set: newPerms,
      full_permissions: merged,
    });

    res.json({ success: true, permissions: merged });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete user (admin only)
router.delete('/:id', authenticate, requireAdmin(), async (req, res) => {
  try {
    const user = await User.findByPk(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    await user.destroy();
    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
