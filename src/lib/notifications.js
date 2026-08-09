import { base44 } from '@/api/base44Client';

/**
 * Create an in-app notification.
 * @param {string} userId - recipient user id
 * @param {string} type - Notification type (see entity enum)
 * @param {string} title
 * @param {string} body
 * @param {object} opts - { data, priority }
 */
export async function createNotification(userId, type, title, body, opts = {}) {
  if (!userId) return null;
  try {
    return await base44.entities.Notification.create({
      user_id: userId,
      type,
      title,
      body: body || '',
      data: opts.data || {},
      priority: opts.priority || 'normal',
      read: false,
    });
  } catch (e) {
    console.error('createNotification failed', e);
    return null;
  }
}

export async function listNotifications(limit = 30) {
  const me = await base44.auth.me().catch(() => null);
  if (!me) return [];
  try {
    return await base44.entities.Notification.filter(
      { user_id: me.id },
      '-created_date',
      limit
    );
  } catch (e) {
    console.error('listNotifications failed', e);
    return [];
  }
}

export async function getUnreadCount() {
  const me = await base44.auth.me().catch(() => null);
  if (!me) return 0;
  try {
    const all = await base44.entities.Notification.filter(
      { user_id: me.id, read: false },
      '-created_date',
      200
    );
    return all.length;
  } catch (e) {
    return 0;
  }
}

export async function markRead(id) {
  try {
    await base44.entities.Notification.update(id, { read: true, read_at: new Date().toISOString() });
    return true;
  } catch (e) {
    return false;
  }
}

export async function markAllRead() {
  const me = await base44.auth.me().catch(() => null);
  if (!me) return;
  try {
    const unread = await base44.entities.Notification.filter(
      { user_id: me.id, read: false },
      '-created_date',
      500
    );
    if (!unread.length) return;
    await base44.entities.Notification.updateMany(
      { user_id: me.id, read: false },
      { $set: { read: true, read_at: new Date().toISOString() } }
    );
  } catch (e) {
    console.error('markAllRead failed', e);
  }
}

export function deepLinkFor(notification) {
  const data = notification.data || {};
  switch (notification.type) {
    case 'appointment_reminder':
    case 'appointment_update':
      return data.appointment_id ? '/appointments' : '/appointments';
    case 'medication_reminder':
      return '/medications';
    case 'consent_expiry':
    case 'consent_update':
      return '/access';
    case 'household_activity':
      return '/household';
    case 'payment':
      return '/appointments';
    case 'chat':
      return data.conversation_id ? `/chat/${data.conversation_id}` : '/chat';
    default:
      return '/';
  }
}

export function iconFor(type) {
  // Returns a lucide icon name string; consumers map to components
  const map = {
    appointment_reminder: 'CalendarClock',
    appointment_update: 'CalendarCheck',
    medication_reminder: 'Pill',
    consent_expiry: 'ShieldAlert',
    consent_update: 'ShieldCheck',
    household_activity: 'Users',
    payment: 'CreditCard',
    chat: 'MessageCircle',
    system: 'Info',
  };
  return map[type] || 'Bell';
}