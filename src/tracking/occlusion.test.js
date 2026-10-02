import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { makeOcclusionTest } from "./occlusion";

class FakeRay {
  constructor(origin, dir) {
    this.origin = origin;
    this.dir = dir;
  }
}

const rapier = { Ray: FakeRay };
const TARGET_HANDLE = 7;
const ORIGIN = new THREE.Vector3(0, 20, 0);
const POINT = new THREE.Vector3(0, 0, 0); // 20 m straight down

const hitOn = (handle, timeOfImpact) => ({
  collider: { parent: () => (handle === null ? null : { handle }) },
  timeOfImpact,
});
const worldReturning = (hit) => ({ castRay: vi.fn(() => hit) });

describe("makeOcclusionTest", () => {
  it("is not occluded when the ray hits nothing", () => {
    expect(makeOcclusionTest(worldReturning(null), rapier, ORIGIN, TARGET_HANDLE)(POINT)).toBe(false);
  });

  it("is not occluded when the first hit is the target itself", () => {
    const world = worldReturning(hitOn(TARGET_HANDLE, 19.5));
    expect(makeOcclusionTest(world, rapier, ORIGIN, TARGET_HANDLE)(POINT)).toBe(false);
  });

  it("is occluded when another body is hit before the point", () => {
    const world = worldReturning(hitOn(3, 10));
    expect(makeOcclusionTest(world, rapier, ORIGIN, TARGET_HANDLE)(POINT)).toBe(true);
  });

  it("is not occluded when another body is hit at the point itself", () => {
    const world = worldReturning(hitOn(3, 19.99));
    expect(makeOcclusionTest(world, rapier, ORIGIN, TARGET_HANDLE)(POINT)).toBe(false);
  });

  it("treats a parentless collider in the way as an occluder", () => {
    const world = worldReturning(hitOn(null, 5));
    expect(makeOcclusionTest(world, rapier, ORIGIN, TARGET_HANDLE)(POINT)).toBe(true);
  });

  it("skips the ray cast for a point at the origin", () => {
    const world = worldReturning(hitOn(3, 0));
    expect(makeOcclusionTest(world, rapier, ORIGIN, TARGET_HANDLE)(ORIGIN.clone())).toBe(false);
    expect(world.castRay).not.toHaveBeenCalled();
  });

  it("casts a unit-length ray limited to the point distance", () => {
    const world = worldReturning(null);
    makeOcclusionTest(world, rapier, ORIGIN, TARGET_HANDLE)(POINT);
    const [ray, maxToi, solid] = world.castRay.mock.calls[0];
    expect(ray.dir.length()).toBeCloseTo(1);
    expect(ray.dir.y).toBeCloseTo(-1);
    expect(maxToi).toBeCloseTo(20);
    expect(solid).toBe(true);
  });
});
