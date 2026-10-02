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

  it("ticks with the accumulated time once the period is reached", () => {
    const { accumulated, tickDt } = advanceDetectionClock(0.02, 0.02, 30);
    expect(accumulated).toBe(0);
    expect(tickDt).toBeCloseTo(0.04);
  });

  it("clamps a huge frame delta (background tab) to one short tick", () => {
    expect(advanceDetectionClock(0, 5, 30)).toEqual({ accumulated: 0, tickDt: MAX_FRAME_DT });
  });

  it("treats a non-positive rate as 1 Hz", () => {
    expect(advanceDetectionClock(0, 0.05, 0).tickDt).toBeNull();
    expect(advanceDetectionClock(0.96, 0.05, Number.NaN).tickDt).toBeCloseTo(1.01);
  });
});
