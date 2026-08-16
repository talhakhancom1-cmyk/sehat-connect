import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, PhoneOff, Mic, MicOff, Video, VideoOff, SwitchCamera, Wifi, WifiOff } from 'lucide-react';
import { useWebRTCCall } from '@/lib/useWebRTCCall';
import { useAudioOutput } from '@/lib/useAudioOutput';
import AudioOutputPicker from '@/components/AudioOutputPicker';

/**
 * Video call component using WebRTC + Socket.IO signaling.
 *
 * Features:
 *  - Full-screen remote video with draggable picture-in-picture local camera
 *  - Auto-hiding control bar (reappears on tap/mouse move)
 *  - Connection quality indicator
 *  - Audio output device switching (setSinkId)
 *  - Smooth fade-in while remote stream connects
 *  - Graceful camera/mic permission error handling
 */
export default function VideoCall({ callId, role, remoteUserId, _displayName, doctorName, otherName, onClose }) {
  const [seconds, setSeconds] = useState(0);
  const [waiting, setWaiting] = useState(0);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [pipPos, setPipPos] = useState({ x: null, y: null }); // null = default bottom-right
  const [remoteReady, setRemoteReady] = useState(false);
  const [cameraSwitchMsg, setCameraSwitchMsg] = useState(null);

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const pipDragRef = useRef(null);
  const pipStartRef = useRef(null);
  const hideTimerRef = useRef(null);
  const displayName = otherName || doctorName || 'Video Call';

  const audioOutput = useAudioOutput();

  const { status, error, localStream, remoteStream, muted, cameraOn, toggleMute, toggleCamera, switchCamera, endCall } = useWebRTCCall({
    callId,
    role,
    remoteUserId,
    video: true,
    onEnded: onClose,
  });

  // Attach local stream to video element.
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  // Attach remote stream to the video element (only when stream changes).
  useEffect(() => {
    const el = remoteVideoRef.current;
    if (!el || !remoteStream) return;
    el.srcObject = remoteStream;
    setRemoteReady(true);

    const audioTracks = remoteStream.getAudioTracks();
    const videoTracks = remoteStream.getVideoTracks();
    console.log('[VideoCall] remoteStream attached', {
      hasAudio: audioTracks.length > 0,
      hasVideo: videoTracks.length > 0,
      audioTracks: audioTracks.map((t) => ({ id: t.id, enabled: t.enabled, muted: t.muted, readyState: t.readyState })),
    });

    el.play().then(() => {
      console.log('[VideoCall] remote video+audio playing');
    }).catch((err) => {
      console.warn('[VideoCall] remote play() rejected:', err.message);
      const resume = () => {
        el.play().catch(() => {});
        document.removeEventListener('click', resume);
        document.removeEventListener('touchstart', resume);
      };
      document.addEventListener('click', resume, { once: true });
      document.addEventListener('touchstart', resume, { once: true });
    });
  }, [remoteStream]);

  // Apply audio output device to the remote video element.
  // Separate effect so changing the device doesn't re-attach the stream
  // (which would reset the sinkId to default).
  useEffect(() => {
    const el = remoteVideoRef.current;
    if (!el) return;
    audioOutput.applyToElement(el);
  }, [audioOutput.selectedDeviceId, audioOutput.supported, audioOutput.applyToElement]);

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

  // Auto-hide controls after 4s of inactivity (when connected).
  const showControls = useCallback(() => {
    setControlsVisible(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    if (status === 'connected') {
      hideTimerRef.current = setTimeout(() => setControlsVisible(false), 4000);
    }
  }, [status]);

  useEffect(() => {
    if (status === 'connected') {
      showControls();
    } else {
      setControlsVisible(true);
    }
    return () => { if (hideTimerRef.current) clearTimeout(hideTimerRef.current); };
  }, [status, showControls]);

  // Draggable PiP — mouse + touch handlers.
  const onPipPointerDown = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    const isTouch = e.touches;
    const clientX = isTouch ? e.touches[0].clientX : e.clientX;
    const clientY = isTouch ? e.touches[0].clientY : e.clientY;
    pipStartRef.current = {
      startX: clientX,
      startY: clientY,
      origX: pipPos.x ?? rect.left,
      origY: pipPos.y ?? rect.top,
    };
    pipDragRef.current = true;
  }, [pipPos]);

  useEffect(() => {
    if (!pipDragRef.current) return;
    const onMove = (e) => {
      if (!pipDragRef.current || !pipStartRef.current) return;
      const isTouch = e.touches;
      const clientX = isTouch ? e.touches[0].clientX : e.clientX;
      const clientY = isTouch ? e.touches[0].clientY : e.clientY;
      const dx = clientX - pipStartRef.current.startX;
      const dy = clientY - pipStartRef.current.startY;
      const newX = pipStartRef.current.origX + dx;
      const newY = pipStartRef.current.origY + dy;
      // Clamp to viewport
      const pipW = 160, pipH = 208; // approx w-40 h-52
      const clampedX = Math.max(8, Math.min(window.innerWidth - pipW - 8, newX));
      const clampedY = Math.max(8, Math.min(window.innerHeight - pipH - 8, newY));
      setPipPos({ x: clampedX, y: clampedY });
    };
    const onUp = () => { pipDragRef.current = false; pipStartRef.current = null; };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onUp);
    };
  }, []);

  const formatTime = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  const handleEnd = () => { endCall(); };

  const statusLabel =
    status === 'connected' ? 'Connected' :
    status === 'ringing' ? `Ringing… (${waiting}s)` :
    status === 'reconnecting' ? 'Reconnecting…' :
    status === 'failed' ? 'Call failed' :
    status === 'ended' ? 'Call ended' : `Connecting… (${waiting}s)`;

  // Connection quality: good (connected), weak (reconnecting), bad (failed)
  const connQuality =
    status === 'connected' ? 'good' :
    status === 'reconnecting' ? 'weak' :
    status === 'failed' ? 'bad' : 'pending';

  const pipStyle = pipPos.x !== null
    ? { left: pipPos.x, top: pipPos.y, right: 'auto', bottom: 'auto' }
    : {};

  return (
    <div
      className="fixed inset-0 z-50 bg-black flex flex-col overflow-hidden"
      onMouseMove={showControls}
      onTouchStart={showControls}
    >
      {/* Top bar (auto-hide) */}
      <div className={`absolute top-0 left-0 right-0 z-20 p-4 bg-gradient-to-b from-black/70 to-transparent flex items-center justify-between transition-opacity duration-300 ${controlsVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-white">
            <div className={'w-2.5 h-2.5 rounded-full ' + (status === 'connected' ? 'bg-green-500 animate-pulse' : status === 'failed' ? 'bg-red-500' : 'bg-amber-400 animate-pulse')} />
            {status === 'connected' && <span className="text-sm font-mono font-medium tabular-nums">{formatTime(seconds)}</span>}
          </div>
          <div className="h-4 w-px bg-white/20" />
          <div className="text-white">
            <p className="text-sm font-semibold">{displayName}</p>
            <div className="flex items-center gap-1.5">
              <p className="text-[11px] text-white/60">{statusLabel}</p>
              {status === 'connected' && (
                <span className="flex items-center gap-0.5 ml-1">
                  {connQuality === 'good' && <Wifi className="w-3 h-3 text-green-400" />}
                  {connQuality === 'weak' && <WifiOff className="w-3 h-3 text-amber-400 animate-pulse" />}
                  {connQuality === 'bad' && <WifiOff className="w-3 h-3 text-red-400" />}
                </span>
              )}
            </div>
          </div>
        </div>
        <button onClick={onClose} className="p-2.5 rounded-full bg-white/10 hover:bg-white/20 transition-colors active:scale-95">
          <X className="w-5 h-5 text-white" />
        </button>
      </div>

      {/* Remote video (full screen) with fade-in */}
      <video
        ref={remoteVideoRef}
        autoPlay
        playsInline
        className={`w-full h-full object-cover transition-opacity duration-700 ${remoteReady ? 'opacity-100' : 'opacity-0'}`}
      />

      {/* Local video (draggable PiP) */}
      <div
        className="absolute bottom-28 right-4 z-20 w-32 h-44 sm:w-40 sm:h-52 rounded-2xl overflow-hidden border-2 border-white/20 shadow-lg bg-slate-800 cursor-grab active:cursor-grabbing touch-none"
        style={pipStyle}
        onMouseDown={onPipPointerDown}
        onTouchStart={onPipPointerDown}
      >
        <video
          ref={localVideoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-cover -scale-x-100 pointer-events-none"
        />
        {!cameraOn && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-800 pointer-events-none">
            <VideoOff className="w-8 h-8 text-white/40" />
          </div>
        )}
      </div>

      {/* Loading / connecting overlay with fade */}
      {status !== 'connected' && !error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black z-10">
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 border-4 border-white/20 border-t-white rounded-full animate-spin" />
            <p className="text-white/60 text-sm">{statusLabel}</p>
          </div>
        </div>
      )}

      {/* Permission / error overlay */}
      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black text-center px-6 z-30">
          <p className="text-white font-semibold mb-2">Call unavailable</p>
          <p className="text-white/60 text-sm mb-4 max-w-xs">
            {error.toLowerCase().includes('permission') || error.toLowerCase().includes('denied') || error.toLowerCase().includes('notallowed')
              ? 'Camera or microphone access was denied. Please allow access in your browser settings and try again.'
              : error}
          </p>
          <button onClick={handleEnd} className="px-6 py-2.5 rounded-full bg-white/10 text-white text-sm font-medium hover:bg-white/20">
            Close
          </button>
        </div>
      )}

      {/* Camera switch feedback toast */}
      {cameraSwitchMsg && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-30 px-4 py-2 rounded-full bg-black/70 text-white text-sm backdrop-blur-sm">
          {cameraSwitchMsg}
        </div>
      )}

      {/* In-call controls (auto-hide) */}
      {status === 'connected' && (
        <div className={`absolute bottom-0 left-0 right-0 z-20 p-4 sm:p-6 bg-gradient-to-t from-black/70 to-transparent flex justify-center gap-3 sm:gap-4 transition-opacity duration-300 ${controlsVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
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
            onClick={async () => {
              const result = await switchCamera();
              if (!result) {
                setCameraSwitchMsg('No other camera available');
                setTimeout(() => setCameraSwitchMsg(null), 2500);
              }
            }}
            className="p-3.5 sm:p-4 rounded-full bg-white/20 text-white hover:bg-white/30 transition-all active:scale-95"
            title="Switch camera"
          >
            <SwitchCamera className="w-5 h-5 sm:w-6 sm:h-6" />
          </button>
          <AudioOutputPicker
            devices={audioOutput.outputDevices}
            selectedId={audioOutput.selectedDeviceId}
            onSelect={audioOutput.selectDevice}
            supported={audioOutput.supported}
            deviceIcon={audioOutput.deviceIcon}
            deviceLabel={audioOutput.deviceLabel}
          />
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
        <div className="absolute bottom-0 left-0 right-0 z-20 p-6 bg-gradient-to-t from-black/70 to-transparent flex justify-center">
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
