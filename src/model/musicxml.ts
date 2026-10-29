import { fromMidi, toMidi } from './pitch';
import { parseSong } from './serialize';
import { DEFAULT_RANGE, hiddenNoteCount, inRange, newId, stepsPerMeasure, totalSteps } from './song';
import type { Accidental, Note, Song } from './types';
import { child, childText, children, escapeXml, parseXml, type XmlElement } from './xml';

/*
 * MusicXML export/import.
 *
 * Export writes a single "Handbells" part on a grand staff (4C and above on the treble
 * staff). A note's ringing length becomes its written duration; notes that cross a
 * barline or can't be written as one note are split and tied. Overlapping notes go into
 * separate voices. Range and player assignments are kept in <miscellaneous> so a file
 * exported here comes back unchanged.
 *
 * Import reads score-partwise files from notation software, merging all parts into one
 * song. Tied notes are joined, grace notes are skipped.
 */

const MISC_PREFIX = 'bellscore-';
const TREBLE_MIN_MIDI = 60; // 4C
/** Notes the range selector can show (1C .. 7C). */
const MIN_MIDI = 24;
const MAX_MIDI = 96;

// ---------------------------------------------------------------------------
// Export

interface Piece {
  steps: number;
  type: string;
  dots: number;
  /** Written as a triplet (3 in the time of 2). */
  triplet: boolean;
}

const NOTE_TYPES: [string, number][] = [
  ['whole', 4],
  ['half', 2],
  ['quarter', 1],
  ['eighth', 0.5],
  ['16th', 0.25],
  ['32nd', 0.125],
];

/**
 * Splits a duration (in steps) into notes that can each be written with one symbol.
 * On grids that divide the beat by 3 (3, 6, 12), durations plain notes can't add up to
 * are written with triplets.
 */
export function splitDuration(steps: number, subdivisions: number): Piece[] {
  const plain: Piece[] = [];
  for (const [type, quarters] of NOTE_TYPES) {
    for (const dots of [1, 0]) {
      const s = quarters * subdivisions * (dots ? 1.5 : 1);
      if (Number.isInteger(s)) plain.push({ steps: s, type, dots, triplet: false });
    }
  }
  const triplets: Piece[] = [];
  if (subdivisions % 3 === 0) {
    for (const [type, quarters] of NOTE_TYPES.slice(2)) {
      const s = (quarters * subdivisions * 2) / 3;
      if (Number.isInteger(s)) triplets.push({ steps: s, type, dots: 0, triplet: true });
    }
  }
  const unit = Math.min(...plain.map((p) => p.steps));
  const candidates = (steps % unit === 0 ? plain : [...plain, ...triplets]).sort((a, b) => b.steps - a.steps);
  const out: Piece[] = [];
  let rest = steps;
  while (rest > 0) {
    const p = candidates.find((c) => c.steps <= rest);
    if (!p) throw new Error(`長さ ${rest} を音符にできません`);
    out.push(p);
    rest -= p.steps;
  }
  return out;
}

interface Chord {
  step: number;
  length: number;
  pitches: number[];
}

/** One voice as a sequence of chords that don't overlap. */
type Voice = Chord[];

function voicesFor(notes: Note[]): Voice[] {
  const byKey = new Map<string, Chord>();
  for (const n of notes) {
    const key = `${n.step}/${n.length}`;
    const c = byKey.get(key) ?? { step: n.step, length: n.length, pitches: [] };
    c.pitches.push(toMidi(n.pitch));
    byKey.set(key, c);
  }
  const chords = [...byKey.values()].sort((a, b) => a.step - b.step || b.length - a.length);
  const voices: Voice[] = [];
  for (const c of chords) {
    c.pitches.sort((a, b) => a - b);
    const v = voices.find((v) => {
      const last = v[v.length - 1];
      return last.step + last.length <= c.step;
    });
    if (v) v.push(c);
    else voices.push([c]);
  }
  return voices.length ? voices : [[]];
}

function pitchXml(midi: number, accidental: Accidental): string {
  const name = fromMidi(midi); // e.g. "4C#"
  if (!name.endsWith('#')) return `<pitch><step>${name[1]}</step><octave>${name[0]}</octave></pitch>`;
  // A black key is never next to an octave boundary, so the flat spelling keeps the octave.
  if (accidental === 'flat') return `<pitch><step>${fromMidi(midi + 1)[1]}</step><alter>-1</alter><octave>${name[0]}</octave></pitch>`;
  return `<pitch><step>${name[1]}</step><alter>1</alter><octave>${name[0]}</octave></pitch>`;
}

function pieceXml(p: Piece): string {
  let s = `<type>${p.type}</type>` + '<dot/>'.repeat(p.dots);
  if (p.triplet) s += '<time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification>';
  return s;
}

/** Writes one voice's notes and rests for the measure [start, end). */
function voiceMeasureXml(voice: Voice, start: number, end: number, voiceNo: number, staff: number, primary: boolean, sub: number, accidental: Accidental): string {
  const out: string[] = [];
  const rest = (steps: number) => {
    if (primary && steps === end - start) {
      out.push(`<note><rest measure="yes"/><duration>${steps}</duration><voice>${voiceNo}</voice><staff>${staff}</staff></note>`);
      return;
    }
    const hide = primary ? '' : ' print-object="no"';
    for (const p of splitDuration(steps, sub)) {
      out.push(`<note${hide}><rest/><duration>${p.steps}</duration><voice>${voiceNo}</voice>${pieceXml(p)}<staff>${staff}</staff></note>`);
    }
  };
  let pos = start;
  for (const c of voice) {
    const cEnd = c.step + c.length;
    if (cEnd <= start || c.step >= end) continue;
    const from = Math.max(c.step, start);
    const to = Math.min(cEnd, end);
    if (from > pos) rest(from - pos);
    const pieces = splitDuration(to - from, sub);
    pieces.forEach((p, i) => {
      const tieStop = from + pieces.slice(0, i).reduce((s, q) => s + q.steps, 0) > c.step;
      const tieStart = i < pieces.length - 1 || to < cEnd;
      c.pitches.forEach((m, j) => {
        const ties = (tieStop ? '<tie type="stop"/>' : '') + (tieStart ? '<tie type="start"/>' : '');
        const tied = (tieStop ? '<tied type="stop"/>' : '') + (tieStart ? '<tied type="start"/>' : '');
        out.push(
          `<note>${j ? '<chord/>' : ''}${pitchXml(m, accidental)}<duration>${p.steps}</duration>${ties}<voice>${voiceNo}</voice>` +
            `${pieceXml(p)}<staff>${staff}</staff>${tied ? `<notations>${tied}</notations>` : ''}</note>`,
        );
      });
    });
    pos = to;
  }
  if (pos < end) rest(end - pos);
  return out.join('\n');
}

export function songToMusicXml(song: Song): string {
  const sub = song.subdivisions;
  const spm = stepsPerMeasure(song);
  const end = totalSteps(song);
  // Export what the editor shows: notes inside the range and the song's length.
  const notes = song.notes
    .filter((n) => inRange(song, n.pitch) && n.step < end)
    .map((n) => ({ ...n, length: Math.min(n.length, end - n.step) }));
  const staves = [
    voicesFor(notes.filter((n) => toMidi(n.pitch) >= TREBLE_MIN_MIDI)),
    voicesFor(notes.filter((n) => toMidi(n.pitch) < TREBLE_MIN_MIDI)),
  ];

  const misc = [
    [`${MISC_PREFIX}range-low`, song.range.low],
    [`${MISC_PREFIX}range-high`, song.range.high],
    [`${MISC_PREFIX}subdivisions`, String(song.subdivisions)],
    [`${MISC_PREFIX}accidental`, song.accidental],
    ...Object.entries(song.assignments).map(([pitch, player]) => [`${MISC_PREFIX}player-${pitch}`, player]),
  ]
    .map(([k, v]) => `<miscellaneous-field name="${escapeXml(k)}">${escapeXml(v)}</miscellaneous-field>`)
    .join('\n');

  const measures: string[] = [];
  for (let m = 0; m < song.measures; m++) {
    const start = m * spm;
    const body: string[] = [];
    if (m === 0) {
      body.push(
        `<attributes><divisions>${sub}</divisions><key><fifths>0</fifths></key>` +
          `<time><beats>${song.beatsPerMeasure}</beats><beat-type>4</beat-type></time><staves>2</staves>` +
          '<clef number="1"><sign>G</sign><line>2</line></clef><clef number="2"><sign>F</sign><line>4</line></clef></attributes>',
        `<direction placement="above"><direction-type><metronome><beat-unit>quarter</beat-unit>` +
          `<per-minute>${song.tempo}</per-minute></metronome></direction-type><staff>1</staff><sound tempo="${song.tempo}"/></direction>`,
      );
    }
    const parts: string[] = [];
    staves.forEach((voices, s) => {
      voices.forEach((voice, v) => {
        const primary = v === 0;
        if (!primary && !voice.some((c) => c.step < start + spm && c.step + c.length > start)) return;
        parts.push(voiceMeasureXml(voice, start, start + spm, s * 4 + v + 1, s + 1, primary, sub, song.accidental));
      });
    });
    body.push(parts.join(`\n<backup><duration>${spm}</duration></backup>\n`));
    if (m === song.measures - 1) body.push('<barline location="right"><bar-style>light-heavy</bar-style></barline>');
    measures.push(`<measure number="${m + 1}">\n${body.join('\n')}\n</measure>`);
  }

  return `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="4.0">
<work><work-title>${escapeXml(song.title)}</work-title></work>
<identification>
<encoding><software>bell_score</software></encoding>
<miscellaneous>
${misc}
</miscellaneous>
</identification>
<part-list><score-part id="P1"><part-name>Handbells</part-name></score-part></part-list>
<part id="P1">
${measures.join('\n')}
</part>
</score-partwise>
`;
}

// ---------------------------------------------------------------------------
// Import

export interface MusicXmlImport {
  song: Song;
  /** Things that couldn't be carried over exactly, for showing to the user. */
  warnings: string[];
}

interface RawNote {
  midi: number;
  /** In quarter notes. */
  start: number;
  dur: number;
}

const STEP_PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const BEAT_UNIT_QUARTERS: Record<string, number> = { whole: 4, half: 2, quarter: 1, eighth: 0.5, '16th': 0.25 };
const EPS = 1e-6;

function num(el: XmlElement | undefined, name: string): number | undefined {
  const t = childText(el, name);
  const n = t === undefined ? NaN : Number(t);
  return Number.isFinite(n) ? n : undefined;
}

function isNearInt(x: number): boolean {
  return Math.abs(x - Math.round(x)) < EPS;
}

function fail(msg: string): never {
  throw new Error(`MusicXML を読み込めません: ${msg}`);
}

/**
 * The order measures are played in, with repeats and 1st/2nd endings expanded.
 * Repeat signs nest only one level, as in most scores.
 */
export function playOrder(measures: XmlElement[]): number[] {
  const barlines = measures.map((m) => children(m, 'barline'));
  const endingNumbers = (i: number): number[] | undefined => {
    for (const b of barlines[i]) {
      const e = child(b, 'ending');
      if (e && e.attrs.type === 'start') {
        return (e.attrs.number ?? '').split(/[,\s]+/).map(Number).filter((n) => n > 0);
      }
    }
    return undefined;
  };
  const order: number[] = [];
  let start = 0;
  let pass = 1;
  let ending: number[] | undefined;
  for (let i = 0; i < measures.length; i++) {
    if (barlines[i].some((b) => child(b, 'repeat')?.attrs.direction === 'forward') && i !== start) {
      start = i;
      pass = 1;
    }
    ending = endingNumbers(i) ?? ending;
    const skip = ending !== undefined && !ending.includes(pass);
    if (!skip) order.push(i);
    if (barlines[i].some((b) => child(b, 'ending')?.attrs.type?.match(/stop|discontinue/))) ending = undefined;
    const back = barlines[i].map((b) => child(b, 'repeat')).find((r) => r?.attrs.direction === 'backward');
    const times = Number(back?.attrs.times) || 2;
    if (back && !skip && pass < times && order.length < 10000) {
      pass++;
      ending = undefined;
      i = start - 1;
    } else if (back && !skip) {
      start = i + 1;
      pass = 1;
    }
  }
  return order;
}

export function songFromMusicXml(text: string): MusicXmlImport {
  const doc = parseXml(text);
  if (child(doc, 'score-timewise')) fail('score-timewise 形式には対応していません');
  const score = child(doc, 'score-partwise');
  if (!score) fail('MusicXML (score-partwise) ではありません');
  const warnings: string[] = [];

  const misc = new Map<string, string>();
  for (const f of children(child(child(score, 'identification'), 'miscellaneous'), 'miscellaneous-field')) {
    if (f.attrs.name?.startsWith(MISC_PREFIX)) misc.set(f.attrs.name.slice(MISC_PREFIX.length), f.text.trim());
  }

  let time: { beats: number; beatType: number } | undefined;
  let fifths: number | undefined;
  let tempo: number | undefined;
  const raw: RawNote[] = [];
  let firstMeasureLen: number | undefined;
  let totalLen = 0;
  let skippedGrace = 0;

  for (const part of children(score, 'part')) {
    let divisions = 1;
    let chromatic = 0;
    let measureStart = 0; // quarters
    // Notes waiting for a tie to continue them; one pitch can have several in different voices.
    const open = new Map<number, RawNote[]>();
    const measures = children(part, 'measure');
    playOrder(measures).forEach((index, mi) => {
      const measure = measures[index];
      let cursor = 0; // divisions from the measure start
      let maxCursor = 0;
      let lastStart = 0;
      const q = (d: number) => measureStart + d / divisions;
      for (const el of measure.children) {
        if (el.name === 'attributes') {
          divisions = num(el, 'divisions') ?? divisions;
          const t = child(el, 'time');
          const beats = childText(t, 'beats');
          const beatType = num(t, 'beat-type');
          if (!time && beats && beatType) {
            const total = beats.split('+').reduce((s, b) => s + Number(b), 0);
            if (total > 0) time = { beats: total, beatType };
          }
          fifths ??= num(child(el, 'key'), 'fifths');
          const tr = child(el, 'transpose');
          if (tr) chromatic = num(tr, 'chromatic') ?? 0;
        } else if (el.name === 'backup') {
          cursor -= num(el, 'duration') ?? 0;
        } else if (el.name === 'forward') {
          cursor += num(el, 'duration') ?? 0;
          maxCursor = Math.max(maxCursor, cursor);
        } else if (el.name === 'direction' || el.name === 'sound') {
          const sound = el.name === 'sound' ? el : child(el, 'sound');
          if (tempo === undefined && sound?.attrs.tempo) tempo = Number(sound.attrs.tempo);
          const metro = child(child(el, 'direction-type'), 'metronome');
          const perMinute = num(metro, 'per-minute');
          const unit = BEAT_UNIT_QUARTERS[childText(metro, 'beat-unit') ?? ''];
          if (tempo === undefined && perMinute && unit) {
            tempo = perMinute * unit * (child(metro, 'beat-unit-dot') ? 1.5 : 1);
          }
        } else if (el.name === 'note') {
          if (child(el, 'grace')) {
            skippedGrace++;
            continue;
          }
          const dur = num(el, 'duration') ?? 0;
          let start = cursor;
          if (child(el, 'chord')) start = lastStart;
          else {
            lastStart = cursor;
            cursor += dur;
            maxCursor = Math.max(maxCursor, cursor);
          }
          const p = child(el, 'pitch');
          if (!p || child(el, 'cue')) continue;
          const pc = STEP_PC[childText(p, 'step') ?? ''];
          const octave = num(p, 'octave');
          if (pc === undefined || octave === undefined) continue;
          const midi = (octave + 1) * 12 + pc + Math.round(num(p, 'alter') ?? 0) + chromatic;
          const ties = children(el, 'tie').map((t) => t.attrs.type);
          const pending = open.get(midi) ?? [];
          const prev = ties.includes('stop')
            ? pending.find((p) => Math.abs(p.start + p.dur - q(start)) < EPS)
            : undefined;
          let note: RawNote;
          if (prev) {
            prev.dur += dur / divisions;
            note = prev;
          } else {
            note = { midi, start: q(start), dur: dur / divisions };
            raw.push(note);
          }
          // Only the note that ends a tie closes it: the same pitch in another voice must not.
          const rest = pending.filter((p) => p !== prev);
          if (ties.includes('start')) rest.push(note);
          open.set(midi, rest);
        }
      }
      const len = maxCursor / divisions;
      if (mi === 0 && firstMeasureLen === undefined) firstMeasureLen = len;
      measureStart += len;
    });
    totalLen = Math.max(totalLen, measureStart);
  }

  // Time signature: the song counts in quarter-note beats.
  const ts = time ?? { beats: 4, beatType: 4 };
  const measureQuarters = (ts.beats * 4) / ts.beatType;
  const beatsPerMeasure = Math.max(1, Math.round(measureQuarters));
  if (ts.beatType !== 4) {
    warnings.push(`${ts.beats}/${ts.beatType}拍子を${beatsPerMeasure}/4拍子として読み込みました。`);
  }

  // A pickup (anacrusis) is shifted so it ends at the first barline.
  const shift = firstMeasureLen !== undefined && firstMeasureLen > EPS && firstMeasureLen < beatsPerMeasure - EPS
    ? beatsPerMeasure - firstMeasureLen
    : 0;

  const inSet = raw.filter((n) => n.midi >= MIN_MIDI && n.midi <= MAX_MIDI && n.dur > EPS);
  const dropped = raw.length - inSet.length;
  if (dropped) warnings.push(`扱えない音域・長さの音符 ${dropped} 個を除きました（対応音域は 1C〜7C）。`);
  if (skippedGrace) warnings.push(`装飾音符 ${skippedGrace} 個を除きました。`);

  // Grid: the one saved by this app if it fits, else the coarsest that fits.
  const fits = (s: number) => inSet.every((n) => isNearInt((n.start + shift) * s) && isNearInt(n.dur * s));
  const saved = Number(misc.get('subdivisions'));
  // If none fits, take the grid that keeps the onsets closest (the coarser one on a tie).
  const error = (s: number) => Math.max(0, ...inSet.map((n) => Math.abs((n.start + shift) * s - Math.round((n.start + shift) * s)) / s));
  const sub = [saved, 2, 4, 3, 6, 12].find((s) => [1, 2, 3, 4, 6, 12].includes(s) && fits(s))
    ?? [4, 6, 12].reduce((best, s) => (error(s) < error(best) - EPS ? s : best));
  if (!fits(sub)) {
    warnings.push('16分音符より細かいリズムがあるため、一部の音符の位置・長さを丸めました。');
  }

  // Quantize, then make sure notes on the same bell don't overlap.
  const quantized: Note[] = inSet
    .map((n) => ({
      pitch: fromMidi(n.midi),
      step: Math.round((n.start + shift) * sub),
      length: Math.max(1, Math.round(n.dur * sub)),
    }))
    .sort((a, b) => a.pitch.localeCompare(b.pitch) || a.step - b.step || b.length - a.length);
  const notes: Note[] = [];
  for (const n of quantized) {
    const prev = notes[notes.length - 1];
    if (prev && prev.pitch === n.pitch) {
      if (prev.step === n.step) continue; // doubled in another part
      if (prev.step + prev.length > n.step) prev.length = n.step - prev.step;
    }
    notes.push({ ...n });
  }

  let low = misc.get('range-low') ?? DEFAULT_RANGE.low;
  let high = misc.get('range-high') ?? DEFAULT_RANGE.high;
  if (!misc.has('range-low') || !misc.has('range-high')) {
    const midis = notes.map((n) => toMidi(n.pitch));
    if (midis.length) {
      low = fromMidi(Math.min(toMidi(low), ...midis));
      high = fromMidi(Math.max(toMidi(high), ...midis));
    }
  }

  const assignments: Record<string, string> = {};
  for (const [k, v] of misc) if (k.startsWith('player-')) assignments[k.slice('player-'.length)] = v;

  const spm = beatsPerMeasure * sub;
  const end = Math.max(Math.round((totalLen + shift) * sub), ...notes.map((n) => n.step + n.length));
  const work = childText(child(score, 'work'), 'work-title');
  const song = parseSong({
    version: 2,
    id: newId(),
    title: work || childText(score, 'movement-title') || '無題',
    tempo: Math.min(300, Math.max(20, Math.round(tempo ?? 100))),
    beatsPerMeasure,
    subdivisions: sub,
    measures: Math.max(1, Math.ceil(end / spm)),
    range: { low, high },
    // Saved by this app, else follow the key signature (flat keys read better with ♭).
    accidental: misc.get('accidental') === 'flat' || (!misc.has('accidental') && (fifths ?? 0) < 0) ? 'flat' : 'sharp',
    assignments,
    notes: notes.sort((a, b) => a.step - b.step || toMidi(b.pitch) - toMidi(a.pitch)),
  });
  const hidden = hiddenNoteCount(song);
  if (hidden) warnings.push(`音域外の音符が ${hidden} 個あります。`);
  return { song, warnings };
}
