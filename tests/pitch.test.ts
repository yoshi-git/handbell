import { describe, expect, it } from 'vitest';
import { displayName, frequency, fromMidi, normalize, notesInRange, toMidi } from '../src/model/pitch';

describe('pitch', () => {
  it('converts note names to MIDI', () => {
    expect(toMidi('3A')).toBe(57);
    expect(toMidi('4A')).toBe(69);
    expect(toMidi('5E')).toBe(76);
    expect(toMidi('4C#')).toBe(61);
    expect(toMidi('4Db')).toBe(61);
    expect(toMidi('x')).toBeNaN();
  });

  it('gives sounding frequencies, optionally octaves higher', () => {
    expect(frequency('4A')).toBe(440);
    expect(frequency('3A')).toBe(220);
    expect(frequency('4A', 1)).toBe(880);
    expect(frequency('3A', 2)).toBe(880);
    expect(frequency('5E', 2)).toBeCloseTo(2637.02, 1);
  });

  it('round-trips MIDI to canonical names', () => {
    expect(fromMidi(57)).toBe('3A');
    expect(normalize('4D♭')).toBe('4C#');
  });

  it('lists the default range 3A–5E as 20 chromatic bells, high to low', () => {
    const list = notesInRange('3A', '5E');
    expect(list).toHaveLength(20);
    expect(list[0]).toBe('5E');
    expect(list[list.length - 1]).toBe('3A');
  });

  it('formats display names with sharps or flats', () => {
    expect(displayName('4C#')).toBe('4C♯');
    expect(displayName('4C#', 'flat')).toBe('4D♭');
  });
});
