import { useRef, useState } from 'react';
import { createSong, newId, players } from '../model/song';
import { songFromJson, songToJson } from '../model/serialize';
import type { Song } from '../model/types';
import { SAMPLES } from '../samples';
import { deleteSong, listSongs, saveSong } from '../storage/localSongs';
import { downloadText, safeFilename } from '../util/file';

function summary(song: Song): string {
  const n = players(song).length;
  return `${song.measures}小節・♩=${song.tempo}・${song.range.low}〜${song.range.high}${n ? `・${n}人` : ''}`;
}

export function SongList() {
  const [songs, setSongs] = useState(listSongs);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = () => setSongs(listSongs());

  const create = () => {
    const song = createSong();
    saveSong(song);
    location.hash = `#/edit/${song.id}`;
  };

  const importFiles = async (files: FileList | null) => {
    if (!files) return;
    setError(null);
    for (const file of Array.from(files)) {
      try {
        const song = songFromJson(await file.text());
        // Keep the existing copy if the same id is already saved.
        if (listSongs().some((s) => s.id === song.id)) song.id = newId();
        saveSong(song);
      } catch (e) {
        setError(`${file.name}: ${(e as Error).message}`);
      }
    }
    refresh();
  };

  const duplicate = (song: Song) => {
    saveSong({ ...song, id: newId(), title: `${song.title}（コピー）` });
    refresh();
  };

  const remove = (song: Song) => {
    if (!confirm(`「${song.title}」を削除しますか？`)) return;
    deleteSong(song.id);
    refresh();
  };

  return (
    <div className="song-list">
      <header className="list-header">
        <h1>🔔 ハンドベル譜面</h1>
        <div className="actions">
          <button className="primary" onClick={create}>
            ＋ 新しい曲
          </button>
          <button onClick={() => fileRef.current?.click()}>JSONを読み込む</button>
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            multiple
            hidden
            onChange={(e) => {
              void importFiles(e.target.files);
              e.target.value = '';
            }}
          />
        </div>
      </header>
      {error && <p className="warn">{error}</p>}

      <section>
        <h2>マイ曲</h2>
        <p className="hint">このブラウザに保存されます。他の端末へはJSON書き出しか共有URLで渡してください。</p>
        {songs.length === 0 ? (
          <p className="empty">まだ曲がありません。「新しい曲」から作成するか、サンプル曲をコピーしてください。</p>
        ) : (
          <ul className="cards">
            {songs.map((s) => (
              <li key={s.id} className="card">
                <a href={`#/edit/${s.id}`} className="card-title">
                  {s.title || '無題'}
                </a>
                <div className="card-meta">{summary(s)}</div>
                <div className="card-actions">
                  <a className="button" href={`#/edit/${s.id}`}>
                    開く
                  </a>
                  <button onClick={() => duplicate(s)}>複製</button>
                  <button onClick={() => downloadText(`${safeFilename(s.title)}.bellscore.json`, songToJson(s))}>
                    書き出し
                  </button>
                  <button className="danger" onClick={() => remove(s)}>
                    削除
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2>サンプル曲</h2>
        <ul className="cards">
          {SAMPLES.map((s) => (
            <li key={s.id} className="card sample">
              <a href={`#/sample/${s.id}`} className="card-title">
                {s.title}
              </a>
              <div className="card-meta">{summary(s)}</div>
              <div className="card-actions">
                <a className="button" href={`#/sample/${s.id}`}>
                  見る・試奏
                </a>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
