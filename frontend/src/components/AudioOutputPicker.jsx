import React, { useState, useRef, useEffect } from 'react';
import { Volume2, ChevronDown, Speaker, Headphones, Bluetooth, Ear, Check } from 'lucide-react';

const ICON_MAP = {
  speaker: Speaker,
  headset: Headphones,
  bluetooth: Bluetooth,
  earpiece: Ear,
  default: Volume2,
};

/**
 * Compact audio output device picker — shows current device icon +
 * label, opens a dropdown to switch. Used in both AudioCall and
 * VideoCall control bars.
 *
 * Props:
 *   devices          — MediaDeviceInfo[] (audiooutput)
 *   selectedId       — currently selected deviceId
 *   onSelect         — (deviceId: string) => void
 *   supported        — boolean (whether setSinkId is available)
 *   deviceIcon       — icon key ('speaker' | 'headset' | ...)
 *   deviceLabel      — human-readable label
 *   compact          — if true, shows icon only (tooltip on hover)
 */
export default function AudioOutputPicker({
  devices,
  selectedId,
  onSelect,
  supported,
  deviceIcon,
  deviceLabel,
  compact = false,
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const Icon = ICON_MAP[deviceIcon] || Volume2;

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
    };
  }, []);

  if (!supported || devices.length <= 1) {
    // Nothing to switch — show a static icon (or nothing in compact mode).
    console.log('[AudioOutputPicker] disabled state:', { supported, deviceCount: devices.length });
    if (compact) return null;
    return (
      <div className="p-3.5 sm:p-4 rounded-full bg-white/10 text-white/50 cursor-default" title={supported ? 'Only one audio output device available' : 'Audio output switching not supported on this browser'}>
        <Icon className="w-5 h-5 sm:w-6 sm:h-6" />
      </div>
    );
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="p-3.5 sm:p-4 rounded-full bg-white/20 text-white hover:bg-white/30 transition-all active:scale-95 flex items-center gap-1"
        title={`Audio output: ${deviceLabel}`}
      >
        <Icon className="w-5 h-5 sm:w-6 sm:h-6" />
        {!compact && <ChevronDown className="w-3 h-3 sm:w-4 sm:h-4" />}
      </button>

      {open && (
        <div className="absolute bottom-full mb-2 right-0 w-56 rounded-xl bg-slate-800 shadow-2xl border border-white/10 overflow-hidden z-20">
          <div className="px-3 py-2 text-xs text-white/50 font-medium border-b border-white/10">
            Audio Output
          </div>
          <div className="max-h-60 overflow-y-auto">
            {devices.map((d) => {
              const iconKey = (d.label || '').toLowerCase().includes('bluetooth') ? 'bluetooth'
                : (d.label || '').toLowerCase().includes('headset') || (d.label || '').toLowerCase().includes('headphone') || (d.label || '').toLowerCase().includes('usb') ? 'headset'
                : (d.label || '').toLowerCase().includes('earpiece') || (d.label || '').toLowerCase().includes('receiver') ? 'earpiece'
                : (d.label || '').toLowerCase().includes('speaker') ? 'speaker'
                : 'default';
              const ItemIcon = ICON_MAP[iconKey] || Volume2;
              const label = d.label || `Device ${d.deviceId.slice(0, 8)}`;
              const active = d.deviceId === selectedId;
              return (
                <button
                  key={d.deviceId}
                  onClick={() => { onSelect(d.deviceId); setOpen(false); }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors ${active ? 'bg-primary/20 text-white' : 'text-white/70 hover:bg-white/5'}`}
                >
                  <ItemIcon className="w-4 h-4 shrink-0" />
                  <span className="flex-1 text-sm truncate">{label}</span>
                  {active && <Check className="w-4 h-4 text-primary shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
