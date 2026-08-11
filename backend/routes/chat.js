const express = require('express');
const { Op } = require('sequelize');
const { Conversation, Message, Doctor, User } = require('../models');
const { authenticate } = require('../middleware/auth');
const { canAccessConversation, isAdmin } = require('../lib/ownership');
const { paginate, buildPaginatedResponse } = require('../lib/paginate');
const { pickFields } = require('../lib/pickFields');

const router = express.Router();

// Whitelists for mass-assignment protection
const CONVERSATION_WRITABLE = ['title', 'status', 'member_ids', 'last_message_at'];
const MESSAGE_WRITABLE = ['content', 'body', 'read', 'status', 'attachment_url', 'attachment_type'];

function parseMemberIds(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  try {
    return JSON.parse(value) || [];
  } catch {
    return [];
  }
}

// GET /api/v1/conversations
router.get('/conversations', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const where = {};
    // Security: non-admins can only filter by their own patient_id/doctor_id
    if (req.query.patient_id) {
      if (req.query.patient_id !== userId && !isAdmin(req.user)) {
        return res.status(403).json({ error: 'Forbidden — you can only view your own conversations' });
      }
      where.patient_id = req.query.patient_id;
    }
    if (req.query.doctor_id) {
      if (req.query.doctor_id !== userId && !isAdmin(req.user)) {
        return res.status(403).json({ error: 'Forbidden — you can only view your own conversations' });
      }
      where.doctor_id = req.query.doctor_id;
    }
    if (req.query.appointment_id) where.appointment_id = req.query.appointment_id;
    if (req.query.status) where.status = req.query.status;

    let conversations;
    if (Object.keys(where).length > 0) {
      conversations = await Conversation.findAll({
        where,
        order: [['last_message_at', 'DESC'], ['created_at', 'DESC']],
        limit: 500
      });
    } else {
      // No specific filter — return all conversations this user is part of
      conversations = await Conversation.findAll({
        order: [['last_message_at', 'DESC'], ['created_at', 'DESC']],
        limit: 500
      });
    }

    const filtered = conversations.filter(c => {
      const memberIds = parseMemberIds(c.member_ids);
      return memberIds.includes(userId) || c.patient_id === userId || c.doctor_id === userId;
    });

    // Apply pagination on the filtered result
    const { page, per_page, offset, limit } = paginate(req);
    const paginated = filtered.slice(offset, offset + limit);

    // Add created_date alias for frontend compatibility
    // Also enrich with profile pictures for both parties:
    // - doctor_image: look up Doctor by user_id (conversation.doctor_id stores user_id)
    // - patient_image: look up User by patient_id
    const doctorUserIds = [...new Set(paginated.map(c => c.doctor_id).filter(Boolean))];
    const patientIds = [...new Set(paginated.map(c => c.patient_id).filter(Boolean))];
    const [doctors, patients] = await Promise.all([
      doctorUserIds.length ? Doctor.findAll({ where: { user_id: doctorUserIds } }).catch(() => []) : [],
      patientIds.length ? User.findAll({ where: { id: patientIds } }).catch(() => []) : [],
    ]);
    const doctorImageByUserId = {};
    for (const d of doctors) doctorImageByUserId[d.user_id] = d.profile_pic_url || null;
    const patientImageById = {};
    for (const u of patients) patientImageById[u.id] = u.profile_pic_url || null;
    const result = paginated.map(c => ({
      ...c.toJSON(),
      doctor_image: doctorImageByUserId[c.doctor_id] || null,
      patient_image: patientImageById[c.patient_id] || null,
      created_date: c.created_at,
      updated_date: c.updated_at
    }));
    res.json(buildPaginatedResponse(req, result, filtered.length));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/v1/conversations
router.post('/conversations', authenticate, async (req, res) => {
  try {
    const body = req.body || {};
    // Security: the creator must be either the patient or the doctor in the conversation
    // (or an admin). This prevents creating conversations impersonating other users.
    if (!isAdmin(req.user)) {
      const isPatient = body.patient_id && body.patient_id === req.user.id;
      const isDoctor = body.doctor_id && body.doctor_id === req.user.id;
      if (!isPatient && !isDoctor) {
        return res.status(403).json({ error: 'Forbidden — you can only create conversations involving yourself' });
      }
    }
    const memberIds = Array.isArray(body.member_ids) ? body.member_ids : [];
    // Always include patient_id and doctor_id in member_ids
    if (body.patient_id && !memberIds.includes(body.patient_id)) memberIds.push(body.patient_id);
    if (body.doctor_id && !memberIds.includes(body.doctor_id)) memberIds.push(body.doctor_id);

    const conversation = await Conversation.create({
      patient_id: body.patient_id,
      patient_name: body.patient_name,
      doctor_id: body.doctor_id,
      doctor_name: body.doctor_name,
      member_ids: JSON.stringify(memberIds),
      appointment_id: body.appointment_id,
      consent_id: body.consent_id,
      title: body.title,
      status: body.status || 'active',
      last_message_at: body.last_message_at || new Date()
    });
    res.status(201).json({
      ...conversation.toJSON(),
      member_ids: memberIds,
      created_date: conversation.created_at,
      updated_date: conversation.updated_at
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// GET /api/v1/conversations/:conversationId
router.get('/conversations/:conversationId', authenticate, async (req, res) => {
  try {
    const conversation = await Conversation.findByPk(req.params.conversationId);
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }
    if (!canAccessConversation(conversation, req.user)) {
      return res.status(403).json({ error: 'Forbidden — you are not a member of this conversation' });
    }
    const [doctor, patient] = await Promise.all([
      conversation.doctor_id ? Doctor.findOne({ where: { user_id: conversation.doctor_id } }).catch(() => null) : null,
      conversation.patient_id ? User.findByPk(conversation.patient_id).catch(() => null) : null,
    ]);
    res.json({
      ...conversation.toJSON(),
      doctor_image: doctor?.profile_pic_url || null,
      patient_image: patient?.profile_pic_url || null,
      member_ids: parseMemberIds(conversation.member_ids),
      created_date: conversation.created_at,
      updated_date: conversation.updated_at
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/v1/conversations/:conversationId
router.put('/conversations/:conversationId', authenticate, async (req, res) => {
  try {
    const conversation = await Conversation.findByPk(req.params.conversationId);
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }
    if (!canAccessConversation(conversation, req.user)) {
      return res.status(403).json({ error: 'Forbidden — you are not a member of this conversation' });
    }
    const updates = pickFields(req.body, CONVERSATION_WRITABLE);
    if (Array.isArray(updates.member_ids)) {
      updates.member_ids = JSON.stringify(updates.member_ids);
    }
    await conversation.update(updates);
    res.json({
      ...conversation.toJSON(),
      member_ids: parseMemberIds(conversation.member_ids),
      created_date: conversation.created_at,
      updated_date: conversation.updated_at
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// GET /api/v1/conversations/:conversationId/messages
router.get('/conversations/:conversationId/messages', authenticate, async (req, res) => {
  try {
    const conversation = await Conversation.findByPk(req.params.conversationId);
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }
    if (!canAccessConversation(conversation, req.user)) {
      return res.status(403).json({ error: 'Forbidden — you are not a member of this conversation' });
    }
    const messages = await Message.findAll({
      where: { conversation_id: req.params.conversationId },
      order: [['created_at', 'ASC']],
      limit: 1000
    });
    const result = messages.map(m => ({
      ...m.toJSON(),
      created_date: m.created_at,
      updated_date: m.updated_at
    }));
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/v1/conversations/:conversationId/messages
router.post('/conversations/:conversationId/messages', authenticate, async (req, res) => {
  try {
    const conversation = await Conversation.findByPk(req.params.conversationId);
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }
    if (!canAccessConversation(conversation, req.user)) {
      return res.status(403).json({ error: 'Forbidden — you are not a member of this conversation' });
    }
    const body = req.body || {};
    const message = await Message.create({
      conversation_id: conversation.id,
      sender_id: req.user.id,
      sender_name: body.sender_name || req.user.display_name,
      sender_role: req.user.role,
      receiver_id: body.receiver_id,
      receiver_name: body.receiver_name,
      content: body.content || body.body,
      body: body.content || body.body,
      attachment_url: body.attachment_url,
      attachment_type: body.attachment_type,
      type: body.type || body.message_type || 'text',
      message_type: body.type || body.message_type || 'text',
      client_message_id: body.client_message_id,
      read: false,
      status: 'sent'
    });
    await conversation.update({ last_message_at: new Date() });
    // Broadcast via Socket.IO if available
    const broadcasters = req.app.get('broadcasters');
    if (broadcasters) broadcasters.emitMessage(conversation.id, message);
    res.status(201).json(message);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// POST /api/v1/conversations/:conversationId/messages/:messageId/read
router.post('/conversations/:conversationId/messages/:messageId/read', authenticate, async (req, res) => {
  try {
    const message = await Message.findOne({
      where: {
        id: req.params.messageId,
        conversation_id: req.params.conversationId
      }
    });
    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }
    const readerIds = parseMemberIds(message.read_by_ids);
    if (!readerIds.includes(req.user.id)) {
      readerIds.push(req.user.id);
    }
    await message.update({
      status: 'read',
      read: true,
      read_at: new Date(),
      read_by_ids: JSON.stringify(readerIds)
    });
    // Broadcast read receipt via Socket.IO
    const broadcasters = req.app.get('broadcasters');
    if (broadcasters) broadcasters.emitMessageStatus(req.params.conversationId, message.id, 'read', req.user.id);
    res.json(message);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// GET /api/v1/messages — used by the frontend base44 Message entity
router.get('/messages', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    // Security: non-admins can only see messages they sent or received
    const where = { [Op.or]: [{ sender_id: userId }, { receiver_id: userId }] };
    // Support additional filters from query params (but don't override the user scope)
    if (req.query.conversation_id) where.conversation_id = req.query.conversation_id;
    // Note: sender_id/receiver_id filters from query are ignored for non-admins
    // to prevent enumerating other users' messages
    const { offset, limit } = paginate(req);
    const { rows, count } = await Message.findAndCountAll({
      where,
      order: [['created_at', 'DESC']],
      offset,
      limit
    });
    const result = rows.map(m => ({
      ...m.toJSON(),
      created_date: m.created_at,
      updated_date: m.updated_at
    }));
    res.json(buildPaginatedResponse(req, result, count));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/v1/messages
router.post('/messages', authenticate, async (req, res) => {
  try {
    const body = req.body || {};
    if (!body.conversation_id) {
      return res.status(400).json({ error: 'conversation_id is required' });
    }
    const conversation = await Conversation.findByPk(body.conversation_id);
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }
    if (!canAccessConversation(conversation, req.user)) {
      return res.status(403).json({ error: 'Forbidden — you are not a member of this conversation' });
    }

    if (body.client_message_id) {
      const existing = await Message.findOne({
        where: {
          conversation_id: conversation.id,
          client_message_id: body.client_message_id
        }
      });
      if (existing) {
        return res.status(200).json(existing);
      }
    }

    const message = await Message.create({
      conversation_id: conversation.id,
      sender_id: req.user.id,
      sender_name: body.sender_name || req.user.display_name,
      sender_role: req.user.role,
      receiver_id: body.receiver_id,
      receiver_name: body.receiver_name,
      content: body.content || body.body,
      body: body.content || body.body,
      attachment_url: body.attachment_url,
      attachment_type: body.attachment_type,
      type: body.type || body.message_type || 'text',
      message_type: body.type || body.message_type || 'text',
      client_message_id: body.client_message_id,
      read: false,
      status: 'sent'
    });
    await conversation.update({ last_message_at: new Date() });
    // Broadcast via Socket.IO if available
    const broadcasters = req.app.get('broadcasters');
    if (broadcasters) broadcasters.emitMessage(conversation.id, message);
    res.status(201).json({
      ...message.toJSON(),
      created_date: message.created_at,
      updated_date: message.updated_at
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// POST /api/v1/conversations/:conversationId/call-log
// Creates or updates a call log entry in the chat thread.
// Body: { call_type, direction, status, duration, call_id, receiver_id, receiver_name }
router.post('/conversations/:conversationId/call-log', authenticate, async (req, res) => {
  try {
    const { conversationId } = req.params;
    const body = req.body || {};
    const conversation = await Conversation.findByPk(conversationId);
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }
    if (!canAccessConversation(conversation, req.user)) {
      return res.status(403).json({ error: 'Forbidden — you are not a member of this conversation' });
    }

    // If call_id is provided, try to find an existing call log to update.
    if (body.call_id) {
      const existing = await Message.findOne({
        where: {
          conversation_id: conversationId,
          type: 'call',
          client_message_id: body.call_id,
        },
      });
      if (existing) {
        await existing.update({
          call_status: body.status || existing.call_status,
          call_duration: body.duration !== undefined ? body.duration : existing.call_duration,
          content: body.status === 'missed' ? 'Missed call'
            : body.status === 'declined' ? 'Call declined'
            : body.status === 'ended' && body.duration ? `Call ended - ${Math.floor(body.duration / 60)}:${String(body.duration % 60).padStart(2, '0')}`
            : body.status === 'connected' ? 'Call connected'
            : existing.content,
        });
        const broadcasters = req.app.get('broadcasters');
        if (broadcasters) broadcasters.emitMessage(conversationId, existing);
        return res.json({
          ...existing.toJSON(),
          created_date: existing.created_at,
          updated_date: existing.updated_at,
        });
      }
    }

    // Create a new call log entry.
    const status = body.status || 'initiated';
    const message = await Message.create({
      conversation_id: conversationId,
      sender_id: req.user.id,
      sender_name: body.sender_name || req.user.display_name || req.user.full_name,
      sender_role: req.user.role,
      receiver_id: body.receiver_id,
      receiver_name: body.receiver_name,
      content: status === 'missed' ? 'Missed call'
        : status === 'declined' ? 'Call declined'
        : status === 'ended' && body.duration ? `Call ended - ${Math.floor(body.duration / 60)}:${String(body.duration % 60).padStart(2, '0')}`
        : status === 'connected' ? 'Call connected'
        : 'Call started',
      body: null,
      type: 'call',
      message_type: 'call',
      call_direction: body.direction || 'outgoing',
      call_status: status,
      call_duration: body.duration || null,
      call_type: body.call_type || 'audio',
      client_message_id: body.call_id || null,
      read: false,
      status: 'sent',
    });
    await conversation.update({ last_message_at: new Date() });
    const broadcasters = req.app.get('broadcasters');
    if (broadcasters) broadcasters.emitMessage(conversationId, message);
    res.status(201).json({
      ...message.toJSON(),
      created_date: message.created_at,
      updated_date: message.updated_at,
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// GET /api/v1/messages/:id
router.get('/messages/:id', authenticate, async (req, res) => {
  try {
    const message = await Message.findByPk(req.params.id);
    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }
    res.json(message);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/v1/messages/:id
router.put('/messages/:id', authenticate, async (req, res) => {
  try {
    const message = await Message.findByPk(req.params.id);
    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }
    const updates = pickFields(req.body, MESSAGE_WRITABLE);
    if (updates.read === true) {
      updates.status = 'read';
    }
    if (updates.read === false) {
      updates.status = 'sent';
    }
    await message.update(updates);
    res.json(message);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;
