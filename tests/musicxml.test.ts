import { describe, expect, it } from 'vitest';
import { songFromMusicXml, songToMusicXml, splitDuration } from '../src/model/musicxml';
import { parseSong } from '../src/model/serialize';
import { addNote, createSong, setAssignment } from '../src/model/song';
import { parseXml } from '../src/model/xml';
import { readMxl } from '../src/util/zip';
import ahnw from '../src/samples/ahnw.bellscore.json';
import arranged from '../src/samples/ahnw-arranged.bellscore.json';
import twinkle from '../src/samples/twinkle.bellscore.json';

async function deflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function sample() {
  let s = createSong('テスト <曲> & "引用"');
  s = { ...s, measures: 2, tempo: 120 };
  s = addNote(s, '4C', 0, 2);
  s = addNote(s, '4E', 0, 2);
  s = addNote(s, '3A', 0, 16); // spans both measures -> tied
  s = addNote(s, '4G', 1, 5); // overlaps the chord -> second voice, 5 steps -> tied pieces
  s = addNote(s, '5D#', 7, 1);
  return setAssignment(s, '4C', '佐藤');
}

function comparable(s: ReturnType<typeof sample>) {
  // Note order within a step doesn't matter.
  const { id: _id, notes, ...rest } = s;
  return { ...rest, notes: [...notes].sort((a, b) => a.step - b.step || a.pitch.localeCompare(b.pitch)) };
}

describe('musicxml', () => {
  it('splits durations into writable notes', () => {
    expect(splitDuration(5, 2).map((p) => [p.type, p.dots])).toEqual([
      ['half', 0],
      ['eighth', 0],
    ]);
    expect(splitDuration(3, 2).map((p) => [p.type, p.dots])).toEqual([['quarter', 1]]);
    expect(splitDuration(4, 3).map((p) => [p.type, p.triplet])).toEqual([
      ['quarter', false],
      ['eighth', true],
    ]);
  });

  it('writes well-formed MusicXML', () => {
    const xml = songToMusicXml(sample());
    const doc = parseXml(xml);
    expect(doc.children[0].name).toBe('score-partwise');
    expect(xml).toContain('<work-title>テスト &lt;曲&gt; &amp; &quot;引用&quot;</work-title>');
    expect(xml).toContain('<tie type="start"/>');
  });

  it('round-trips through MusicXML', () => {
    for (const s of [sample(), parseSong(twinkle), parseSong(ahnw), parseSong(arranged)]) {
      const { song, warnings } = songFromMusicXml(songToMusicXml(s));
      expect(warnings).toEqual([]);
      expect(comparable(song)).toEqual(comparable(s));
    }
  });

  it('round-trips triplets', () => {
    let s = { ...createSong('三連'), subdivisions: 3, measures: 1 };
    s = addNote(s, '4C', 0, 1);
    s = addNote(s, '4D', 1, 4);
    s = addNote(s, '4E', 5, 7);
    expect(comparable(songFromMusicXml(songToMusicXml(s)).song)).toEqual(comparable(s));
  });

  it('reads files from notation software', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="4.0">
  <movement-title>Pickup</movement-title>
  <part-list><score-part id="P1"/><score-part id="P2"/></part-list>
  <part id="P1">
    <measure number="0" implicit="yes">
      <attributes><divisions>4</divisions><time><beats>3</beats><beat-type>4</beat-type></time></attributes>
      <direction><direction-type><metronome><beat-unit>half</beat-unit><per-minute>40</per-minute></metronome></direction-type></direction>
      <note><pitch><step>B</step><alter>-1</alter><octave>4</octave></pitch><duration>4</duration></note>
    </measure>
    <measure number="1">
      <note><grace/><pitch><step>D</step><octave>5</octave></pitch></note>
      <note><pitch><step>C</step><octave>5</octave></pitch><duration>8</duration><tie type="start"/></note>
      <note><chord/><pitch><step>E</step><octave>4</octave></pitch><duration>8</duration></note>
      <note><pitch><step>C</step><octave>5</octave></pitch><duration>2</duration><tie type="stop"/></note>
      <note><rest/><duration>2</duration></note>
    </measure>
  </part>
  <part id="P2">
    <measure number="0"><attributes><divisions>1</divisions></attributes><note><rest/><duration>1</duration></note></measure>
    <measure number="1">
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration></note>
      <note><pitch><step>C</step><octave>3</octave></pitch><duration>2</duration></note>
    </measure>
  </part>
</score-partwise>`;
    const { song, warnings } = songFromMusicXml(xml);
    expect(song.title).toBe('Pickup');
    expect(song.tempo).toBe(80);
    expect(song.beatsPerMeasure).toBe(3);
    expect(song.subdivisions).toBe(2);
    expect(song.measures).toBe(2);
    expect(song.range).toEqual({ low: '3C', high: '5E' });
    expect(song.notes).toEqual([
      { pitch: '4A#', step: 4, length: 2 },
      { pitch: '5C', step: 6, length: 5 },
      { pitch: '4E', step: 6, length: 4 }, // doubled in P2 at the same step: one bell
      { pitch: '3C', step: 8, length: 4 },
    ]);
    expect(warnings).toEqual(['装飾音符 1 個を除きました。']);
  });

  it('rejects files that are not MusicXML', () => {
    expect(() => songFromMusicXml('not xml <')).toThrow();
    expect(() => songFromMusicXml('<html></html>')).toThrow();
    expect(() => songFromMusicXml('<score-partwise><part><measure></part></score-partwise>')).toThrow();
  });

  it('reads compressed .mxl files', async () => {
    const files: [string, string][] = [
      ['META-INF/container.xml', '<container><rootfiles><rootfile full-path="score.musicxml"/></rootfiles></container>'],
      ['score.musicxml', songToMusicXml(sample())],
    ];
    const enc = new TextEncoder();
    const chunks: Uint8Array[] = [];
    const central: Uint8Array[] = [];
    let offset = 0;
    for (const [name, text] of files) {
      const nameBytes = enc.encode(name);
      const data = await deflateRaw(enc.encode(text));
      const local = new DataView(new ArrayBuffer(30));
      local.setUint32(0, 0x04034b50, true);
      local.setUint16(8, 8, true);
      local.setUint32(18, data.length, true);
      local.setUint16(26, nameBytes.length, true);
      const cd = new DataView(new ArrayBuffer(46));
      cd.setUint32(0, 0x02014b50, true);
      cd.setUint16(10, 8, true);
      cd.setUint32(20, data.length, true);
      cd.setUint16(28, nameBytes.length, true);
      cd.setUint32(42, offset, true);
      chunks.push(new Uint8Array(local.buffer), nameBytes, data);
      central.push(new Uint8Array(cd.buffer), nameBytes);
      offset += 30 + nameBytes.length + data.length;
    }
    const cdSize = central.reduce((s, c) => s + c.length, 0);
    const eocd = new DataView(new ArrayBuffer(22));
    eocd.setUint32(0, 0x06054b50, true);
    eocd.setUint16(10, files.length, true);
    eocd.setUint32(12, cdSize, true);
    eocd.setUint32(16, offset, true);
    const zip = new Uint8Array(await new Blob([...chunks, ...central, new Uint8Array(eocd.buffer)]).arrayBuffer());
    const xml = await readMxl(zip.buffer);
    expect(comparable(songFromMusicXml(xml).song)).toEqual(comparable(sample()));
  });
});
