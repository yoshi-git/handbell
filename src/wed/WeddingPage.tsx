import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Player } from '../audio/scheduler';
import { parseSong } from '../model/serialize';
import { stepsPerMeasure } from '../model/song';
import type { NoteName, Song } from '../model/types';
import aladdin from '../samples/aladdin.bellscore.json';
import { WeddingScore } from './WeddingScore';

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
  const playheadRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  /** After stopping or reaching the end: hide the playhead and glide back to the start. */
  const finish = useCallback(() => {
    setPlaying(false);
    setActiveStep(null);
    if (playheadRef.current) playheadRef.current.style.display = 'none';
    scrollRef.current?.scrollTo({ left: 0, behavior: 'smooth' });
  }, []);

  const stop = useCallback(() => {
    player.current!.stop();
    finish();
  }, [finish]);

  const play = useCallback(() => {
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
      onEnd: finish,
    });
  }, [song, finish]);

  useEffect(() => () => player.current!.stop(), []);

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

      <main className="wed-card">
        <div className={`wed-scroll${playing ? ' flowing' : ''}`} ref={scrollRef}>
          <WeddingScore song={song} stepWidth={STEP_WIDTH} activePitches={activePitches} playheadRef={playheadRef} />
        </div>
      </main>

      <div className="wed-controls">
        <button className={`wed-play${playing ? ' playing' : ''}`} onClick={playing ? stop : play}>
          {playing ? '■ Stop' : '▶ Start'}
        </button>
      </div>
    </div>
  );
}
