const express = require('express');
const { CallRoom, CallParticipant } = require('../models');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

router.post('/', authenticate, async (req, res) => {
  try {
    const body = req.body || {};
    const room = await CallRoom.create({
      conversation_id: body.conversation_id,
      appointment_id: body.appointment_id,
      initiator_id: req.user.id,
      call_type: body.call_type === 'audio' ? 'audio' : 'video',
      status: 'ringing',
      started_at: null
    });
    await CallParticipant.create({
      call_room_id: room.id,
      user_id: req.user.id,
      user_name: req.user.display_name,
      role: req.user.role,
      joined_at: new Date(),
      connection_state: 'connected'
    });
    res.status(201).json(room);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.get('/:callId', authenticate, async (req, res) => {
  try {
    const room = await CallRoom.findByPk(req.params.callId);
    if (!room) {
      return res.status(404).json({ error: 'Call room not found' });
    }
    const participants = await CallParticipant.findAll({
      where: { call_room_id: room.id }
    });
    res.json({ ...room.toJSON(), participants });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/:callId/join', authenticate, async (req, res) => {
  try {
    const room = await CallRoom.findByPk(req.params.callId);
    if (!room) {
      return res.status(404).json({ error: 'Call room not found' });
    }
    if (room.status === 'ended' || room.status === 'failed') {
      return res.status(400).json({ error: 'Call is no longer active' });
    }

    let participant = await CallParticipant.findOne({
      where: { call_room_id: room.id, user_id: req.user.id }
    });
    if (participant) {
      await participant.update({ joined_at: new Date(), left_at: null, connection_state: 'connected' });
    } else {
      participant = await CallParticipant.create({
        call_room_id: room.id,
        user_id: req.user.id,
        user_name: req.user.display_name,
        role: req.user.role,
        joined_at: new Date(),
        connection_state: 'connected'
      });
    }

    if (room.status === 'ringing' || room.status === 'idle') {
      await room.update({ status: 'connecting' });
    }
    const activeCount = await CallParticipant.count({
      where: { call_room_id: room.id, left_at: null }
    });
    if (activeCount >= 2 && room.status !== 'active') {
      await room.update({ status: 'active', started_at: room.started_at || new Date() });
    }

    res.json({ room, participant });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/:callId/leave', authenticate, async (req, res) => {
  try {
    const room = await CallRoom.findByPk(req.params.callId);
    if (!room) {
      return res.status(404).json({ error: 'Call room not found' });
    }
    const participant = await CallParticipant.findOne({
      where: { call_room_id: room.id, user_id: req.user.id }
    });
    if (participant) {
      await participant.update({ left_at: new Date(), connection_state: 'disconnected' });
    }
    const activeCount = await CallParticipant.count({
      where: { call_room_id: room.id, left_at: null }
    });
    if (activeCount === 0) {
      await room.update({ status: 'ended', ended_at: new Date(), ended_reason: 'all_participants_left' });
    }
    res.json({ message: 'Left call' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/:callId/end', authenticate, async (req, res) => {
  try {
    const room = await CallRoom.findByPk(req.params.callId);
    if (!room) {
      return res.status(404).json({ error: 'Call room not found' });
    }
    await room.update({
      status: 'ended',
      ended_at: new Date(),
      ended_reason: (req.body && req.body.reason) || 'ended_by_user'
    });
    await CallParticipant.update(
      { left_at: new Date(), connection_state: 'disconnected' },
      { where: { call_room_id: room.id, left_at: null } }
    );
    res.json(room);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;
