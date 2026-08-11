import { base44 } from '@/api/base44Client';

export async function getOrCreateForAppointment(appointment, user) {
  if (!appointment?.id || !user?.id) return null;
  const patientId = appointment.patient_id;
  let doctorUserId = appointment.doctor_user_id;

  // Backfill doctor_user_id if missing — look up the Doctor record by its PK
  // (appointment.doctor_id is the Doctor table ID, not the User ID).
  if (!doctorUserId && appointment.doctor_id) {
    try {
      const doctor = await base44.entities.Doctor.findById(appointment.doctor_id);
      if (doctor && doctor.user_id) doctorUserId = doctor.user_id;
    } catch {}
  }

  const memberIds = [patientId, doctorUserId].filter(Boolean);

  try {
    const existing = await base44.entities.Conversation.filter({ appointment_id: appointment.id }, '-created_date', 5);
    if (existing && existing.length) return existing[0];
  } catch {}

  const convo = await base44.entities.Conversation.create({
    patient_id: patientId,
    patient_name: appointment.patient_name,
    doctor_id: doctorUserId,
    doctor_name: appointment.doctor_name,
    member_ids: memberIds,
    appointment_id: appointment.id,
    status: 'active',
    last_message_at: new Date().toISOString(),
  });

  const members = [
    { conversation_id: convo.id, user_id: patientId, user_name: appointment.patient_name, role: 'patient', added_by: user.id, joined_at: new Date().toISOString(), status: 'active' },
    { conversation_id: convo.id, user_id: doctorUserId, user_name: appointment.doctor_name, role: 'doctor', added_by: user.id, joined_at: new Date().toISOString(), status: 'active' },
  ].filter((m) => m.user_id);
  if (members.length) await base44.entities.ConversationMember.bulkCreate(members).catch(() => {});

  return convo;
}

export function otherParty(conversation, userId) {
  if (!conversation) return { id: '', name: 'User', role: 'patient' };
  const isDoctor = conversation.doctor_id === userId;
  return {
    id: isDoctor ? conversation.patient_id : conversation.doctor_id,
    name: isDoctor ? conversation.patient_name : conversation.doctor_name,
    role: isDoctor ? 'patient' : 'doctor',
  };
}

export async function listMyConversations(userId) {
  // The backend already filters to only conversations this user is part of,
  // so we just fetch all and filter by status.
  const convos = await base44.entities.Conversation.filter({}, '-last_message_at', 100).catch(() => []);
  return (convos || []).filter((c) => {
    const memberIds = Array.isArray(c.member_ids) ? c.member_ids : [];
    return (memberIds.includes(userId) || c.patient_id === userId || c.doctor_id === userId) && c.status !== 'closed';
  });
}

export async function listMessages(conversationId) {
  const msgs = await base44.entities.Message.filter({ conversation_id: conversationId }, 'created_date', 500).catch(() => []);
  return msgs || [];
}

export async function sendMessage(conversation, user, content, opts = {}) {
  const other = otherParty(conversation, user.id);
  // Generate a client_message_id for idempotency — the backend uses this
  // to deduplicate messages if the same request is sent twice (e.g. double-click).
  const client_message_id = opts.client_message_id || `${user.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const msg = await base44.entities.Message.create({
    conversation_id: conversation.id,
    sender_id: user.id,
    sender_name: user.display_name || user.full_name || user.email,
    receiver_id: other.id,
    receiver_name: other.name,
    content,
    type: opts.type || 'text',
    attachment_url: opts.attachment_url,
    client_message_id,
    read: false,
  });
  await base44.entities.Conversation.update(conversation.id, { last_message_at: new Date().toISOString() }).catch(() => {});
  return msg;
}

export async function markConversationRead(conversationId, userId) {
  const msgs = await base44.entities.Message.filter({ conversation_id: conversationId, receiver_id: userId, read: false }, 'created_date', 200).catch(() => []);
  for (const m of msgs) {
    await base44.entities.Message.update(m.id, { read: true }).catch(() => {});
  }
}

/**
 * Create or update a call log entry in the chat thread.
 * If call_id matches an existing call log, it updates the status/duration.
 * Otherwise it creates a new call log message.
 */
export async function logCall(conversationId, { call_id, call_type, direction, status, duration, receiver_id, receiver_name, sender_name }) {
  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';
  const token = localStorage.getItem('ehc_token');
  const res = await fetch(`${API_BASE_URL}/v1/conversations/${conversationId}/call-log`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ call_id, call_type, direction, status, duration, receiver_id, receiver_name, sender_name }),
  });
  if (!res.ok) throw new Error('Failed to log call');
  return res.json();
}