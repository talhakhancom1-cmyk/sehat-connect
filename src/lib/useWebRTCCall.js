import { useEffect, useRef, useState, useCallback } from 'react';
import { WebRTCCall, fetchIceServers } from '@/lib/webrtc';
import {
  getCallSocket,
  sendSignal,
  acceptCall,
  declineCall,
  cancelCall,
  endCall as socketEndCall,
} from '@/lib/callSocket';

/**
 * Shared React hook that drives a 1:1 WebRTC call over the Socket.IO
 * signaling server. Used by both AudioCall and VideoCall components.
 *
 * Props:
 *   callId       — the CallRoom id (from initiateCall or the incoming call:ringing event)
 *   role         — 'caller' | 'callee'
 *   remoteUserId — the other party's user id (for routing signals)
 *   video        — whether to request/offer video
 *   onEnded      — callback fired when the call ends (hangup, decline, timeout, error)
 *
 * Returns:
 *   { status, error, localStream, remoteStream, muted, cameraOn, toggleMute, toggleCamera, endCall }
 *   status: 'connecting' | 'ringing' | 'connected' | 'reconnecting' | 'ended' | 'failed'
 */
export function useWebRTCCall({ callId, role, remoteUserId, video = false, onEnded }) {
  const [status, setStatus] = useState(role === 'caller' ? 'ringing' : 'connecting');
  const [error, setError] = useState(null);
  const [muted, setMuted] = useState(false);
  const [cameraOn, setCameraOn] = useState(video);
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);

  const callRef = useRef(null);
  const socketRef = useRef(null);
  const onEndedRef = useRef(onEnded);
  useEffect(() => { onEndedRef.current = onEnded; }, [onEnded]);

  const endCall = useCallback(async () => {
    const call = callRef.current;
    const socket = socketRef.current;
    if (call) { call.close(); callRef.current = null; }
    if (socket && callId) {
      try { await socketEndCall(socket, callId); } catch { /* best-effort */ }
    }
    setStatus('ended');
    onEndedRef.current?.();
  }, [callId]);

  // Set up the WebRTC call + signaling listeners.
  useEffect(() => {
    let disposed = false;
    let iceServers = [];

    const setup = async () => {
      try {
        iceServers = await fetchIceServers();
      } catch {
        iceServers = [{ urls: ['stun:stun.l.google.com:19302'] }];
      }
      if (disposed) return;

      const socket = getCallSocket();
      socketRef.current = socket;

      const call = new WebRTCCall({
        iceServers,
        video,
        onRemoteStream: (stream) => {
          if (!disposed) setRemoteStream(stream);
        },
        onIceCandidate: (candidate) => {
          // Send each ICE candidate to the peer via the signaling server.
          sendSignal(socket, {
            call_id: callId,
            to_user_id: remoteUserId,
            signal_type: 'ice_candidate',
            payload: candidate,
          });
        },
        onStateChange: ({ ice, connection }) => {
          if (disposed) return;
          if (ice === 'connected' || connection === 'connected') {
            setStatus('connected');
          } else if (ice === 'disconnected' || connection === 'disconnected') {
            setStatus('reconnecting');
          } else if (ice === 'failed') {
            setStatus('failed');
            setError('Connection failed. Please try again.');
          }
        },
        onError: (e) => {
          if (!disposed) setError(e.message || 'Call error');
        },
      });
      callRef.current = call;

      // --- Incoming WebRTC signals from the peer ---
      const onSignal = async ({ call_id, from_user_id, signal_type, payload }) => {
        if (call_id !== callId || from_user_id !== remoteUserId) return;
        try {
          if (signal_type === 'offer') {
            await call.setRemoteOffer(payload);
            const answer = await call.createAnswer();
            sendSignal(socket, { call_id, to_user_id: from_user_id, signal_type: 'answer', payload: answer });
            setStatus('connected');
          } else if (signal_type === 'answer') {
            await call.setRemoteAnswer(payload);
          } else if (signal_type === 'ice_candidate') {
            await call.addIceCandidate(payload);
          }
        } catch (e) {
          if (!disposed) setError(e.message || 'Signaling error');
        }
      };
      socket.on('call:signal', onSignal);

      // --- Remote party ended / left / declined ---
      const onEndedRemote = () => {
        if (disposed) return;
        call.close();
        callRef.current = null;
        setStatus('ended');
        onEndedRef.current?.();
      };
      socket.on('call:ended', onEndedRemote);
      socket.on('call:declined', onEndedRemote);
      socket.on('call:cancelled', onEndedRemote);
      socket.on('call:participant_left', onEndedRemote);

      // --- Acquire local media ---
      try {
        const stream = await call.start({ video });
        if (disposed) { call.close(); return; }
        setLocalStream(stream);
      } catch (e) {
        if (!disposed) {
          setError(e.message || 'Could not access microphone/camera');
          setStatus('failed');
        }
        return;
      }

      // --- Role-specific signaling flow ---
      if (role === 'caller') {
        // Caller: wait for the callee to accept (the caller's UI calls
        // initiateCall separately and passes the resulting callId here).
        // Once accepted, create the offer.
        const onAccepted = async ({ call_id, from_user_id }) => {
          if (call_id !== callId || from_user_id !== remoteUserId) return;
          try {
            const offer = await call.createOffer();
            sendSignal(socket, { call_id, to_user_id: remoteUserId, signal_type: 'offer', payload: offer });
          } catch (e) {
            if (!disposed) setError(e.message || 'Could not create offer');
          }
        };
        socket.on('call:accepted', onAccepted);

        // Ring timeout / no answer
        const onFailed = ({ call_id }) => {
          if (call_id !== callId) return;
          if (!disposed) {
            setStatus('failed');
            setError('Call was not answered');
          }
        };
        socket.on('call:state_changed', onFailed);

        return () => {
          socket.off('call:signal', onSignal);
          socket.off('call:accepted', onAccepted);
          socket.off('call:state_changed', onFailed);
          socket.off('call:ended', onEndedRemote);
          socket.off('call:declined', onEndedRemote);
          socket.off('call:cancelled', onEndedRemote);
          socket.off('call:participant_left', onEndedRemote);
        };
      } else {
        // Callee: the callee already accepted (the incoming-call UI calls
        // acceptCall separately and passes the resulting callId here).
        // The caller will send the offer, which we handle in onSignal above.
        return () => {
          socket.off('call:signal', onSignal);
          socket.off('call:ended', onEndedRemote);
          socket.off('call:declined', onEndedRemote);
          socket.off('call:cancelled', onEndedRemote);
          socket.off('call:participant_left', onEndedRemote);
        };
      }
    };

    let cleanup = null;
    setup().then((fn) => { cleanup = fn; });

    return () => {
      disposed = true;
      if (cleanup) cleanup();
      if (callRef.current) { callRef.current.close(); callRef.current = null; }
    };
  }, [callId, remoteUserId, role, video]);

  const toggleMute = useCallback(() => {
    const call = callRef.current;
    if (!call) return;
    const newMuted = call.toggleMute();
    setMuted(newMuted);
    return newMuted;
  }, []);

  const toggleCamera = useCallback(() => {
    const call = callRef.current;
    if (!call) return;
    const newOn = call.toggleCamera();
    setCameraOn(newOn);
    return newOn;
  }, []);

  return { status, error, localStream, remoteStream, muted, cameraOn, toggleMute, toggleCamera, endCall };
}
