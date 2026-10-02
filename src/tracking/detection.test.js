import { describe, expect, it } from "vitest";
import { NO_DETECTION, makeDetection, ndcRectToPixels } from "./detection";

describe("makeDetection", () => {
  it("marks the detection visible and centres it in the bbox", () => {
    const detection = makeDetection({ minX: -0.5, minY: -1, maxX: 0.5, maxY: 0 });
    expect(detection.visible).toBe(true);
    expect(detection.center).toEqual({ x: 0, y: -0.5 });
  });
});

describe("NO_DETECTION", () => {
  it("is invisible and frozen", () => {
    expect(NO_DETECTION).toEqual({ visible: false, bbox: null, center: null });
    expect(Object.isFrozen(NO_DETECTION)).toBe(true);
  });
});

describe("ndcRectToPixels", () => {
  it("maps the bottom-left NDC quadrant to the bottom-left of the canvas", () => {
    const rect = ndcRectToPixels({ minX: -1, minY: -1, maxX: 0, maxY: 0 }, 320, 240);
    expect(rect).toEqual({ x: 0, y: 120, width: 160, height: 120 });
  });

  it("maps the full frame to the full canvas", () => {
    const rect = ndcRectToPixels({ minX: -1, minY: -1, maxX: 1, maxY: 1 }, 320, 240);
    expect(rect).toEqual({ x: 0, y: 0, width: 320, height: 240 });
  });
});
