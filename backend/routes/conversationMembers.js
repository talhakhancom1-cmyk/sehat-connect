const express = require('express');
const { ConversationMember } = require('../models');
const { authenticate } = require('../middleware/auth');
const { parseSort } = require('../lib/parseSort');

const router = express.Router();

router.get('/', authenticate, async (req, res) => {
  try {
    const where = {};
    if (req.query.conversation_id) where.conversation_id = req.query.conversation_id;
    if (req.query.user_id) where.user_id = req.query.user_id;
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
    await member.update(req.body);
    res.json({ ...member.toJSON(), created_date: member.created_at });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;
