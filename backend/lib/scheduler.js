/**
 * Background job scheduler for EcoHealth.
 *
 * Uses node-cron for periodic tasks:
 *   - Appointment reminders (24h and 1h before)
 *   - Medication dose reminders
 *   - Consent expiry notifications + auto-expire
 *   - Health card token cleanup (expire past-due tokens)
 *   - Session cleanup (revoke expired sessions)
 *   - Pending notification delivery retry
 *
 * Each job is guarded with try/catch so one failure doesn't stop the others.
 * Jobs are only registered if node-cron is installed; otherwise this is a no-op.
 */
let cron;
try {
  cron = require('node-cron');
} catch {
  cron = null;
}

const { Op } = require('sequelize');
const {
  Appointment,
  Consent,
  DoseEvent,
  HealthCardToken,
  Session,
  Notification,
} = require('../models');
const { sendNotification, processPendingNotifications } = require('./notificationDispatcher');

/**
 * Appointment reminders: scan appointments starting in the next 24h and 1h,
 * and send notifications if not already sent.
 */
async function sendAppointmentReminders(io) {
  if (!Appointment) return;
  try {
    const now = new Date();
    const inOneHour = new Date(now.getTime() + 60 * 60 * 1000);
    const in24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    // Find confirmed appointments in the next 24h
    const appointments = await Appointment.findAll({
      where: {
        status: { [Op.in]: ['confirmed', 'pending'] },
        appointment_date: { [Op.between]: [now, in24Hours] },
      },
    });

    for (const appt of appointments) {
      const apptTime = new Date(appt.appointment_date);
      const hoursUntil = (apptTime - now) / (60 * 60 * 1000);

      // 1-hour reminder
      if (hoursUntil <= 1 && hoursUntil > 0) {
        const reminderKey = `appt_1h_${appt.id}`;
        const existing = await Notification.findOne({
          where: {
            user_id: appt.patient_id,
            type: 'appointment_reminder',
            'data.reminder_key': reminderKey,
          },
        });
        if (!existing) {
          await sendNotification({
            user_id: appt.patient_id,
            type: 'appointment_reminder',
            title: 'Appointment in 1 hour',
            body: `Your appointment with ${appt.doctor_name} is in 1 hour.`,
            data: { appointment_id: appt.id, reminder_key: reminderKey },
            priority: 'high',
          }, io);
        }
      }

      // 24-hour reminder
      if (hoursUntil <= 24 && hoursUntil > 23) {
        const reminderKey = `appt_24h_${appt.id}`;
        const existing = await Notification.findOne({
          where: {
            user_id: appt.patient_id,
            type: 'appointment_reminder',
            'data.reminder_key': reminderKey,
          },
        });
        if (!existing) {
          await sendNotification({
            user_id: appt.patient_id,
            type: 'appointment_reminder',
            title: 'Appointment tomorrow',
            body: `You have an appointment with ${appt.doctor_name} tomorrow at ${appt.time_slot}.`,
            data: { appointment_id: appt.id, reminder_key: reminderKey },
            priority: 'normal',
          }, io);
        }
      }
    }
  } catch (err) {
    console.error('[scheduler] Appointment reminders failed:', err.message);
  }
}

/**
 * Medication reminders: notify patients about doses due in the next 30 minutes.
 * DoseEvent.taken_at stores the scheduled time.
 */
async function sendMedicationReminders(io) {
  if (!DoseEvent) return;
  try {
    const now = new Date();
    const in30Min = new Date(now.getTime() + 30 * 60 * 1000);

    // Find pending doses due in the next 30 minutes
    const doses = await DoseEvent.findAll({
      where: {
        status: 'pending',
        taken_at: { [Op.between]: [now, in30Min] },
      },
    });

    // Get patient emails for email delivery
    const { User, MedicationPlan } = require('../models');
    const ReminderPreference = require('../models/ReminderPreference');

    for (const dose of doses) {
      const reminderKey = `dose_${dose.id}`;
      const existing = await Notification.findOne({
        where: {
          user_id: dose.patient_id,
          type: 'medication_reminder',
          'data.reminder_key': reminderKey,
        },
      });
      if (!existing) {
        // Get medication name and dosage
        const plan = await MedicationPlan.findByPk(dose.medication_plan_id);
        if (plan && plan.reminders_enabled === false) continue; // Skip if reminders disabled for this med

        // Check if patient has reminders enabled globally
        const pref = await ReminderPreference.findOne({ where: { patient_id: dose.patient_id } });
        if (pref && pref.reminders_enabled === false) continue;

        // Get patient email for email delivery
        const patient = await User.findByPk(dose.patient_id);
        const medName = plan?.medication_name || 'your medication';
        const dosage = plan?.dosage || '';

        await sendNotification({
          user_id: dose.patient_id,
          type: 'medication_reminder',
          title: 'Medication reminder',
          body: `Time to take ${medName}${dosage ? ` (${dosage})` : ''}.`,
          data: {
            dose_event_id: dose.id,
            reminder_key: reminderKey,
            medication_name: medName,
            dosage,
            email: patient?.email, // Include email so notificationDispatcher sends email too
          },
          priority: 'normal',
        }, io);
      }
    }

    // Mark overdue pending doses as missed (past 2 hours from scheduled time)
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
    await DoseEvent.update(
      { status: 'missed' },
      {
        where: {
          status: 'pending',
          taken_at: { [Op.lt]: twoHoursAgo },
        },
      }
    );
  } catch (err) {
    console.error('[scheduler] Medication reminders failed:', err.message);
  }
}

/**
 * Consent expiry: auto-expire consents past their expiry date and notify the patient.
 */
async function processConsentExpiry(io) {
  if (!Consent) return;
  try {
    const now = new Date();
    const expired = await Consent.findAll({
      where: {
        status: 'active',
        expires_at: { [Op.lt]: now },
      },
    });
    for (const consent of expired) {
      await consent.update({ status: 'expired' });
      await sendNotification({
        user_id: consent.patient_id,
        type: 'consent_expiry',
        title: 'Consent expired',
        body: 'A consent you granted has expired.',
        data: { consent_id: consent.id },
        priority: 'normal',
      }, io);
    }
  } catch (err) {
    console.error('[scheduler] Consent expiry failed:', err.message);
  }
}

/**
 * Health card token cleanup: expire tokens past their expiry date.
 */
async function cleanupHealthCardTokens() {
  if (!HealthCardToken) return;
  try {
    const now = new Date();
    await HealthCardToken.update(
      { is_used: true, used_at: now },
      { where: { expires_at: { [Op.lt]: now }, is_used: false } }
    );
  } catch (err) {
    console.error('[scheduler] Health card token cleanup failed:', err.message);
  }
}

/**
 * Session cleanup: revoke expired sessions.
 */
async function cleanupExpiredSessions() {
  if (!Session) return;
  try {
    const now = new Date();
    await Session.update(
      { is_revoked: true, revoked_at: now },
      { where: { expires_at: { [Op.lt]: now }, is_revoked: false } }
    );
  } catch (err) {
    console.error('[scheduler] Session cleanup failed:', err.message);
  }
}

/**
 * Register all cron jobs. Call once after the server starts.
 * @param {object} io - Socket.IO instance (for real-time notification delivery)
 */
function startScheduler(io = null) {
  if (!cron) {
    console.warn('[scheduler] node-cron not installed — background jobs disabled.');
    return;
  }

  // Appointment + medication reminders: every 15 minutes
  cron.schedule('*/15 * * * *', async () => {
    await sendAppointmentReminders(io);
    await sendMedicationReminders(io);
  });

  // Consent expiry + token cleanup: every hour
  cron.schedule('0 * * * *', async () => {
    await processConsentExpiry(io);
    await cleanupHealthCardTokens();
  });

  // Session cleanup: daily at 3 AM
  cron.schedule('0 3 * * *', async () => {
    await cleanupExpiredSessions();
  });

  // Pending notification delivery retry: every 5 minutes
  cron.schedule('*/5 * * * *', async () => {
    await processPendingNotifications(io);
  });

  console.log('[scheduler] Background jobs registered (reminders, expiry, cleanup).');
}

module.exports = {
  startScheduler,
  sendAppointmentReminders,
  sendMedicationReminders,
  processConsentExpiry,
  cleanupHealthCardTokens,
  cleanupExpiredSessions,
};
