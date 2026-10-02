import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { detectByProjection } from "./geometryDetector";

const NEVER_OCCLUDED = () => false;

// At the origin, looking down -Z. Half-width of the view at 10 m ≈ 7.70 m.
function makeCamera() {
  const camera = new THREE.PerspectiveCamera(60, 4 / 3, 0.1, 500);
  camera.updateMatrixWorld();
  return camera;
}

function makeTarget(x, y, z, yaw = 0) {
  return {
    center: new THREE.Vector3(x, y, z),
    quaternion: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw),
    halfExtents: new THREE.Vector3(0.5, 0.25, 1),
  };
}

const widthOf = ({ bbox }) => bbox.maxX - bbox.minX;

describe("detectByProjection", () => {
  it("boxes a target straight ahead around the frame centre", () => {
    const detection = detectByProjection(makeTarget(0, 0, -10), makeCamera(), NEVER_OCCLUDED);
    expect(detection.visible).toBe(true);
    expect(detection.center.x).toBeCloseTo(0);
    expect(detection.center.y).toBeCloseTo(0);
    expect(detection.bbox.minX).toBeLessThan(0);
    expect(detection.bbox.maxX).toBeGreaterThan(0);
  });

  it("does not see a target behind the camera", () => {
    expect(detectByProjection(makeTarget(0, 0, 10), makeCamera(), NEVER_OCCLUDED).visible).toBe(false);
  });

  it("clips a target that straddles the right edge", () => {
    const detection = detectByProjection(makeTarget(7.7, 0, -10), makeCamera(), NEVER_OCCLUDED);
    expect(detection.visible).toBe(true);
    expect(detection.bbox.maxX).toBe(1);
    expect(detection.bbox.minX).toBeLessThan(1);
  });

  it("does not see a target fully outside the frame", () => {
    expect(detectByProjection(makeTarget(30, 0, -10), makeCamera(), NEVER_OCCLUDED).visible).toBe(false);
  });

  it("does not see a fully occluded target", () => {
    expect(detectByProjection(makeTarget(0, 0, -10), makeCamera(), () => true).visible).toBe(false);
  });

  it("still sees a target when only the centre is occluded", () => {
    const target = makeTarget(0, 0, -10);
    const detection = detectByProjection(target, makeCamera(), (p) => p === target.center);
    expect(detection.visible).toBe(true);
  });

  it("uses the target orientation", () => {
    const camera = makeCamera();
    const lengthwise = detectByProjection(makeTarget(0, 0, -10), camera, NEVER_OCCLUDED);
    const sideways = detectByProjection(makeTarget(0, 0, -10, Math.PI / 2), camera, NEVER_OCCLUDED);
    expect(widthOf(sideways)).toBeGreaterThan(widthOf(lengthwise));
  });
});
