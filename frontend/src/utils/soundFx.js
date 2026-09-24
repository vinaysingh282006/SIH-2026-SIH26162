/**
 * Procedural Web Audio API Sound Effects Engine
 * ===============================================
 * Generates futuristic sci-fi telemetry, radar pings, anomaly alerts,
 * and harmonious success chimes using 100% native Web Audio oscillators.
 * Zero external MP3 downloads, 0 latency, zero dependencies.
 */

let audioCtx = null;
let soundEnabled = true;

function getAudioContext() {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

export function isSoundEnabled() {
  return soundEnabled;
}

export function setSoundEnabled(enabled) {
  soundEnabled = Boolean(enabled);
  return soundEnabled;
}

export function toggleSound() {
  soundEnabled = !soundEnabled;
  return soundEnabled;
}

/**
 * Radar Pulse / Sonar Ping (Soft decaying sine wave)
 */
export function playRadarPing() {
  if (!soundEnabled) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'sine';
  osc.frequency.setValueAtTime(880, now);
  osc.frequency.exponentialRampToValueAtTime(330, now + 0.6);

  gain.gain.setValueAtTime(0.18, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.65);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(now);
  osc.stop(now + 0.65);
}

/**
 * High-tech telemetry chirp / packet transmission
 */
export function playTelemetryChirp() {
  if (!soundEnabled) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const osc1 = ctx.createOscillator();
  const gain = ctx.createGain();

  osc1.type = 'triangle';
  osc1.frequency.setValueAtTime(1400, now);
  osc1.frequency.setValueAtTime(2200, now + 0.04);
  osc1.frequency.setValueAtTime(1800, now + 0.08);

  gain.gain.setValueAtTime(0.15, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);

  osc1.connect(gain);
  gain.connect(ctx.destination);

  osc1.start(now);
  osc1.stop(now + 0.16);
}

/**
 * Anomaly Alert — double warning beep
 */
export function playAlert() {
  if (!soundEnabled) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  [0, 0.12].forEach((offset) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(740, now + offset);
    osc.frequency.exponentialRampToValueAtTime(880, now + offset + 0.08);

    gain.gain.setValueAtTime(0.15, now + offset);
    gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.09);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now + offset);
    osc.stop(now + offset + 0.1);
  });
}

/**
 * Consensus validation & self-healing success chime (harmonious triad)
 */
export function playSuccessChime() {
  if (!soundEnabled) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const chord = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6

  chord.forEach((freq, idx) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now + idx * 0.05);

    gain.gain.setValueAtTime(0.08, now + idx * 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.05 + 0.5);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now + idx * 0.05);
    osc.stop(now + idx * 0.05 + 0.55);
  });
}

/**
 * Low-frequency cautionary tone for edge case / limit condition
 */
export function playWarningCaution() {
  if (!soundEnabled) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(220, now);
  osc.frequency.linearRampToValueAtTime(160, now + 0.35);

  gain.gain.setValueAtTime(0.12, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(now);
  osc.stop(now + 0.36);
}

/**
 * Step transition whoosh
 */
export function playStepWhoosh() {
  if (!soundEnabled) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'sine';
  osc.frequency.setValueAtTime(300, now);
  osc.frequency.exponentialRampToValueAtTime(900, now + 0.15);

  gain.gain.setValueAtTime(0.12, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(now);
  osc.stop(now + 0.18);
}
