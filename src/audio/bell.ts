/**
 * Synthesized handbell: a few inharmonic partials with exponential decay.
 * English handbells are tuned so the strongest overtone is a 12th (3x) above the fundamental.
 */
const PARTIALS = [
  { ratio: 1, gain: 1, decay: 2.4 },
  { ratio: 3, gain: 0.45, decay: 1.2 },
  { ratio: 4.2, gain: 0.12, decay: 0.6 },
  { ratio: 5.4, gain: 0.08, decay: 0.4 },
  { ratio: 8.1, gain: 0.05, decay: 0.2 },
];

/** Plays one bell strike at `time`, damped after `duration` seconds. */
export function strikeBell(
  ctx: BaseAudioContext,
  dest: AudioNode,
  freq: number,
  time: number,
  duration: number,
): void {
  const out = ctx.createGain();
  out.connect(dest);
  // Lower bells ring longer; damp at the end of the written length.
  const ring = Math.min(duration, 6);
  const end = time + ring + 0.12;
  out.gain.setValueAtTime(1, time);
  out.gain.setValueAtTime(1, time + ring);
  out.gain.exponentialRampToValueAtTime(0.001, end);

  const lowBoost = Math.min(1.6, Math.max(0.7, 440 / freq));
  // Ears are most sensitive around 1–4kHz, so soften bells played that high (e.g. 2 octaves up).
  const treble = freq > 1000 ? Math.sqrt(1000 / freq) : 1;
  for (const p of PARTIALS) {
    const f = freq * p.ratio;
    if (f > 16000) continue;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = f;
    const g = ctx.createGain();
    const peak = p.gain * 0.18 * treble;
    g.gain.setValueAtTime(0, time);
    g.gain.linearRampToValueAtTime(peak, time + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.004 + p.decay * lowBoost);
    osc.connect(g).connect(out);
    osc.start(time);
    osc.stop(end + 0.05);
  }
}
