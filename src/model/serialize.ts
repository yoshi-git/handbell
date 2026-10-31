import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string';
import { isValidNote, normalize, toMidi } from './pitch';
import type { Clip } from './song';
import type { Song } from './types';

function fail(msg: string): never {
  throw new Error(`譜面データを読み込めません: ${msg}`);
}

function posInt(v: unknown, field: string, min = 1): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < min) fail(`${field} が不正です`);
  return v;
}

/** Validates untrusted data (file import / shared URL) and returns a clean Song. */
export function parseSong(data: unknown): Song {
  if (!data || typeof data !== 'object') fail('オブジェクトではありません');
  const d = data as Record<string, unknown>;
  // version 1 had no `accidental`; it always displayed sharps.
  if (d.version !== 1 && d.version !== 2) fail('未対応のバージョンです');
  if (d.accidental !== undefined && d.accidental !== 'sharp' && d.accidental !== 'flat') fail('accidental が不正です');
  const range = d.range as Record<string, unknown> | undefined;
  if (!range || !isValidNote(String(range.low)) || !isValidNote(String(range.high))) fail('音域が不正です');
  const assignments: Record<string, string> = {};
  if (d.assignments && typeof d.assignments === 'object') {
    for (const [k, v] of Object.entries(d.assignments as Record<string, unknown>)) {
      if (isValidNote(k) && typeof v === 'string' && v.trim()) assignments[normalize(k)] = v;
    }
  }
  if (!Array.isArray(d.notes)) fail('notes がありません');
  const notes = d.notes.map((n, i) => {
    const note = n as Record<string, unknown>;
    if (!isValidNote(String(note.pitch))) fail(`${i}番目の音符の音名が不正です`);
    return {
      pitch: normalize(String(note.pitch)),
      step: posInt(note.step, 'step', 0),
      length: posInt(note.length, 'length'),
    };
  });
  return {
    version: 2,
    id: typeof d.id === 'string' && d.id ? d.id : Math.random().toString(36).slice(2),
    title: typeof d.title === 'string' ? d.title : '無題',
    tempo: posInt(d.tempo, 'tempo'),
    beatsPerMeasure: posInt(d.beatsPerMeasure, 'beatsPerMeasure'),
    subdivisions: posInt(d.subdivisions, 'subdivisions'),
    measures: posInt(d.measures, 'measures'),
    range: { low: normalize(String(range.low)), high: normalize(String(range.high)) },
    accidental: d.accidental === 'flat' ? 'flat' : 'sharp',
    assignments,
    notes,
  };
}

export function songToJson(song: Song): string {
  return JSON.stringify(song, null, 2);
}

export function songFromJson(text: string): Song {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    fail('JSON として解釈できません');
  }
  return parseSong(data);
}

export function encodeForUrl(song: Song): string {
  return compressToEncodedURIComponent(JSON.stringify(song));
}

export function decodeFromUrl(encoded: string): Song {
  const text = decompressFromEncodedURIComponent(encoded);
  if (!text) fail('共有URLが壊れています');
  return songFromJson(text);
}

// ---- copied areas on the system clipboard ----

const CLIP_TYPE = 'bellscore-clip';

/** Text put on the system clipboard so an area can be pasted into another tab or score. */
export function clipToText(clip: Clip): string {
  return JSON.stringify({
    type: CLIP_TYPE,
    version: 1,
    low: clip.low,
    high: clip.high,
    width: clip.width,
    subdivisions: clip.subdivisions,
    notes: clip.notes.map(({ pitch, step, length }) => ({ pitch, step, length })),
  });
}

function clipFail(msg: string): never {
  throw new Error(`クリップボードの内容を貼り付けられません: ${msg}`);
}

function intAtLeast(v: unknown, min: number): number | null {
  return typeof v === 'number' && Number.isInteger(v) && v >= min ? v : null;
}

/** Validates clipboard text (which may be anything) and returns a clean Clip. */
export function parseClip(text: string): Clip {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    clipFail('譜面の範囲ではありません');
  }
  if (!data || typeof data !== 'object') clipFail('譜面の範囲ではありません');
  const d = data as Record<string, unknown>;
  if (d.type !== CLIP_TYPE) clipFail('譜面の範囲ではありません');
  if (d.version !== 1) clipFail('未対応のバージョンです');
  if (!isValidNote(String(d.low)) || !isValidNote(String(d.high))) clipFail('音域が不正です');
  const low = normalize(String(d.low));
  const high = normalize(String(d.high));
  if (toMidi(low) > toMidi(high)) clipFail('音域が不正です');
  const width = intAtLeast(d.width, 1) ?? clipFail('長さが不正です');
  const subdivisions = intAtLeast(d.subdivisions, 1) ?? clipFail('長さが不正です');
  if (!Array.isArray(d.notes)) clipFail('音符がありません');
  const notes = d.notes.map((n: unknown) => {
    const note = (n && typeof n === 'object' ? n : {}) as Record<string, unknown>;
    if (!isValidNote(String(note.pitch))) clipFail('音名が不正です');
    const pitch = normalize(String(note.pitch));
    if (toMidi(pitch) < toMidi(low) || toMidi(pitch) > toMidi(high)) clipFail('音符が範囲の外にあります');
    const step = intAtLeast(note.step, 0);
    const length = intAtLeast(note.length, 1);
    if (step === null || step >= width || length === null) clipFail('音符の位置が不正です');
    return { pitch, step, length };
  });
  return { low, high, width, subdivisions, notes };
}
