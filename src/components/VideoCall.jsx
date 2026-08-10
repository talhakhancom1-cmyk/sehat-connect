import React, { useState, useEffect, useRef } from 'react';
import { X, PhoneOff, Mic, MicOff, Video, VideoOff, SwitchCamera } from 'lucide-react';
import { useWebRTCCall } from '@/lib/useWebRTCCall';

/**
 * Video call component using WebRTC + Socket.IO signaling.
 *
 * Props:
 *   callId       — CallRoom id from the signaling server
 *   role         — 'caller' | 'callee'
 *   remoteUserId — the other party's user id
 *   displayName  — this user's name
 *   doctorName   — the other party's display name (kept for backwards compat)
 *   onClose      — called when the call ends or the user closes the window
 */
export default function VideoCall({ callId, role, remoteUserId, _displayName, doctorName, otherName, onClose }) {
  const [seconds, setSeconds] = useState(0);
  const [waiting, setWaiting] = useState(0);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const displayName = otherName || doctorName || 'Video Call';

  const { status, error, localStream, remoteStream, muted, cameraOn, toggleMute, toggleCamera, switchCamera, endCall } = useWebRTCCall({
    callId,
    role,
    remoteUserId,
    video: true,
    onEnded: onClose,
  });

  // Attach streams to video elements.
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  useEffect(() => {
    const el = remoteVideoRef.current;
    if (!el || !remoteStream) return;
    el.srcObject = remoteStream;
    // Log track info for debugging audio issues
    const audioTracks = remoteStream.getAudioTracks();
    const videoTracks = remoteStream.getVideoTracks();
    console.log('[VideoCall] remoteStream attached', {
      hasAudio: audioTracks.length > 0,
      hasVideo: videoTracks.length > 0,
      audioTracks: audioTracks.map((t) => ({ id: t.id, enabled: t.enabled, muted: t.muted, readyState: t.readyState })),
    });
    // Explicitly call play() — browsers block autoplay with sound unless
    // there was a user gesture. Since the user clicked "Accept"/"Call",
    // we have a gesture, but we still need to call play() to be safe.
    el.play().then(() => {
      console.log('[VideoCall] remote video+audio playing');
    }).catch((err) => {
      console.warn('[VideoCall] remote play() rejected:', err.message);
      // Retry on next user interaction
      const resume = () => {
        el.play().catch(() => {});
        document.removeEventListener('click', resume);
        document.removeEventListener('touchstart', resume);
      };
      document.addEventListener('click', resume, { once: true });
      document.addEventListener('touchstart', resume, { once: true });
    });
  }, [remoteStream]);

  // Call timer — starts when connected.
  useEffect(() => {
    if (status !== 'connected') return;
    const interval = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(interval);
  }, [status]);

  // Waiting timer — auto-close after 45s of no connection.
  useEffect(() => {
    if (status === 'connected' || status === 'ended' || status === 'failed') {
      setWaiting(0);
      return;
    }
    const interval = setInterval(() => {
      setWaiting((w) => {
        if (w >= 45) {
          endCall();
          return 0;
        }
        return w + 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [status, endCall]);

  const formatTime = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  const handleEnd = () => {
    endCall();
  };

  const statusLabel =
    status === 'connected' ? 'Connected' :
    status === 'ringing' ? `Ringing… (${waiting}s)` :
    status === 'reconnecting' ? 'Reconnecting…' :
    status === 'failed' ? 'Call failed' :
    status === 'ended' ? 'Call ended' : `Connecting… (${waiting}s)`;

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      {/* Top bar */}
      <div className="absolute top-0 left-0 right-0 z-10 p-4 bg-gradient-to-b from-black/70 to-transparent flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-white">
            <div className={'w-2.5 h-2.5 rounded-full ' + (status === 'connected' ? 'bg-green-500 animate-pulse' : status === 'failed' ? 'bg-red-500' : 'bg-amber-400 animate-pulse')} />
            {status === 'connected' && <span className="text-sm font-mono font-medium tabular-nums">{formatTime(seconds)}</span>}
          </div>
          <div className="h-4 w-px bg-white/20" />
          <div className="text-white">
            <p className="text-sm font-semibold">{displayName}</p>
            <p className="text-[11px] text-white/60">{statusLabel}</p>
          </div>
        </div>
        <button onClick={onClose} className="p-2.5 rounded-full bg-white/10 hover:bg-white/20 transition-colors active:scale-95">
          <X className="w-5 h-5 text-white" />
        </button>
      </div>

      {/* Remote video (full screen) */}
      <video
        ref={remoteVideoRef}
        autoPlay
        playsInline
        className="w-full h-full object-cover"
      />

      {/* Local video (picture-in-picture) */}
      <div className="absolute bottom-24 right-4 z-10 w-32 h-44 sm:w-40 sm:h-52 rounded-2xl overflow-hidden border-2 border-white/20 shadow-lg bg-slate-800">
        <video
          ref={localVideoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-cover -scale-x-100"
        />
        {!cameraOn && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-800">
            <VideoOff className="w-8 h-8 text-white/40" />
          </div>
        )}
      </div>

      {/* Loading / error overlay */}
      {status !== 'connected' && !error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black">
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 border-4 border-white/20 border-t-white rounded-full animate-spin" />
            <p className="text-white/60 text-sm">{statusLabel}</p>
          </div>
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black text-center px-6">
          <p className="text-white font-semibold mb-2">Call unavailable</p>
          <p className="text-white/60 text-sm mb-4">{error}</p>
          <button onClick={handleEnd} className="px-6 py-2.5 rounded-full bg-white/10 text-white text-sm font-medium hover:bg-white/20">
            Close
          </button>
        </div>
      )}

      {/* In-call controls */}
      {status === 'connected' && (
        <div className="absolute bottom-0 left-0 right-0 z-10 p-4 sm:p-6 bg-gradient-to-t from-black/70 to-transparent flex justify-center gap-3 sm:gap-4">
          <button
            onClick={toggleMute}
            className={'p-3.5 sm:p-4 rounded-full transition-all active:scale-95 ' + (muted ? 'bg-white/10 text-white' : 'bg-white/20 text-white hover:bg-white/30')}
            title={muted ? 'Unmute' : 'Mute'}
          >
            {muted ? <MicOff className="w-5 h-5 sm:w-6 sm:h-6" /> : <Mic className="w-5 h-5 sm:w-6 sm:h-6" />}
          </button>
          <button
            onClick={toggleCamera}
            className={'p-3.5 sm:p-4 rounded-full transition-all active:scale-95 ' + (cameraOn ? 'bg-white/20 text-white hover:bg-white/30' : 'bg-white/10 text-white')}
            title={cameraOn ? 'Turn off camera' : 'Turn on camera'}
          >
            {cameraOn ? <Video className="w-5 h-5 sm:w-6 sm:h-6" /> : <VideoOff className="w-5 h-5 sm:w-6 sm:h-6" />}
          </button>
          <button
            onClick={switchCamera}
            className="p-3.5 sm:p-4 rounded-full bg-white/20 text-white hover:bg-white/30 transition-all active:scale-95"
            title="Switch camera"
          >
            <SwitchCamera className="w-5 h-5 sm:w-6 sm:h-6" />
          </button>
          <button
            onClick={handleEnd}
            className="flex items-center gap-2 px-6 py-3 sm:px-8 sm:py-4 rounded-full bg-red-500 text-white font-semibold text-sm hover:bg-red-600 transition-all active:scale-95 shadow-lg"
          >
            <PhoneOff className="w-5 h-5" />
            End Call
          </button>
        </div>
      )}

      {/* End call button (when not connected yet) */}
      {status !== 'connected' && !error && (
        <div className="absolute bottom-0 left-0 right-0 z-10 p-6 bg-gradient-to-t from-black/70 to-transparent flex justify-center">
          <button
            onClick={handleEnd}
            className="flex items-center gap-2 px-8 py-3.5 rounded-full bg-red-500 text-white font-semibold text-sm hover:bg-red-600 transition-all active:scale-95 shadow-lg"
          >
            <PhoneOff className="w-5 h-5" />
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
