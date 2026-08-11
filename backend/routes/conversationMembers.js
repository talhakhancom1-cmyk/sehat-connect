const express = require('express');
const { ConversationMember, Conversation } = require('../models');
const { authenticate } = require('../middleware/auth');
const { parseSort } = require('../lib/parseSort');
const { canAccessConversation, isAdmin } = require('../lib/ownership');

const router = express.Router();

router.get('/', authenticate, async (req, res) => {
  try {
    const where = {};
    if (req.query.user_id) where.user_id = req.query.user_id;
    // Non-admins can only see members of conversations they are part of
    if (!isAdmin(req.user)) {
      const myMemberships = await ConversationMember.findAll({
        where: { user_id: req.user.id, status: 'active' },
        attributes: ['conversation_id']
      });
      const myConversationIds = myMemberships.map(m => m.conversation_id);
      if (req.query.conversation_id) {
        if (!myConversationIds.includes(req.query.conversation_id)) {
          return res.json([]);
        }
        where.conversation_id = req.query.conversation_id;
      } else {
        where.conversation_id = myConversationIds.length
          ? { [require('sequelize').Op.in]: myConversationIds }
          : '__NO_MATCH__';
      }
    } else {
      if (req.query.conversation_id) where.conversation_id = req.query.conversation_id;
    }
    const members = await ConversationMember.findAll({
      where,
      order: parseSort(req.query, ['created_at', 'joined_at'], 'created_at', 'DESC'),
      limit: 200
    });
    const result = members.map(m => ({ ...m.toJSON(), created_date: m.created_at }));
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/', authenticate, async (req, res) => {
  try {
    const body = req.body || {};
    if (!body.conversation_id || !body.user_id) {
      return res.status(400).json({ error: 'conversation_id and user_id are required' });
    }
    // Check the caller is a member of the conversation (or admin)
    const conversation = await Conversation.findByPk(body.conversation_id);
    if (!conversation) return res.status(404).json({ error: 'Conversation not found' });
    if (!canAccessConversation(conversation, req.user)) {
      return res.status(403).json({ error: 'Forbidden — you are not a member of this conversation' });
    }
    const member = await ConversationMember.create({
      conversation_id: body.conversation_id,
      user_id: body.user_id,
      user_name: body.user_name || null,
      role: body.role || null,
      added_by: body.added_by || req.user.id,
      joined_at: body.joined_at || new Date(),
      status: body.status || 'active'
    });
    res.status(201).json({ ...member.toJSON(), created_date: member.created_at });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.put('/:id', authenticate, async (req, res) => {
  try {
    const member = await ConversationMember.findByPk(req.params.id);
    if (!member) return res.status(404).json({ error: 'Member not found' });
    // Check the caller is a member of the same conversation (or admin)
    const conversation = await Conversation.findByPk(member.conversation_id);
    if (!conversation) return res.status(404).json({ error: 'Conversation not found' });
    if (!canAccessConversation(conversation, req.user)) {
      return res.status(403).json({ error: 'Forbidden — you are not a member of this conversation' });
    }
    await member.update(req.body);
    res.json({ ...member.toJSON(), created_date: member.created_at });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;
