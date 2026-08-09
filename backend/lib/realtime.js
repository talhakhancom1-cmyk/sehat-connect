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

const JWT_SECRET = process.env.JWT_SECRET || 'dev-jwt-secret-do-not-use-in-production';

// Map of user_id -> Set(socket.id) for presence + direct delivery
const onlineUsers = new Map();

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
      const targetSockets = getSocketIdsForUser(to_user_id);
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
    });

    // ---- Disconnect ----
    socket.on('disconnect', () => {
      removeUserSocket(userId, socket.id);
      if (!userOnline(userId)) {
        socket.broadcast.emit('presence:update', { user_id: userId, online: false });
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
