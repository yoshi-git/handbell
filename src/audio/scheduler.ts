import { frequency } from '../model/pitch';
import { totalSteps } from '../model/song';
import type { NoteName, Song } from '../model/types';
import { strikeBell } from './bell';

export interface PlayOptions {
  fromStep: number;
  loop: boolean;
  onStep: (step: number) => void;
  /** Called every animation frame with the fractional step position (for the playhead). */
  onPosition?: (pos: number) => void;
  onEnd: () => void;
}

const LOOK_AHEAD = 0.12; // seconds of audio scheduled ahead
const TICK_MS = 25;

/** Look-ahead scheduler (Web Audio clock) driving bell strikes and a step callback for the UI. */
export class Player {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private timer: number | null = null;
  private raf: number | null = null;
  private song: Song | null = null;
  private opts: PlayOptions | null = null;
  private startTime = 0;
  private startStep = 0;
  private nextStep = 0;
  private lastReported = -1;

  get playing(): boolean {
    return this.timer !== null;
  }

  private stepDur(): number {
    return 60 / this.song!.tempo / this.song!.subdivisions;
  }

  /** Swap song data (e.g. tempo changes) without restarting. */
  update(song: Song): void {
    if (!this.playing || !this.song || !this.ctx) {
      this.song = song;
      return;
    }
    if (song.tempo !== this.song.tempo || song.subdivisions !== this.song.subdivisions) {
      // Re-anchor the clock so the playhead doesn't jump.
      const now = this.ctx.currentTime;
      const cur = this.startStep + (now - this.startTime) / this.stepDur();
      this.song = song;
      this.startStep = cur;
      this.startTime = now;
    } else {
      this.song = song;
    }
  }

  async start(song: Song, opts: PlayOptions): Promise<void> {
    this.stop();
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.8;
      const comp = this.ctx.createDynamicsCompressor();
      this.master.connect(comp).connect(this.ctx.destination);
    }
    await this.ctx.resume();
    this.song = song;
    this.opts = opts;
    this.startStep = opts.fromStep;
    this.nextStep = opts.fromStep;
    this.startTime = this.ctx.currentTime + 0.08;
    this.lastReported = -1;
    this.timer = window.setInterval(() => this.tick(), TICK_MS);
    this.tick();
    const frame = () => {
      this.report();
      if (this.playing) this.raf = requestAnimationFrame(frame);
    };
    this.raf = requestAnimationFrame(frame);
  }

  stop(): void {
    if (this.timer !== null) window.clearInterval(this.timer);
    if (this.raf !== null) cancelAnimationFrame(this.raf);
    this.timer = null;
    this.raf = null;
    // Silence anything still ringing.
    if (this.ctx && this.master) {
      const old = this.master;
      old.gain.setTargetAtTime(0, this.ctx.currentTime, 0.03);
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.8;
      this.master.connect(this.ctx.destination);
      setTimeout(() => old.disconnect(), 300);
    }
  }

  /** Strikes a single bell immediately (used when clicking a note name). */
  async preview(pitch: NoteName, seconds = 1.2): Promise<void> {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.8;
      this.master.connect(this.ctx.destination);
    }
    await this.ctx.resume();
    strikeBell(this.ctx, this.master!, frequency(pitch), this.ctx.currentTime + 0.01, seconds);
  }

  private timeOf(step: number): number {
    return this.startTime + (step - this.startStep) * this.stepDur();
  }

  private tick(): void {
    const ctx = this.ctx!;
    const song = this.song!;
    const opts = this.opts!;
    const end = totalSteps(song);
    const horizon = ctx.currentTime + LOOK_AHEAD;
    while (this.timeOf(this.nextStep) < horizon) {
      if (this.nextStep >= end) {
        if (!opts.loop) {
          // Let the last bells ring, then finish.
          if (ctx.currentTime > this.timeOf(end)) {
            this.stop();
            opts.onEnd();
          }
          return;
        }
        // Restart from the loop start, continuing the same clock.
        this.startTime = this.timeOf(end);
        this.startStep = opts.fromStep;
        this.nextStep = opts.fromStep;
        continue;
      }
      const t = this.timeOf(this.nextStep);
      const dur = this.stepDur();
      for (const n of song.notes) {
        if (n.step === this.nextStep) {
          strikeBell(ctx, this.master!, frequency(n.pitch), t, n.length * dur);
        }
      }
      this.nextStep++;
    }
  }

  private report(): void {
    if (!this.ctx || !this.song || !this.opts) return;
    const pos = this.startStep + (this.ctx.currentTime - this.startTime) / this.stepDur();
    const step = Math.max(this.opts.fromStep, Math.floor(pos));
    this.opts.onPosition?.(Math.max(this.opts.fromStep, Math.min(pos, totalSteps(this.song))));
    if (step !== this.lastReported && step < totalSteps(this.song)) {
      this.lastReported = step;
      this.opts.onStep(step);
    }
  }
}
