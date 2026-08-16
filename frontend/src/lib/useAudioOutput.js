import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * Hook for enumerating audio output devices and routing audio to a
 * selected device via HTMLMediaElement.setSinkId().
 *
 * Browser support:
 *  - Chrome/Edge (desktop + Android): full setSinkId() support.
 *  - Firefox: does NOT support setSinkId() (uses OS-level routing).
 *  - Safari (desktop 17+): partial support; iOS Safari historically
 *    does NOT support setSinkId() — audio routing is OS-level.
 *
 * When setSinkId is unavailable, the hook still enumerates devices
 * (for display) but cannot actually switch the output — the caller
 * should show a graceful note or rely on OS-level routing.
 *
 * Usage:
 *   const {
 *     outputDevices,      // MediaDeviceInfo[] (audiooutput only)
 *     selectedDeviceId,   // string | null
 *     selectDevice,       // (id: string) => void
 *     applyToElement,     // (el: HTMLMediaElement) => Promise<void>
 *     supported,          // boolean — whether setSinkId is available
 *     deviceLabel,        // human-readable label for the active device
 *     deviceIcon,         // 'speaker' | 'headset' | 'bluetooth' | 'earpiece' | 'default'
 *   } = useAudioOutput();
 */
export function useAudioOutput() {
  const [outputDevices, setOutputDevices] = useState([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState(null);
  const [sinkError, setSinkError] = useState(null);
  const [supported] = useState(
    typeof HTMLMediaElement !== 'undefined' &&
      typeof HTMLMediaElement.prototype.setSinkId === 'function'
  );
  const lastElementRef = useRef(null);

  // Heuristic: classify a device label into an icon category.
  const classifyDevice = useCallback((label) => {
    const l = (label || '').toLowerCase();
    if (l.includes('bluetooth') || l.includes('airpods') || l.includes('bt')) return 'bluetooth';
    if (l.includes('headset') || l.includes('headphone') || l.includes('usb') || l.includes('audio-technica') || l.includes('jabra') || l.includes('plantronics')) return 'headset';
    if (l.includes('earpiece') || l.includes('receiver') || l.includes('built-in earpiece')) return 'earpiece';
    if (l.includes('speaker') || l.includes('built-in speaker')) return 'speaker';
    return 'default';
  }, []);

  const deviceIcon = classifyDevice(
    outputDevices.find((d) => d.deviceId === selectedDeviceId)?.label
  );

  const deviceLabel =
    outputDevices.find((d) => d.deviceId === selectedDeviceId)?.label || 'Default';

  // Enumerate audio output devices.
  const refreshDevices = useCallback(async () => {
    try {
      if (!navigator.mediaDevices?.enumerateDevices) return;
      const devices = await navigator.mediaDevices.enumerateDevices();
      const outputs = devices.filter((d) => d.kind === 'audiooutput');
      setOutputDevices(outputs);

      // Auto-select a sensible default on first load:
      // Prefer Bluetooth > headset > earpiece > speaker > default
      if (selectedDeviceId === null && outputs.length > 0) {
        const bluetooth = outputs.find((d) => classifyDevice(d.label) === 'bluetooth');
        const headset = outputs.find((d) => classifyDevice(d.label) === 'headset');
        const earpiece = outputs.find((d) => classifyDevice(d.label) === 'earpiece');
        const preferred = bluetooth || headset || earpiece || outputs[0];
        setSelectedDeviceId(preferred.deviceId);
      }
    } catch {
      /* ignore — permissions may not be granted yet */
    }
  }, [selectedDeviceId, classifyDevice]);

  // Initial enumeration + listen for device changes (plug/unplug).
  useEffect(() => {
    refreshDevices();
    if (!navigator.mediaDevices?.addEventListener) return;
    const handler = () => refreshDevices();
    navigator.mediaDevices.addEventListener('devicechange', handler);
    return () => navigator.mediaDevices.removeEventListener('devicechange', handler);
  }, [refreshDevices]);

  // Re-enumerate after getUserMedia permission is granted (labels become visible).
  useEffect(() => {
    const check = () => {
      if (outputDevices.length > 0 && outputDevices[0].label) return;
      refreshDevices();
    };
    const interval = setInterval(check, 2000);
    return () => clearInterval(interval);
  }, [outputDevices, refreshDevices]);

  // Apply the selected sink to a media element.
  const applyToElement = useCallback(
    async (el) => {
      if (!el) return;
      lastElementRef.current = el;
      if (!supported || !selectedDeviceId) return;
      try {
        await el.setSinkId(selectedDeviceId);
        setSinkError(null);
      } catch (e) {
        console.warn('[useAudioOutput] setSinkId failed:', e.name, e.message);
        setSinkError(e.name === 'NotFoundError' ? 'Selected audio device not found' : e.message);
      }
    },
    [supported, selectedDeviceId]
  );

  // When the selected device changes, re-apply to the last element.
  const selectDevice = useCallback(
    (id) => {
      setSelectedDeviceId(id);
      setSinkError(null);
      if (lastElementRef.current && supported) {
        lastElementRef.current.setSinkId(id).then(() => {
          setSinkError(null);
        }).catch((e) => {
          console.warn('[useAudioOutput] setSinkId failed on select:', e.name, e.message);
          setSinkError(e.name === 'NotFoundError' ? 'Selected audio device not found' : e.message);
        });
      }
    },
    [supported]
  );

  return {
    outputDevices,
    selectedDeviceId,
    selectDevice,
    applyToElement,
    supported,
    sinkError,
    deviceLabel,
    deviceIcon,
  };
}
