import { useMemo } from 'react';
import { displayName, type Accidental } from '../model/pitch';
import { playerStats } from '../model/song';
import type { Song } from '../model/types';
import { playerColor } from '../util/colors';

/** Table under the score: how many bells each player holds and how many strikes they play in total. */
export function PlayerStats({ song, players, accidental }: { song: Song; players: string[]; accidental: Accidental }) {
  const stats = useMemo(() => playerStats(song), [song]);
  if (!players.length) return null;
  return (
    <table className="player-stats">
      <thead>
        <tr>
          <th>担当</th>
          <th title="担当しているベル（音名）の数">担当音種数</th>
          <th title="担当しているベルを鳴らす回数の合計">延べ担当音数</th>
          <th>音名</th>
        </tr>
      </thead>
      <tbody>
        {stats.map((s) => (
          <tr key={s.name} className={s.name ? '' : 'unassigned'}>
            <th style={{ color: playerColor(players, s.name) }}>{s.name || '未割り当て'}</th>
            <td>{s.bells.length}</td>
            <td>{s.strikes}</td>
            <td className="bells">{s.bells.map((b) => displayName(b, accidental)).join(' ')}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
