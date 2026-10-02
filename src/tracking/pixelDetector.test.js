import { describe, expect, it } from "vitest";
import { MIN_PIXELS, detectRedTarget, isTargetRed } from "./pixelDetector";

const RED = [255, 0, 0];
const SHADED_RED = [90, 12, 10];
const ORANGE = [255, 165, 0]; // crates
const AMBER = [255, 179, 0]; // wall strips
const GREY = [48, 48, 48]; // ground

function makeBuffer(width, height, rgb = [0, 0, 0]) {
  const buffer = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) buffer.set([...rgb, 255], i * 4);
  return buffer;
}

// Rows are counted from the BOTTOM, as WebGL returns them.
function paintRect(buffer, width, { col0, col1, row0, row1 }, rgb) {
  for (let row = row0; row <= row1; row++) {
    for (let col = col0; col <= col1; col++) {
      buffer.set([...rgb, 255], (row * width + col) * 4);
    }
  }
}

describe("isTargetRed", () => {
  it("accepts lit and shaded red", () => {
    expect(isTargetRed(...RED)).toBe(true);
    expect(isTargetRed(...SHADED_RED)).toBe(true);
  });

  it("rejects orange, amber, grey and very dark red", () => {
    expect(isTargetRed(...ORANGE)).toBe(false);
    expect(isTargetRed(...AMBER)).toBe(false);
    expect(isTargetRed(...GREY)).toBe(false);
    expect(isTargetRed(60, 0, 0)).toBe(false);
  });
});

describe("detectRedTarget", () => {
  it("returns the NDC box and centre of a red block", () => {
    const buffer = makeBuffer(8, 6);
    paintRect(buffer, 8, { col0: 2, col1: 3, row0: 1, row1: 2 }, RED);
    const detection = detectRedTarget(buffer, 8, 6);
    expect(detection.visible).toBe(true);
    expect(detection.bbox.minX).toBeCloseTo(-0.5);
    expect(detection.bbox.maxX).toBeCloseTo(0);
    expect(detection.bbox.minY).toBeCloseTo(-2 / 3);
    expect(detection.bbox.maxY).toBeCloseTo(0);
    expect(detection.center.x).toBeCloseTo(-0.25);
    expect(detection.center.y).toBeCloseTo(-1 / 3);
  });

  it("treats buffer row 0 as the bottom of the image", () => {
    const buffer = makeBuffer(8, 6);
    paintRect(buffer, 8, { col0: 0, col1: 3, row0: 0, row1: 0 }, RED);
    const detection = detectRedTarget(buffer, 8, 6);
    expect(detection.bbox.minY).toBeCloseTo(-1);
    expect(detection.bbox.maxY).toBeCloseTo(-2 / 3);
  });

  it("finds only the red block among orange crates and amber walls", () => {
    const buffer = makeBuffer(8, 6, ORANGE);
    paintRect(buffer, 8, { col0: 0, col1: 7, row0: 5, row1: 5 }, AMBER);
    paintRect(buffer, 8, { col0: 6, col1: 7, row0: 0, row1: 1 }, RED);
    const detection = detectRedTarget(buffer, 8, 6);
    expect(detection.bbox.minX).toBeCloseTo(0.5);
    expect(detection.bbox.maxX).toBeCloseTo(1);
  });

  it("ignores fewer than MIN_PIXELS red pixels", () => {
    const buffer = makeBuffer(8, 6, GREY);
    paintRect(buffer, 8, { col0: 0, col1: MIN_PIXELS - 2, row0: 0, row1: 0 }, RED);
    expect(detectRedTarget(buffer, 8, 6).visible).toBe(false);
  });

  it("reports nothing for an all-black buffer (first PIXEL read)", () => {
    expect(detectRedTarget(makeBuffer(8, 6), 8, 6).visible).toBe(false);
  });

  it("reports nothing for a too-small or missing buffer", () => {
    expect(detectRedTarget(new Uint8Array(4), 8, 6).visible).toBe(false);
    expect(detectRedTarget(null, 8, 6).visible).toBe(false);
  });
});
