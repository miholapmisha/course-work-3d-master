import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

function createMemoryStorage() {
  const data = new Map();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key),
  };
}

let mod;

beforeAll(async () => {
  vi.stubGlobal("localStorage", createMemoryStorage()); // Node has no localStorage
  mod = await import("./useFlyingObjectParams");
});

beforeEach(() => mod.useFlyingObjectParams.getState().reset());

describe("useFlyingObjectParams", () => {
  it("starts from the defaults in geometry mode", () => {
    const state = mod.useFlyingObjectParams.getState();
    expect(state.height).toBe(mod.DEFAULT_FLYING_OBJECT_PARAMS.height);
    expect(state.detectMode).toBe(mod.DETECT_MODES.GEOMETRY);
  });

  it("has metadata for every numeric parameter", () => {
    expect(Object.keys(mod.FLYING_OBJECT_PARAM_META)).toEqual(Object.keys(mod.DEFAULT_FLYING_OBJECT_PARAMS));
  });

  it("clamps values into the metadata range and parses strings", () => {
    const { setParam } = mod.useFlyingObjectParams.getState();
    setParam("height", "1000");
    setParam("scanTilt", 10);
    expect(mod.useFlyingObjectParams.getState().height).toBe(mod.FLYING_OBJECT_PARAM_META.height.max);
    expect(mod.useFlyingObjectParams.getState().scanTilt).toBe(mod.FLYING_OBJECT_PARAM_META.scanTilt.max);
  });

  it("ignores unknown keys and NaN", () => {
    const before = mod.useFlyingObjectParams.getState();
    before.setParam("nope", 1);
    before.setParam("height", "abc");
    expect(mod.useFlyingObjectParams.getState().height).toBe(before.height);
    expect(mod.useFlyingObjectParams.getState().nope).toBeUndefined();
  });

  it("switches detect mode and rejects unknown modes", () => {
    const { setDetectMode } = mod.useFlyingObjectParams.getState();
    setDetectMode(mod.DETECT_MODES.PIXEL);
    setDetectMode("laser");
    expect(mod.useFlyingObjectParams.getState().detectMode).toBe(mod.DETECT_MODES.PIXEL);
  });

  it("reset restores defaults and the default mode", () => {
    const state = mod.useFlyingObjectParams.getState();
    state.setParam("fov", 30);
    state.setDetectMode(mod.DETECT_MODES.PIXEL);
    state.reset();
    expect(mod.useFlyingObjectParams.getState().fov).toBe(mod.DEFAULT_FLYING_OBJECT_PARAMS.fov);
    expect(mod.useFlyingObjectParams.getState().detectMode).toBe(mod.DEFAULT_DETECT_MODE);
  });
});
