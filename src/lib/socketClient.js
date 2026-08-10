/**
 * Socket.IO client singleton for Sehat Connect real-time features
 * (chat messages, typing indicators, read receipts, call signaling).
 *
 * Mirrors the event contract implemented by backend/lib/realtime.js.
 */
import { io } from 'socket.io-client';

const TOKEN_KEY = 'ehc_token';
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';
// If VITE_WS_URL is set, the WebSocket signaling server runs on a separate
// VPS (split architecture). Otherwise it's on the same origin as the API.
// Socket.IO needs the origin (no /api suffix) — the server mounts it at path '/ws'.
const WS_URL = import.meta.env.VITE_WS_URL || '';
const SOCKET_ORIGIN = WS_URL
  ? WS_URL.replace(/\/ws\/?$/, '')
  : API_BASE_URL.replace(/\/api\/?$/, '') || undefined;

let socket = null;

function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

/**
 * Returns the shared socket instance, creating (and connecting) it on first use.
 * Reuses one connection across the whole app.
 */
export function getSocket() {
  const token = getToken();
  if (!token) return null;

  if (socket && socket.connected) return socket;

  if (!socket) {
    socket = io(SOCKET_ORIGIN, {
      path: '/ws',
      auth: { token },
      transports: ['websocket', 'polling'],
      autoConnect: true,
      reconnection: true,
    });
    socket.on('connect_error', () => {
      // Non-fatal — chat/calls fall back to polling if the socket can't connect.
    });
  } else if (!socket.connected) {
    // Token may have changed (e.g. re-login) — refresh auth before reconnecting.
    socket.auth = { token };
    socket.connect();
  }
  return socket;
}

/** Disconnect and clear the socket (call on logout). */
export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

export function joinConversation(conversationId) {
  const s = getSocket();
  if (s && conversationId) s.emit('conversation:join', { conversation_id: conversationId });
}

export function leaveConversation(conversationId) {
  const s = getSocket();
  if (s && conversationId) s.emit('conversation:leave', { conversation_id: conversationId });
}

/** Subscribe to new messages. Returns an unsubscribe function. */
export function onMessageNew(callback) {
  const s = getSocket();
  if (!s) return () => {};
  const handler = ({ message }) => callback(message);
  s.on('message:new', handler);
  return () => s.off('message:new', handler);
}

/** Subscribe to message status changes (delivered/read). Returns an unsubscribe function. */
export function onMessageStatusChanged(callback) {
  const s = getSocket();
  if (!s) return () => {};
  s.on('message:status_changed', callback);
  return () => s.off('message:status_changed', callback);
}

/** Subscribe to typing indicator updates. Returns an unsubscribe function. */
export function onTypingUpdate(callback) {
  const s = getSocket();
  if (!s) return () => {};
  s.on('typing:update', callback);
  return () => s.off('typing:update', callback);
}

export function emitTyping(conversationId, isTyping) {
  const s = getSocket();
  if (!s || !conversationId) return;
  s.emit(isTyping ? 'typing:start' : 'typing:stop', { conversation_id: conversationId });
}

export function emitMessageRead(conversationId, messageId) {
  const s = getSocket();
  if (!s || !conversationId || !messageId) return;
  s.emit('message:read', { conversation_id: conversationId, message_id: messageId });
}

/** Subscribe to incoming call-ring notifications. Returns an unsubscribe function. */
export function onCallRinging(callback) {
  const s = getSocket();
  if (!s) return () => {};
  s.on('call:ringing', callback);
  return () => s.off('call:ringing', callback);
}
