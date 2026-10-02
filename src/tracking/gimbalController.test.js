import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { TRACKER_STATUS } from "./trackerState";
import {
  TILT_MAX,
  TILT_MIN,
  angularError,
  commandGimbal,
  createGimbal,
  gimbalQuaternion,
  integrateGimbal,
} from "./gimbalController";

const deg = THREE.MathUtils.degToRad;
const { SEARCH, TRACKING, LOST } = TRACKER_STATUS;
const DT = 1 / 30;
const PARAMS = Object.freeze({
  kp: 4,
  kd: 0.1,
  maxRate: deg(90),
  scanRate: deg(30),
  scanTilt: deg(-45),
  vFov: deg(60),
  aspect: 4 / 3,
});

const forwardOf = (pan, tilt) => new THREE.Vector3(0, 0, -1).applyQuaternion(gimbalQuaternion(pan, tilt));

describe("createGimbal", () => {
  it("starts still, with tilt clamped to the limits", () => {
    expect(createGimbal(deg(-45))).toEqual({ pan: 0, tilt: deg(-45), rate: { pan: 0, tilt: 0 }, prevErr: null });
    expect(createGimbal(0).tilt).toBe(TILT_MAX);
    expect(createGimbal(-2).tilt).toBe(TILT_MIN);
  });
});

describe("gimbalQuaternion", () => {
  it("points the camera down by the tilt angle", () => {
    const forward = forwardOf(0, deg(-45));
    expect(forward.x).toBeCloseTo(0);
    expect(forward.y).toBeCloseTo(-Math.SQRT1_2);
    expect(forward.z).toBeCloseTo(-Math.SQRT1_2);
  });

  it("turns left for positive pan", () => {
    expect(forwardOf(0.3, deg(-45)).x).toBeLessThan(0);
  });
});

describe("angularError", () => {
  it("is zero at the centre and half the FOV at the frame edge", () => {
    expect(angularError({ x: 0, y: 0 }, PARAMS)).toEqual({ x: 0, y: 0 });
    expect(angularError({ x: 0, y: 1 }, PARAMS).y).toBeCloseTo(deg(30));
    expect(angularError({ x: 1, y: 0 }, PARAMS).x).toBeCloseTo(Math.atan(Math.tan(deg(30)) * (4 / 3)));
  });
});

describe("commandGimbal", () => {
  it("scans in SEARCH and swings tilt toward scanTilt", () => {
    const gimbal = commandGimbal(createGimbal(deg(-80)), SEARCH, null, DT, PARAMS);
    expect(gimbal.rate.pan).toBeCloseTo(PARAMS.scanRate);
    expect(gimbal.rate.tilt).toBeGreaterThan(0);
    expect(gimbal.prevErr).toBeNull();
  });

  it("never scans faster than maxRate", () => {
    const params = { ...PARAMS, scanRate: deg(180) };
    expect(commandGimbal(createGimbal(deg(-45)), SEARCH, null, DT, params).rate.pan).toBeCloseTo(deg(90));
  });

  it("holds still in LOST and forgets the previous error", () => {
    const tracked = { ...createGimbal(deg(-45)), rate: { pan: 1, tilt: 1 }, prevErr: { x: 0.1, y: 0.1 } };
    const gimbal = commandGimbal(tracked, LOST, null, DT, PARAMS);
    expect(gimbal.rate).toEqual({ pan: 0, tilt: 0 });
    expect(gimbal.prevErr).toBeNull();
  });

  it("holds still in TRACKING without a centre", () => {
    expect(commandGimbal(createGimbal(deg(-45)), TRACKING, null, DT, PARAMS).rate).toEqual({ pan: 0, tilt: 0 });
  });

  it("turns right (pan down) for a target right of centre and up for a target above", () => {
    const start = createGimbal(deg(-45));
    expect(commandGimbal(start, TRACKING, { x: 0.5, y: 0 }, DT, PARAMS).rate.pan).toBeLessThan(0);
    expect(commandGimbal(start, TRACKING, { x: 0, y: 0.5 }, DT, PARAMS).rate.tilt).toBeGreaterThan(0);
  });

  it("has no derivative kick on the first TRACKING tick", () => {
    const center = { x: 0.5, y: 0 };
    const gimbal = commandGimbal(createGimbal(deg(-45)), TRACKING, center, DT, PARAMS);
    expect(gimbal.rate.pan).toBeCloseTo(-PARAMS.kp * angularError(center, PARAMS).x);
  });

  it("adds a derivative term once the error changes", () => {
    const first = commandGimbal(createGimbal(deg(-45)), TRACKING, { x: 0.1, y: 0 }, DT, PARAMS);
    const steady = commandGimbal(first, TRACKING, { x: 0.1, y: 0 }, DT, PARAMS);
    const growing = commandGimbal(first, TRACKING, { x: 0.2, y: 0 }, DT, PARAMS);
    expect(steady.rate.pan).toBeCloseTo(first.rate.pan);
    expect(Math.abs(growing.rate.pan)).toBeGreaterThan(Math.abs(PARAMS.kp * angularError({ x: 0.2, y: 0 }, PARAMS).x));
  });

  it("clamps both rates to maxRate", () => {
    const gimbal = commandGimbal(createGimbal(deg(-45)), TRACKING, { x: 1, y: 1 }, DT, { ...PARAMS, kp: 100 });
    expect(Math.abs(gimbal.rate.pan)).toBeCloseTo(PARAMS.maxRate);
    expect(Math.abs(gimbal.rate.tilt)).toBeCloseTo(PARAMS.maxRate);
  });

  it("does not mutate its input", () => {
    const gimbal = Object.freeze(createGimbal(deg(-45)));
    expect(() => commandGimbal(gimbal, TRACKING, { x: 0.2, y: 0.1 }, DT, PARAMS)).not.toThrow();
  });
});

describe("integrateGimbal", () => {
  it("applies the held rate", () => {
    const gimbal = integrateGimbal({ ...createGimbal(deg(-45)), rate: { pan: 1, tilt: 0.5 } }, 0.1);
    expect(gimbal.pan).toBeCloseTo(0.1);
    expect(gimbal.tilt).toBeCloseTo(deg(-45) + 0.05);
  });

  it("keeps tilt inside its limits", () => {
    const down = { ...createGimbal(TILT_MIN), rate: { pan: 0, tilt: -1 } };
    const up = { ...createGimbal(TILT_MAX), rate: { pan: 0, tilt: 1 } };
    expect(integrateGimbal(down, 1).tilt).toBe(TILT_MIN);
    expect(integrateGimbal(up, 1).tilt).toBe(TILT_MAX);
  });

  it("wraps pan into (-PI, PI]", () => {
    const gimbal = { ...createGimbal(deg(-45)), pan: Math.PI - 0.01, rate: { pan: 1, tilt: 0 } };
    expect(integrateGimbal(gimbal, 0.02).pan).toBeCloseTo(-Math.PI + 0.01);
  });
});

describe("closed loop with a real camera", () => {
  const camera = new THREE.PerspectiveCamera(60, 4 / 3, 0.1, 500);
  const projectFrom = (gimbal, point) => {
    camera.quaternion.copy(gimbalQuaternion(gimbal.pan, gimbal.tilt));
    camera.updateMatrixWorld();
    const p = point.clone().project(camera);
    return { x: p.x, y: p.y };
  };
  const track = (gimbal, point, steps) => {
    let g = gimbal;
    for (let i = 0; i < steps; i++) {
      g = integrateGimbal(commandGimbal(g, TRACKING, projectFrom(g, point), DT, PARAMS), DT);
    }
    return g;
  };

  it("drives a target right of centre back to the centre", () => {
    const start = createGimbal(-0.5);
    const point = forwardOf(-0.2, -0.5).multiplyScalar(10); // 0.2 rad to the right
    expect(projectFrom(start, point).x).toBeGreaterThan(0.1);
    const final = projectFrom(track(start, point, 120), point);
    expect(Math.abs(final.x)).toBeLessThan(0.02);
    expect(Math.abs(final.y)).toBeLessThan(0.02);
  });

  it("stays finite and inside tilt limits near nadir (keyhole)", () => {
    const start = createGimbal(TILT_MIN);
    const point = new THREE.Vector3(0.05, -20, 0.05); // almost straight below
    const final = track(start, point, 120);
    expect(Number.isFinite(final.pan)).toBe(true);
    expect(final.tilt).toBeGreaterThanOrEqual(TILT_MIN);
    expect(final.tilt).toBeLessThanOrEqual(TILT_MAX);
  });
});
