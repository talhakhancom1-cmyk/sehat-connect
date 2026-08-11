import React, { useEffect, useState } from 'react';
import { Phone, PhoneOff, Video, X } from 'lucide-react';

/**
 * Full-screen incoming call overlay shown to the receiving party.
 * Gives them an explicit Accept / Decline choice instead of auto-joining.
 */
export default function IncomingCallOverlay({ callerName, callerImageUrl, callType = 'audio', onAccept, onDecline }) {
  const [ringing, setRinging] = useState(true);
  const isVideo = callType === 'video';

  // Gentle pulsing ring animation toggle (purely visual).
  useEffect(() => {
    const t = setInterval(() => setRinging(r => !r), 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="fixed inset-0 z-[60] bg-slate-900/95 backdrop-blur-sm flex flex-col items-center justify-center animate-fade-in">
      <div className="absolute top-0 left-0 right-0 p-4 flex justify-end">
        <button onClick={onDecline} className="p-2.5 rounded-full bg-white/10 hover:bg-white/20 transition-colors">
          <X className="w-5 h-5 text-white" />
        </button>
      </div>

      <p className="text-white/60 text-xs uppercase tracking-widest mb-6">
        Incoming {isVideo ? 'video' : 'voice'} call
      </p>

      {callerImageUrl ? (
        <img
          src={callerImageUrl}
          alt={callerName}
          className={'w-28 h-28 rounded-full object-cover mb-5 transition-transform duration-1000 ' + (ringing ? 'scale-105' : 'scale-95')}
          style={{ boxShadow: ringing ? '0 0 0 12px rgba(99,102,241,0.18)' : '0 0 0 0 rgba(99,102,241,0)' }}
        />
      ) : (
        <div
          className={'w-28 h-28 rounded-full bg-primary/90 flex items-center justify-center text-white text-4xl font-bold mb-5 transition-transform duration-1000 ' + (ringing ? 'scale-105' : 'scale-95')}
          style={{ boxShadow: ringing ? '0 0 0 12px rgba(99,102,241,0.18)' : '0 0 0 0 rgba(99,102,241,0)' }}
        >
          {(callerName || 'U').slice(0, 1).toUpperCase()}
        </div>
      )}
      <p className="text-white font-semibold text-xl mb-1">{callerName || 'Unknown'}</p>
      <p className="text-white/50 text-sm mb-12">Ringing…</p>

      <div className="flex items-center gap-10">
        <button
          onClick={onDecline}
          className="flex flex-col items-center gap-2 group"
        >
          <span className="w-16 h-16 rounded-full bg-red-500 flex items-center justify-center group-hover:bg-red-600 group-active:scale-95 transition-all shadow-lg">
            <PhoneOff className="w-7 h-7 text-white" />
          </span>
          <span className="text-white/70 text-xs font-medium">Decline</span>
        </button>
        <button
          onClick={onAccept}
          className="flex flex-col items-center gap-2 group"
        >
          <span className="w-16 h-16 rounded-full bg-green-500 flex items-center justify-center group-hover:bg-green-600 group-active:scale-95 transition-all shadow-lg animate-pulse-glow">
            {isVideo
              ? <Video className="w-7 h-7 text-white" />
              : <Phone className="w-7 h-7 text-white" />}
          </span>
          <span className="text-white/70 text-xs font-medium">Accept</span>
        </button>
      </div>
    </div>
  );
}