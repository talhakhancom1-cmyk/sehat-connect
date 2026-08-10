/**
 * Real-time WebSocket server (Socket.IO) for Sehat Connect.
 *
 * Implements the documented event contract from socketEvents.js:
 *   - conversation:join / conversation:leave
 *   - message:send (server echoes message:new to the room)
 *   - message:read (server emits message:status_changed)
 *   - typing:start / typing:stop (server emits typing:update)
 *   - call:signal / call:join / call:leave
 *
 * Auth: clients must send `auth: { token }` during handshake. The JWT is
 * verified against JWT_SECRET and the socket is tagged with the user id.
 *
 * The exported `io` instance is also attached to `req.app.get('io')` so REST
 * routes (chat.js, calls.js) can broadcast events after a DB write.
 */
const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');
const { CallRoom, CallParticipant } = require('../models');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required');
}

const RING_TIMEOUT_MS = Number(process.env.CALL_RING_TIMEOUT_MS) || 30000;

// Map of user_id -> Set(socket.id) for presence + direct delivery
const onlineUsers = new Map();
// callId -> Set<userId> currently in the call room
const callMembers = new Map();
// callId -> ring timeout handle
const callRingTimers = new Map();

function userOnline(userId) {
  return onlineUsers.has(userId) && onlineUsers.get(userId).size > 0;
}

function addUserSocket(userId, socketId) {
  if (!onlineUsers.has(userId)) onlineUsers.set(userId, new Set());
  onlineUsers.get(userId).add(socketId);
}

function removeUserSocket(userId, socketId) {
  const set = onlineUsers.get(userId);
  if (set) {
    set.delete(socketId);
    if (set.size === 0) onlineUsers.delete(userId);
  }
}

function getSocketIdsForUser(userId) {
  const set = onlineUsers.get(userId);
  return set ? Array.from(set) : [];
}

/**
 * Attach a Socket.IO server to an existing http.Server.
 * Returns the io instance.
 */
function attachSocketServer(httpServer, corsOrigin = '*') {
  const io = new Server(httpServer, {
    path: '/ws',
    cors: {
      origin: corsOrigin === '*' ? true : corsOrigin.split(',').map((s) => s.trim()),
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });

  // ---- Auth middleware ----
  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token || socket.handshake.query?.token;
      if (!token) {
        return next(new Error('Authentication required'));
      }
      const decoded = jwt.verify(token, JWT_SECRET);
      socket.userId = decoded.id;
      socket.userRole = decoded.role;
      socket.email = decoded.email;
      next();
    } catch (err) {
      next(new Error('Invalid or expired token'));
    }
  });

  io.on('connection', (socket) => {
    const userId = socket.userId;
    addUserSocket(userId, socket.id);

    // Presence: notify friends/contacts that this user is online
    socket.broadcast.emit('presence:update', { user_id: userId, online: true });

    // ---- Conversation lifecycle ----
    socket.on('conversation:join', ({ conversation_id } = {}) => {
      if (!conversation_id) return;
      socket.join(`conversation:${conversation_id}`);
    });

    socket.on('conversation:leave', ({ conversation_id } = {}) => {
      if (!conversation_id) return;
      socket.leave(`conversation:${conversation_id}`);
    });

    // ---- Typing indicators ----
    socket.on('typing:start', ({ conversation_id } = {}) => {
      if (!conversation_id) return;
      socket.to(`conversation:${conversation_id}`).emit('typing:update', {
        conversation_id,
        user_id: userId,
        typing: true,
      });
    });

    socket.on('typing:stop', ({ conversation_id } = {}) => {
      if (!conversation_id) return;
      socket.to(`conversation:${conversation_id}`).emit('typing:update', {
        conversation_id,
        user_id: userId,
        typing: false,
      });
    });

    // ---- Message read receipts ----
    socket.on('message:read', ({ conversation_id, message_id } = {}) => {
      if (!conversation_id || !message_id) return;
      socket.to(`conversation:${conversation_id}`).emit('message:status_changed', {
        message_id,
        status: 'read',
        read_by: userId,
      });
    });

    // ---- Call signaling (WebRTC) ----
    socket.on('call:signal', ({ call_id, to_user_id, signal_type, payload } = {}) => {
      if (!call_id || !to_user_id) return;
      console.log(`[realtime] call:signal ${signal_type} from ${userId} to ${to_user_id}`);
      const targetSockets = getSocketIdsForUser(to_user_id);
      console.log(`[realtime] target ${to_user_id} has ${targetSockets.length} socket(s)`);
      targetSockets.forEach((sid) => {
        io.to(sid).emit('call:signal', {
          call_id,
          from_user_id: userId,
          signal_type,
          payload,
        });
      });
    });

    socket.on('call:join', ({ call_id } = {}) => {
      if (!call_id) return;
      socket.join(`call:${call_id}`);
      socket.to(`call:${call_id}`).emit('call:participant_joined', {
        call_id,
        user_id: userId,
      });
    });

    socket.on('call:leave', ({ call_id } = {}) => {
      if (!call_id) return;
      socket.to(`call:${call_id}`).emit('call:participant_left', {
        call_id,
        user_id: userId,
      });
      socket.leave(`call:${call_id}`);
      // Also clean up the in-memory call member set + DB participant record.
      const members = callMembers.get(call_id);
      if (members) {
        members.delete(userId);
        if (!members.size) callMembers.delete(call_id);
      }
      CallParticipant.update(
        { left_at: new Date(), connection_state: 'disconnected' },
        { where: { call_room_id: call_id, user_id: userId, left_at: null } }
      ).catch(() => {});
    });

    // ---- Full call lifecycle (WebRTC signaling) ----
    // Caller initiates a call: creates a CallRoom, rings the target.
    socket.on('call:initiate', async (payload, ack) => {
      try {
        const { to_user_id, call_type = 'audio', conversation_id, appointment_id } = payload || {};
        console.log(`[realtime] call:initiate from ${userId} to ${to_user_id} type=${call_type}`);
        if (!to_user_id) return ack && ack({ error: 'to_user_id is required' });

        const room = await CallRoom.create({
          conversation_id,
          appointment_id,
          initiator_id: userId,
          call_type: call_type === 'video' ? 'video' : 'audio',
          status: 'ringing',
          started_at: null,
        });

        if (!callMembers.has(room.id)) callMembers.set(room.id, new Set());
        callMembers.get(room.id).add(userId);

        // Ring the target user (only if they have sockets online).
        const targetSockets = getSocketIdsForUser(to_user_id);
        console.log(`[realtime] target ${to_user_id} has ${targetSockets.length} socket(s) online`);
        targetSockets.forEach((sid) => {
          io.to(sid).emit('call:ringing', {
            call_id: room.id,
            from_user_id: userId,
            call_type: room.call_type,
            conversation_id,
            appointment_id,
          });
        });

        // Auto-cancel if not answered within the ring timeout.
        const timer = setTimeout(async () => {
          try {
            const fresh = await CallRoom.findByPk(room.id);
            if (fresh && fresh.status === 'ringing') {
              await fresh.update({ status: 'failed', ended_reason: 'no_answer_timeout' });
              const initSockets = getSocketIdsForUser(userId);
              initSockets.forEach((sid) => io.to(sid).emit('call:state_changed', { call_id: room.id, status: 'failed', reason: 'no_answer_timeout' }));
              const tgtSockets = getSocketIdsForUser(to_user_id);
              tgtSockets.forEach((sid) => io.to(sid).emit('call:state_changed', { call_id: room.id, status: 'failed', reason: 'no_answer_timeout' }));
              const members = callMembers.get(room.id);
              if (members) { members.delete(userId); if (!members.size) callMembers.delete(room.id); }
            }
          } catch { /* best-effort */ }
        }, RING_TIMEOUT_MS);
        callRingTimers.set(room.id, timer);

        ack && ack({ call_id: room.id, status: 'ringing' });
      } catch (err) {
        ack && ack({ error: err.message });
      }
    });

    // Callee accepts the call — notify the caller to create the offer.
    socket.on('call:accept', async (payload, ack) => {
      try {
        const { call_id } = payload || {};
        if (!call_id) return ack && ack({ error: 'call_id is required' });

        const room = await CallRoom.findByPk(call_id);
        if (!room) return ack && ack({ error: 'Call room not found' });
        if (room.status === 'ended' || room.status === 'failed') {
          return ack && ack({ error: 'Call is no longer active' });
        }

        const timer = callRingTimers.get(call_id);
        if (timer) { clearTimeout(timer); callRingTimers.delete(call_id); }

        if (!callMembers.has(call_id)) callMembers.set(call_id, new Set());
        callMembers.get(call_id).add(userId);

        let participant = await CallParticipant.findOne({
          where: { call_room_id: call_id, user_id: userId },
        });
        if (participant) {
          await participant.update({ joined_at: new Date(), left_at: null, connection_state: 'connected' });
        } else {
          await CallParticipant.create({
            call_room_id: call_id,
            user_id: userId,
            user_name: '',
            joined_at: new Date(),
            connection_state: 'connected',
          });
        }

        await room.update({ status: 'connecting' });

        // Tell the caller the callee accepted.
        const initSockets = getSocketIdsForUser(room.initiator_id);
        initSockets.forEach((sid) => io.to(sid).emit('call:accepted', { call_id, from_user_id: userId }));

        ack && ack({ call_id, status: 'connecting' });
      } catch (err) {
        ack && ack({ error: err.message });
      }
    });

    // Callee declines the call.
    socket.on('call:decline', async (payload, ack) => {
      try {
        const { call_id } = payload || {};
        if (!call_id) return ack && ack({ error: 'call_id is required' });

        const room = await CallRoom.findByPk(call_id);
        if (!room) return ack && ack({ error: 'Call room not found' });

        const timer = callRingTimers.get(call_id);
        if (timer) { clearTimeout(timer); callRingTimers.delete(call_id); }

        await room.update({ status: 'ended', ended_at: new Date(), ended_reason: 'declined' });
        const members = callMembers.get(call_id);
        if (members) { members.delete(userId); members.delete(room.initiator_id); if (!members.size) callMembers.delete(call_id); }

        const initSockets = getSocketIdsForUser(room.initiator_id);
        initSockets.forEach((sid) => io.to(sid).emit('call:declined', { call_id, from_user_id: userId }));
        ack && ack({ call_id, status: 'ended' });
      } catch (err) {
        ack && ack({ error: err.message });
      }
    });

    // Caller cancels while ringing.
    socket.on('call:cancel', async (payload, ack) => {
      try {
        const { call_id } = payload || {};
        if (!call_id) return ack && ack({ error: 'call_id is required' });

        const room = await CallRoom.findByPk(call_id);
        if (!room) return ack && ack({ error: 'Call room not found' });

        const timer = callRingTimers.get(call_id);
        if (timer) { clearTimeout(timer); callRingTimers.delete(call_id); }

        await room.update({ status: 'ended', ended_at: new Date(), ended_reason: 'cancelled' });
        const members = callMembers.get(call_id) || new Set();
        for (const otherId of members) {
          if (otherId !== userId) {
            const otherSockets = getSocketIdsForUser(otherId);
            otherSockets.forEach((sid) => io.to(sid).emit('call:cancelled', { call_id, from_user_id: userId }));
          }
        }
        members.delete(userId);
        if (!members.size) callMembers.delete(call_id);

        ack && ack({ call_id, status: 'ended' });
      } catch (err) {
        ack && ack({ error: err.message });
      }
    });

    // Either party ends the whole call.
    socket.on('call:end', async (payload, ack) => {
      try {
        const { call_id } = payload || {};
        if (!call_id) return ack && ack({ error: 'call_id is required' });

        const room = await CallRoom.findByPk(call_id);
        if (!room) return ack && ack({ error: 'Call room not found' });

        const timer = callRingTimers.get(call_id);
        if (timer) { clearTimeout(timer); callRingTimers.delete(call_id); }

        await room.update({ status: 'ended', ended_at: new Date(), ended_reason: 'ended_by_user' });
        await CallParticipant.update(
          { left_at: new Date(), connection_state: 'disconnected' },
          { where: { call_room_id: call_id, left_at: null } }
        );

        const members = callMembers.get(call_id) || new Set();
        for (const otherId of members) {
          if (otherId !== userId) {
            const otherSockets = getSocketIdsForUser(otherId);
            otherSockets.forEach((sid) => io.to(sid).emit('call:ended', { call_id, from_user_id: userId }));
          }
        }
        callMembers.delete(call_id);

        ack && ack({ call_id, status: 'ended' });
      } catch (err) {
        ack && ack({ error: err.message });
      }
    });

    // ---- Disconnect ----
    socket.on('disconnect', () => {
      removeUserSocket(userId, socket.id);
      if (!userOnline(userId)) {
        socket.broadcast.emit('presence:update', { user_id: userId, online: false });
      }
      // Leave any active call rooms and notify other participants.
      for (const [callId, members] of callMembers.entries()) {
        if (members.has(userId)) {
          members.delete(userId);
          if (!members.size) callMembers.delete(callId);
          CallParticipant.update(
            { left_at: new Date(), connection_state: 'disconnected' },
            { where: { call_room_id: callId, user_id: userId, left_at: null } }
          ).catch(() => {});
          for (const otherId of members) {
            const otherSockets = getSocketIdsForUser(otherId);
            otherSockets.forEach((sid) => io.to(sid).emit('call:participant_left', { call_id: callId, user_id: userId }));
          }
        }
      }
    });
  });

  return io;
}

/**
 * Broadcast helpers usable from REST routes.
 * Usage: const io = req.app.get('io'); io.emitMessage(conversationId, message);
 */
function buildBroadcasters(io) {
  return {
    /**
     * Emit a new message to all members of a conversation room.
     */
    emitMessage(conversationId, message) {
      io.to(`conversation:${conversationId}`).emit('message:new', { message });
    },
    /**
     * Emit a message status change (sent/delivered/read).
     */
    emitMessageStatus(conversationId, messageId, status, readBy = null) {
      io.to(`conversation:${conversationId}`).emit('message:status_changed', {
        message_id: messageId,
        status,
        read_by: readBy,
      });
    },
    /**
     * Emit a call state change to all participants in the call room.
     */
    emitCallState(callId, status) {
      io.to(`call:${callId}`).emit('call:state_changed', { call_id: callId, status });
    },
    /**
     * Ring a specific user (incoming call notification).
     */
    emitCallRinging(callId, fromUserId, toUserId) {
      const targetSockets = getSocketIdsForUser(toUserId);
      targetSockets.forEach((sid) => {
        io.to(sid).emit('call:ringing', { call_id: callId, from_user_id: fromUserId });
      });
    },
    /**
     * Send a notification to a specific user (in-app push).
     */
    emitNotification(userId, notification) {
      const targetSockets = getSocketIdsForUser(userId);
      targetSockets.forEach((sid) => {
        io.to(sid).emit('notification:new', notification);
      });
    },
    /**
     * Check if a user is currently online.
     */
    isUserOnline(userId) {
      return userOnline(userId);
    },
  };
}

module.exports = { attachSocketServer, buildBroadcasters };
