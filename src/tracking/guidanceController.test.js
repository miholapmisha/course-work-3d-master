import { describe, expect, it } from "vitest";
import {
  computeLos,
  createGuidanceState,
  stepGuidance,
  wrapAngle,
} from "./guidanceController";

describe("guidanceController", () => {
  describe("wrapAngle", () => {
    it("keeps angles within [-PI, PI]", () => {
      expect(wrapAngle(0)).toBe(0);
      expect(wrapAngle(Math.PI)).toBeCloseTo(Math.PI);
      expect(wrapAngle(Math.PI + 0.5)).toBeCloseTo(-Math.PI + 0.5);
      expect(wrapAngle(-Math.PI - 0.5)).toBeCloseTo(Math.PI - 0.5);
    });
  });

  describe("computeLos", () => {
    it("computes LOS angles correctly for directly ahead target", () => {
      const drone = { x: 0, y: 10, z: 0 };
      const target = { x: 0, y: 0, z: 10 };
      const los = computeLos(drone, target);
      expect(los.azim).toBeCloseTo(0); // Z-axis forward
      expect(los.elev).toBeCloseTo(-Math.PI / 4); // 45 degrees downward
      expect(los.distance).toBeCloseTo(Math.SQRT2 * 10);
    });

    it("computes azimuth angle for target to the right (+X)", () => {
      const drone = { x: 0, y: 10, z: 0 };
      const target = { x: 10, y: 10, z: 0 };
      const los = computeLos(drone, target);
      expect(los.azim).toBeCloseTo(Math.PI / 2);
      expect(los.elev).toBeCloseTo(0);
      expect(los.distance).toBeCloseTo(10);
    });
  });

  describe("stepGuidance", () => {
    it("stays inactive with zero velocity when tracking is false", () => {
      const s0 = createGuidanceState();
      const res = stepGuidance(s0, {
        dronePos: { x: 0, y: 10, z: 0 },
        targetPos: { x: 0, y: 0, z: 20 },
        tracking: false,
        dt: 0.1,
      });
      expect(res.state.active).toBe(false);
      expect(res.velocity).toEqual({ x: 0, y: 0, z: 0 });
      expect(res.intercepted).toBe(false);
    });

    it("initializes velocity direction along LOS upon initial detection", () => {
      const s0 = createGuidanceState();
      const res = stepGuidance(s0, {
        dronePos: { x: 0, y: 10, z: 0 },
        targetPos: { x: 0, y: 10, z: 20 },
        tracking: true,
        dt: 1.0,
        params: { approachSpeed: 5, maxAccel: 10 },
      });

      expect(res.state.active).toBe(true);
      expect(res.velocity.x).toBeCloseTo(0);
      expect(res.velocity.y).toBeCloseTo(0);
      expect(res.velocity.z).toBeCloseTo(5);
      expect(res.state.prevQ).not.toBeNull();
    });

    it("PNG steers velocity proportionally when target maneuvers laterally", () => {
      const s0 = createGuidanceState();
      // First tick: target directly forward at z=20
      const step1 = stepGuidance(s0, {
        dronePos: { x: 0, y: 10, z: 0 },
        targetPos: { x: 0, y: 10, z: 20 },
        tracking: true,
        dt: 0.1,
        params: { approachSpeed: 10, pngGain: 3, maxAccel: 100 },
      });

      // Target moves to the right (+X)
      const step2 = stepGuidance(step1.state, {
        dronePos: { x: 0, y: 10, z: 1 },
        targetPos: { x: 2, y: 10, z: 20 },
        tracking: true,
        dt: 0.1,
        params: { approachSpeed: 10, pngGain: 3, maxAccel: 100 },
      });

      // Azimuth of velocity should lead the target (positive X velocity)
      expect(step2.velocity.x).toBeGreaterThan(0);
      expect(step2.state.sigma.azim).toBeGreaterThan(0);
    });

    it("detects interception and stops when within interceptRadius", () => {
      const s0 = createGuidanceState();
      const res = stepGuidance(s0, {
        dronePos: { x: 0, y: 1.5, z: 10 },
        targetPos: { x: 0, y: 1, z: 10.5 }, // distance ~0.7m < 1.2m
        tracking: true,
        dt: 0.1,
      });

      expect(res.intercepted).toBe(true);
      expect(res.velocity).toEqual({ x: 0, y: 0, z: 0 });
    });

    it("clamps descent when drone reaches minHeight", () => {
      const s0 = createGuidanceState();
      const res = stepGuidance(s0, {
        dronePos: { x: 0, y: 0.4, z: 0 }, // below minHeight (0.5)
        targetPos: { x: 0, y: 0, z: 20 },
        tracking: true,
        dt: 0.1,
        params: { minHeight: 0.5, approachSpeed: 5, maxAccel: 50 },
      });

      expect(res.velocity.y).toBeGreaterThanOrEqual(0);
    });

    it("decelerates smoothly when tracking is lost", () => {
      const s0 = {
        ...createGuidanceState(),
        active: true,
        velocity: { x: 0, y: 0, z: 5 },
      };

      const res = stepGuidance(s0, {
        dronePos: { x: 0, y: 10, z: 0 },
        targetPos: { x: 0, y: 0, z: 20 },
        tracking: false,
        dt: 0.5,
        params: { maxAccel: 4 },
      });

      expect(res.state.active).toBe(false);
      // Velocity should decrease from 5 by (4 * 0.5) = 2 -> 3
      expect(res.velocity.z).toBeCloseTo(3);
    });
  });
});
