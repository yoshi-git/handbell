import type { Accidental, NoteName } from './types';

export type { Accidental };

const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const LETTER_PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

const NOTE_RE = /^(\d)([A-Ga-g])(#|b|♯|♭)?$/;

/** "3A" -> 57 (scientific pitch: 4A = 440Hz = MIDI 69). Returns NaN for invalid input. */
export function toMidi(name: NoteName): number {
  const m = NOTE_RE.exec(name.trim());
  if (!m) return NaN;
  const octave = Number(m[1]);
  let pc = LETTER_PC[m[2].toUpperCase()];
  if (m[3] === '#' || m[3] === '♯') pc += 1;
  if (m[3] === 'b' || m[3] === '♭') pc -= 1;
  return (octave + 1) * 12 + pc;
}

/** 57 -> "3A". Always uses sharps (the canonical storage form). */
export function fromMidi(midi: number): NoteName {
  const octave = Math.floor(midi / 12) - 1;
  return `${octave}${SHARP_NAMES[((midi % 12) + 12) % 12]}`;
}

export function isValidNote(name: string): boolean {
  return !Number.isNaN(toMidi(name));
}

/** Normalizes any accepted spelling ("4Db", "4d♭") to canonical sharp form ("4C#"). */
export function normalize(name: string): NoteName {
  const midi = toMidi(name);
  if (Number.isNaN(midi)) throw new Error(`不正な音名です: ${name}`);
  return fromMidi(midi);
}

export function isBlackKey(name: NoteName): boolean {
  return name.includes('#');
}

/** All chromatic notes from low to high inclusive, ordered high -> low (score row order). */
export function notesInRange(low: NoteName, high: NoteName): NoteName[] {
  const lo = toMidi(low);
  const hi = toMidi(high);
  const out: NoteName[] = [];
  for (let m = hi; m >= lo; m--) out.push(fromMidi(m));
  return out;
}

/** Sounding frequency in Hz; `octaves` raises playback only (the written pitch stays). */
export function frequency(name: NoteName, octaves = 0): number {
  return 440 * Math.pow(2, (toMidi(name) - 69) / 12 + octaves);
}

/** Display label, e.g. "4C#" -> "4C♯" or "4D♭". */
export function displayName(name: NoteName, accidental: Accidental = 'sharp'): string {
  const midi = toMidi(name);
  const octave = Math.floor(midi / 12) - 1;
  const pc = midi % 12;
  const label = (accidental === 'flat' ? FLAT_NAMES : SHARP_NAMES)[pc];
  return `${octave}${label.replace('#', '♯').replace('b', '♭')}`;
}

/** Every note a range selector may offer (1C .. 7C). */
export const SELECTABLE_NOTES: NoteName[] = notesInRange('1C', '7C').reverse();
