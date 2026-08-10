/**
 * Global call context — listens for incoming call:ringing events at the
 * app root level so the user gets an incoming-call popup regardless of
 * which page they're on (not just when ChatThread is open).
 *
 * Exposes:
 *   incomingCall  — { callId, callerName, call_type, remoteUserId } or null
 *   activeCall    — { callId, role, remoteUserId, video } or null
 *   startCall(conversation, other, user, opts) — initiate an outgoing call
 *   acceptCall()  — accept the incoming call
 *   declineCall() — decline the incoming call
 *   endCall()     — end the active call
 *   callSocket    — the shared socket instance (or null)
 */
import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { getCallSocket, initiateCall, acceptCall as socketAcceptCall, declineCall as socketDeclineCall, cancelCall, endCall as socketEndCall } from '@/lib/callSocket';
import { otherParty, logCall } from '@/lib/conversations';
import { createNotification } from '@/lib/notifications';

const CallContext = createContext(null);

export function CallProvider({ children }) {
  const { user } = useAuth();
  const [incomingCall, setIncomingCall] = useState(null);
  const [activeCall, setActiveCall] = useState(null); // { callId, role, remoteUserId, video }
  const [callError, setCallError] = useState(null);

  const incomingCallRef = useRef(null);
  const activeCallRef = useRef(null);
  const initiatingRef = useRef(false);

  useEffect(() => { incomingCallRef.current = incomingCall; }, [incomingCall]);
  useEffect(() => { activeCallRef.current = activeCall; }, [activeCall]);

  // Global listener for incoming call:ringing events — works on any page.
  useEffect(() => {
    if (!user?.id) return;
    const socket = getCallSocket();
    if (!socket) return;

    const onRinging = ({ call_id, from_user_id, call_type, conversation_id, appointment_id }) => {
      console.log('[CallContext] call:ringing received', { call_id, from_user_id, call_type, conversation_id });
      // Skip if we're already in a call or already showing an incoming call.
      if (activeCallRef.current || incomingCallRef.current || initiatingRef.current) {
        console.log('[CallContext] auto-declining (busy)');
        // Auto-decline — we're busy.
        socketDeclineCall(socket, call_id).catch(() => {});
        return;
      }
      setIncomingCall({
        callId: call_id,
        callerName: 'Incoming call',
        call_type: call_type || 'audio',
        remoteUserId: from_user_id,
        conversation_id,
        appointment_id,
      });
    };

    const onCancelled = ({ call_id }) => {
      setIncomingCall((prev) => (prev && prev.callId === call_id ? null : prev));
    };

    const onStateChanged = ({ call_id, status }) => {
      if (status === 'failed') {
        setIncomingCall((prev) => (prev && prev.callId === call_id ? null : prev));
      }
    };

    socket.on('call:ringing', onRinging);
    socket.on('call:cancelled', onCancelled);
    socket.on('call:state_changed', onStateChanged);

    return () => {
      socket.off('call:ringing', onRinging);
      socket.off('call:cancelled', onCancelled);
      socket.off('call:state_changed', onStateChanged);
    };
  }, [user?.id]);

  // Start an outgoing call.
  const startCall = useCallback(async (conversation, otherUser, currentUser, opts = {}) => {
    console.log('[CallContext] startCall called', { conversation: !!conversation, otherUser, currentUser: currentUser?.id, opts });
    if (!conversation || !currentUser?.id || !otherUser?.id) {
      console.warn('[CallContext] startCall early return: missing data', { conversation, otherUser, currentUser });
      setCallError('Could not start call: missing conversation or user info.');
      return false;
    }
    if (initiatingRef.current || activeCallRef.current) {
      console.warn('[CallContext] startCall early return: already in a call or initiating', { initiating: initiatingRef.current, active: !!activeCallRef.current });
      return false;
    }
    initiatingRef.current = true;
    setCallError(null);
    setIncomingCall(null);
    try {
      const socket = getCallSocket();
      console.log('[CallContext] socket from getCallSocket:', socket ? `connected=${socket.connected} id=${socket.id}` : 'NULL');
      if (!socket) {
        setCallError('Real-time connection not available. Please refresh and try again.');
        initiatingRef.current = false;
        return false;
      }
      const callType = opts.video ? 'video' : 'audio';
      console.log('[CallContext] initiating call', { to_user_id: otherUser.id, call_type: callType, conversation_id: conversation.id });
      const res = await initiateCall(socket, {
        to_user_id: otherUser.id,
        call_type: callType,
        conversation_id: conversation.id,
        appointment_id: conversation.appointment_id,
      });
      console.log('[CallContext] initiateCall response:', res);
      setActiveCall({
        callId: res.call_id,
        role: 'caller',
        remoteUserId: otherUser.id,
        video: !!opts.video,
        conversationId: conversation.id,
        otherName: otherUser.name || otherUser.display_name || 'User',
        callType,
        startedAt: Date.now(),
      });
      // Log the call start in the chat thread.
      logCall(conversation.id, {
        call_id: res.call_id,
        call_type: callType,
        direction: 'outgoing',
        status: 'initiated',
        receiver_id: otherUser.id,
        receiver_name: otherUser.name || otherUser.display_name,
        sender_name: currentUser?.display_name || currentUser?.full_name,
      }).catch(() => {});
      // Push notification so the callee sees it even if offline.
      createNotification(otherUser.id, 'chat',
        `📞 Incoming ${callType} call from ${currentUser?.display_name || currentUser?.full_name || 'User'}`,
        'Tap to join the call', {
        priority: 'high',
        data: { conversation_id: conversation.id, appointment_id: conversation.appointment_id },
      }).catch(() => {});
      return true;
    } catch (e) {
      console.error('startCall failed:', e);
      setCallError(e?.message || 'Could not start call.');
      return false;
    } finally {
      initiatingRef.current = false;
    }
  }, []);

  // Accept an incoming call.
  const acceptCall = useCallback(async () => {
    const incoming = incomingCallRef.current;
    if (!incoming) return;
    const socket = getCallSocket();
    if (!socket) return;
    try {
      await socketAcceptCall(socket, incoming.callId);
      setActiveCall({
        callId: incoming.callId,
        role: 'callee',
        remoteUserId: incoming.remoteUserId,
        video: incoming.call_type === 'video',
        conversationId: incoming.conversation_id,
        callType: incoming.call_type || 'audio',
        startedAt: Date.now(),
      });
      setIncomingCall(null);
    } catch (e) {
      console.error('acceptCall failed:', e);
      setCallError(e?.message || 'Could not accept call.');
      setIncomingCall(null);
    }
  }, []);

  // Decline an incoming call.
  const declineCall = useCallback(async () => {
    const incoming = incomingCallRef.current;
    if (!incoming) return;
    setIncomingCall(null);
    const socket = getCallSocket();
    if (!socket) return;
    try {
      await socketDeclineCall(socket, incoming.callId);
      // Log the declined call.
      if (incoming.conversation_id) {
        logCall(incoming.conversation_id, {
          call_id: incoming.callId,
          call_type: incoming.call_type || 'audio',
          direction: 'incoming',
          status: 'declined',
        }).catch(() => {});
      }
    } catch (e) {
      console.error('declineCall failed:', e);
    }
  }, []);

  // End the active call.
  const endCall = useCallback(async () => {
    const active = activeCallRef.current;
    if (!active) return;
    const socket = getCallSocket();
    if (socket) {
      try { await socketEndCall(socket, active.callId); } catch { /* best-effort */ }
    }
    // Log the call end with duration.
    if (active.conversationId) {
      const duration = active.startedAt ? Math.floor((Date.now() - active.startedAt) / 1000) : 0;
      logCall(active.conversationId, {
        call_id: active.callId,
        call_type: active.callType || 'audio',
        direction: active.role === 'caller' ? 'outgoing' : 'incoming',
        status: 'ended',
        duration,
      }).catch(() => {});
    }
    setActiveCall(null);
  }, []);

  // Cancel an outgoing call while ringing (before the callee accepts).
  const cancelOutgoing = useCallback(async () => {
    const active = activeCallRef.current;
    if (!active || active.role !== 'caller') return;
    const socket = getCallSocket();
    if (socket) {
      try { await cancelCall(socket, active.callId); } catch { /* best-effort */ }
    }
    // Log the missed/cancelled call.
    if (active.conversationId) {
      logCall(active.conversationId, {
        call_id: active.callId,
        call_type: active.callType || 'audio',
        direction: 'outgoing',
        status: 'missed',
      }).catch(() => {});
    }
    setActiveCall(null);
  }, []);

  const value = {
    incomingCall,
    activeCall,
    callError,
    startCall,
    acceptCall,
    declineCall,
    endCall,
    cancelOutgoing,
    clearError: () => setCallError(null),
  };

  return <CallContext.Provider value={value}>{children}</CallContext.Provider>;
}

export function useCall() {
  const ctx = useContext(CallContext);
  if (!ctx) return null;
  return ctx;
}
