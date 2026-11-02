"use client";

/*
 * Invytra's own sounds, made live with the Web Audio API (no audio files, nothing licensed).
 * Browsers only allow sound after a click, so call primeSound() inside the click handler,
 * then play the sound when the action has worked.
 */

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx ??= new AC();
    return ctx;
  } catch {
    return null;
  }
}

/** Unlocks audio; call it synchronously in the click that will lead to a sound. */
export function primeSound(): void {
  const a = audio();
  if (a?.state === "suspended") void a.resume().catch(() => undefined);
}

/**
 * "Launch": a short airy whoosh rising into a bright four-note chime (G major, ending an
 * octave up) with a soft echo. About 1.5 seconds, gentle volume.
 */
export function playLaunchSound(): void {
  const a = audio();
  if (!a) return;
  try {
    if (a.state === "suspended") void a.resume();
    const t0 = a.currentTime + 0.02;

    const master = a.createGain();
    master.gain.value = 0.22;
    const comp = a.createDynamicsCompressor();
    master.connect(comp).connect(a.destination);

    // Soft echo.
    const echo = a.createDelay(1);
    echo.delayTime.value = 0.17;
    const feedback = a.createGain();
    feedback.gain.value = 0.28;
    const wet = a.createGain();
    wet.gain.value = 0.22;
    echo.connect(feedback).connect(echo);
    echo.connect(wet).connect(master);

    // Whoosh: filtered noise sweeping up.
    const len = Math.floor(a.sampleRate * 0.55);
    const buf = a.createBuffer(1, len, a.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const noise = a.createBufferSource();
    noise.buffer = buf;
    const band = a.createBiquadFilter();
    band.type = "bandpass";
    band.Q.value = 1.2;
    band.frequency.setValueAtTime(350, t0);
    band.frequency.exponentialRampToValueAtTime(3200, t0 + 0.45);
    const ng = a.createGain();
    ng.gain.setValueAtTime(0.0001, t0);
    ng.gain.exponentialRampToValueAtTime(0.5, t0 + 0.2);
    ng.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.55);
    noise.connect(band).connect(ng).connect(master);
    noise.start(t0);
    noise.stop(t0 + 0.6);

    // Chime: G5 – B5 – D6 – G6, bell-like (fundamental + a quiet octave), the last one rings.
    const notes: [number, number, number][] = [
      [783.99, 0.2, 0.9],
      [987.77, 0.3, 0.9],
      [1174.66, 0.4, 1.0],
      [1567.98, 0.54, 1.5],
    ];
    for (const [freq, at, ring] of notes) {
      const start = t0 + at;
      const g = a.createGain();
      g.gain.setValueAtTime(0.0001, start);
      g.gain.exponentialRampToValueAtTime(0.9, start + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, start + ring);
      g.connect(master);
      g.connect(echo);
      for (const [mult, level, type] of [
        [1, 1, "sine"],
        [2, 0.22, "sine"],
        [3.01, 0.06, "triangle"],
      ] as [number, number, OscillatorType][]) {
        const o = a.createOscillator();
        o.type = type;
        o.frequency.value = freq * mult;
        const og = a.createGain();
        og.gain.value = level;
        o.connect(og).connect(g);
        o.start(start);
        o.stop(start + ring + 0.05);
      }
    }
  } catch {
    // Sound is a nicety: never let it break the page.
  }
}
