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
  if (!token) {
    console.warn('[socketClient] getSocket: no token in localStorage');
    return null;
  }

  if (socket && socket.connected) return socket;

  if (!socket) {
    console.log('[socketClient] creating new socket to', SOCKET_ORIGIN, 'path /ws');
    socket = io(SOCKET_ORIGIN, {
      path: '/ws',
      auth: { token },
      transports: ['websocket', 'polling'],
      autoConnect: true,
      reconnection: true,
    });
    socket.on('connect', () => console.log('[socketClient] connected, id=', socket.id));
    socket.on('connect_error', (err) => {
      console.warn('[socketClient] connect_error:', err.message);
    });
    socket.on('disconnect', (reason) => {
      console.warn('[socketClient] disconnected:', reason);
      // Socket.IO auto-reconnects by default, but we force it for 'io server disconnect'
      if (reason === 'io server disconnect') {
        setTimeout(() => socket.connect(), 1000);
      }
    });
    socket.io.on('reconnect', (attempt) => {
      console.log('[socketClient] reconnected after', attempt, 'attempts');
    });
    socket.io.on('reconnect_attempt', (attempt) => {
      console.log('[socketClient] reconnect attempt', attempt);
    });
  } else if (!socket.connected) {
    // Token may have changed (e.g. re-login) — refresh auth before reconnecting.
    console.log('[socketClient] reconnecting existing socket');
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

/** Subscribe to new notifications. Returns an unsubscribe function. */
export function onNotificationNew(callback) {
  const s = getSocket();
  if (!s) return () => {};
  s.on('notification:new', callback);
  return () => s.off('notification:new', callback);
}
