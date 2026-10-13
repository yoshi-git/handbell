import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string';
import { isValidNote, normalize } from './pitch';
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
  if (d.version !== 1) fail('未対応のバージョンです');
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
    version: 1,
    id: typeof d.id === 'string' && d.id ? d.id : Math.random().toString(36).slice(2),
    title: typeof d.title === 'string' ? d.title : '無題',
    tempo: posInt(d.tempo, 'tempo'),
    beatsPerMeasure: posInt(d.beatsPerMeasure, 'beatsPerMeasure'),
    subdivisions: posInt(d.subdivisions, 'subdivisions'),
    measures: posInt(d.measures, 'measures'),
    range: { low: normalize(String(range.low)), high: normalize(String(range.high)) },
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
