import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Player } from '../audio/scheduler';
import { parseSong } from '../model/serialize';
import { stepsPerMeasure } from '../model/song';
import type { NoteName, Song } from '../model/types';
import aladdin from '../samples/aladdin.bellscore.json';
import { WeddingScore } from './WeddingScore';
// Laid behind the score and uncovered as it flows away at the end of the song. Swap the file to change it.
import revealImage from './reveal.svg';

/** Width of one step in px (a 4/4 measure of 6 steps per beat is 240px). */
const STEP_WIDTH = 10;
/** Handbells sound high: play 2 octaves above the written notes (the editor's default). */
const OCTAVES = 2;

function load(): { song: Song } | { error: string } {
  try {
    return { song: parseSong(aladdin) };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

const LOADED = load();

/** Falling petals and hearts behind the page: [left %, size px, duration s, delay s, sideways drift px]. */
const PETALS: [number, number, number, number, number][] = [
  [4, 14, 17, -3, 40],
  [12, 10, 21, -14, -30],
  [21, 16, 19, -8, 50],
  [30, 11, 23, -18, -40],
  [38, 13, 18, -1, 30],
  [47, 9, 22, -11, -25],
  [56, 15, 20, -6, 45],
  [64, 12, 24, -16, -35],
  [72, 10, 19, -9, 30],
  [80, 16, 21, -2, -45],
  [88, 11, 18, -13, 35],
  [95, 13, 22, -7, -30],
];

export function WeddingPage() {
  if ('error' in LOADED) {
    return <div className="wed-error">譜面を読み込めませんでした（{LOADED.error}）</div>;
  }
  return <Wedding song={LOADED.song} />;
}

function Wedding({ song }: { song: Song }) {
  const player = useRef<Player>();
  if (!player.current) {
    player.current = new Player();
    player.current.octaves = OCTAVES;
  }
  const [playing, setPlaying] = useState(false);
  const [activeStep, setActiveStep] = useState<number | null>(null);
  /** The song was played to the end: the score flows away, uncovering the image laid behind it. */
  const [revealed, setRevealed] = useState(false);
  /** Height of the score grid: the image layer matches it so it never peeks out below the score. */
  const [gridHeight, setGridHeight] = useState<number>();
  const playheadRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const leaveRaf = useRef<number>();

  useEffect(() => {
    const grid = scrollRef.current?.firstElementChild as HTMLElement | null | undefined;
    if (!grid) return;
    const observer = new ResizeObserver(() => setGridHeight(grid.offsetHeight));
    observer.observe(grid);
    return () => observer.disconnect();
  }, []);

  const hidePlayhead = useCallback(() => {
    if (playheadRef.current) playheadRef.current.style.display = 'none';
  }, []);

  const cancelLeave = useCallback(() => {
    if (leaveRaf.current !== undefined) cancelAnimationFrame(leaveRaf.current);
    leaveRaf.current = undefined;
  }, []);

  /** Playback is over (stopped or finished): clear the bell highlights. */
  const settle = useCallback(() => {
    setPlaying(false);
    setActiveStep(null);
  }, []);

  /** After the last note: keep the score flowing at the playback speed until it has left the card. */
  const leave = useCallback(() => {
    const box = scrollRef.current;
    if (!box) return;
    const speed = (STEP_WIDTH * song.tempo * song.subdivisions) / 60; // px per second
    // Track the position here: re-reading scrollLeft could round small steps away and stall.
    let x = box.scrollLeft;
    let last = performance.now();
    const frame = (now: number) => {
      const end = box.scrollWidth - box.clientWidth;
      x = Math.min(end, x + (speed * Math.max(0, now - last)) / 1000);
      last = now;
      box.scrollLeft = x;
      if (x < end) {
        leaveRaf.current = requestAnimationFrame(frame);
      } else {
        leaveRaf.current = undefined;
        hidePlayhead();
      }
    };
    leaveRaf.current = requestAnimationFrame(frame);
  }, [song, hidePlayhead]);

  /** Back from the image: jump to the start while the score is invisible, then fade it in over the image. */
  const showScore = useCallback(() => {
    cancelLeave();
    hidePlayhead();
    const box = scrollRef.current;
    if (box) {
      box.style.transition = 'none';
      box.style.opacity = '0';
      box.scrollLeft = 0;
      void box.offsetWidth; // apply the jump before fading back in
      box.style.transition = '';
      box.style.opacity = '';
    }
    setRevealed(false);
  }, [cancelLeave, hidePlayhead]);

  /** Stopped partway: glide back to the start (no image). */
  const stop = useCallback(() => {
    player.current!.stop();
    settle();
    hidePlayhead();
    scrollRef.current?.scrollTo({ left: 0, behavior: 'smooth' });
  }, [settle, hidePlayhead]);

  const play = useCallback(() => {
    if (revealed) showScore();
    setPlaying(true);
    void player.current!.start(song, {
      fromStep: 0,
      loop: false,
      onStep: setActiveStep,
      onPosition: (pos) => {
        const el = playheadRef.current;
        const box = scrollRef.current;
        if (!el || !box) return;
        el.style.display = 'block';
        el.style.transform = `translateX(${pos * STEP_WIDTH}px)`;
        // Like the editor's flowing score: hold the playhead a quarter measure into the lanes
        // (never past 30% of them) and scroll the score under it.
        const labels = el.offsetLeft;
        const hold = Math.min((stepsPerMeasure(song) * STEP_WIDTH) / 4, (box.clientWidth - labels) * 0.3);
        box.scrollLeft = Math.max(0, pos * STEP_WIDTH - hold);
      },
      // Only a full play-through reveals the image (Stop just goes back to the start).
      onEnd: () => {
        settle();
        setRevealed(true);
        leave();
      },
    });
  }, [song, revealed, showScore, settle, leave]);

  useEffect(
    () => () => {
      player.current!.stop();
      cancelLeave();
    },
    [cancelLeave],
  );

  const activePitches = useMemo(() => {
    const set = new Set<NoteName>();
    if (activeStep === null) return set;
    for (const n of song.notes) if (n.step === activeStep) set.add(n.pitch);
    return set;
  }, [activeStep, song.notes]);

  return (
    <div className="wed">
      <div className="wed-petals" aria-hidden="true">
        {PETALS.map(([x, size, dur, delay, drift], i) => (
          <span
            key={i}
            className={`wed-petal ${i % 3 === 1 ? 'heart' : 'petal'}`}
            style={
              {
                left: `${x}%`,
                ['--s']: `${size}px`,
                ['--drift']: `${drift}px`,
                animationDuration: `${dur}s`,
                animationDelay: `${delay}s`,
              } as CSSProperties
            }
          />
        ))}
      </div>

      <header className="wed-header">
        <h1 className="wed-title">A Whole New World</h1>
        <div className="wed-ornament" aria-hidden="true">
          <span className="line" />
          <span className="heart">♥</span>
          <span className="line" />
        </div>
      </header>

      {/* The image lies behind the score (backdrop) while it plays and shows where the score has flowed away. */}
      <main className={`wed-card${playing || revealed ? ' backdrop' : ''}${revealed ? ' revealed' : ''}`}>
        <div className={`wed-scroll${playing || revealed ? ' flowing' : ''}`} ref={scrollRef}>
          <WeddingScore song={song} stepWidth={STEP_WIDTH} activePitches={activePitches} playheadRef={playheadRef} />
        </div>
        <button
          type="button"
          className="wed-reveal"
          style={{ height: gridHeight }}
          onClick={showScore}
          tabIndex={revealed ? 0 : -1}
          aria-hidden={!revealed}
          title="クリックで譜面に戻る"
        >
          <img src={revealImage} alt="" />
        </button>
      </main>

      <div className="wed-controls">
        <button className={`wed-play${playing ? ' playing' : ''}`} onClick={playing ? stop : play}>
          {playing ? '■ Stop' : '▶ Start'}
        </button>
      </div>
    </div>
  );
}
