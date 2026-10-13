import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Player } from '../audio/scheduler';
import { PlayerPanel, UNASSIGNED } from '../components/PlayerPanel';
import { ScoreGrid } from '../components/ScoreGrid';
import { SELECTABLE_NOTES, displayName, toMidi, type Accidental } from '../model/pitch';
import {
  hiddenNoteCount,
  newId,
  players as listPlayers,
  setAssignment,
  setSubdivisions,
  stepsPerMeasure,
  totalSteps,
} from '../model/song';
import { encodeForUrl, songToJson } from '../model/serialize';
import type { NoteName, Song } from '../model/types';
import { saveSong } from '../storage/localSongs';
import { downloadText, safeFilename } from '../util/file';

export type EditorSource = 'mine' | 'sample' | 'shared';

interface History {
  past: Song[];
  present: Song;
  future: Song[];
}

const HISTORY_LIMIT = 200;
const SUBDIVISION_OPTIONS = [
  { value: 1, label: '4分音符' },
  { value: 2, label: '8分音符' },
  { value: 3, label: '3連符' },
  { value: 4, label: '16分音符' },
];

function loadPref<T extends string>(key: string, fallback: T): T {
  try {
    return (localStorage.getItem(key) as T) ?? fallback;
  } catch {
    return fallback;
  }
}

function savePref(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore
  }
}

export function Editor({ initial, source }: { initial: Song; source: EditorSource }) {
  const readOnly = source !== 'mine';
  const [hist, setHist] = useState<History>({ past: [], present: initial, future: [] });
  const song = hist.present;
  const [mode, setMode] = useState<'edit' | 'play'>(readOnly ? 'play' : 'edit');
  const [accidental, setAccidental] = useState<Accidental>(() => loadPref('bellscore.accidental', 'sharp'));
  const [stepWidth, setStepWidth] = useState(() => Number(loadPref('bellscore.zoom', '24')) || 24);
  const [shareUrl, setShareUrl] = useState<string | null>(null);

  const change = useCallback((next: Song, transient = false) => {
    setHist((h) => {
      if (next === h.present) return h;
      if (transient) return { ...h, present: next };
      return { past: [...h.past, h.present].slice(-HISTORY_LIMIT), present: next, future: [] };
    });
  }, []);
  /** Snapshot the current state so the following transient edits undo as one step. */
  const checkpoint = useCallback(() => {
    setHist((h) => ({ past: [...h.past, h.present].slice(-HISTORY_LIMIT), present: h.present, future: [] }));
  }, []);
  const undo = useCallback(() => {
    setHist((h) =>
      h.past.length ? { past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future] } : h,
    );
  }, []);
  const redo = useCallback(() => {
    setHist((h) => (h.future.length ? { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1) } : h));
  }, []);

  useEffect(() => {
    if (source === 'mine') saveSong(song);
  }, [song, source]);

  useEffect(() => {
    document.title = `${song.title} - ハンドベル譜面`;
  }, [song.title]);

  const players = useMemo(() => listPlayers(song), [song]);

  // ---- playback ----
  const player = useRef<Player>();
  if (!player.current) player.current = new Player();
  const [playing, setPlaying] = useState(false);
  const [loop, setLoop] = useState(false);
  const [startStep, setStartStep] = useState(0);
  const [activeStep, setActiveStep] = useState<number | null>(null);
  const [muted, setMuted] = useState<Set<string>>(new Set());
  const [solo, setSolo] = useState<Set<string>>(new Set());
  const mixRef = useRef({ muted, solo, assignments: song.assignments });
  mixRef.current = { muted, solo, assignments: song.assignments };
  const playheadRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const audible = useCallback((pitch: NoteName) => {
    const { muted, solo, assignments } = mixRef.current;
    const who = assignments[pitch] ?? UNASSIGNED;
    return solo.size ? solo.has(who) : !muted.has(who);
  }, []);

  const hidePlayhead = () => {
    if (playheadRef.current) playheadRef.current.style.display = 'none';
  };

  const stop = useCallback(() => {
    player.current!.stop();
    setPlaying(false);
    setActiveStep(null);
    hidePlayhead();
  }, []);

  const play = useCallback(() => {
    const total = totalSteps(song);
    const from = startStep < total ? startStep : 0;
    setPlaying(true);
    void player.current!.start(song, {
      fromStep: from,
      loop,
      audible,
      onStep: setActiveStep,
      onPosition: (pos) => {
        const el = playheadRef.current;
        const box = scrollRef.current;
        if (!el || !box) return;
        el.style.display = 'block';
        el.style.transform = `translateX(${pos * stepWidth}px)`;
        // Keep the playhead in view (the label columns are sticky on the left).
        const x = el.offsetLeft + pos * stepWidth;
        const labels = el.offsetLeft;
        if (x > box.scrollLeft + box.clientWidth - 80 || x < box.scrollLeft + labels) {
          box.scrollLeft = Math.max(0, x - labels - 40);
        }
      },
      onEnd: () => {
        setPlaying(false);
        setActiveStep(null);
        hidePlayhead();
      },
    });
  }, [song, startStep, loop, audible, stepWidth]);

  useEffect(() => {
    player.current!.update(song);
  }, [song]);

  useEffect(() => () => player.current!.stop(), []);

  const preview = useCallback((pitch: NoteName) => void player.current!.preview(pitch), []);

  const activePitches = useMemo(() => {
    const set = new Set<NoteName>();
    if (activeStep === null) return set;
    for (const n of song.notes) if (n.step === activeStep) set.add(n.pitch);
    return set;
  }, [activeStep, song.notes]);
  const activePlayers = useMemo(
    () => new Set([...activePitches].map((p) => song.assignments[p] ?? UNASSIGNED)),
    [activePitches, song.assignments],
  );

  const toggleIn = (set: Set<string>, name: string) => {
    const next = new Set(set);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    return next;
  };

  // ---- keyboard shortcuts ----
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('input, select, textarea')) return;
      if (e.code === 'Space') {
        e.preventDefault();
        if (playing) stop();
        else play();
      } else if (!readOnly && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (!readOnly && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [playing, play, stop, undo, redo, readOnly]);

  const onAssign = useCallback(
    (pitch: NoteName, name: string) => setHist((h) => {
      const next = setAssignment(h.present, pitch, name);
      return { past: [...h.past, h.present].slice(-HISTORY_LIMIT), present: next, future: [] };
    }),
    [],
  );

  const copyToMine = () => {
    const copy = { ...song, id: newId(), title: source === 'sample' ? `${song.title}（コピー）` : song.title };
    saveSong(copy);
    location.hash = `#/edit/${copy.id}`;
  };

  const share = () => {
    const base = location.href.split('#')[0];
    setShareUrl(`${base}#/song?d=${encodeForUrl(song)}`);
  };

  const editing = !readOnly && mode === 'edit';
  const hidden = hiddenNoteCount(song);
  const spm = stepsPerMeasure(song);

  return (
    <div className="editor">
      <header className="topbar no-print">
        <a href="#/" className="back" onClick={stop}>
          ← 一覧
        </a>
        {readOnly ? (
          <h1 className="title-static">{song.title}</h1>
        ) : (
          <input
            className="title-input"
            value={song.title}
            onFocus={checkpoint}
            onChange={(e) => change({ ...song, title: e.target.value }, true)}
            aria-label="曲名"
          />
        )}
        <div className="spacer" />
        {!readOnly && (
          <div className="seg">
            <button className={mode === 'edit' ? 'on' : ''} onClick={() => setMode('edit')}>
              編集
            </button>
            <button className={mode === 'play' ? 'on' : ''} onClick={() => setMode('play')}>
              試奏
            </button>
          </div>
        )}
        <button onClick={() => downloadText(`${safeFilename(song.title)}.bellscore.json`, songToJson(song))}>
          JSON書き出し
        </button>
        <button onClick={share}>共有URL</button>
        <button onClick={() => window.print()}>印刷</button>
      </header>

      {readOnly && (
        <div className="banner no-print">
          {source === 'sample' ? 'サンプル曲（読み取り専用）' : '共有された譜面（読み取り専用）'}
          <button className="primary" onClick={copyToMine}>
            マイ曲に保存して編集
          </button>
        </div>
      )}

      <div className="toolbar no-print">
        <label>
          テンポ ♩=
          <input
            type="number"
            min={20}
            max={300}
            value={song.tempo}
            onFocus={checkpoint}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (v >= 20 && v <= 300) change({ ...song, tempo: v }, true);
            }}
          />
        </label>
        {editing && (
          <>
            <label>
              拍子
              <select
                value={song.beatsPerMeasure}
                onChange={(e) => change({ ...song, beatsPerMeasure: Number(e.target.value) })}
              >
                {[2, 3, 4, 5, 6].map((b) => (
                  <option key={b} value={b}>
                    {b}/4
                  </option>
                ))}
              </select>
            </label>
            <label>
              最小単位
              <select value={song.subdivisions} onChange={(e) => change(setSubdivisions(song, Number(e.target.value)))}>
                {SUBDIVISION_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              小節数
              <button onClick={() => change({ ...song, measures: Math.max(1, song.measures - 1) })}>−</button>
              <span className="num">{song.measures}</span>
              <button onClick={() => change({ ...song, measures: song.measures + 1 })}>＋</button>
            </label>
            <label>
              音域
              <select
                value={song.range.low}
                onChange={(e) => change({ ...song, range: { ...song.range, low: e.target.value } })}
              >
                {SELECTABLE_NOTES.filter((n) => toMidi(n) < toMidi(song.range.high)).map((n) => (
                  <option key={n} value={n}>
                    {displayName(n, accidental)}
                  </option>
                ))}
              </select>
              〜
              <select
                value={song.range.high}
                onChange={(e) => change({ ...song, range: { ...song.range, high: e.target.value } })}
              >
                {SELECTABLE_NOTES.filter((n) => toMidi(n) > toMidi(song.range.low)).map((n) => (
                  <option key={n} value={n}>
                    {displayName(n, accidental)}
                  </option>
                ))}
              </select>
            </label>
            <span className="undo">
              <button onClick={undo} disabled={!hist.past.length} title="元に戻す (Ctrl+Z)">
                ↶
              </button>
              <button onClick={redo} disabled={!hist.future.length} title="やり直し (Ctrl+Y)">
                ↷
              </button>
            </span>
          </>
        )}
        <div className="spacer" />
        <label>
          表記
          <select
            value={accidental}
            onChange={(e) => {
              setAccidental(e.target.value as Accidental);
              savePref('bellscore.accidental', e.target.value);
            }}
          >
            <option value="sharp">♯</option>
            <option value="flat">♭</option>
          </select>
        </label>
        <label>
          拡大
          <input
            type="range"
            min={12}
            max={44}
            value={stepWidth}
            onChange={(e) => {
              setStepWidth(Number(e.target.value));
              savePref('bellscore.zoom', e.target.value);
            }}
          />
        </label>
      </div>

      <div className="playbar no-print">
        <button className="primary play" onClick={playing ? stop : play}>
          {playing ? '■ 停止' : '▶ 再生'}
        </button>
        <label>
          <input type="checkbox" checked={loop} onChange={(e) => setLoop(e.target.checked)} disabled={playing} />
          ループ
        </label>
        <span className="hint">
          開始位置: {Math.floor(startStep / spm) + 1}小節目
          {startStep > 0 && (
            <button className="link" onClick={() => setStartStep(0)}>
              先頭へ
            </button>
          )}
          （小節番号の行をクリックで変更 / スペースキーで再生・停止）
        </span>
        {editing && <span className="hint">マスをクリックで音符、ドラッグで響かせる長さ、音符クリックで削除</span>}
        {hidden > 0 && <span className="warn">音域外・範囲外の音符 {hidden} 個は非表示です</span>}
      </div>

      <div className="workspace">
        <div className="grid-scroll" ref={scrollRef}>
          <ScoreGrid
            song={song}
            players={players}
            readOnly={!editing}
            accidental={accidental}
            stepWidth={stepWidth}
            activePitches={activePitches}
            startStep={startStep}
            playheadRef={playheadRef}
            onChange={change}
            onAssign={onAssign}
            onPreview={preview}
            onSetStart={setStartStep}
          />
        </div>
        <PlayerPanel
          song={song}
          players={players}
          accidental={accidental}
          activePlayers={activePlayers}
          showMix={mode === 'play'}
          muted={muted}
          solo={solo}
          onToggleMute={(n) => setMuted((s) => toggleIn(s, n))}
          onToggleSolo={(n) => setSolo((s) => toggleIn(s, n))}
        />
      </div>

      <PrintView song={song} players={players} accidental={accidental} />

      <datalist id="player-names">
        {players.map((p) => (
          <option key={p} value={p} />
        ))}
      </datalist>

      {shareUrl && <ShareDialog url={shareUrl} onClose={() => setShareUrl(null)} />}
    </div>
  );
}

function ShareDialog({ url, onClose }: { url: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>共有URL</h3>
        <p>このURLを開くと、同じ譜面を表示・試奏できます（譜面データはURL自体に含まれています）。</p>
        <input className="share-url" readOnly value={url} onFocus={(e) => e.target.select()} />
        {url.length > 2000 && <p className="warn">URLが長いため、一部のアプリでは途切れる場合があります。その場合はJSON書き出しを使ってください。</p>}
        <div className="modal-actions">
          <button className="primary" onClick={copy}>
            {copied ? 'コピーしました' : 'コピー'}
          </button>
          <button onClick={onClose}>閉じる</button>
        </div>
      </div>
    </div>
  );
}

/** Printable layout: the score split into lines of whole measures. */
function PrintView({ song, players, accidental }: { song: Song; players: string[]; accidental: Accidental }) {
  const spm = stepsPerMeasure(song);
  const stepWidth = 12;
  const measuresPerLine = Math.max(1, Math.floor(860 / (spm * stepWidth)));
  const lines = [];
  for (let m = 0; m < song.measures; m += measuresPerLine) {
    lines.push(
      <ScoreGrid
        key={m}
        song={song}
        players={players}
        readOnly
        accidental={accidental}
        stepWidth={stepWidth}
        fromStep={m * spm}
        toStep={Math.min(song.measures, m + measuresPerLine) * spm}
      />,
    );
  }
  return (
    <div className="print-only">
      <h1>{song.title}</h1>
      <p>
        ♩={song.tempo}　{song.beatsPerMeasure}/4拍子
      </p>
      {lines}
    </div>
  );
}
