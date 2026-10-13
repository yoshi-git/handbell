import { displayName, type Accidental } from '../model/pitch';
import { bellsOf, rows } from '../model/song';
import type { NoteName, Song } from '../model/types';
import { playerColor } from '../util/colors';

interface Props {
  song: Song;
  players: string[];
  accidental: Accidental;
  /** Players striking at the current playback step. */
  activePlayers?: Set<string>;
  showMix: boolean;
  muted: Set<string>;
  solo: Set<string>;
  onToggleMute: (player: string) => void;
  onToggleSolo: (player: string) => void;
}

export const UNASSIGNED = '(未割当)';

export function PlayerPanel(p: Props) {
  const unassigned: NoteName[] = rows(p.song).filter((pitch) => !p.song.assignments[pitch]);
  const list = unassigned.length ? [...p.players, UNASSIGNED] : p.players;
  return (
    <aside className="player-panel">
      <h3>担当者</h3>
      {list.length === 0 && <p className="hint">譜面左の「名前」欄に担当者名を入力してください。</p>}
      <ul>
        {list.map((name) => {
          const bells = name === UNASSIGNED ? unassigned : bellsOf(p.song, name);
          const color = name === UNASSIGNED ? 'var(--unassigned)' : playerColor(p.players, name);
          const off = p.solo.size ? !p.solo.has(name) : p.muted.has(name);
          return (
            <li
              key={name}
              className={`${p.activePlayers?.has(name) ? 'active' : ''}${p.showMix && off ? ' off' : ''}`}
              style={{ ['--c' as string]: color }}
            >
              <div className="player-head">
                <span className="swatch" />
                <span className="name">{name}</span>
                {p.showMix && (
                  <span className="mix">
                    <button
                      className={p.muted.has(name) ? 'on' : ''}
                      onClick={() => p.onToggleMute(name)}
                      title="このパートを鳴らさない"
                    >
                      M
                    </button>
                    <button
                      className={p.solo.has(name) ? 'on' : ''}
                      onClick={() => p.onToggleSolo(name)}
                      title="このパートだけ鳴らす"
                    >
                      S
                    </button>
                  </span>
                )}
              </div>
              <div className="bells">{bells.map((b) => displayName(b, p.accidental)).join(' ')}</div>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
