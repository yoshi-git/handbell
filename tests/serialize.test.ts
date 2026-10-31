import { describe, expect, it } from 'vitest';
import { addNote, copySelection, createSong, pasteClip, setAssignment } from '../src/model/song';
import ffx from '../src/samples/to-zanarkand.bellscore.json';
import {
  clipToText,
  decodeFromUrl,
  encodeForUrl,
  parseClip,
  parseSong,
  songFromJson,
  songToJson,
} from '../src/model/serialize';

function sample() {
  let s = createSong('テスト曲');
  s = addNote(s, '4C#', 0, 2);
  s = addNote(s, '5E', 3);
  return setAssignment(s, '4C#', '佐藤');
}

describe('serialize', () => {
  it('round-trips through JSON', () => {
    const s = sample();
    expect(songFromJson(songToJson(s))).toEqual(s);
  });

  it('round-trips through a share URL', () => {
    const s = sample();
    const encoded = encodeForUrl(s);
    expect(encoded).toMatch(/^[A-Za-z0-9+\-$]*$/);
    expect(decodeFromUrl(encoded)).toEqual(s);
  });

  it('rejects invalid data', () => {
    expect(() => songFromJson('not json')).toThrow();
    expect(() => parseSong({ ...sample(), version: 3 })).toThrow();
    expect(() => parseSong({ ...sample(), accidental: 'natural' })).toThrow();
    expect(() => parseSong({ ...sample(), notes: [{ pitch: 'H9', step: 0, length: 1 }] })).toThrow();
    expect(() => decodeFromUrl('garbage')).toThrow();
  });

  it('keeps the flat display setting', () => {
    const s = { ...sample(), accidental: 'flat' as const };
    expect(songFromJson(songToJson(s)).accidental).toBe('flat');
    expect(decodeFromUrl(encodeForUrl(s)).accidental).toBe('flat');
  });

  it('migrates version 1 data (no accidental) to sharps', () => {
    const { accidental: _a, ...v1 } = { ...sample(), version: 1 };
    const s = parseSong(v1);
    expect(s.version).toBe(2);
    expect(s.accidental).toBe('sharp');
  });

  it('normalizes flat spellings on import', () => {
    const s = parseSong({ ...sample(), notes: [{ pitch: '4Db', step: 0, length: 1 }] });
    expect(s.notes[0].pitch).toBe('4C#');
  });

  it('round-trips a copied area through clipboard text', () => {
    const s = sample();
    const clip = copySelection(s, { low: '4C', high: '5E', from: 0, to: 4 });
    expect(clip.notes).toHaveLength(2);
    expect(parseClip(clipToText(clip))).toEqual(clip);
    // Pasting the parsed clip into another song gives the same notes.
    const other = pasteClip(createSong('別の曲'), parseClip(clipToText(clip)), 8);
    expect(other.notes.map((n) => [n.pitch, n.step, n.length])).toEqual([
      ['4C#', 8, 2],
      ['5E', 11, 1],
    ]);
  });

  it('rejects clipboard text that is not a valid copied area', () => {
    const ok = JSON.parse(clipToText(copySelection(sample(), { low: '4C', high: '5E', from: 0, to: 4 })));
    const text = (patch: object) => JSON.stringify({ ...ok, ...patch });
    expect(() => parseClip('ただの文字列')).toThrow();
    expect(() => parseClip(songToJson(sample()))).toThrow(); // a whole song, not an area
    expect(() => parseClip(text({ version: 2 }))).toThrow();
    expect(() => parseClip(text({ low: '5E', high: '4C' }))).toThrow();
    expect(() => parseClip(text({ width: 0 }))).toThrow();
    expect(() => parseClip(text({ notes: [{ pitch: 'H9', step: 0, length: 1 }] }))).toThrow();
    expect(() => parseClip(text({ notes: [{ pitch: '3A', step: 0, length: 1 }] }))).toThrow(); // outside low..high
    expect(() => parseClip(text({ notes: [{ pitch: '4C', step: 4, length: 1 }] }))).toThrow(); // past the width
    expect(() => parseClip(text({ notes: [{ pitch: '4C', step: 0, length: 0 }] }))).toThrow();
    expect(() => parseClip(text({ notes: [null] }))).toThrow();
    expect(parseClip(text({ notes: [{ pitch: '4Db', step: 1, length: 2 }] })).notes).toEqual([
      { pitch: '4C#', step: 1, length: 2 },
    ]);
  });

  it('loads the bundled sample song', () => {
    const s = parseSong(ffx);
    expect(s.range).toEqual({ low: '3A', high: '5E' });
    expect(s.notes.length).toBeGreaterThan(0);
  });

  it('loads every bundled sample song', () => {
    const files = import.meta.glob('../src/samples/*.bellscore.json', { eager: true, import: 'default' });
    const ids = Object.values(files).map((data) => parseSong(data).id);
    expect(ids.length).toBeGreaterThanOrEqual(2);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
