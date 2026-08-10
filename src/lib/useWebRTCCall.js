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
export function useWebRTCCall({ callId, remoteUserId, role, video = false, onEnded }) {
  const [status, setStatus] = useState(role === 'caller' ? 'ringing' : 'connecting');
  const [error, setError] = useState(null);
  const [muted, setMuted] = useState(false);
  const [cameraOn, setCameraOn] = useState(video);
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);

  const callRef = useRef(null);
  const socketRef = useRef(null);
  const onEndedRef = useRef(onEnded);
  // Buffer for signals that arrive before the WebRTCCall is ready.
  const signalBufferRef = useRef([]);
  const callReadyRef = useRef(false);
  // Track if the caller already received call:accepted so we can create
  // the offer once the call is ready.
  const acceptedReceivedRef = useRef(false);

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

    // --- Register ALL socket listeners SYNCHRONOUSLY before any async work ---
    // This prevents the race condition where call:accepted or call:signal
    // events arrive before the listeners are registered.
    const socket = getCallSocket();
    if (!socket) {
      setError('Real-time connection not available');
      setStatus('failed');
      return;
    }
    socketRef.current = socket;
    console.log('[WebRTC] effect start', { callId, role, remoteUserId, video, socketId: socket.id });

    // Buffer handler for signals — stores them until the WebRTCCall is ready.
    const onSignal = ({ call_id, from_user_id, signal_type, payload }) => {
      if (call_id !== callId || from_user_id !== remoteUserId) return;
      console.log('[WebRTC] signal received', { signal_type, buffered: !callReadyRef.current });
      if (callReadyRef.current && callRef.current) {
        handleSignal(signal_type, payload);
      } else {
        signalBufferRef.current.push({ signal_type, payload });
      }
    };

    const handleSignal = async (signal_type, payload) => {
      const call = callRef.current;
      if (!call) return;
      try {
        if (signal_type === 'offer') {
          await call.setRemoteOffer(payload);
          const answer = await call.createAnswer();
          console.log('[WebRTC] answer created, sending to peer');
          sendSignal(socket, { call_id: callId, to_user_id: remoteUserId, signal_type: 'answer', payload: answer });
        } else if (signal_type === 'answer') {
          await call.setRemoteAnswer(payload);
          console.log('[WebRTC] remote answer set');
        } else if (signal_type === 'ice_candidate') {
          await call.addIceCandidate(payload);
        }
      } catch (e) {
        console.error('[WebRTC] signal error', signal_type, e);
        if (!disposed) setError(e.message || 'Signaling error');
      }
    };

    const onAccepted = ({ call_id, from_user_id }) => {
      if (call_id !== callId || from_user_id !== remoteUserId) return;
      console.log('[WebRTC] call:accepted received', { callReady: callReadyRef.current });
      acceptedReceivedRef.current = true;
      // If the call is already ready, create the offer now.
      // Otherwise, the offer will be created once setup completes.
      if (callReadyRef.current && callRef.current) {
        createOffer();
      }
    };

    const createOffer = async () => {
      const call = callRef.current;
      if (!call) return;
      try {
        console.log('[WebRTC] creating offer');
        const offer = await call.createOffer();
        console.log('[WebRTC] offer created, sending to peer');
        sendSignal(socket, { call_id: callId, to_user_id: remoteUserId, signal_type: 'offer', payload: offer });
      } catch (e) {
        console.error('[WebRTC] createOffer error', e);
        if (!disposed) setError(e.message || 'Could not create offer');
      }
    };

    const onEndedRemote = () => {
      if (disposed) return;
      console.log('[WebRTC] remote ended');
      if (callRef.current) { callRef.current.close(); callRef.current = null; }
      setStatus('ended');
      onEndedRef.current?.();
    };

    const onFailed = ({ call_id, status: s, reason }) => {
      if (call_id !== callId) return;
      console.log('[WebRTC] state_changed', s, reason);
      if (s === 'failed' && !disposed) {
        setStatus('failed');
        setError(reason === 'no_answer_timeout' ? 'Call was not answered' : 'Call failed');
      }
    };

    // Register all listeners immediately (synchronous).
    socket.on('call:signal', onSignal);
    socket.on('call:accepted', onAccepted);
    socket.on('call:state_changed', onFailed);
    socket.on('call:ended', onEndedRemote);
    socket.on('call:declined', onEndedRemote);
    socket.on('call:cancelled', onEndedRemote);
    socket.on('call:participant_left', onEndedRemote);

    // --- Now do the async setup (ICE servers, getUserMedia, RTCPeerConnection) ---
    const setup = async () => {
      let iceServers = [];
      try {
        iceServers = await fetchIceServers();
        console.log('[WebRTC] ICE servers', iceServers);
      } catch {
        iceServers = [{ urls: ['stun:stun.l.google.com:19302'] }];
      }
      if (disposed) return;

      const call = new WebRTCCall({
        iceServers,
        video,
        onRemoteStream: (stream) => {
          console.log('[WebRTC] remote stream received');
          if (!disposed) setRemoteStream(stream);
        },
        onIceCandidate: (candidate) => {
          console.log('[WebRTC] ICE candidate generated');
          sendSignal(socket, {
            call_id: callId,
            to_user_id: remoteUserId,
            signal_type: 'ice_candidate',
            payload: candidate,
          });
        },
        onStateChange: ({ ice, connection }) => {
          if (disposed) return;
          console.log('[WebRTC] state', { ice, connection });
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
          console.error('[WebRTC] error', e);
          if (!disposed) setError(e.message || 'Call error');
        },
      });
      callRef.current = call;

      // Acquire local media.
      try {
        const stream = await call.start({ video });
        if (disposed) { call.close(); return; }
        setLocalStream(stream);
        const audioTracks = stream.getAudioTracks();
        const videoTracks = stream.getVideoTracks();
        console.log('[WebRTC] local media acquired', {
          audioTracks: audioTracks.length,
          videoTracks: videoTracks.length,
          audioDetail: audioTracks.map((t) => ({ id: t.id, kind: t.kind, enabled: t.enabled, readyState: t.readyState, label: t.label })),
          videoDetail: videoTracks.map((t) => ({ id: t.id, kind: t.kind, enabled: t.enabled, readyState: t.readyState, label: t.label })),
        });
      } catch (e) {
        if (!disposed) {
          setError(e.message || 'Could not access microphone/camera');
          setStatus('failed');
        }
        return;
      }

      // Mark the call as ready and process any buffered signals.
      callReadyRef.current = true;
      console.log('[WebRTC] call ready, processing buffer', { buffered: signalBufferRef.current.length, accepted: acceptedReceivedRef.current });

      // Process buffered signals.
      const buffered = signalBufferRef.current.splice(0);
      for (const { signal_type, payload } of buffered) {
        await handleSignal(signal_type, payload);
      }

      // If we're the caller and call:accepted already arrived, create the offer now.
      if (role === 'caller' && acceptedReceivedRef.current) {
        console.log('[WebRTC] caller: accepted was already received, creating offer now');
        createOffer();
      }
    };

    setup();

    return () => {
      disposed = true;
      socket.off('call:signal', onSignal);
      socket.off('call:accepted', onAccepted);
      socket.off('call:state_changed', onFailed);
      socket.off('call:ended', onEndedRemote);
      socket.off('call:declined', onEndedRemote);
      socket.off('call:cancelled', onEndedRemote);
      socket.off('call:participant_left', onEndedRemote);
      if (callRef.current) { callRef.current.close(); callRef.current = null; }
    };
  }, [callId, remoteUserId, role, video]);

  const toggleMute = useCallback(() => {
    const call = callRef.current;
    if (!call) return false;
    const newMuted = call.toggleMute();
    setMuted(newMuted);
    return newMuted;
  }, []);

  const toggleCamera = useCallback(() => {
    const call = callRef.current;
    if (!call) return false;
    const newOn = call.toggleCamera();
    setCameraOn(newOn);
    return newOn;
  }, []);

  const switchCamera = useCallback(async () => {
    const call = callRef.current;
    if (!call) return false;
    return call.switchCamera();
  }, []);

  return { status, error, localStream, remoteStream, muted, cameraOn, toggleMute, toggleCamera, switchCamera, endCall };
}
