import { memo, useMemo, type CSSProperties } from 'react';
import { displayName, isBlackKey, type Accidental } from '../model/pitch';
import { players as listPlayers, playerName, rows, stepsPerMeasure, strikeCounts, totalSteps } from '../model/song';
import type { Note, NoteName, Song } from '../model/types';
import { playerColor } from '../util/colors';

export interface WeddingScoreProps {
  song: Song;
  stepWidth: number;
  /** Bells struck at the current playback step. */
  activePitches: ReadonlySet<NoteName>;
  playheadRef: React.Ref<HTMLDivElement>;
}

/**
 * Read-only score for the wedding page: note names and lanes only (no player names, counts
 * or editing). Bells never struck in the song get no row. Notes keep the editor's player colors.
 */
export function WeddingScore({ song, stepWidth, activePitches, playheadRef }: WeddingScoreProps) {
  const spm = stepsPerMeasure(song);
  const steps = totalSteps(song);
  const players = useMemo(() => listPlayers(song), [song]);
  const used = useMemo(() => {
    const strikes = strikeCounts(song);
    return rows(song).filter((p) => strikes.has(p));
  }, [song]);

  const byPitch = useMemo(() => {
    const map = new Map<NoteName, Note[]>();
    for (const n of song.notes) {
      if (n.step >= steps) continue;
      const list = map.get(n.pitch) ?? [];
      list.push(n);
      map.set(n.pitch, list);
    }
    return map;
  }, [song.notes, steps]);

  const laneStyle = useMemo<CSSProperties>(
    () => ({
      width: steps * stepWidth,
      ['--sw' as string]: `${stepWidth}px`,
      ['--spb' as string]: song.subdivisions,
      ['--spm' as string]: spm,
    }),
    [steps, stepWidth, song.subdivisions, spm],
  );

  const measureLabels = [];
  for (let m = 0; m < song.measures; m++) {
    measureLabels.push(
      <span key={m} className="wed-measure" style={{ left: m * spm * stepWidth }}>
        {m + 1}
      </span>,
    );
  }

  return (
    <div className="wed-grid">
      <div className="wed-row wed-head">
        <div className="wed-label">♪</div>
        <div className="wed-lane wed-head-lane" style={laneStyle}>
          {measureLabels}
        </div>
      </div>
      {used.map((pitch) => (
        <Row
          key={pitch}
          pitch={pitch}
          accidental={song.accidental}
          color={playerColor(players, playerName(song.assignments[pitch]))}
          notes={byPitch.get(pitch)}
          active={activePitches.has(pitch)}
          steps={steps}
          stepWidth={stepWidth}
          laneStyle={laneStyle}
        />
      ))}
      <div className="wed-playhead" ref={playheadRef} />
    </div>
  );
}

interface RowProps {
  pitch: NoteName;
  accidental: Accidental;
  color: string;
  notes: Note[] | undefined;
  active: boolean;
  steps: number;
  stepWidth: number;
  laneStyle: CSSProperties;
}

const Row = memo(function Row(p: RowProps) {
  return (
    <div className={`wed-row${isBlackKey(p.pitch) ? ' black' : ''}${p.active ? ' active' : ''}`}>
      <div className="wed-label">{displayName(p.pitch, p.accidental)}</div>
      <div className="wed-lane" style={p.laneStyle}>
        {p.notes?.map((n) => (
          <div
            key={n.step}
            className="wed-note"
            style={{
              left: n.step * p.stepWidth,
              width: (Math.min(n.step + n.length, p.steps) - n.step) * p.stepWidth,
              ['--c' as string]: p.color,
            }}
          />
        ))}
      </div>
    </div>
  );
});
