import React, { useState, useEffect, useRef } from 'react';
import { X, PhoneOff } from 'lucide-react';

const JITSI_DOMAIN = 'meet.jit.si';
const SCRIPT_SRC = `https://${JITSI_DOMAIN}/external_api.js`;

let scriptPromise = null;
function loadJitsiScript() {
  if (window.JitsiMeetExternalAPI) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = SCRIPT_SRC;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => { scriptPromise = null; reject(new Error('Failed to load call provider')); };
    document.head.appendChild(s);
  });
  return scriptPromise;
}

// Deterministic room name so both caller and receiver join the SAME room.
export function buildCallRoomName(conversationId) {
  return `sehatconnectvoice${String(conversationId || 'call').replace(/[^a-zA-Z0-9]/g, '')}`;
}

export default function AudioCall({ roomName, displayName, otherName, onClose }) {
  const [seconds, setSeconds] = useState(0);
  const [status, setStatus] = useState('connecting'); // connecting | ringing | connected | ended
  const [error, setError] = useState(null);
  const containerRef = useRef(null);
  const apiRef = useRef(null);

  useEffect(() => {
    const interval = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    let disposed = false;
    loadJitsiScript()
      .then(() => {
        if (disposed || !containerRef.current) return;
        const safeRoom = buildCallRoomName(roomName);
        const options = {
          roomName: safeRoom,
          parentNode: containerRef.current,
          configOverwrite: {
            prejoinPageEnabled: false,
            startWithAudioMuted: false,
            startWithVideoMuted: true,
            requireDisplayName: true,
          },
          interfaceConfigOverwrite: {
            SHOW_WATERMARK_FOR_GUESTS: false,
            SHOW_JITSI_WATERMARK: false,
            HIDE_INVITE_MORE_HEADER: true,
            TOOLBAR_BUTTONS: ['microphone', 'hangup', 'settings'],
            SETTINGS_SECTIONS: ['devices', 'general'],
          },
          userInfo: { displayName: displayName || 'SehatConnect User' },
        };
        const api = new window.JitsiMeetExternalAPI(JITSI_DOMAIN, options);
        apiRef.current = api;
        api.addEventListener('videoConferenceJoined', () => setStatus('ringing'));
        api.addEventListener('participantJoined', () => setStatus('connected'));
        api.addEventListener('participantLeft', () => setStatus('ringing'));
        api.addEventListener('videoConferenceLeft', () => { if (!disposed && onClose) onClose(); });
      })
      .catch((e) => { if (!disposed) setError(e.message || 'Call unavailable'); });

    return () => {
      disposed = true;
      if (apiRef.current) { try { apiRef.current.dispose(); } catch { /* ignore */ } apiRef.current = null; }
    };
  }, [roomName, displayName, onClose]);

  const formatTime = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  const handleEnd = () => {
    if (apiRef.current) {
      try { apiRef.current.executeCommand('hangup'); } catch { /* ignore */ }
      try { apiRef.current.dispose(); } catch { /* ignore */ }
      apiRef.current = null;
    }
    if (onClose) onClose();
  };

  const statusLabel = status === 'connected' ? 'Connected' : status === 'ringing' ? 'Ringing…' : 'Connecting…';

  return (
    <div className="fixed inset-0 z-50 bg-slate-900 flex flex-col items-center justify-center">
      <div ref={containerRef} className="absolute inset-0 opacity-0 pointer-events-none" />
      <div className="absolute top-0 left-0 right-0 p-4 flex justify-between">
        <div className="flex items-center gap-2 text-white">
          <div className={'w-2.5 h-2.5 rounded-full ' + (status === 'connected' ? 'bg-green-500 animate-pulse' : 'bg-amber-400 animate-pulse')} />
          <span className="text-sm font-mono tabular-nums">{formatTime(seconds)}</span>
        </div>
        <button onClick={onClose} className="p-2.5 rounded-full bg-white/10 hover:bg-white/20 transition-colors">
          <X className="w-5 h-5 text-white" />
        </button>
      </div>

      <div className="w-24 h-24 rounded-full bg-primary/90 flex items-center justify-center text-white text-3xl font-bold mb-5 animate-pulse-glow">
        {(otherName || 'U').slice(0, 1).toUpperCase()}
      </div>
      <p className="text-white font-semibold text-lg">{otherName || 'Voice Call'}</p>
      <p className="text-white/50 text-sm mb-10">{statusLabel}</p>

      {error && (
        <div className="absolute bottom-32 text-center px-6">
          <p className="text-white/70 text-sm">{error}</p>
        </div>
      )}

      <button
        onClick={handleEnd}
        className="flex items-center gap-2 px-8 py-3.5 rounded-full bg-red-500 text-white font-semibold text-sm hover:bg-red-600 transition-all active:scale-95 shadow-lg"
      >
        <PhoneOff className="w-5 h-5" />
        End Call
      </button>
    </div>
  );
}