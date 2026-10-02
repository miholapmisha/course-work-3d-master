import { describe, expect, it } from "vitest";
import { MAX_FRAME_DT, advanceDetectionClock, clampFrameDt } from "./detectionClock";

describe("clampFrameDt", () => {
  it("passes normal deltas through", () => {
    expect(clampFrameDt(0.016)).toBe(0.016);
  });

  it("clamps huge deltas and zeroes invalid ones", () => {
    expect(clampFrameDt(5)).toBe(MAX_FRAME_DT);
    expect(clampFrameDt(-1)).toBe(0);
    expect(clampFrameDt(Number.NaN)).toBe(0);
  });
});

describe("advanceDetectionClock", () => {
  it("accumulates below the detection period", () => {
    expect(advanceDetectionClock(0, 0.02, 30)).toEqual({ accumulated: 0.02, tickDt: null });
  });

  it("ticks once a period has accumulated and carries the remainder", () => {
    const { accumulated, tickDt } = advanceDetectionClock(0.02, 0.02, 30);
    expect(tickDt).toBeCloseTo(1 / 30);
    expect(accumulated).toBeCloseTo(0.04 - 1 / 30);
  });

  it("clamps a huge frame delta (background tab) to one short tick without catch-up", () => {
    const first = advanceDetectionClock(0, 5, 30);
    expect(first.tickDt).toBeGreaterThan(0);
    expect(first.tickDt).toBeLessThanOrEqual(MAX_FRAME_DT);
    expect(first.accumulated).toBeLessThanOrEqual(1 / 30 / 2);
    expect(advanceDetectionClock(first.accumulated, 0, 30).tickDt).toBeNull();
  });

  it("treats a non-positive rate as 1 Hz", () => {
    expect(advanceDetectionClock(0, 0.05, 0).tickDt).toBeNull();
    expect(advanceDetectionClock(0.96, 0.05, Number.NaN).tickDt).toBeCloseTo(1);
  });

  describe("with jittered 60 fps frame deltas", () => {
    const SECONDS = 60;
    // Deterministic ±0.2 ms jitter around 1/60 s, like real browser frames.
    const frameDts = Array.from({ length: SECONDS * 60 }, (_, i) => 1 / 60 + (i % 3 - 1) * 0.0002);
    const run = (detectHz) =>
      frameDts.reduce(
        (acc, dt) => {
          const clock = advanceDetectionClock(acc.accumulated, dt, detectHz);
          return clock.tickDt === null
            ? { ...acc, accumulated: clock.accumulated }
            : { accumulated: clock.accumulated, ticks: acc.ticks + 1, tickTime: acc.tickTime + clock.tickDt };
        },
        { accumulated: 0, ticks: 0, tickTime: 0 }
      );

    it.each([20, 30, 60])("keeps the configured %i Hz rate", (detectHz) => {
      expect(run(detectHz).ticks / SECONDS).toBeCloseTo(detectHz, 0);
    });

    it("accounts for every second of frame time across ticks", () => {
      const total = frameDts.reduce((sum, dt) => sum + dt, 0);
      const { accumulated, tickTime } = run(30);
      expect(tickTime + accumulated).toBeCloseTo(total, 6);
    });
  });
});
