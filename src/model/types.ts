/** Canonical note name: octave digit + letter + optional "#", e.g. "3A", "4C#", "5E". */
export type NoteName = string;

export interface Note {
  pitch: NoteName;
  /** Position in subdivision steps from the start of the song. */
  step: number;
  /** How many steps the bell rings before being damped. */
  length: number;
}

export interface Song {
  version: 1;
  id: string;
  title: string;
  /** Quarter-note beats per minute. */
  tempo: number;
  beatsPerMeasure: number;
  /** Steps per beat (2 = eighth notes, 4 = sixteenth notes). */
  subdivisions: number;
  measures: number;
  range: { low: NoteName; high: NoteName };
  /** Bell (note name) -> player name. */
  assignments: Record<NoteName, string>;
  notes: Note[];
}
