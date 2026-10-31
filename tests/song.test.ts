import { describe, expect, it } from 'vitest';
import {
  addNote,
  copySelection,
  createSong,
  deleteSelection,
  deleteMeasures,
  insertMeasures,
  pasteClip,
  hiddenNoteCount,
  noteAt,
  bellsOf,
  playerMemo,
  playerName,
  mutedBells,
  playerStats,
  players,
  rows,
  setAssignment,
  setNoteLength,
  setSubdivisions,
  shiftMeasure,
  strikeCounts,
  transpose,
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

  it('reads the player name left of ":" and keeps the rest as a memo', () => {
    expect(playerName('大泉:右手で2本')).toBe('大泉');
    expect(playerMemo('大泉:右手で2本')).toBe('右手で2本');
    expect(playerName(' 黒部 ： 持ち替え ')).toBe('黒部'); // full-width colon, spaces
    expect(playerMemo(' 黒部 ： 持ち替え ')).toBe('持ち替え');
    expect(playerName('小幡')).toBe('小幡');
    expect(playerMemo('小幡')).toBe('');
    expect(playerMemo('a:b:c')).toBe('b:c');
    expect(playerName(undefined)).toBe('');

    let s = createSong();
    s = setAssignment(s, '5E', '大泉:高い方');
    s = setAssignment(s, '5C', '大泉');
    s = setAssignment(s, '4C', ':メモだけ');
    expect(players(s)).toEqual(['大泉']);
    expect(bellsOf(s, '大泉')).toEqual(['5E', '5C']);
    expect(s.assignments['5E']).toBe('大泉:高い方'); // stored as typed
  });

  it('sums bells and strikes per player, then unassigned played bells', () => {
    let s = createSong();
    s = addNote(s, '5E', 0);
    s = addNote(s, '5E', 4);
    s = addNote(s, '5C', 8);
    s = addNote(s, '4C', 0);
    s = addNote(s, '3A', 2);
    s = addNote(s, '3A', 1000); // past the song's end: not counted
    s = setAssignment(s, '5E', '大泉:高い方');
    s = setAssignment(s, '5C', '大泉');
    s = setAssignment(s, '4D', '黒部'); // held but never struck
    s = setAssignment(s, '3A', '黒部');
    expect(playerStats(s)).toEqual([
      { name: '大泉', bells: ['5E', '5C'], strikes: 3 },
      { name: '黒部', bells: ['4D', '3A'], strikes: 1 },
      { name: '', bells: ['4C'], strikes: 1 },
    ]);
    expect(playerStats(createSong())).toEqual([]);
  });

  it('finds the bells to silence for muted players', () => {
    let s = createSong();
    s = addNote(s, '4C', 0);
    s = setAssignment(s, '5E', '大泉:高い方');
    s = setAssignment(s, '5C', '大泉');
    s = setAssignment(s, '3A', '黒部');
    expect([...mutedBells(s, new Set())]).toEqual([]);
    expect([...mutedBells(s, new Set(['大泉']))]).toEqual(['5E', '5C']);
    // '' stands for bells nobody is assigned to.
    const loose = mutedBells(s, new Set(['']));
    expect(loose.has('4C')).toBe(true);
    expect(loose.has('5E') || loose.has('3A')).toBe(false);
  });

  it('counts notes hidden by a narrowed range', () => {
    let s = addNote(createSong(), '3A', 0);
    s = { ...s, range: { low: '4C', high: '5E' } };
    expect(hiddenNoteCount(s)).toBe(1);
  });

  it('transposes notes and assignments together, keeping the range', () => {
    let s = createSong();
    s = addNote(s, '4C', 0, 2);
    s = addNote(s, '4E', 2);
    s = setAssignment(s, '4C', 'A');
    const up = transpose(s, 1);
    expect(up.notes).toEqual([
      { pitch: '4C#', step: 0, length: 2 },
      { pitch: '4F', step: 2, length: 1 },
    ]);
    expect(up.assignments).toEqual({ '4C#': 'A' });
    expect(up.range).toEqual(s.range);
    expect(transpose(up, -1).notes).toEqual(s.notes);
    expect(transpose(s, 0)).toBe(s);
  });

  it('refuses to transpose notes beyond the selectable notes', () => {
    const s = addNote(createSong(), '6B', 0);
    expect(transpose(s, 2)).toBe(s);
    expect(transpose(s, 1).notes[0].pitch).toBe('7C');
  });

  it('inserts empty measures and shifts later notes', () => {
    let s = createSong(); // 4/4, 8th notes: 8 steps per measure
    s = addNote(s, '4C', 0);
    s = addNote(s, '4D', 8);
    const t = insertMeasures(s, 1);
    expect(t.measures).toBe(9);
    expect(t.notes.map((n) => [n.pitch, n.step])).toEqual([
      ['4C', 0],
      ['4D', 16],
    ]);
  });

  it('deletes a range of measures and pulls later notes forward', () => {
    let s = createSong(); // 8 steps per measure
    s = addNote(s, '4C', 0, 12); // rings into measure 2 -> damped at the cut
    s = addNote(s, '4D', 8); // inside the deleted measures
    s = addNote(s, '4E', 20);
    s = addNote(s, '4F', 24);
    const t = deleteMeasures(s, 1, 2);
    expect(t.measures).toBe(6);
    expect(t.notes.map((n) => [n.pitch, n.step, n.length])).toEqual([
      ['4C', 0, 8],
      ['4F', 8, 1],
    ]);
  });

  it('moves to neighbouring measure starts, clamped to the song', () => {
    const s = createSong(); // 8 measures of 8 steps
    expect(shiftMeasure(s, 0, 1)).toBe(8);
    expect(shiftMeasure(s, 8, -1)).toBe(0);
    expect(shiftMeasure(s, 12, 1)).toBe(16);
    expect(shiftMeasure(s, 12, -1)).toBe(8); // mid-measure: back to its own start first
    expect(shiftMeasure(s, 0, -1)).toBe(0);
    expect(shiftMeasure(s, 56, 1)).toBe(56); // last measure
    expect(shiftMeasure(s, 200, -1)).toBe(56); // beyond the end (e.g. after deleting measures)
  });

  it('keeps at least one measure when deleting', () => {
    const s = addNote(createSong(), '4C', 60);
    const t = deleteMeasures(s, 0, 99);
    expect(t.measures).toBe(1);
    expect(t.notes).toEqual([{ pitch: '4C', step: 4, length: 1 }]);
    expect(deleteMeasures(t, 0, 1)).toBe(t);
  });

  it('copies an area and pastes it at another step, keeping pitches', () => {
    let s = createSong();
    s = addNote(s, '4C', 0, 2);
    s = addNote(s, '4E', 2);
    s = addNote(s, '5C', 0); // outside the copied rows
    const clip = copySelection(s, { low: '4C', high: '4E', from: 0, to: 8 });
    expect(clip.notes).toHaveLength(2);
    const t = pasteClip(s, clip, 8);
    expect(noteAt(t, '4C', 8)).toEqual({ pitch: '4C', step: 8, length: 2 });
    expect(noteAt(t, '4E', 10)).toEqual({ pitch: '4E', step: 10, length: 1 });
    expect(noteAt(t, '5C', 8)).toBeUndefined();
  });

  it('pastes over existing notes and extends the song when needed', () => {
    let s = createSong();
    s = addNote(s, '4C', 0, 2);
    s = addNote(s, '4D', 60, 4); // rings into the paste target
    s = addNote(s, '4C', 64); // replaced by the paste
    const clip = copySelection(s, { low: '4C', high: '4D', from: 0, to: 8 });
    const t = pasteClip(s, clip, 62);
    expect(t.measures).toBe(9);
    expect(noteAt(t, '4D', 60)!.length).toBe(2);
    expect(t.notes.filter((n) => n.pitch === '4C').map((n) => n.step)).toEqual([0, 62]);
  });

  it('rescales a clip copied with different subdivisions', () => {
    let s = createSong();
    s = addNote(s, '4C', 2, 2);
    const clip = copySelection(s, { low: '4C', high: '4C', from: 0, to: 8 });
    const t = pasteClip(setSubdivisions(createSong(), 4), clip, 16);
    expect(t.notes).toEqual([{ pitch: '4C', step: 20, length: 4 }]);
  });

  it('deletes notes starting inside a selection', () => {
    let s = createSong();
    s = addNote(s, '4C', 0);
    s = addNote(s, '4C', 4);
    s = addNote(s, '4D', 4);
    const t = deleteSelection(s, { low: '4C', high: '4C', from: 2, to: 8 });
    expect(t.notes.map((n) => [n.pitch, n.step])).toEqual([
      ['4C', 0],
      ['4D', 4],
    ]);
  });

  it('counts strikes per bell within the song length', () => {
    let s = { ...createSong(), measures: 1 }; // 8 steps
    s = addNote(s, '4C', 0);
    s = addNote(s, '4C', 4);
    s = addNote(s, '4D', 2, 4);
    s = { ...s, notes: [...s.notes, { pitch: '4E', step: 8, length: 1 }] }; // past the last measure
    expect(Object.fromEntries(strikeCounts(s))).toEqual({ '4C': 2, '4D': 1 });
  });
});
