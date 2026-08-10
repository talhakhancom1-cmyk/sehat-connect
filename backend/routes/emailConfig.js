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
const nodemailer = require('nodemailer');
const { EmailConfig } = require('../models');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { sendEmail, invalidateTransporter, getEmailConfig } = require('../lib/emailService');
const { decrypt } = require('../lib/crypto');

const router = express.Router();

// All routes require authentication + admin role
router.use(authenticate, requireAdmin());

// GET /api/v1/email-config/diagnose — full SMTP diagnostic (admin only)
// Shows stored config, password decryption status, and tests the actual connection
router.get('/diagnose', async (req, res) => {
  try {
    const config = await EmailConfig.findOne({
      where: { is_active: true },
      order: [['updated_at', 'DESC']],
    });

    if (!config) {
      return res.json({
        configured: false,
        message: 'No active email configuration found in database',
      });
    }

    // Check password decryption
    const rawPassword = config.smtp_password;
    const decryptedPassword = decrypt(rawPassword);
    const passwordDecryptable = decryptedPassword !== null && decryptedPassword.length > 0;

    const diag = {
      configured: true,
      config: {
        id: config.id,
        smtp_host: config.smtp_host,
        smtp_port: config.smtp_port,
        smtp_secure: config.smtp_secure,
        smtp_username: config.smtp_username,
        from_email: config.from_email,
        from_name: config.from_name,
        is_active: config.is_active,
        updated_at: config.updated_at,
      },
      password: {
        stored: !!rawPassword,
        stored_length: rawPassword ? rawPassword.length : 0,
        looks_encrypted: rawPassword ? rawPassword.includes(':') : false,
        decryptable: passwordDecryptable,
        decrypted_length: passwordDecryptable ? decryptedPassword.length : 0,
      },
      env: {
        EMAIL_ENCRYPTION_KEY_set: !!process.env.EMAIL_ENCRYPTION_KEY,
        FILE_DOWNLOAD_SECRET_set: !!process.env.FILE_DOWNLOAD_SECRET,
        JWT_SECRET_set: !!process.env.JWT_SECRET,
      },
    };

    // Attempt actual SMTP connection test
    if (!passwordDecryptable) {
      diag.smtp_test = {
        success: false,
        error: 'Password could not be decrypted. The JWT_SECRET/FILE_DOWNLOAD_SECRET on this server may differ from when the config was saved. Re-save the SMTP settings to fix.',
      };
      return res.json(diag);
    }

    try {
      console.log('[diagnose] Testing SMTP connection', {
        host: config.smtp_host,
        port: config.smtp_port,
        secure: config.smtp_secure,
        username: config.smtp_username,
      });

      const transporter = nodemailer.createTransport({
        host: config.smtp_host,
        port: config.smtp_port,
        secure: config.smtp_secure,
        auth: {
          user: config.smtp_username,
          pass: decryptedPassword,
        },
        connectionTimeout: 15000,
        greetingTimeout: 10000,
        socketTimeout: 20000,
      });

      await transporter.verify();
      diag.smtp_test = { success: true, message: 'SMTP connection verified successfully' };
      transporter.close();
    } catch (smtpErr) {
      diag.smtp_test = {
        success: false,
        error: smtpErr.message,
        code: smtpErr.code,
        command: smtpErr.command,
        response: smtpErr.response,
      };
    }

    res.json(diag);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

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
    console.log('[email-config] POST received, body keys:', Object.keys(body), {
      smtp_host: body.smtp_host,
      smtp_username: body.smtp_username,
      from_email: body.from_email,
      has_password: !!body.smtp_password,
    });

    // Validate required fields
    if (!body.smtp_host || !body.smtp_username || !body.from_email) {
      console.error('[email-config] validation failed:', {
        smtp_host: !!body.smtp_host,
        smtp_username: !!body.smtp_username,
        from_email: !!body.from_email,
      });
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
