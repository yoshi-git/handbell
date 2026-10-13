import { memo, useMemo, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { displayName, isBlackKey, type Accidental } from '../model/pitch';
import { addNote, noteAt, removeNote, rows, setNoteLength, stepsPerMeasure, totalSteps } from '../model/song';
import type { Note, NoteName, Song } from '../model/types';
import { playerColor } from '../util/colors';

export interface ScoreGridProps {
  song: Song;
  players: string[];
  readOnly: boolean;
  accidental: Accidental;
  stepWidth: number;
  /** Visible step window (used to split the score into lines for printing). */
  fromStep?: number;
  toStep?: number;
  /** Bells struck at the current playback step. */
  activePitches?: Set<NoteName>;
  startStep?: number;
  playheadRef?: React.Ref<HTMLDivElement>;
  /** `transient` changes (drag in progress) should not create an undo entry. */
  onChange?: (song: Song, transient: boolean) => void;
  onAssign?: (pitch: NoteName, player: string) => void;
  onPreview?: (pitch: NoteName) => void;
  onSetStart?: (step: number) => void;
}

const PLAYER_W = 112;
const NOTE_W = 52;

export function ScoreGrid(props: ScoreGridProps) {
  const { song, stepWidth, fromStep = 0, toStep = totalSteps(song) } = props;
  // Rows only need stable props; per-step data is passed as `active`.
  const { activePitches, playheadRef, ...rowProps } = props;
  const spm = stepsPerMeasure(song);
  const steps = toStep - fromStep;

  const byPitch = useMemo(() => {
    const map = new Map<NoteName, Note[]>();
    for (const n of song.notes) {
      if (n.step + n.length <= fromStep || n.step >= toStep) continue;
      const list = map.get(n.pitch) ?? [];
      list.push(n);
      map.set(n.pitch, list);
    }
    return map;
  }, [song.notes, fromStep, toStep]);

  // Latest song for pointer handlers that outlive a render.
  const songRef = useRef(song);
  songRef.current = song;

  const laneStyle: CSSProperties = {
    width: steps * stepWidth,
    ['--sw' as string]: `${stepWidth}px`,
    ['--spb' as string]: song.subdivisions,
    ['--spm' as string]: spm,
  };

  const measureLabels = [];
  for (let s = Math.ceil(fromStep / spm) * spm; s < toStep; s += spm) {
    measureLabels.push(
      <span key={s} className="measure-no" style={{ left: (s - fromStep) * stepWidth }}>
        {s / spm + 1}
      </span>,
    );
  }

  const headerClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!props.onSetStart) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const step = fromStep + Math.floor((e.clientX - rect.left) / stepWidth);
    // Snap to the beat for easier selection.
    props.onSetStart(Math.max(0, step - (step % song.subdivisions)));
  };

  return (
    <div
      className="score-grid"
      style={{ ['--player-w' as string]: `${PLAYER_W}px`, ['--note-w' as string]: `${NOTE_W}px` }}
    >
      <div className="grid-row grid-header">
        <div className="cell-player">担当</div>
        <div className="cell-note">音名</div>
        <div
          className={`lane header-lane${props.onSetStart ? ' clickable' : ''}`}
          style={laneStyle}
          onClick={headerClick}
          title={props.onSetStart ? 'クリックで再生開始位置を指定' : undefined}
        >
          {measureLabels}
          {props.startStep !== undefined && props.startStep >= fromStep && props.startStep < toStep && (
            <span className="start-marker" style={{ left: (props.startStep - fromStep) * stepWidth }}>
              ▼
            </span>
          )}
        </div>
      </div>
      {rows(song).map((pitch) => (
        <GridRow
          key={pitch}
          pitch={pitch}
          player={song.assignments[pitch]}
          color={playerColor(props.players, song.assignments[pitch])}
          notes={byPitch.get(pitch)}
          active={activePitches?.has(pitch) ?? false}
          laneStyle={laneStyle}
          {...rowProps}
          fromStep={fromStep}
          songRef={songRef}
        />
      ))}
      {playheadRef && (
        <div
          className="playhead"
          ref={playheadRef}
          style={{ left: PLAYER_W + NOTE_W, display: 'none' }}
        />
      )}
    </div>
  );
}

interface RowProps extends Omit<ScoreGridProps, 'activePitches' | 'playheadRef'> {
  pitch: NoteName;
  player: string | undefined;
  color: string;
  notes: Note[] | undefined;
  active: boolean;
  laneStyle: CSSProperties;
  fromStep: number;
  songRef: React.MutableRefObject<Song>;
}

type Drag = { pitch: NoteName; step: number; moved: boolean; existing: boolean; pushed: boolean };

const GridRow = memo(function GridRow(p: RowProps) {
  const drag = useRef<Drag | null>(null);

  const stepAt = (e: PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return p.fromStep + Math.floor((e.clientX - rect.left) / p.stepWidth);
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (p.readOnly || !p.onChange || e.button !== 0) return;
    const song = p.songRef.current;
    const step = stepAt(e);
    if (step < 0 || step >= totalSteps(song)) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const hit = noteAt(song, p.pitch, step);
    if (hit) {
      drag.current = { pitch: p.pitch, step: hit.step, moved: false, existing: true, pushed: false };
    } else {
      p.onChange(addNote(song, p.pitch, step), false);
      p.onPreview?.(p.pitch);
      drag.current = { pitch: p.pitch, step, moved: false, existing: false, pushed: true };
    }
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || !p.onChange) return;
    const song = p.songRef.current;
    const note = noteAt(song, d.pitch, d.step);
    if (!note) return;
    const length = stepAt(e) - d.step + 1;
    if (length === note.length && !d.moved) return;
    const next = setNoteLength(song, note, length);
    if (next === song) return;
    d.moved = true;
    p.onChange(next, d.pushed);
    d.pushed = true;
  };

  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    if (!d || !p.onChange) return;
    if (d.existing && !d.moved) {
      const song = p.songRef.current;
      const note = noteAt(song, d.pitch, d.step);
      if (note) p.onChange(removeNote(song, note), false);
    }
  };

  const black = isBlackKey(p.pitch);
  return (
    <div className={`grid-row${black ? ' black' : ''}${p.active ? ' active' : ''}`}>
      <div className="cell-player" style={{ color: p.color }}>
        {p.readOnly || !p.onAssign ? (
          <span className="player-name">{p.player ?? ''}</span>
        ) : (
          <PlayerInput pitch={p.pitch} value={p.player ?? ''} onCommit={p.onAssign} />
        )}
      </div>
      <button
        className="cell-note"
        style={{ borderLeftColor: p.player ? p.color : 'transparent' }}
        onClick={() => p.onPreview?.(p.pitch)}
        title="クリックで音を確認"
        tabIndex={-1}
      >
        {displayName(p.pitch, p.accidental)}
      </button>
      <div
        className={`lane${p.readOnly ? '' : ' editable'}`}
        style={p.laneStyle}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {p.notes?.map((n) => {
          const start = Math.max(n.step, p.fromStep);
          const clipped = n.step < p.fromStep;
          return (
            <div
              key={n.step}
              className={`note-bar${clipped ? ' clipped' : ''}`}
              style={{
                left: (start - p.fromStep) * p.stepWidth,
                width: (n.step + n.length - start) * p.stepWidth,
                ['--c' as string]: p.color,
              }}
            />
          );
        })}
      </div>
    </div>
  );
});

function PlayerInput(props: { pitch: NoteName; value: string; onCommit: (pitch: NoteName, v: string) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft !== null && draft !== props.value) props.onCommit(props.pitch, draft.trim());
    setDraft(null);
  };
  return (
    <input
      className="player-input"
      value={draft ?? props.value}
      placeholder="名前"
      list="player-names"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') {
          setDraft(null);
          (e.target as HTMLInputElement).blur();
        }
      }}
    />
  );
}
