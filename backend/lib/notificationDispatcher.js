/**
 * Notification dispatcher for Sehat Connect.
 *
 * Reads pending Notification rows and delivers them via the appropriate channel:
 *   - In-app: always (via Socket.IO if user is online, else stored in DB)
 *   - Push (mobile): FCM (Android) / APNs (iOS) via Device.push_token
 *   - SMS: Twilio (if configured)
 *   - Email: SendGrid/SES (if configured)
 *
 * Provider credentials are read from env vars. If a provider is not configured,
 * that channel is skipped gracefully. In-app delivery always works.
 */
const { Notification, Device } = require('../models');
const { Op } = require('sequelize');
const emailService = require('./emailService');

/**
 * Create a notification row and attempt immediate delivery.
 * Used by other services (appointment reminders, chat, etc.)
 *
 * @param {object} params - { user_id, type, title, body, data, priority }
 * @param {object} io - Socket.IO instance (optional, for in-app push)
 * @returns {Promise<Notification>}
 */
async function sendNotification(params, io = null) {
  const {
    user_id,
    type = 'system',
    title,
    body = '',
    data = {},
    priority = 'normal',
  } = params || {};

  if (!user_id || !title) {
    throw new Error('user_id and title are required');
  }

  const notification = await Notification.create({
    user_id,
    type,
    title,
    body,
    data,
    priority,
  });

  // Attempt delivery
  await deliverNotification(notification, io);
  return notification;
}

/**
 * Deliver a single notification via all configured channels.
 */
async function deliverNotification(notification, io = null) {
  const channels = [];

  // 1. In-app via Socket.IO (real-time)
  if (io) {
    try {
      const broadcasters = io.app?.get?.('broadcasters');
      if (broadcasters) {
        broadcasters.emitNotification(notification.user_id, notification.toJSON());
        channels.push('socket');
      }
    } catch (err) {
      console.warn('Socket.IO delivery failed:', err.message);
    }
  }

  // 2. Push via FCM/APNs
  try {
    const devices = await Device.findAll({
      where: {
        user_id: notification.user_id,
        is_revoked: false,
        push_token: { [Op.ne]: null },
      },
    });
    if (devices.length > 0) {
      const pushed = await sendPushNotification(devices, notification);
      if (pushed) channels.push('push');
    }
  } catch (err) {
    console.warn('Push delivery failed:', err.message);
  }

  // 3. SMS via Twilio (if configured)
  if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
    try {
      const sent = await sendSMS(notification);
      if (sent) channels.push('sms');
    } catch (err) {
      console.warn('SMS delivery failed:', err.message);
    }
  }

  // 4. Email via configured SMTP (uses EmailConfig from DB, not env vars)
  try {
    const toEmail = notification.data?.email;
    if (toEmail) {
      // Map notification type to email feature flag
      const featureMap = {
        appointment_reminder: 'enable_appointment_reminders',
        medication_reminder: 'enable_medication_reminders',
        consent_expiry: 'enable_consent_notifications',
        consent_update: 'enable_consent_notifications',
        chat: 'enable_chat_notifications',
        payment: 'enable_payment_receipts',
      };
      const featureFlag = featureMap[notification.type];
      const enabled = featureFlag ? await emailService.isFeatureEnabled(featureFlag) : true;
      if (enabled) {
        const result = await emailService.sendEmail({
          to: toEmail,
          subject: notification.title,
          html: `<p>${notification.body}</p>`,
        });
        if (result.success) channels.push('email');
      }
    }
  } catch (err) {
    console.warn('Email delivery failed:', err.message);
  }

  // Mark as delivered
  await notification.update({
    delivered_at: new Date(),
    delivery_channel: channels.join(',') || 'none',
  });

  return channels;
}

/**
 * Send a push notification to a list of devices via FCM.
 * Supports both Android (FCM) and iOS (APNs via FCM).
 *
 * Requires FCM_SERVER_KEY env var. If not set, skips gracefully.
 */
async function sendPushNotification(devices, notification) {
  const fcmKey = process.env.FCM_SERVER_KEY;
  if (!fcmKey) return false;

  const payload = {
    notification: {
      title: notification.title,
      body: notification.body,
    },
    data: {
      notification_id: notification.id,
      type: notification.type,
      ...flattenData(notification.data),
    },
    priority: notification.priority === 'high' ? 'high' : 'normal',
  };

  const tokens = devices.map((d) => d.push_token).filter(Boolean);
  if (tokens.length === 0) return false;

  try {
    const response = await fetch('https://fcm.googleapis.com/fcm/send', {
      method: 'POST',
      headers: {
        Authorization: `key=${fcmKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ registration_ids: tokens, ...payload }),
    });
    if (!response.ok) {
      console.warn('FCM response not OK:', response.status);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('FCM send error:', err.message);
    return false;
  }
}

/**
 * Send an SMS via Twilio.
 * Requires TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER.
 */
async function sendSMS(notification) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_FROM_NUMBER;
  if (!accountSid || !authToken || !fromNumber) return false;

  // We need the user's phone number — would come from User model
  // For now, skip if no phone is stored in notification.data.phone
  const toPhone = notification.data?.phone;
  if (!toPhone) return false;

  try {
    const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          From: fromNumber,
          To: toPhone,
          Body: `${notification.title}: ${notification.body}`,
        }),
      }
    );
    return response.ok;
  } catch (err) {
    console.warn('Twilio send error:', err.message);
    return false;
  }
}

/**
 * Flatten nested data object for FCM data payload (must be string values).
 */
function flattenData(data) {
  if (!data || typeof data !== 'object') return {};
  const flat = {};
  for (const [key, value] of Object.entries(data)) {
    flat[key] = typeof value === 'string' ? value : JSON.stringify(value);
  }
  return flat;
}

/**
 * Process all undelivered notifications (called by cron job).
 */
async function processPendingNotifications(io = null) {
  try {
    const pending = await Notification.findAll({
      where: {
        delivered_at: null,
        [Op.or]: [
          { expires_at: null },
          { expires_at: { [Op.gt]: new Date() } },
        ],
      },
      limit: 100,
      order: [['created_at', 'ASC']],
    });
    for (const notification of pending) {
      await deliverNotification(notification, io);
    }
    return pending.length;
  } catch (err) {
    console.error('Process pending notifications error:', err.message);
    return 0;
  }
}

module.exports = {
  sendNotification,
  deliverNotification,
  processPendingNotifications,
};
