import React, { useState, useRef } from 'react';
import { Mic, Square, Send } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';

export default function VoiceRecorder({ onSend, disabled }) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [stopping, setStopping] = useState(false);
  const mediaRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const sendingRef = useRef(false);
  const { toast } = useToast();

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunksRef.current = [];
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : (MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '');
      const mr = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      mr.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data); };
      mediaRef.current = mr;
      mr.start(250);
      setRecording(true);
      setSeconds(0);
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch (e) {
      toast({ title: 'Microphone unavailable', description: 'Please grant mic permission to record voice notes.', variant: 'destructive' });
    }
  };

  const stop = (send) => {
    return new Promise((resolve) => {
      const mr = mediaRef.current;
      if (!mr) { setStopping(false); return resolve(null); }
      // Guard against a double-tap firing the upload/send twice.
      if (send && sendingRef.current) { setStopping(false); return resolve(null); }
      if (send) sendingRef.current = true;
      mr.onstop = async () => {
        streamTracks().forEach((t) => t.stop());
        if (timerRef.current) clearInterval(timerRef.current);
        mediaRef.current = null;
        if (!send) { setRecording(false); setStopping(false); resolve(null); return; }
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        if (!blob.size) { setRecording(false); setStopping(false); sendingRef.current = false; resolve(null); return; }
        setUploading(true);
        try {
          const file = new File([blob], `voice-${Date.now()}.webm`, { type: 'audio/webm' });
          const { file_url } = await base44.integrations.Core.UploadFile({ file });
          resolve(file_url);
        } catch (e) {
          toast({ title: 'Voice upload failed', variant: 'destructive' });
          resolve(null);
        } finally {
          setUploading(false);
          setRecording(false);
          setStopping(false);
          sendingRef.current = false;
        }
      };
      try { mr.stop(); } catch (e) { setStopping(false); sendingRef.current = false; resolve(null); }
    });
  };

  const streamTracks = () => (mediaRef.current?.stream?.getTracks() || []);

  const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  if (recording) {
    return (
      <div className="flex items-center gap-2 flex-1 px-3 py-2 rounded-xl bg-red-50 border border-red-200">
        <button
          onClick={() => stop(false)}
          className="p-1.5 rounded-full bg-red-500 text-white hover:bg-red-600 active:scale-95 transition-all"
          title="Cancel"
        >
          <Square className="w-3.5 h-3.5" />
        </button>
        <div className="flex items-center gap-2 flex-1">
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          <span className="text-sm text-red-700 font-medium tabular-nums">{fmt(seconds)}</span>
        </div>
        <button
          onClick={async () => { if (stopping || uploading) return; setStopping(true); const url = await stop(true); if (url) onSend(url, seconds); }}
          disabled={uploading || stopping || disabled}
          className="p-2 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 active:scale-95 transition-all disabled:opacity-40"
          title="Send voice note"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={start}
      disabled={disabled || uploading}
      className={cn('p-2.5 rounded-xl bg-secondary text-foreground hover:bg-secondary/80 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed')}
      title="Record voice note"
    >
      <Mic className="w-4 h-4" />
    </button>
  );
}