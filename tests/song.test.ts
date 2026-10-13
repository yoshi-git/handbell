import { describe, expect, it } from 'vitest';
import {
  addNote,
  createSong,
  hiddenNoteCount,
  noteAt,
  players,
  rows,
  setAssignment,
  setNoteLength,
  setSubdivisions,
} from '../src/model/song';

describe('song', () => {
  it('creates a song with the default 3A–5E range', () => {
    const s = createSong();
    expect(s.range).toEqual({ low: '3A', high: '5E' });
    expect(rows(s)).toHaveLength(20);
  });

  it('adds notes without overlapping the next note on the same bell', () => {
    let s = createSong();
    s = addNote(s, '4C', 4);
    s = addNote(s, '4C', 0, 8);
    expect(noteAt(s, '4C', 0)!.length).toBe(4);
    // Adding on an occupied step is a no-op.
    expect(addNote(s, '4C', 2)).toBe(s);
  });

  it('clamps note length to the next note and the song end', () => {
    let s = createSong();
    s = addNote(s, '4C', 0);
    s = addNote(s, '4C', 3);
    s = setNoteLength(s, noteAt(s, '4C', 0)!, 10);
    expect(noteAt(s, '4C', 0)!.length).toBe(3);
    s = setNoteLength(s, noteAt(s, '4C', 3)!, 1000);
    expect(noteAt(s, '4C', 3)!.length).toBe(64 - 3);
  });

  it('rescales notes when the subdivision changes', () => {
    let s = addNote(createSong(), '4C', 2, 2); // beat 2 in eighths
    s = setSubdivisions(s, 4);
    expect(s.notes[0]).toEqual({ pitch: '4C', step: 4, length: 4 });
  });

  it('lists players in row order and removes empty names', () => {
    let s = createSong();
    s = setAssignment(s, '3A', '鈴木');
    s = setAssignment(s, '5E', '田中');
    s = setAssignment(s, '5D', '田中');
    expect(players(s)).toEqual(['田中', '鈴木']);
    s = setAssignment(s, '3A', ' ');
    expect(players(s)).toEqual(['田中']);
  });

  it('counts notes hidden by a narrowed range', () => {
    let s = addNote(createSong(), '3A', 0);
    s = { ...s, range: { low: '4C', high: '5E' } };
    expect(hiddenNoteCount(s)).toBe(1);
  });
});
