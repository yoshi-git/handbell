import { parseSong } from '../model/serialize';
import type { Song } from '../model/types';

// Every *.bellscore.json placed in this folder is bundled as a sample song.
const modules = import.meta.glob('./*.bellscore.json', { eager: true, import: 'default' });

// Listed first in this order; the rest follow alphabetically by file name.
const PINNED = [
  './rainbow.bellscore.json',
  './famima-short.bellscore.json',
  './mario-short.bellscore.json',
  './butterfly-short.bellscore.json',
];
const rank = (path: string) => (PINNED.includes(path) ? PINNED.indexOf(path) : PINNED.length);

export const SAMPLES: Song[] = Object.entries(modules)
  .sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b))
  .flatMap(([path, data]) => {
    try {
      return [parseSong(data)];
    } catch (e) {
      console.warn(`サンプル曲 ${path} を読み込めませんでした`, e);
      return [];
    }
  });

export function getSample(id: string): Song | undefined {
  return SAMPLES.find((s) => s.id === id);
}
