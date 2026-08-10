import React, { useState, useEffect } from 'react';
import { X, PhoneOff, Mic, MicOff } from 'lucide-react';
import { useWebRTCCall } from '@/lib/useWebRTCCall';

// Deterministic room name kept for backwards compatibility with any callers
// that still import buildCallRoomName — the new system uses CallRoom ids
// from the signaling server, but we keep this export so existing imports work.
export function buildCallRoomName(conversationId) {
  return `sehatconnectvoice${String(conversationId || 'call').replace(/[^a-zA-Z0-9]/g, '')}`;
}

/**
 * Audio-only call component using WebRTC + Socket.IO signaling.
 *
 * Props:
 *   callId       — CallRoom id from the signaling server
 *   role         — 'caller' | 'callee'
 *   remoteUserId — the other party's user id
 *   displayName  — this user's name (unused in audio-only UI but kept for API symmetry)
 *   otherName    — the other party's display name (shown in the UI)
 *   onClose      — called when the call ends or the user closes the window
 */
export default function AudioCall({ callId, role, remoteUserId, _displayName, otherName, onClose }) {
  const [seconds, setSeconds] = useState(0);
  const [waiting, setWaiting] = useState(0);

  const { status, error, muted, toggleMute, endCall } = useWebRTCCall({
    callId,
    role,
    remoteUserId,
    video: false,
    onEnded: onClose,
  });

  // Call timer — starts when connected.
  useEffect(() => {
    if (status !== 'connected') return;
    const interval = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(interval);
  }, [status]);

  // Waiting timer — counts up while ringing/connecting so the user sees
  // how long they've been waiting. Auto-close after 45s of no connection.
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

  const statusColor =
    status === 'connected' ? 'bg-green-500 animate-pulse' :
    status === 'failed' ? 'bg-red-500' :
    status === 'ended' ? 'bg-gray-500' :
    'bg-amber-400 animate-pulse';

  return (
    <div className="fixed inset-0 z-[55] bg-slate-900 flex flex-col items-center justify-center">
      <div className="absolute top-0 left-0 right-0 p-4 flex justify-between">
        <div className="flex items-center gap-2 text-white">
          <div className={'w-2.5 h-2.5 rounded-full ' + statusColor} />
          {status === 'connected' && <span className="text-sm font-mono tabular-nums">{formatTime(seconds)}</span>}
        </div>
        <button onClick={onClose} className="p-2.5 rounded-full bg-white/10 hover:bg-white/20 transition-colors">
          <X className="w-5 h-5 text-white" />
        </button>
      </div>

      <div className={'w-24 h-24 rounded-full bg-primary/90 flex items-center justify-center text-white text-3xl font-bold mb-5 ' + (status === 'connected' ? '' : 'animate-pulse-glow')}>
        {(otherName || 'U').slice(0, 1).toUpperCase()}
      </div>
      <p className="text-white font-semibold text-lg">{otherName || 'Voice Call'}</p>
      <p className="text-white/50 text-sm mb-10">{statusLabel}</p>

      {error && (
        <div className="absolute bottom-32 text-center px-6">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      <div className="flex items-center gap-4">
        <button
          onClick={toggleMute}
          disabled={status !== 'connected'}
          className={'p-4 rounded-full transition-all active:scale-95 disabled:opacity-30 ' + (muted ? 'bg-white/10 text-white' : 'bg-white/20 text-white hover:bg-white/30')}
          title={muted ? 'Unmute' : 'Mute'}
        >
          {muted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
        </button>
        <button
          onClick={handleEnd}
          className="flex items-center gap-2 px-8 py-3.5 rounded-full bg-red-500 text-white font-semibold text-sm hover:bg-red-600 transition-all active:scale-95 shadow-lg"
        >
          <PhoneOff className="w-5 h-5" />
          End Call
        </button>
      </div>
    </div>
  );
}
