import { getSocket } from '@/lib/socketClient';

/**
 * Call signaling helpers built on top of the existing Socket.IO singleton
 * (src/lib/socketClient.js), which connects to the backend's /ws path.
 *
 * The backend (lib/realtime.js) handles:
 *   call:initiate, call:accept, call:decline, call:cancel, call:end,
 *   call:signal (offer/answer/ice_candidate relay), call:leave.
 */

/** Returns the shared socket instance (or null if not authenticated). */
export function getCallSocket() {
  return getSocket();
}

export function initiateCall(socket, { to_user_id, call_type = 'audio', conversation_id, appointment_id }) {
  return new Promise((resolve, reject) => {
    if (!socket) return reject(new Error('Socket not connected'));
    socket.emit('call:initiate', { to_user_id, call_type, conversation_id, appointment_id }, (res) => {
      if (res && res.error) reject(new Error(res.error));
      else resolve(res);
    });
  });
}

export function acceptCall(socket, call_id) {
  return new Promise((resolve, reject) => {
    if (!socket) return reject(new Error('Socket not connected'));
    socket.emit('call:accept', { call_id }, (res) => {
      if (res && res.error) reject(new Error(res.error));
      else resolve(res);
    });
  });
}

export function declineCall(socket, call_id) {
  return new Promise((resolve, reject) => {
    if (!socket) return reject(new Error('Socket not connected'));
    socket.emit('call:decline', { call_id }, (res) => {
      if (res && res.error) reject(new Error(res.error));
      else resolve(res);
    });
  });
}

export function cancelCall(socket, call_id) {
  return new Promise((resolve, reject) => {
    if (!socket) return reject(new Error('Socket not connected'));
    socket.emit('call:cancel', { call_id }, (res) => {
      if (res && res.error) reject(new Error(res.error));
      else resolve(res);
    });
  });
}

export function endCall(socket, call_id) {
  return new Promise((resolve, reject) => {
    if (!socket) return reject(new Error('Socket not connected'));
    socket.emit('call:end', { call_id }, (res) => {
      if (res && res.error) reject(new Error(res.error));
      else resolve(res);
    });
  });
}

export function leaveCall(socket, call_id) {
  return new Promise((resolve, reject) => {
    if (!socket) return reject(new Error('Socket not connected'));
    socket.emit('call:leave', { call_id }, (res) => {
      // call:leave has no ack in the backend — resolve immediately.
      resolve({ call_id, status: 'left' });
    });
  });
}

/** Relay a WebRTC signal (offer / answer / ice_candidate) to the peer. */
export function sendSignal(socket, { call_id, to_user_id, signal_type, payload }) {
  if (!socket) return;
  socket.emit('call:signal', { call_id, to_user_id, signal_type, payload });
}
