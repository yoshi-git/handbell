import { notesInRange, toMidi } from './pitch';
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
