import { memo, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { displayName, fromMidi, isBlackKey, toMidi, type Accidental } from '../model/pitch';
import {
  addNote,
  noteAt,
  playerMemo,
  playerName,
  removeNote,
  rows,
  setNoteLength,
  stepsPerMeasure,
  strikeCounts,
  totalSteps,
  type Selection,
} from '../model/song';
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
  /** 'select' makes dragging on the lanes select an area instead of writing notes. */
  tool?: 'note' | 'select';
  selection?: Selection | null;
  onSelect?: (sel: Selection | null) => void;
  /** Show how many times each bell is struck, at the right edge. */
  showCounts?: boolean;
}

/** Widths of the sticky label columns: [player, note name]. Narrower on phones. */
const LABEL_W = { normal: [112, 52], compact: [60, 40] } as const;
const COMPACT_QUERY = '(max-width: 720px)';

function useCompact(): boolean {
  const [compact, setCompact] = useState(() => typeof matchMedia !== 'undefined' && matchMedia(COMPACT_QUERY).matches);
  useEffect(() => {
    const mq = matchMedia(COMPACT_QUERY);
    const update = () => setCompact(mq.matches);
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return compact;
}

export function ScoreGrid(props: ScoreGridProps) {
  const { song, stepWidth, fromStep = 0, toStep = totalSteps(song) } = props;
  // Rows only need stable props; per-step data is passed as `active`.
  const { activePitches, playheadRef, selection, ...rowProps } = props;
  const spm = stepsPerMeasure(song);
  const steps = toStep - fromStep;
  const [playerW, noteW] = LABEL_W[useCompact() ? 'compact' : 'normal'];

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

  const counts = useMemo(() => (props.showCounts ? strikeCounts(song) : null), [props.showCounts, song]);

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
      style={{ ['--player-w' as string]: `${playerW}px`, ['--note-w' as string]: `${noteW}px` }}
    >
      <div className="grid-row grid-header">
        <div className="cell-player" title="担当者名。「名前:メモ」と書くと、: より後ろはメモになります">
          担当
        </div>
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
        {counts && <div className="cell-count">回数</div>}
      </div>
      {rows(song).map((pitch) => (
        <GridRow
          key={pitch}
          pitch={pitch}
          player={song.assignments[pitch]}
          color={playerColor(props.players, playerName(song.assignments[pitch]))}
          notes={byPitch.get(pitch)}
          active={activePitches?.has(pitch) ?? false}
          count={counts ? counts.get(pitch) ?? 0 : undefined}
          laneStyle={laneStyle}
          {...rowProps}
          fromStep={fromStep}
          songRef={songRef}
        />
      ))}
      {selection && <SelectionBox song={song} sel={selection} fromStep={fromStep} toStep={toStep} stepWidth={stepWidth} left={playerW + noteW} />}
      {playheadRef && (
        <div
          className="playhead"
          ref={playheadRef}
          style={{ left: playerW + noteW, display: 'none' }}
        />
      )}
    </div>
  );
}

function SelectionBox(p: { song: Song; sel: Selection; fromStep: number; toStep: number; stepWidth: number; left: number }) {
  const top = toMidi(p.song.range.high) - toMidi(p.sel.high);
  const count = toMidi(p.sel.high) - toMidi(p.sel.low) + 1;
  const from = Math.max(p.sel.from, p.fromStep);
  const to = Math.min(p.sel.to, p.toStep);
  if (to <= from) return null;
  return (
    <div
      className="selection-box"
      style={{
        left: p.left + (from - p.fromStep) * p.stepWidth,
        width: (to - from) * p.stepWidth,
        top: `calc(var(--row-h) * ${top + 1})`,
        height: `calc(var(--row-h) * ${count})`,
      }}
    />
  );
}

interface RowProps extends Omit<ScoreGridProps, 'activePitches' | 'playheadRef' | 'selection'> {
  pitch: NoteName;
  player: string | undefined;
  color: string;
  notes: Note[] | undefined;
  active: boolean;
  /** Strikes of this bell in the song; undefined hides the column. */
  count: number | undefined;
  laneStyle: CSSProperties;
  fromStep: number;
  songRef: React.MutableRefObject<Song>;
}

type Drag = { pitch: NoteName; step: number; moved: boolean; existing: boolean; pushed: boolean };
type Anchor = { midi: number; step: number };

const GridRow = memo(function GridRow(p: RowProps) {
  const drag = useRef<Drag | null>(null);
  const anchor = useRef<Anchor | null>(null);

  const stepAt = (e: PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return p.fromStep + Math.floor((e.clientX - rect.left) / p.stepWidth);
  };

  /** Pitch and step under the pointer, clamped to the score (the pointer may leave this row while dragging). */
  const cellAt = (e: PointerEvent<HTMLDivElement>): Anchor => {
    const song = p.songRef.current;
    const rect = e.currentTarget.getBoundingClientRect();
    const midi = toMidi(p.pitch) - Math.floor((e.clientY - rect.top) / rect.height);
    return {
      midi: Math.max(toMidi(song.range.low), Math.min(toMidi(song.range.high), midi)),
      step: Math.max(0, Math.min(totalSteps(song) - 1, stepAt(e))),
    };
  };

  const select = (a: Anchor, b: Anchor) =>
    p.onSelect?.({
      low: fromMidi(Math.min(a.midi, b.midi)),
      high: fromMidi(Math.max(a.midi, b.midi)),
      from: Math.min(a.step, b.step),
      to: Math.max(a.step, b.step) + 1,
    });

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (p.readOnly || !p.onChange || e.button !== 0) return;
    const song = p.songRef.current;
    const step = stepAt(e);
    if (step < 0 || step >= totalSteps(song)) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    if (p.tool === 'select') {
      anchor.current = cellAt(e);
      select(anchor.current, anchor.current);
      return;
    }
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
    if (anchor.current) {
      select(anchor.current, cellAt(e));
      return;
    }
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
    anchor.current = null;
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
  const name = playerName(p.player);
  const memo = playerMemo(p.player);
  return (
    <div className={`grid-row${black ? ' black' : ''}${p.active ? ' active' : ''}`}>
      <div className="cell-player" style={{ color: p.color }}>
        {p.readOnly || !p.onAssign ? (
          <span className="player-name" title={p.player}>
            {name}
            {memo && <span className="player-memo">{memo}</span>}
          </span>
        ) : (
          <PlayerInput pitch={p.pitch} value={p.player ?? ''} onCommit={p.onAssign} />
        )}
      </div>
      <button
        className="cell-note"
        style={{ borderLeftColor: name ? p.color : 'transparent' }}
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
      {p.count !== undefined && <div className="cell-count">{p.count || ''}</div>}
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
      title={props.value || undefined}
      placeholder="名前:メモ"
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
