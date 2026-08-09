/**
 * Email service for Sehat Connect.
 *
 * Uses nodemailer with SMTP settings stored in the EmailConfig table.
 * The admin panel configures the SMTP provider (Gmail, SendGrid, SES, Mailgun, etc.)
 * and this service sends transactional emails:
 *   - Password reset
 *   - Signup OTP
 *   - Appointment reminders
 *   - Medication reminders
 *   - Consent notifications
 *   - Chat notifications
 *   - Payment receipts
 *
 * If no EmailConfig is set up or email is inactive, all sends are skipped gracefully.
 */
const nodemailer = require('nodemailer');
const { EmailConfig } = require('../models');

let cachedTransporter = null;
let cachedConfigId = null;

/**
 * Load the active email config from the database.
 * Returns null if not configured or inactive.
 */
async function getEmailConfig() {
  try {
    const config = await EmailConfig.findOne({
      where: { is_active: true },
      order: [['updated_at', 'DESC']],
    });
    return config;
  } catch (err) {
    console.error('[emailService] Failed to load email config:', err.message);
    return null;
  }
}

/**
 * Create or reuse a nodemailer transporter based on the active config.
 */
async function getTransporter() {
  const config = await getEmailConfig();
  if (!config) return { transporter: null, config: null };

  // Reuse transporter if config hasn't changed
  if (cachedTransporter && cachedConfigId === config.id) {
    return { transporter: cachedTransporter, config };
  }

  try {
    const transporter = nodemailer.createTransport({
      host: config.smtp_host,
      port: config.smtp_port,
      secure: config.smtp_secure,
      auth: {
        user: config.smtp_username,
        pass: config.smtp_password,
      },
    });

    // Verify the connection
    await transporter.verify();

    cachedTransporter = transporter;
    cachedConfigId = config.id;
    return { transporter, config };
  } catch (err) {
    console.error('[emailService] SMTP connection failed:', err.message);
    cachedTransporter = null;
    cachedConfigId = null;
    return { transporter: null, config, error: err.message };
  }
}

/**
 * Invalidate the cached transporter (called when config is updated).
 */
function invalidateTransporter() {
  cachedTransporter = null;
  cachedConfigId = null;
}

/**
 * Send an email using the configured SMTP settings.
 *
 * @param {object} params - { to, subject, html, text, replyTo }
 * @returns {Promise<{ success: boolean, error?: string, messageId?: string }>}
 */
async function sendEmail({ to, subject, html, text, replyTo } = {}) {
  const { transporter, config } = await getTransporter();
  if (!transporter) {
    return { success: false, error: 'Email not configured or SMTP connection failed' };
  }

  if (!to || !subject) {
    return { success: false, error: 'to and subject are required' };
  }

  try {
    const info = await transporter.sendMail({
      from: `"${config.from_name}" <${config.from_email}>`,
      to,
      subject,
      text: text || '',
      html: html || text || '',
      replyTo: replyTo || config.reply_to || undefined,
    });
    return { success: true, messageId: info.messageId };
  } catch (err) {
    console.error('[emailService] Send failed:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Check if a specific email feature is enabled.
 * @param {string} feature - e.g. 'enable_password_reset', 'enable_appointment_reminders'
 */
async function isFeatureEnabled(feature) {
  const config = await getEmailConfig();
  if (!config || !config.is_active) return false;
  return !!config[feature];
}

// ---- Template helpers ----

/**
 * Send a password reset email.
 */
async function sendPasswordResetEmail(toEmail, resetUrl, resetToken) {
  const enabled = await isFeatureEnabled('enable_password_reset');
  if (!enabled) return { success: false, error: 'Password reset emails disabled' };

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #4f46e5;">Password Reset Request</h2>
      <p>You requested a password reset for your Sehat Connect account.</p>
      <p>Click the button below to reset your password. This link expires in 1 hour.</p>
      <p style="text-align: center; margin: 30px 0;">
        <a href="${resetUrl}" style="background: #4f46e5; color: white; padding: 12px 30px; text-decoration: none; border-radius: 8px; font-weight: bold;">Reset Password</a>
      </p>
      <p style="color: #666; font-size: 14px;">Or copy this link: ${resetUrl}</p>
      <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
      <p style="color: #999; font-size: 12px;">If you didn't request this, you can safely ignore this email. Your password has not been changed.</p>
    </div>
  `;
  return sendEmail({
    to: toEmail,
    subject: 'Reset your Sehat Connect password',
    html,
  });
}

/**
 * Send a signup OTP email.
 */
async function sendSignupOtpEmail(toEmail, otpCode) {
  const enabled = await isFeatureEnabled('enable_signup_otp');
  if (!enabled) return { success: false, error: 'Signup OTP emails disabled' };

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #4f46e5;">Verify Your Email</h2>
      <p>Welcome to Sehat Connect! Use the code below to verify your email address.</p>
      <p style="text-align: center; margin: 30px 0;">
        <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #4f46e5;">${otpCode}</span>
      </p>
      <p style="color: #666; font-size: 14px;">This code expires in 10 minutes.</p>
      <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
      <p style="color: #999; font-size: 12px;">If you didn't create an account, you can safely ignore this email.</p>
    </div>
  `;
  return sendEmail({
    to: toEmail,
    subject: 'Your Sehat Connect verification code',
    html,
  });
}

/**
 * Send an appointment reminder email.
 */
async function sendAppointmentReminderEmail(toEmail, doctorName, appointmentDate, timeSlot, type = '1 hour') {
  const enabled = await isFeatureEnabled('enable_appointment_reminders');
  if (!enabled) return { success: false, error: 'Appointment reminder emails disabled' };

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #4f46e5;">Appointment Reminder</h2>
      <p>This is a reminder for your upcoming appointment in ${type}.</p>
      <table style="width: 100%; margin: 20px 0;">
        <tr><td style="padding: 8px 0; color: #666;">Doctor:</td><td style="font-weight: bold;">${doctorName}</td></tr>
        <tr><td style="padding: 8px 0; color: #666;">Date:</td><td style="font-weight: bold;">${appointmentDate}</td></tr>
        <tr><td style="padding: 8px 0; color: #666;">Time:</td><td style="font-weight: bold;">${timeSlot}</td></tr>
      </table>
      <p>Please be ready a few minutes before your scheduled time.</p>
    </div>
  `;
  return sendEmail({
    to: toEmail,
    subject: `Appointment with ${doctorName} in ${type}`,
    html,
  });
}

/**
 * Send a medication reminder email.
 */
async function sendMedicationReminderEmail(toEmail, medicationName, scheduledTime) {
  const enabled = await isFeatureEnabled('enable_medication_reminders');
  if (!enabled) return { success: false, error: 'Medication reminder emails disabled' };

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #4f46e5;">Medication Reminder</h2>
      <p>It's time to take your medication.</p>
      <table style="width: 100%; margin: 20px 0;">
        <tr><td style="padding: 8px 0; color: #666;">Medication:</td><td style="font-weight: bold;">${medicationName}</td></tr>
        <tr><td style="padding: 8px 0; color: #666;">Scheduled:</td><td style="font-weight: bold;">${scheduledTime}</td></tr>
      </table>
    </div>
  `;
  return sendEmail({
    to: toEmail,
    subject: 'Medication reminder',
    html,
  });
}

/**
 * Send a payment receipt email.
 */
async function sendPaymentReceiptEmail(toEmail, amount, currency, appointmentDetails, invoiceNumber) {
  const enabled = await isFeatureEnabled('enable_payment_receipts');
  if (!enabled) return { success: false, error: 'Payment receipt emails disabled' };

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #4f46e5;">Payment Receipt</h2>
      <p>Thank you for your payment. Here are your receipt details:</p>
      <table style="width: 100%; margin: 20px 0;">
        <tr><td style="padding: 8px 0; color: #666;">Invoice:</td><td style="font-weight: bold;">${invoiceNumber}</td></tr>
        <tr><td style="padding: 8px 0; color: #666;">Amount:</td><td style="font-weight: bold;">${currency} ${amount}</td></tr>
        <tr><td style="padding: 8px 0; color: #666;">Details:</td><td>${appointmentDetails}</td></tr>
      </table>
      <p style="color: #999; font-size: 12px;">Please keep this receipt for your records.</p>
    </div>
  `;
  return sendEmail({
    to: toEmail,
    subject: `Payment receipt — ${invoiceNumber}`,
    html,
  });
}

module.exports = {
  sendEmail,
  getEmailConfig,
  getTransporter,
  invalidateTransporter,
  isFeatureEnabled,
  sendPasswordResetEmail,
  sendSignupOtpEmail,
  sendAppointmentReminderEmail,
  sendMedicationReminderEmail,
  sendPaymentReceiptEmail,
};
