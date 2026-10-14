import { fromMidi, notesInRange, SELECTABLE_NOTES, toMidi } from './pitch';
import type { Note, NoteName, Song } from './types';

export const DEFAULT_RANGE = { low: '3A', high: '5E' } as const;

export function newId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function createSong(title = '新しい曲'): Song {
  return {
    version: 1,
    id: newId(),
    title,
    tempo: 100,
    beatsPerMeasure: 4,
    subdivisions: 2,
    measures: 8,
    range: { ...DEFAULT_RANGE },
    assignments: {},
    notes: [],
  };
}

export function stepsPerMeasure(song: Song): number {
  return song.beatsPerMeasure * song.subdivisions;
}

export function totalSteps(song: Song): number {
  return song.measures * stepsPerMeasure(song);
}

/** Row order for the score: high -> low. */
export function rows(song: Song): NoteName[] {
  return notesInRange(song.range.low, song.range.high);
}

export function inRange(song: Song, pitch: NoteName): boolean {
  const m = toMidi(pitch);
  return m >= toMidi(song.range.low) && m <= toMidi(song.range.high);
}

/** Notes hidden because they are outside the range or past the last measure. */
export function hiddenNoteCount(song: Song): number {
  const end = totalSteps(song);
  return song.notes.filter((n) => !inRange(song, n.pitch) || n.step >= end).length;
}

export function noteAt(song: Song, pitch: NoteName, step: number): Note | undefined {
  return song.notes.find((n) => n.pitch === pitch && step >= n.step && step < n.step + n.length);
}

function sortNotes(notes: Note[]): Note[] {
  return [...notes].sort((a, b) => a.step - b.step || toMidi(b.pitch) - toMidi(a.pitch));
}

export function addNote(song: Song, pitch: NoteName, step: number, length = 1): Song {
  if (noteAt(song, pitch, step)) return song;
  // Don't let the new note run into the next note on the same bell.
  const next = song.notes
    .filter((n) => n.pitch === pitch && n.step > step)
    .reduce((min, n) => Math.min(min, n.step), Infinity);
  const len = Math.max(1, Math.min(length, next - step));
  return { ...song, notes: sortNotes([...song.notes, { pitch, step, length: len }]) };
}

export function removeNote(song: Song, note: Note): Song {
  return { ...song, notes: song.notes.filter((n) => n !== note) };
}

export function setNoteLength(song: Song, note: Note, length: number): Song {
  const next = song.notes
    .filter((n) => n.pitch === note.pitch && n.step > note.step)
    .reduce((min, n) => Math.min(min, n.step), totalSteps(song));
  const len = Math.max(1, Math.min(length, next - note.step));
  if (len === note.length) return song;
  return { ...song, notes: song.notes.map((n) => (n === note ? { ...n, length: len } : n)) };
}

export function setAssignment(song: Song, pitch: NoteName, player: string): Song {
  const assignments = { ...song.assignments };
  if (player.trim()) assignments[pitch] = player;
  else delete assignments[pitch];
  return { ...song, assignments };
}

/** Changes steps-per-beat, rescaling note positions so the music keeps its timing. */
export function setSubdivisions(song: Song, subdivisions: number): Song {
  const ratio = subdivisions / song.subdivisions;
  const scaled = song.notes.map((n) => ({
    ...n,
    step: Math.round(n.step * ratio),
    length: Math.max(1, Math.round(n.length * ratio)),
  }));
  // Rounding can collapse two notes onto the same step; keep the first.
  const seen = new Set<string>();
  const notes = scaled.filter((n) => {
    const key = `${n.pitch}@${n.step}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return { ...song, subdivisions, notes: sortNotes(notes) };
}

const MIN_MIDI = toMidi(SELECTABLE_NOTES[0]);
const MAX_MIDI = toMidi(SELECTABLE_NOTES[SELECTABLE_NOTES.length - 1]);

/** Whether every note stays within the selectable notes (1C..7C) after shifting. */
export function canTranspose(song: Song, semitones: number): boolean {
  return song.notes.every((n) => {
    const m = toMidi(n.pitch) + semitones;
    return m >= MIN_MIDI && m <= MAX_MIDI;
  });
}

/**
 * Shifts every note by `semitones`. Player assignments move with the notes so each
 * player keeps their part; the range is left as is (it reflects the bells on hand).
 */
export function transpose(song: Song, semitones: number): Song {
  if (!semitones || !canTranspose(song, semitones)) return song;
  const shift = (p: NoteName) => fromMidi(toMidi(p) + semitones);
  const assignments: Record<NoteName, string> = {};
  for (const [pitch, player] of Object.entries(song.assignments)) {
    const m = toMidi(pitch) + semitones;
    if (m >= MIN_MIDI && m <= MAX_MIDI) assignments[fromMidi(m)] = player;
  }
  return { ...song, assignments, notes: sortNotes(song.notes.map((n) => ({ ...n, pitch: shift(n.pitch) }))) };
}

/** Distinct player names in row order (high -> low), for stable colors and listing. */
export function players(song: Song): string[] {
  const out: string[] = [];
  for (const pitch of rows(song)) {
    const p = song.assignments[pitch];
    if (p && !out.includes(p)) out.push(p);
  }
  return out;
}

export function bellsOf(song: Song, player: string): NoteName[] {
  return rows(song).filter((p) => song.assignments[p] === player);
}

/** Inserts `count` empty measures before measure `index` (0-based), shifting later notes. */
export function insertMeasures(song: Song, index: number, count = 1): Song {
  const at = Math.max(0, Math.min(index, song.measures)) * stepsPerMeasure(song);
  const shift = count * stepsPerMeasure(song);
  return {
    ...song,
    measures: song.measures + count,
    notes: song.notes.map((n) => (n.step >= at ? { ...n, step: n.step + shift } : n)),
  };
}

/** A rectangular area of the score: pitches low..high, steps from..to (exclusive). */
export interface Selection {
  low: NoteName;
  high: NoteName;
  from: number;
  to: number;
}

/** Copied notes, with steps relative to the start of the copied area. */
export interface Clip {
  low: NoteName;
  high: NoteName;
  width: number;
  subdivisions: number;
  notes: Note[];
}

function inSelection(sel: Selection, n: Note): boolean {
  const m = toMidi(n.pitch);
  return m >= toMidi(sel.low) && m <= toMidi(sel.high) && n.step >= sel.from && n.step < sel.to;
}

export function selectedNotes(song: Song, sel: Selection): Note[] {
  return song.notes.filter((n) => inSelection(sel, n));
}

export function copySelection(song: Song, sel: Selection): Clip {
  return {
    low: sel.low,
    high: sel.high,
    width: sel.to - sel.from,
    subdivisions: song.subdivisions,
    notes: selectedNotes(song, sel).map((n) => ({ ...n, step: n.step - sel.from })),
  };
}

/** Removes notes that start inside the selection. */
export function deleteSelection(song: Song, sel: Selection): Song {
  const notes = song.notes.filter((n) => !inSelection(sel, n));
  return notes.length === song.notes.length ? song : { ...song, notes };
}

/** The area a clip would cover when pasted at `step` (in this song's subdivisions). */
export function pasteArea(song: Song, clip: Clip, step: number): Selection {
  const width = Math.max(1, Math.round((clip.width * song.subdivisions) / clip.subdivisions));
  return { low: clip.low, high: clip.high, from: step, to: step + width };
}

/**
 * Pastes a clip at `step` keeping its pitches. Notes already in the target area are
 * replaced, and the song is lengthened if the clip runs past the last measure.
 */
export function pasteClip(song: Song, clip: Clip, step: number): Song {
  const area = pasteArea(song, clip, step);
  const ratio = song.subdivisions / clip.subdivisions;
  const lo = toMidi(area.low);
  const hi = toMidi(area.high);
  const inRows = (p: NoteName) => toMidi(p) >= lo && toMidi(p) <= hi;
  const kept = deleteSelection(song, area).notes.map((n) =>
    // Damp bells that would otherwise ring into the pasted area.
    inRows(n.pitch) && n.step < area.from && n.step + n.length > area.from ? { ...n, length: area.from - n.step } : n,
  );
  const seen = new Set<string>();
  const pasted = clip.notes
    .map((n) => ({ ...n, step: step + Math.round(n.step * ratio), length: Math.max(1, Math.round(n.length * ratio)) }))
    .filter((n) => {
      const key = `${n.pitch}@${n.step}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  const measures = Math.max(song.measures, Math.ceil(area.to / stepsPerMeasure(song)));
  // Keep each bell's notes from overlapping the next one.
  const all = sortNotes([...kept, ...pasted]);
  const notes = all.map((n) => {
    const next = all.find((o) => o.pitch === n.pitch && o.step > n.step);
    return next && n.step + n.length > next.step ? { ...n, length: next.step - n.step } : n;
  });
  return { ...song, measures, notes };
}
