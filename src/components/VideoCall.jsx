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

export default function VideoCall({ roomName, displayName, doctorName, onClose }) {
  const [seconds, setSeconds] = useState(0);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(null);
  const containerRef = useRef(null);
  const apiRef = useRef(null);

  // Timer
  useEffect(() => {
    const interval = setInterval(() => setSeconds(s => s + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  // Init Jitsi External API
  useEffect(() => {
    let disposed = false;
    loadJitsiScript()
      .then(() => {
        if (disposed || !containerRef.current) return;
        // Unique, hard-to-guess room for privacy on the free public bridge
        const safeRoom = `sehatconnect-${String(roomName || 'consult').replace(/[^a-zA-Z0-9-]/g, '')}-${Math.random().toString(36).slice(2, 8)}`;
        const options = {
          roomName: safeRoom,
          parentNode: containerRef.current,
          configOverwrite: {
            prejoinPageEnabled: true,
            startWithAudioMuted: false,
            startWithVideoMuted: false,
            requireDisplayName: true,
            doNotFlipDeck: true,
          },
          interfaceConfigOverwrite: {
            SHOW_WATERMARK_FOR_GUESTS: false,
            SHOW_JITSI_WATERMARK: false,
            HIDE_INVITE_MORE_HEADER: true,
            TOOLBAR_BUTTONS: ['microphone', 'camera', 'desktop', 'fullscreen', 'hangup', 'settings', 'raisehand', 'videoquality', 'filmstrip', 'shortcuts', 'toggle-camera', 'chat'],
            SETTINGS_SECTIONS: ['devices', 'general'],
          },
          userInfo: {
            displayName: displayName || 'SehatConnect User',
          },
        };
        const api = new window.JitsiMeetExternalAPI(JITSI_DOMAIN, options);
        apiRef.current = api;
        api.addEventListener('videoConferenceLeft', () => {
          if (!disposed && onClose) onClose();
        });
        setReady(true);
      })
      .catch((e) => { if (!disposed) setError(e.message || 'Call unavailable'); });

    return () => {
      disposed = true;
      if (apiRef.current) {
        try { apiRef.current.dispose(); } catch { /* ignore */ }
        apiRef.current = null;
      }
    };
  }, [roomName, displayName, onClose]);

  const formatTime = (s) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  };

  const handleEnd = () => {
    if (apiRef.current) {
      try { apiRef.current.executeCommand('hangup'); } catch { /* ignore */ }
      try { apiRef.current.dispose(); } catch { /* ignore */ }
      apiRef.current = null;
    }
    if (onClose) onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      {/* Top bar */}
      <div className="absolute top-0 left-0 right-0 z-10 p-4 bg-gradient-to-b from-black/70 to-transparent flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-white">
            <div className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse" />
            <span className="text-sm font-mono font-medium tabular-nums">{formatTime(seconds)}</span>
          </div>
          <div className="h-4 w-px bg-white/20" />
          <div className="text-white">
            <p className="text-sm font-semibold">{doctorName || 'Video Consultation'}</p>
            <p className="text-[11px] text-white/60">SehatConnect</p>
          </div>
        </div>
        <button onClick={onClose} className="p-2.5 rounded-full bg-white/10 hover:bg-white/20 transition-colors active:scale-95">
          <X className="w-5 h-5 text-white" />
        </button>
      </div>

      {/* Jitsi container */}
      <div ref={containerRef} className="w-full h-full" />

      {/* Loading / error overlay */}
      {!ready && !error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black">
          <div className="w-10 h-10 border-4 border-white/20 border-t-white rounded-full animate-spin" />
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

      {/* End call button */}
      <div className="absolute bottom-0 left-0 right-0 z-10 p-6 bg-gradient-to-t from-black/70 to-transparent flex justify-center">
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