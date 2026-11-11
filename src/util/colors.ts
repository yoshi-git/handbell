import masterData from '../playerColors.json';

/** Distinct, readable hues for player names (works on light and dark backgrounds). */
const PALETTE = [
  '#e4572e', '#2e86de', '#17a589', '#c0392b', '#8e44ad',
  '#d68910', '#d63384', '#5c6bc0', '#d35400', '#1f618d',
  '#9e9d24', '#229954', '#8d6e63', '#5d6d7e', '#af601a',
];

const HEX = /^#[0-9a-f]{6}$/i;

/** Player name -> color, from src/playerColors.json (entries that are not #rrggbb are ignored). */
export const PLAYER_COLOR_MASTER: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(masterData as Record<string, unknown>)
    .filter((e): e is [string, string] => typeof e[1] === 'string' && HEX.test(e[1]))
    .map(([name, color]) => [name.trim(), color.toLowerCase()]),
);

/** Rough perceived distance between two #rrggbb colors ("redmean"; 0 = same, ~765 = black/white). */
function colorDistance(a: string, b: string): number {
  const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [r1, g1, b1] = rgb(a);
  const [r2, g2, b2] = rgb(b);
  const r = (r1 + r2) / 2;
  return Math.sqrt((2 + r / 256) * (r1 - r2) ** 2 + 4 * (g1 - g2) ** 2 + (2 + (255 - r) / 256) * (b1 - b2) ** 2);
}

/** Palette colors closer than this to a master color are kept away from other names. */
const NEAR = 100;

/** FNV-1a over UTF-16 code units. */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * A color for each player. Names in the master always get their master color. Other names
 * pick, by a hash of the name, from the palette colors that do not look like any master
 * color; when two of them land on the same color, the later name (code point order) moves
 * to the next free one.
 * The result does not depend on the order of `players`.
 */
export function playerColors(
  players: readonly string[],
  master: Readonly<Record<string, string>> = PLAYER_COLOR_MASTER,
): Map<string, string> {
  const known = new Map(Object.entries(master).map(([name, c]) => [name, c.toLowerCase()]));
  const taken = [...known.values()];
  const distinct = PALETTE.filter((c) => taken.every((m) => colorDistance(c, m) >= NEAR));
  const unused = PALETTE.filter((c) => !taken.includes(c));
  const pool = distinct.length ? distinct : unused.length ? unused : PALETTE;
  const out = new Map<string, string>();
  const used = new Set<string>();
  for (const name of players) {
    const c = known.get(name);
    if (!c) continue;
    out.set(name, c);
    used.add(c);
  }
  const others = [...new Set(players)].filter((p) => p && !known.has(p)).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  for (const name of others) {
    const start = hash(name) % pool.length;
    let color = pool[start];
    for (let k = 0; k < pool.length; k++) {
      const c = pool[(start + k) % pool.length];
      if (!used.has(c)) {
        color = c;
        break;
      }
    }
    used.add(color);
    out.set(name, color);
  }
  return out;
}

const cache = new WeakMap<readonly string[], Map<string, string>>();

export function playerColor(players: readonly string[], name: string | undefined): string {
  if (!name) return 'var(--unassigned)';
  let colors = cache.get(players);
  if (!colors) {
    colors = playerColors(players);
    cache.set(players, colors);
  }
  return colors.get(name) ?? playerColors([name]).get(name)!;
}
