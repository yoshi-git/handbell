import { describe, expect, it } from 'vitest';
import { addNote, createSong, setAssignment } from '../src/model/song';
import twinkle from '../src/samples/twinkle.bellscore.json';
import { decodeFromUrl, encodeForUrl, parseSong, songFromJson, songToJson } from '../src/model/serialize';

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
    expect(() => parseSong({ version: 2 })).toThrow();
    expect(() => parseSong({ ...sample(), notes: [{ pitch: 'H9', step: 0, length: 1 }] })).toThrow();
    expect(() => decodeFromUrl('garbage')).toThrow();
  });

  it('normalizes flat spellings on import', () => {
    const s = parseSong({ ...sample(), notes: [{ pitch: '4Db', step: 0, length: 1 }] });
    expect(s.notes[0].pitch).toBe('4C#');
  });

  it('loads the bundled sample song', () => {
    const s = parseSong(twinkle);
    expect(s.range).toEqual({ low: '3A', high: '5E' });
    expect(s.notes.length).toBeGreaterThan(0);
  });
});
