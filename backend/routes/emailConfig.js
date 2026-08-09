/**
 * Email/SMTP configuration routes (admin-only).
 *
 * Endpoints:
 *   GET    /api/v1/email-config         — get current config (password masked)
 *   POST   /api/v1/email-config         — create or update config
 *   POST   /api/v1/email-config/test    — send a test email
 *   DELETE /api/v1/email-config          — deactivate email config
 */
const express = require('express');
const { EmailConfig } = require('../models');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { sendEmail, invalidateTransporter, getEmailConfig } = require('../lib/emailService');

const router = express.Router();

// All routes require authentication + admin role
router.use(authenticate, requireAdmin());

// GET /api/v1/email-config — get current config (password never exposed)
router.get('/', async (req, res) => {
  try {
    const config = await EmailConfig.findOne({
      order: [['updated_at', 'DESC']],
    });
    if (!config) {
      return res.json({ configured: false });
    }
    const json = config.toJSON();
    // Mask the password — only show whether it's set
    json.smtp_password_set = !!json.smtp_password;
    delete json.smtp_password;
    json.configured = true;
    res.json(json);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/v1/email-config — create or update config
router.post('/', async (req, res) => {
  try {
    const body = req.body || {};

    // Validate required fields
    if (!body.smtp_host || !body.smtp_username || !body.from_email) {
      return res.status(400).json({
        error: 'smtp_host, smtp_username, and from_email are required',
      });
    }

    const existing = await EmailConfig.findOne({ order: [['updated_at', 'DESC']] });

    const configData = {
      smtp_host: body.smtp_host.trim(),
      smtp_port: parseInt(body.smtp_port, 10) || 587,
      smtp_secure: body.smtp_secure !== undefined ? !!body.smtp_secure : (parseInt(body.smtp_port, 10) === 465),
      smtp_username: body.smtp_username.trim(),
      from_email: body.from_email.trim(),
      from_name: body.from_name || 'Sehat Connect',
      reply_to: body.reply_to || null,
      enable_password_reset: body.enable_password_reset !== false,
      enable_signup_otp: !!body.enable_signup_otp,
      enable_appointment_reminders: body.enable_appointment_reminders !== false,
      enable_medication_reminders: body.enable_medication_reminders !== false,
      enable_consent_notifications: body.enable_consent_notifications !== false,
      enable_chat_notifications: body.enable_chat_notifications !== false,
      enable_payment_receipts: body.enable_payment_receipts !== false,
      is_active: body.is_active !== false,
      updated_by_user_id: req.user.id,
    };

    // Only update the password if a new one is provided
    if (body.smtp_password && body.smtp_password.trim()) {
      configData.smtp_password = body.smtp_password.trim();
    } else if (existing) {
      configData.smtp_password = existing.smtp_password;
    } else {
      return res.status(400).json({ error: 'smtp_password is required on first setup' });
    }

    let config;
    if (existing) {
      await existing.update(configData);
      config = existing;
    } else {
      config = await EmailConfig.create(configData);
    }

    // Invalidate cached transporter so it reconnects with new settings
    invalidateTransporter();

    const json = config.toJSON();
    json.smtp_password_set = !!json.smtp_password;
    delete json.smtp_password;
    json.configured = true;
    res.json(json);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// POST /api/v1/email-config/test — send a test email
router.post('/test', async (req, res) => {
  try {
    const { to } = req.body || {};
    const testEmail = to || req.user.email;
    if (!testEmail) {
      return res.status(400).json({ error: 'Test email address is required (provide "to" in body)' });
    }

    const config = await getEmailConfig();
    if (!config) {
      return res.status(400).json({ error: 'Email not configured. Save SMTP settings first.' });
    }

    const result = await sendEmail({
      to: testEmail,
      subject: 'Sehat Connect — Test Email',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #4f46e5;">Test Email Successful!</h2>
          <p>This is a test email from Sehat Connect. If you're seeing this, your SMTP configuration is working correctly.</p>
          <table style="width: 100%; margin: 20px 0;">
            <tr><td style="padding: 4px 0; color: #666;">SMTP Host:</td><td>${config.smtp_host}</td></tr>
            <tr><td style="padding: 4px 0; color: #666;">Port:</td><td>${config.smtp_port}</td></tr>
            <tr><td style="padding: 4px 0; color: #666;">From:</td><td>${config.from_name} &lt;${config.from_email}&gt;</td></tr>
            <tr><td style="padding: 4px 0; color: #666;">Sent at:</td><td>${new Date().toISOString()}</td></tr>
          </table>
          <p style="color: #999; font-size: 12px;">You can now enable email notifications for password resets, appointment reminders, and more.</p>
        </div>
      `,
    });

    if (result.success) {
      res.json({ success: true, message: `Test email sent to ${testEmail}`, messageId: result.messageId });
    } else {
      res.status(400).json({ success: false, error: result.error });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/v1/email-config — deactivate email config
router.delete('/', async (req, res) => {
  try {
    const config = await EmailConfig.findOne({ order: [['updated_at', 'DESC']] });
    if (!config) {
      return res.status(404).json({ error: 'No email config found' });
    }
    await config.update({ is_active: false });
    invalidateTransporter();
    res.json({ success: true, message: 'Email config deactivated' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
