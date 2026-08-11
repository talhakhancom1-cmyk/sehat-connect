/**
 * Notification beep sound utility.
 *
 * Uses the Web Audio API to generate a short, subtle beep — no external
 * audio file needed. Handles browser autoplay restrictions gracefully:
 * the AudioContext is created lazily on first user interaction, so it
 * won't break anything if the browser blocks it.
 */

let audioCtx = null;

function getAudioContext() {
  if (audioCtx) return audioCtx;
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    audioCtx = new Ctx();
    return audioCtx;
  } catch (e) {
    console.warn('[notificationSound] could not create AudioContext:', e.message);
    return null;
  }
}

/**
 * Play a short, subtle notification beep.
 * Two quick tones (880Hz then 1100Hz) for a pleasant "ding-dong" effect.
 */
export function playNotificationBeep() {
  const ctx = getAudioContext();
  if (!ctx) return;

  // Resume if suspended (browser autoplay policy)
  if (ctx.state === 'suspended') {
    ctx.resume().catch(() => {});
    // If still suspended, the browser requires a user gesture first.
    // The beep will play on the next interaction — see primeAudio() below.
    if (ctx.state === 'suspended') return;
  }

  try {
    const now = ctx.currentTime;

    // First tone (880Hz, 0.12s)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.frequency.value = 880;
    osc1.type = 'sine';
    gain1.gain.setValueAtTime(0, now);
    gain1.gain.linearRampToValueAtTime(0.15, now + 0.01);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    osc1.connect(gain1).connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.13);

    // Second tone (1100Hz, 0.15s) — starts right after the first
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.frequency.value = 1100;
    osc2.type = 'sine';
    gain2.gain.setValueAtTime(0, now + 0.08);
    gain2.gain.linearRampToValueAtTime(0.15, now + 0.09);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
    osc2.connect(gain2).connect(ctx.destination);
    osc2.start(now + 0.08);
    osc2.stop(now + 0.23);
  } catch (e) {
    console.warn('[notificationSound] could not play beep:', e.message);
  }
}

/**
 * "Prime" the audio context by resuming it on the first user interaction.
 * Call this once on app load — it attaches one-time listeners that resume
 * the suspended AudioContext so subsequent beeps can play.
 */
export function primeAudio() {
  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.state === 'running') return;

  const resume = () => {
    ctx.resume().catch(() => {});
    document.removeEventListener('click', resume);
    document.removeEventListener('touchstart', resume);
    document.removeEventListener('keydown', resume);
  };
  document.addEventListener('click', resume, { once: true });
  document.addEventListener('touchstart', resume, { once: true });
  document.addEventListener('keydown', resume, { once: true });
}
