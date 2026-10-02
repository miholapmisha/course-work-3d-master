import { describe, expect, it } from "vitest";
import { drawPovOverlay } from "./drawPovOverlay";
import { TRACKER_STATUS } from "../tracking/trackerState";

function fakeContext(width = 320, height = 240) {
  const calls = [];
  const record = (name) => (...args) => calls.push([name, ...args]);
  return {
    canvas: { width, height },
    calls,
    clearRect: record("clearRect"),
    beginPath: record("beginPath"),
    moveTo: record("moveTo"),
    lineTo: record("lineTo"),
    stroke: record("stroke"),
    strokeRect: record("strokeRect"),
    fillText: record("fillText"),
  };
}

const callsNamed = (ctx, name) => ctx.calls.filter(([n]) => n === name);

describe("drawPovOverlay", () => {
  it("clears the canvas and prints the status", () => {
    const ctx = fakeContext();
    drawPovOverlay(ctx, { status: TRACKER_STATUS.SEARCH, bbox: null });
    expect(callsNamed(ctx, "clearRect")).toEqual([["clearRect", 0, 0, 320, 240]]);
    expect(callsNamed(ctx, "fillText")[0][1]).toBe(TRACKER_STATUS.SEARCH);
    expect(callsNamed(ctx, "strokeRect")).toHaveLength(0);
  });

  it("draws the bbox in canvas pixels", () => {
    const ctx = fakeContext();
    drawPovOverlay(ctx, { status: TRACKER_STATUS.TRACKING, bbox: { minX: -1, minY: -1, maxX: 0, maxY: 0 } });
    expect(callsNamed(ctx, "strokeRect")).toEqual([["strokeRect", 0, 120, 160, 120]]);
  });
});
