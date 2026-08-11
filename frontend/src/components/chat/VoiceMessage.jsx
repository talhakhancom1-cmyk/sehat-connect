import React, { useRef, useState, useEffect } from 'react';
import { cn } from '@/lib/utils';

const fmt = (s) => {
  if (!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
};

export default function VoiceMessage({ url, mine }) {
  const [playing, setPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState(false);
  const [ready, setReady] = useState(false);
  const audioRef = useRef(null);

  const toggle = async () => {
    const a = audioRef.current;
    if (!a || error) return;
    try {
      if (playing) {
        a.pause();
      } else {
        // Restart from the beginning if it had finished.
        if (a.ended) { a.currentTime = 0; setElapsed(0); }
        await a.play();
      }
    } catch (e) {
      // AbortError happens when playback is interrupted (e.g. rapid pause) — not a real failure.
      // Only surface a hard error for genuine decode/not-supported issues; the audio element's
      // onError handler covers media load failures separately.
      if (e && e.name !== 'AbortError') {
        setError(true);
      }
    }
  };

  // webm/opus often reports Infinity duration until forced to compute it.
  // Seek to the end and back to force the browser to resolve a real duration.
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    setReady(false);
    setError(false);
    const onLoaded = () => {
      if (a.duration && isFinite(a.duration) && a.duration > 0) {
        setDuration(a.duration);
        setReady(true);
        return;
      }
      // Force duration resolution for streaming webm.
      try {
        a.currentTime = 1e101;
        const onDur = () => {
          if (isFinite(a.duration) && a.duration > 0) setDuration(a.duration);
          a.currentTime = 0;
          setElapsed(0);
          setReady(true);
          a.removeEventListener('durationchange', onDur);
        };
        a.addEventListener('durationchange', onDur);
      } catch (e) {
        setReady(true);
      }
    };
    a.addEventListener('loadedmetadata', onLoaded);
    return () => a.removeEventListener('loadedmetadata', onLoaded);
  }, [url]);

  const dur = duration > 0 ? duration : 0;
  const pct = dur > 0 ? Math.min(100, (elapsed / dur) * 100) : 0;

  return (
    <div className="flex items-center gap-2 min-w-[160px]">
      <audio
        ref={audioRef}
        src={url}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => { setPlaying(false); setElapsed(0); }}
        onTimeUpdate={(e) => {
          const a = e.target;
          setElapsed(a.currentTime || 0);
          if (a.duration && isFinite(a.duration) && a.duration > 0 && a.duration !== dur) {
            setDuration(a.duration);
          }
        }}
        onError={() => setError(true)}
      />
      <button
        onClick={toggle}
        className={cn('w-8 h-8 rounded-full flex items-center justify-center text-white shrink-0 transition-transform active:scale-90', mine ? 'bg-white/25' : 'bg-primary/90', (error || !ready) && 'opacity-50')}
        title={error ? 'Unavailable' : (playing ? 'Pause' : 'Play')}
      >
        {playing ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
        )}
      </button>
      <div className="flex-1 flex flex-col gap-1">
        <div className={cn('h-1.5 rounded-full overflow-hidden', mine ? 'bg-white/30' : 'bg-primary/20')}>
          {dur > 0 ? (
            <div className={cn('h-full rounded-full transition-[width] duration-150', mine ? 'bg-white' : 'bg-primary')} style={{ width: `${pct}%` }} />
          ) : (
            <div className={cn('h-full w-full rounded-full', mine ? 'bg-white/40' : 'bg-primary/30', playing && 'animate-pulse')} />
          )}
        </div>
        <span className={cn('text-[10px] tabular-nums', mine ? 'text-white/70' : 'text-muted-foreground')}>
          {error ? 'unavailable' : fmt(dur > 0 ? dur : (elapsed || 0))}
        </span>
      </div>
    </div>
  );
}