import { useRef, useState } from 'react';
import { createSong, newId, players } from '../model/song';
import { songFromMusicXml } from '../model/musicxml';
import { songFromJson, songToJson } from '../model/serialize';
import type { Song } from '../model/types';
import { SAMPLES } from '../samples';
import { deleteSong, listSongs, saveSong } from '../storage/localSongs';
import { downloadText, safeFilename } from '../util/file';
import { decodeXmlBytes, readMxl } from '../util/zip';

function summary(song: Song): string {
  const n = players(song).length;
  return `${song.measures}小節・♩=${song.tempo}・${song.range.low}〜${song.range.high}${n ? `・${n}人` : ''}`;
}

/** Reads a song from JSON or MusicXML, chosen by file extension. */
async function readSongFile(file: File, onWarnings: (warnings: string[]) => void): Promise<Song> {
  const name = file.name.toLowerCase();
  if (name.endsWith('.json')) return songFromJson(await file.text());
  const xml = name.endsWith('.mxl')
    ? await readMxl(await file.arrayBuffer())
    : decodeXmlBytes(new Uint8Array(await file.arrayBuffer()));
  const { song, warnings } = songFromMusicXml(xml);
  if (warnings.length) onWarnings(warnings);
  return song;
}

export function SongList() {
  const [songs, setSongs] = useState(listSongs);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
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
    setNotice(null);
    for (const file of Array.from(files)) {
      try {
        const song = await readSongFile(file, (warnings) => setNotice(`${file.name}: ${warnings.join(' ')}`));
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
          <button onClick={() => fileRef.current?.click()} title="JSON・MusicXML (.musicxml / .xml / .mxl)">
            ファイルを読み込む
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".json,.musicxml,.xml,.mxl,application/json,application/vnd.recordare.musicxml+xml,application/vnd.recordare.musicxml"
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
      {notice && <p className="hint">{notice}</p>}

      <section>
        <h2>マイ曲</h2>
        <p className="hint">このブラウザに保存されます。他の端末へはJSON書き出しか共有URLで渡してください。</p>
        {songs.length === 0 ? (
          <p className="empty">まだ曲がありません。「新しい曲」から作成するか、サンプル曲をコピーしてください。</p>
        ) : (
          <ul className="song-rows">
            {songs.map((s) => (
              <li key={s.id}>
                <a href={`#/edit/${s.id}`} className="row-link">
                  <span className="row-title">{s.title || '無題'}</span>
                  <span className="row-meta">{summary(s)}</span>
                </a>
                <div className="row-actions">
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
        <ul className="song-rows">
          {SAMPLES.map((s) => (
            <li key={s.id}>
              <a href={`#/sample/${s.id}`} className="row-link">
                <span className="row-title">{s.title}</span>
                <span className="row-meta">{summary(s)}</span>
              </a>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
