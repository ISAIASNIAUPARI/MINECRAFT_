import { MAX_FRAME_MS, MAX_TICKS_PER_FRAME, TICK_DURATION_S } from '../core/constants';

/**
 * Fixed-timestep game loop with a render interpolation factor.
 *
 * `update(dt)` is called a whole number of times per frame, each with the same
 * constant `dt` (= {@link TICK_DURATION_S}), so simulation is deterministic and
 * frame-rate independent. `render(alpha)` is called once per frame; `alpha` is
 * the 0..1 fraction into the next tick, for interpolating visuals.
 *
 * See https://gafferongames.com/post/fix_your_timestep/
 */
export interface GameLoopCallbacks {
  update(dt: number): void;
  render(alpha: number): void;
  /** Optional once-per-second callback for stats/telemetry. */
  onSecond?(fps: number): void;
}

export class GameLoop {
  private running = false;
  private rafId = 0;
  private accumulator = 0;
  private lastTime = 0;

  private frameCount = 0;
  private secondTimer = 0;
  private measuredFps = 0;

  constructor(private readonly cb: GameLoopCallbacks) {}

  get fps(): number {
    return this.measuredFps;
  }

  get isRunning(): boolean {
    return this.running;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.accumulator = 0;
    this.rafId = requestAnimationFrame(this.frame);
  }

  stop(): void {
    this.running = false;
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = 0;
  }

  /** Advance the simulation manually — used by tests, which never call `start()`. */
  advance(elapsedSeconds: number): void {
    this.accumulator += elapsedSeconds;
    let ticks = 0;
    while (this.accumulator >= TICK_DURATION_S && ticks < MAX_TICKS_PER_FRAME) {
      this.cb.update(TICK_DURATION_S);
      this.accumulator -= TICK_DURATION_S;
      ticks++;
    }
    this.cb.render(this.accumulator / TICK_DURATION_S);
  }

  private readonly frame = (now: number): void => {
    if (!this.running) return;
    this.rafId = requestAnimationFrame(this.frame);

    let frameMs = now - this.lastTime;
    this.lastTime = now;
    if (frameMs > MAX_FRAME_MS) frameMs = MAX_FRAME_MS; // clamp huge stalls
    const frameSeconds = frameMs / 1000;

    this.accumulator += frameSeconds;
    let ticks = 0;
    while (this.accumulator >= TICK_DURATION_S && ticks < MAX_TICKS_PER_FRAME) {
      this.cb.update(TICK_DURATION_S);
      this.accumulator -= TICK_DURATION_S;
      ticks++;
    }
    // If we hit the tick ceiling, drop the backlog rather than spiral.
    if (ticks >= MAX_TICKS_PER_FRAME) this.accumulator = 0;

    const alpha = this.accumulator / TICK_DURATION_S;
    this.cb.render(alpha);

    this.frameCount++;
    this.secondTimer += frameSeconds;
    if (this.secondTimer >= 1) {
      this.measuredFps = this.frameCount / this.secondTimer;
      this.cb.onSecond?.(this.measuredFps);
      this.frameCount = 0;
      this.secondTimer = 0;
    }
  };
}
