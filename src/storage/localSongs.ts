import { parseSong } from '../model/serialize';
import type { Song } from '../model/types';

const KEY = 'bellscore.songs';

function readAll(): Song[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const list = JSON.parse(raw) as unknown[];
    return list.flatMap((s) => {
      try {
        return [parseSong(s)];
      } catch {
        return [];
      }
    });
  } catch {
    return [];
  }
}

function writeAll(songs: Song[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(songs));
  } catch {
    // Storage full or unavailable: the editor still works for this session.
  }
}

export function listSongs(): Song[] {
  return readAll();
}

export function getSong(id: string): Song | undefined {
  return readAll().find((s) => s.id === id);
}

export function saveSong(song: Song): void {
  const songs = readAll();
  const i = songs.findIndex((s) => s.id === song.id);
  if (i >= 0) songs[i] = song;
  else songs.unshift(song);
  writeAll(songs);
}

export function deleteSong(id: string): void {
  writeAll(readAll().filter((s) => s.id !== id));
}
