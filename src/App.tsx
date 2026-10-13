import { useEffect, useState } from 'react';
import { decodeFromUrl } from './model/serialize';
import type { Song } from './model/types';
import { Editor, type EditorSource } from './pages/Editor';
import { SongList } from './pages/SongList';
import { getSample } from './samples';
import { getSong } from './storage/localSongs';

type Route =
  | { page: 'list' }
  | { page: 'editor'; song: Song; source: EditorSource }
  | { page: 'error'; message: string };

function resolve(hash: string): Route {
  const [path, query = ''] = hash.replace(/^#/, '').split('?');
  const parts = path.split('/').filter(Boolean);
  if (parts[0] === 'edit' && parts[1]) {
    const song = getSong(parts[1]);
    return song ? { page: 'editor', song, source: 'mine' } : { page: 'error', message: '曲が見つかりません。' };
  }
  if (parts[0] === 'sample' && parts[1]) {
    const song = getSample(parts[1]);
    return song ? { page: 'editor', song, source: 'sample' } : { page: 'error', message: 'サンプル曲が見つかりません。' };
  }
  if (parts[0] === 'song') {
    const d = new URLSearchParams(query).get('d');
    try {
      if (!d) throw new Error('共有URLに譜面データがありません。');
      return { page: 'editor', song: decodeFromUrl(d), source: 'shared' };
    } catch (e) {
      return { page: 'error', message: (e as Error).message };
    }
  }
  return { page: 'list' };
}

export function App() {
  const [hash, setHash] = useState(location.hash);
  useEffect(() => {
    const onChange = () => setHash(location.hash);
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  useEffect(() => {
    if (!hash.startsWith('#/edit') && !hash.startsWith('#/sample') && !hash.startsWith('#/song')) {
      document.title = 'ハンドベル譜面';
    }
  }, [hash]);

  const route = resolve(hash);
  if (route.page === 'editor') return <Editor key={hash} initial={route.song} source={route.source} />;
  if (route.page === 'error')
    return (
      <div className="error-page">
        <p>{route.message}</p>
        <a href="#/">一覧へ戻る</a>
      </div>
    );
  return <SongList />;
}
