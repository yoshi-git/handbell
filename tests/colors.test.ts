import { describe, expect, it } from 'vitest';
import { players } from '../src/model/song';
import { parseSong } from '../src/model/serialize';
import { PLAYER_COLOR_MASTER, playerColor, playerColors } from '../src/util/colors';

const MASTER = { 小幡: '#2e86de', 小山: '#e4572e' };

describe('player colors', () => {
  it('gives master names their master color whoever else is playing', () => {
    expect(playerColors(['小幡'], MASTER).get('小幡')).toBe('#2e86de');
    expect(playerColors(['Aさん', '小山', '小幡', 'Bさん'], MASTER).get('小幡')).toBe('#2e86de');
    expect(playerColors(['小山', 'Cさん'], MASTER).get('小山')).toBe('#e4572e');
  });

  it('colors other names apart from the master and from each other, in any order', () => {
    const names = ['Aさん', 'Bさん', 'Cさん', 'Dさん', 'Eさん', 'Fさん'];
    const colors = playerColors([...names, '小幡'], MASTER);
    const auto = names.map((n) => colors.get(n)!);
    expect(new Set(auto).size).toBe(names.length);
    for (const c of auto) expect(Object.values(MASTER)).not.toContain(c);
    expect(playerColors([...names].reverse(), MASTER)).toEqual(playerColors(names, MASTER));
  });

  it('keeps a name\'s color when unrelated players change', () => {
    const a = playerColors(['Aさん'], MASTER).get('Aさん');
    // Master members never take a spare color, so they cannot push Aさん aside.
    expect(playerColors(['小山', 'Aさん', '小幡'], MASTER).get('Aさん')).toBe(a);
  });

  it('keeps other names off colors that look like a master color', () => {
    const many = Array.from({ length: 30 }, (_, i) => `P${i}`);
    const colors = [...playerColors(many, { 小幡: '#2e86df' }).values()];
    expect(colors).not.toContain('#2e86de');
  });

  it('colors everyone even when there are more players than colors', () => {
    const many = Array.from({ length: 30 }, (_, i) => `P${i}`);
    const colors = playerColors(many, MASTER);
    for (const n of many) expect(colors.get(n)).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('ignores names that only exist on Object.prototype', () => {
    expect(playerColors(['toString'], MASTER).get('toString')).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('uses grey for bells with no player', () => {
    expect(playerColor([], undefined)).toBe('var(--unassigned)');
    expect(playerColor([], '')).toBe('var(--unassigned)');
  });

  it('has a valid master with no two members sharing a color', () => {
    const colors = Object.values(PLAYER_COLOR_MASTER);
    for (const c of colors) expect(c).toMatch(/^#[0-9a-f]{6}$/);
    expect(new Set(colors).size).toBe(colors.length);
  });

  it('colors each player the same in every sample song, and apart within a song', () => {
    const files = import.meta.glob('../src/samples/*.bellscore.json', { eager: true, import: 'default' });
    const seen = new Map<string, string>();
    for (const data of Object.values(files)) {
      const names = players(parseSong(data));
      const colors = names.map((n) => playerColor(names, n));
      expect(new Set(colors).size).toBe(names.length);
      names.forEach((n, i) => {
        if (seen.has(n)) expect(colors[i]).toBe(seen.get(n));
        seen.set(n, colors[i]);
      });
    }
  });
});
