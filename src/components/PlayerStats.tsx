import { useMemo } from 'react';
import { displayName, type Accidental } from '../model/pitch';
import { playerStats } from '../model/song';
import type { Song } from '../model/types';
import { playerColor } from '../util/colors';

interface Props {
  song: Song;
  players: string[];
  accidental: Accidental;
  /** Players switched off for playback ('' = bells with no player). Checkboxes show only with `onMutedChange`. */
  muted?: ReadonlySet<string>;
  onMutedChange?: (muted: Set<string>) => void;
}

/** Table under the score: how many bells each player holds and how many strikes they play in total. */
export function PlayerStats({ song, players, accidental, muted = new Set(), onMutedChange }: Props) {
  const stats = useMemo(() => playerStats(song), [song]);
  if (!players.length) return null;
  const names = stats.map((s) => s.name);
  const offCount = names.filter((n) => muted.has(n)).length;
  const toggle = (name: string, on: boolean) => {
    const next = new Set(muted);
    if (on) next.delete(name);
    else next.add(name);
    onMutedChange?.(next);
  };
  return (
    <table className="player-stats">
      <thead>
        <tr>
          {onMutedChange && (
            <th className="sound" title="チェックした担当のベルだけを再生で鳴らします">
              <input
                type="checkbox"
                aria-label="全員を鳴らす"
                checked={offCount === 0}
                ref={(el) => {
                  if (el) el.indeterminate = offCount > 0 && offCount < names.length;
                }}
                onChange={(e) => onMutedChange(e.target.checked ? new Set() : new Set(names))}
              />
            </th>
          )}
          <th>担当</th>
          <th title="担当しているベル（音名）の数">担当音種数</th>
          <th title="担当しているベルを鳴らす回数の合計">延べ担当音数</th>
          <th>音名</th>
        </tr>
      </thead>
      <tbody>
        {stats.map((s) => {
          const off = muted.has(s.name);
          return (
            <tr key={s.name} className={`${s.name ? '' : 'unassigned'}${off ? ' off' : ''}`}>
              {onMutedChange && (
                <td className="sound">
                  <input
                    type="checkbox"
                    aria-label={`${s.name || '未割り当て'}を鳴らす`}
                    checked={!off}
                    onChange={(e) => toggle(s.name, e.target.checked)}
                  />
                </td>
              )}
              <th style={{ color: playerColor(players, s.name) }}>{s.name || '未割り当て'}</th>
              <td>{s.bells.length}</td>
              <td>{s.strikes}</td>
              <td className="bells">{s.bells.map((b) => displayName(b, accidental)).join(' ')}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
