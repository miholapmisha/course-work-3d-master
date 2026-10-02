# Flying Object POV Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a stationary observer flying object with a pan/tilt gimbal camera that finds the ground target, keeps it centred, and shows its camera feed in a POV window with a tracking overlay.

**Architecture:** All maths lives in pure, unit-tested modules under `src/tracking/` (detectors, tracker state machine, gimbal controller, detection clock). A single R3F hook (`useFlyingObjectTracking`) wires them together each frame: integrate gimbal → sync POV camera → (on detection tick) detect → step tracker → command gimbal → render POV into an FBO. The FBO is shown through a drei `<Hud>` plane; an HTML canvas overlay draws the box/crosshair/status from a transient Zustand store.

**Tech Stack:** React 19, @react-three/fiber 9, @react-three/drei 10 (`Hud`, `useFBO`, `OrthographicCamera`), @react-three/rapier 2 (Rapier 0.19 ray casts), three 0.184, Zustand 5, Vitest 5.

**Spec:** `docs/superpowers/specs/2026-10-02-flying-object-pov-tracking-design.md`

## Global Constraints

- The flying object NEVER moves: its position comes only from `posX` / `height` / `posZ` params. No code may move the flying object toward the target.
- Do not modify `src/components/Target.jsx` or anything in `docs/coursework/`; never stage them (the user has uncommitted work there). Always `git add` explicit paths.
- Source style in `src/`: double quotes, semicolons, 2-space indent. `vite.config.js` keeps its existing single-quote/no-semicolon style.
- Modules in `src/tracking/` import no React, never touch the scene graph, and never mutate their inputs (return new objects).
- Functions < 50 lines, files < 400 lines.
- `useFrame` callbacks use the default priority 0 — drei `<Hud>` owns priority 1 and renders the main scene.
- POV FBO: 320×240, `type: THREE.UnsignedByteType`, `colorSpace: THREE.SRGBColorSpace`; pixel thresholds are in sRGB bytes.
- Coverage for `src/tracking/**` ≥ 80% (lines, functions, branches, statements).
- Commit messages: conventional (`feat:`, `test:`, `docs:`, `chore:`) and end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Target passes almost directly under the flying object (keyhole near nadir)** — gimbal must stay within `[TILT_MIN, TILT_MAX]`, values stay finite, no throw. → Task 4 test "stays finite and inside tilt limits near nadir".
2. **Background tab / huge frame delta** — one tick at most, `dt` clamped to 0.1 s, no gimbal jump. → Task 3 test "clamps a huge frame delta".
3. **Target partly out of frame or partly behind a crate** — still detected, box clipped to the frame. → Task 2 tests "straddles the right edge" and "only the centre is occluded".
4. **Switching to PIXEL mode (first read is an empty/black buffer) or a buffer of the wrong size** — no throw, reported as not visible, tracker goes LOST and re-acquires. → Task 1 tests "all-black buffer" and "too-small buffer"; Task 3 LOST→TRACKING test.
5. **Browser window resize** — HUD plane and HTML overlay stay aligned bottom-left. → Task 7 manual step with `browser_resize`.

---

## File Map

| Path | Status | Responsibility |
|---|---|---|
| `vite.config.js` | modify | Vitest config + coverage gate |
| `package.json` | modify | `test`, `test:watch`, `test:coverage` scripts; dev deps |
| `.gitignore` | modify | ignore `coverage/` |
| `src/tracking/detection.js` | create | `NO_DETECTION`, `makeDetection`, `ndcRectToPixels` |
| `src/tracking/pixelDetector.js` | create | red-pixel detection on an RGBA buffer |
| `src/tracking/geometryDetector.js` | create | projected bounding box + occlusion samples |
| `src/tracking/occlusion.js` | create | Rapier ray-cast occlusion test factory |
| `src/tracking/trackerState.js` | create | SEARCH/TRACKING/LOST state machine |
| `src/tracking/detectionClock.js` | create | frame-dt clamp + detection tick clock |
| `src/tracking/gimbalController.js` | create | gimbal command (PD / scan / hold) + integration + pose |
| `src/state/useFlyingObjectParams.js` | create | persisted flying object params + `detectMode` |
| `src/state/useTrackerStore.js` | create | transient `{ status, bbox, center }` |
| `src/components/ParamPanel.jsx` | modify | presentational panel (`title, meta, values, onChange, onReset`) |
| `src/components/ParamPanels.jsx` | create | container + target/flying object panel wrappers |
| `src/components/ParamPanel.css` | modify | positioning moves to `.param-panels` |
| `src/components/povLayout.js` | create | POV size/margin constants |
| `src/hooks/useFlyingObjectTracking.js` | create | per-frame wiring |
| `src/components/FlyingObject.jsx` | create | airframe mesh, FBO, renders `FlyingObjectPov` |
| `src/components/FlyingObjectPov.jsx` | create | `<Hud>` plane showing the FBO |
| `src/components/drawPovOverlay.js` | create | canvas 2D drawing of box/crosshair/status |
| `src/components/PovOverlay.jsx` / `.css` | create | overlay canvas + GEOM/PIXEL button |
| `src/components/Environment.jsx` | modify | wall strips `#ff5252` → `#ffb300` |
| `src/App.jsx` | modify | mount `ParamPanels`, `Flying object`, `PovOverlay` |
| `CLAUDE.md`, `docs/PARAMETERS.md` | modify | docs |

---

### Task 1: Test infrastructure, detection contract, pixel detector

**Files:**
- Modify: `package.json`, `vite.config.js`, `.gitignore`
- Create: `src/tracking/detection.js`, `src/tracking/detection.test.js`, `src/tracking/pixelDetector.js`, `src/tracking/pixelDetector.test.js`

**Interfaces:**
- Produces:
  - `NO_DETECTION: { visible: false, bbox: null, center: null }` (frozen)
  - `makeDetection(bbox: {minX,minY,maxX,maxY}) → { visible: true, bbox, center: {x,y} }` — NDC, Y up
  - `ndcRectToPixels(bbox, width, height) → { x, y, width, height }` — canvas pixels, origin top-left
  - `isTargetRed(r, g, b) → boolean`, `detectRedTarget(pixels: Uint8Array, width, height) → Detection`
  - constants `MIN_RED = 80`, `MAX_GB_TO_R_RATIO = 0.35`, `MIN_PIXELS = 4`

- [ ] **Step 1: Install Vitest and add scripts**

```bash
npm install -D vitest@^5.0.3 @vitest/coverage-v8@^5.0.3
npm pkg set scripts.test="vitest run" scripts.test:watch="vitest" scripts.test:coverage="vitest run --coverage"
grep -qx "coverage" .gitignore || printf "\ncoverage\n" >> .gitignore
```

- [ ] **Step 2: Configure Vitest in `vite.config.js`** (replace the whole file)

```js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.js'],
    coverage: {
      provider: 'v8',
      include: ['src/tracking/**/*.js'],
      exclude: ['src/tracking/**/*.test.js'],
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
})
```

- [ ] **Step 3: Write failing tests `src/tracking/detection.test.js`**

```js
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
```

- [ ] **Step 4: Write failing tests `src/tracking/pixelDetector.test.js`**

```js
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
```

- [ ] **Step 5: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `Failed to resolve import "./detection"` / `"./pixelDetector"`.

- [ ] **Step 6: Implement `src/tracking/detection.js`**

```js
// Shared detection contract: bbox and center are in NDC [-1, 1], Y axis up.
export const NO_DETECTION = Object.freeze({ visible: false, bbox: null, center: null });

export function makeDetection(bbox) {
  return {
    visible: true,
    bbox,
    center: { x: (bbox.minX + bbox.maxX) / 2, y: (bbox.minY + bbox.maxY) / 2 },
  };
}

// NDC rectangle -> canvas pixels (origin top-left, Y down).
export function ndcRectToPixels(bbox, width, height) {
  return {
    x: ((bbox.minX + 1) / 2) * width,
    y: ((1 - bbox.maxY) / 2) * height,
    width: ((bbox.maxX - bbox.minX) / 2) * width,
    height: ((bbox.maxY - bbox.minY) / 2) * height,
  };
}
```

- [ ] **Step 7: Implement `src/tracking/pixelDetector.js`**

```js
import { NO_DETECTION, makeDetection } from "./detection";

// Thresholds apply to sRGB-encoded bytes (the POV render target is sRGB).
export const MIN_RED = 80;
export const MAX_GB_TO_R_RATIO = 0.35;
export const MIN_PIXELS = 4;

export function isTargetRed(r, g, b) {
  return r >= MIN_RED && g <= MAX_GB_TO_R_RATIO * r && b <= MAX_GB_TO_R_RATIO * r;
}

// pixels: RGBA bytes from readRenderTargetPixels. Row 0 is the BOTTOM of the
// image, which already matches the upward Y axis of NDC.
export function detectRedTarget(pixels, width, height) {
  if (!pixels || width <= 0 || height <= 0 || pixels.length < width * height * 4) {
    return NO_DETECTION;
  }
  const bounds = scanRedBounds(pixels, width, height);
  if (bounds.count < MIN_PIXELS) return NO_DETECTION;
  return makeDetection({
    minX: (bounds.minCol / width) * 2 - 1,
    maxX: ((bounds.maxCol + 1) / width) * 2 - 1,
    minY: (bounds.minRow / height) * 2 - 1,
    maxY: ((bounds.maxRow + 1) / height) * 2 - 1,
  });
}

function scanRedBounds(pixels, width, height) {
  let count = 0;
  let minCol = width;
  let maxCol = -1;
  let minRow = height;
  let maxRow = -1;
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const i = (row * width + col) * 4;
      if (!isTargetRed(pixels[i], pixels[i + 1], pixels[i + 2])) continue;
      count++;
      if (col < minCol) minCol = col;
      if (col > maxCol) maxCol = col;
      if (row < minRow) minRow = row;
      if (row > maxRow) maxRow = row;
    }
  }
  return { count, minCol, maxCol, minRow, maxRow };
}
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `npm test`
Expected: PASS — 2 files, all tests green.

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json vite.config.js .gitignore src/tracking/detection.js src/tracking/detection.test.js src/tracking/pixelDetector.js src/tracking/pixelDetector.test.js
git commit -m "feat: add vitest setup and red-pixel target detector

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Geometry detector and occlusion test

**Files:**
- Create: `src/tracking/geometryDetector.js`, `src/tracking/geometryDetector.test.js`, `src/tracking/occlusion.js`, `src/tracking/occlusion.test.js`

**Interfaces:**
- Consumes: `NO_DETECTION`, `makeDetection` from `./detection` (Task 1).
- Produces:
  - `detectByProjection(target: { center: Vector3, quaternion: Quaternion, halfExtents: Vector3 }, camera: THREE.Camera, isOccluded: (p: Vector3) => boolean) → Detection` — camera must have up-to-date `matrixWorld`/`matrixWorldInverse`.
  - `makeOcclusionTest(world, rapier, origin: Vector3, targetHandle: number) → (point: Vector3) => boolean`
  - `OCCLUSION_EPSILON = 0.05`

- [ ] **Step 1: Write failing tests `src/tracking/geometryDetector.test.js`**

```js
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
```

- [ ] **Step 2: Write failing tests `src/tracking/occlusion.test.js`**

```js
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
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — cannot resolve `./geometryDetector` and `./occlusion`.

- [ ] **Step 4: Implement `src/tracking/geometryDetector.js`**

```js
import * as THREE from "three";
import { NO_DETECTION, makeDetection } from "./detection";

const CORNER_SIGNS = [
  [-1, -1, -1], [-1, -1, 1], [-1, 1, -1], [-1, 1, 1],
  [1, -1, -1], [1, -1, 1], [1, 1, -1], [1, 1, 1],
];
const TOP_CORNER_SIGNS = CORNER_SIGNS.filter(([, sy]) => sy === 1);

// target: { center: Vector3, quaternion: Quaternion, halfExtents: Vector3 }
// camera: matrixWorld / matrixWorldInverse / projectionMatrix must be current.
// isOccluded: (point: Vector3) => boolean
export function detectByProjection(target, camera, isOccluded) {
  const inFront = boxPoints(target, CORNER_SIGNS).filter((p) => isInFront(camera, p));
  if (inFront.length === 0) return NO_DETECTION;

  const bbox = clipToFrame(boundsOf(inFront.map((p) => p.clone().project(camera))));
  if (!bbox) return NO_DETECTION;

  const samples = [target.center, ...boxPoints(target, TOP_CORNER_SIGNS)];
  if (samples.every((p) => isOccluded(p))) return NO_DETECTION;

  return makeDetection(bbox);
}

function boxPoints({ center, quaternion, halfExtents }, signs) {
  return signs.map(([sx, sy, sz]) =>
    new THREE.Vector3(sx * halfExtents.x, sy * halfExtents.y, sz * halfExtents.z)
      .applyQuaternion(quaternion)
      .add(center)
  );
}

function isInFront(camera, point) {
  return point.clone().applyMatrix4(camera.matrixWorldInverse).z < -camera.near;
}

function boundsOf(points) {
  return {
    minX: Math.min(...points.map((p) => p.x)),
    maxX: Math.max(...points.map((p) => p.x)),
    minY: Math.min(...points.map((p) => p.y)),
    maxY: Math.max(...points.map((p) => p.y)),
  };
}

function clipToFrame(bounds) {
  const clipped = {
    minX: Math.max(bounds.minX, -1),
    maxX: Math.min(bounds.maxX, 1),
    minY: Math.max(bounds.minY, -1),
    maxY: Math.min(bounds.maxY, 1),
  };
  return clipped.minX < clipped.maxX && clipped.minY < clipped.maxY ? clipped : null;
}
```

- [ ] **Step 5: Implement `src/tracking/occlusion.js`**

```js
import * as THREE from "three";

// A ray hit closer than this to the sample point counts as hitting the point.
export const OCCLUSION_EPSILON = 0.05;

// Builds isOccluded(point) for detectByProjection from a Rapier world: the point
// is occluded when the first collider on the ray origin -> point belongs to a
// different body and lies before the point.
export function makeOcclusionTest(world, rapier, origin, targetHandle) {
  return (point) => {
    const direction = new THREE.Vector3().subVectors(point, origin);
    const distance = direction.length();
    if (distance < OCCLUSION_EPSILON) return false;
    direction.divideScalar(distance);

    const hit = world.castRay(new rapier.Ray(origin, direction), distance, true);
    if (!hit) return false;
    if (hit.collider.parent()?.handle === targetHandle) return false;
    return hit.timeOfImpact < distance - OCCLUSION_EPSILON;
  };
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test`
Expected: PASS — 4 files green.

- [ ] **Step 7: Commit**

```bash
git add src/tracking/geometryDetector.js src/tracking/geometryDetector.test.js src/tracking/occlusion.js src/tracking/occlusion.test.js
git commit -m "feat: add geometric target detector with ray-cast occlusion

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Tracker state machine and detection clock

**Files:**
- Create: `src/tracking/trackerState.js`, `src/tracking/trackerState.test.js`, `src/tracking/detectionClock.js`, `src/tracking/detectionClock.test.js`

**Interfaces:**
- Produces:
  - `TRACKER_STATUS = { SEARCH: "SEARCH", TRACKING: "TRACKING", LOST: "LOST" }` (frozen), `CONFIRM_FRAMES = 3`
  - `createTrackerState() → { status: "SEARCH", seenFrames: 0, lostTime: 0 }`
  - `stepTracker(prev, detection: Detection | null, dt: number, { holdTime }) → TrackerState` — called once per detection tick
  - `MAX_FRAME_DT = 0.1`, `clampFrameDt(dt) → number`
  - `advanceDetectionClock(accumulated, frameDt, detectHz) → { accumulated: number, tickDt: number | null }`

- [ ] **Step 1: Write failing tests `src/tracking/trackerState.test.js`**

```js
import { describe, expect, it } from "vitest";
import { CONFIRM_FRAMES, TRACKER_STATUS, createTrackerState, stepTracker } from "./trackerState";

const SEEN = { visible: true };
const UNSEEN = { visible: false };
const OPTS = { holdTime: 1.5 };
const { SEARCH, TRACKING, LOST } = TRACKER_STATUS;

const run = (state, detections, dt = 0.1) =>
  detections.reduce((s, d) => stepTracker(s, d, dt, OPTS), state);

describe("trackerState", () => {
  it("starts in SEARCH", () => {
    expect(createTrackerState()).toEqual({ status: SEARCH, seenFrames: 0, lostTime: 0 });
  });

  it(`needs ${CONFIRM_FRAMES} consecutive sightings to start TRACKING`, () => {
    const almost = run(createTrackerState(), [SEEN, SEEN]);
    expect(almost.status).toBe(SEARCH);
    expect(run(almost, [SEEN]).status).toBe(TRACKING);
  });

  it("resets the confirmation count on a miss", () => {
    const state = run(createTrackerState(), [SEEN, SEEN, UNSEEN, SEEN, SEEN]);
    expect(state.status).toBe(SEARCH);
    expect(state.seenFrames).toBe(2);
  });

  it("goes LOST when a tracked target disappears", () => {
    const tracking = run(createTrackerState(), [SEEN, SEEN, SEEN]);
    expect(run(tracking, [UNSEEN])).toEqual({ status: LOST, seenFrames: 0, lostTime: 0 });
  });

  it("returns to TRACKING when a lost target reappears", () => {
    const lost = run(createTrackerState(), [SEEN, SEEN, SEEN, UNSEEN, UNSEEN]);
    expect(run(lost, [SEEN]).status).toBe(TRACKING);
  });

  it("falls back to SEARCH only after holdTime is exceeded", () => {
    const lost = run(createTrackerState(), [SEEN, SEEN, SEEN, UNSEEN]);
    const atLimit = run(lost, [UNSEEN, UNSEEN, UNSEEN], 0.5); // lostTime = 1.5
    expect(atLimit.status).toBe(LOST);
    expect(run(atLimit, [UNSEEN], 0.5)).toEqual(createTrackerState());
  });

  it("treats a missing detection as not visible", () => {
    const tracking = run(createTrackerState(), [SEEN, SEEN, SEEN]);
    expect(stepTracker(tracking, null, 0.1, OPTS).status).toBe(LOST);
  });

  it("recovers from an unknown status", () => {
    expect(stepTracker({ status: "BOGUS" }, SEEN, 0.1, OPTS)).toEqual(createTrackerState());
  });

  it("does not mutate the previous state", () => {
    const prev = Object.freeze(createTrackerState());
    expect(() => stepTracker(prev, SEEN, 0.1, OPTS)).not.toThrow();
  });
});
```

- [ ] **Step 2: Write failing tests `src/tracking/detectionClock.test.js`**

```js
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
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — cannot resolve `./trackerState` and `./detectionClock`.

- [ ] **Step 4: Implement `src/tracking/trackerState.js`**

```js
export const TRACKER_STATUS = Object.freeze({
  SEARCH: "SEARCH",
  TRACKING: "TRACKING",
  LOST: "LOST",
});

// Consecutive sightings needed before SEARCH turns into TRACKING (debounces noise).
export const CONFIRM_FRAMES = 3;

export function createTrackerState() {
  return { status: TRACKER_STATUS.SEARCH, seenFrames: 0, lostTime: 0 };
}

// Called once per detection tick. dt = seconds since the previous tick.
export function stepTracker(prev, detection, dt, { holdTime }) {
  const visible = Boolean(detection?.visible);
  switch (prev.status) {
    case TRACKER_STATUS.SEARCH: {
      const seenFrames = visible ? prev.seenFrames + 1 : 0;
      return seenFrames >= CONFIRM_FRAMES
        ? { status: TRACKER_STATUS.TRACKING, seenFrames, lostTime: 0 }
        : { ...prev, seenFrames };
    }
    case TRACKER_STATUS.TRACKING:
      return visible ? prev : { status: TRACKER_STATUS.LOST, seenFrames: 0, lostTime: 0 };
    case TRACKER_STATUS.LOST: {
      if (visible) return { status: TRACKER_STATUS.TRACKING, seenFrames: 0, lostTime: 0 };
      const lostTime = prev.lostTime + dt;
      return lostTime > holdTime ? createTrackerState() : { ...prev, lostTime };
    }
    default:
      return createTrackerState();
  }
}
```

- [ ] **Step 5: Implement `src/tracking/detectionClock.js`**

```js
// Longest frame step we accept; protects against a resumed background tab.
export const MAX_FRAME_DT = 0.1;

export function clampFrameDt(frameDt) {
  return Number.isFinite(frameDt) && frameDt > 0 ? Math.min(frameDt, MAX_FRAME_DT) : 0;
}

// Detection runs at detectHz, slower than rendering — like a real camera.
// Returns the new accumulator and, on a tick, the time since the previous tick.
export function advanceDetectionClock(accumulated, frameDt, detectHz) {
  const period = 1 / (detectHz > 0 ? detectHz : 1);
  const next = accumulated + clampFrameDt(frameDt);
  return next >= period ? { accumulated: 0, tickDt: next } : { accumulated: next, tickDt: null };
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test`
Expected: PASS — 6 files green.

- [ ] **Step 7: Commit**

```bash
git add src/tracking/trackerState.js src/tracking/trackerState.test.js src/tracking/detectionClock.js src/tracking/detectionClock.test.js
git commit -m "feat: add tracker state machine and detection clock

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Gimbal controller

**Files:**
- Create: `src/tracking/gimbalController.js`, `src/tracking/gimbalController.test.js`

**Interfaces:**
- Consumes: `TRACKER_STATUS` from `./trackerState` (Task 3).
- Produces:
  - `Gimbal = { pan, tilt, rate: { pan, tilt }, prevErr: { x, y } | null }` — radians, rad/s. **Convention (three.js): +pan turns the camera LEFT, +tilt turns it UP.**
  - `TILT_MIN` (−85° in rad), `TILT_MAX` (−5° in rad), `SCAN_TILT_GAIN = 2`
  - `createGimbal(tilt) → Gimbal`
  - `gimbalQuaternion(pan, tilt) → THREE.Quaternion` (camera looks down its −Z)
  - `angularError(center, { vFov, aspect }) → { x, y }`
  - `commandGimbal(gimbal, status, center | null, dt, params) → Gimbal` — per detection tick; `params = { kp, kd, maxRate, scanRate, scanTilt, vFov, aspect }` in rad / s
  - `integrateGimbal(gimbal, dt) → Gimbal` — per rendered frame

- [ ] **Step 1: Write failing tests `src/tracking/gimbalController.test.js`**

```js
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/tracking/gimbalController.test.js`
Expected: FAIL — cannot resolve `./gimbalController`.

- [ ] **Step 3: Implement `src/tracking/gimbalController.js`**

```js
import * as THREE from "three";
import { TRACKER_STATUS } from "./trackerState";

export const TILT_MIN = THREE.MathUtils.degToRad(-85);
export const TILT_MAX = THREE.MathUtils.degToRad(-5);
// Fixed gain (1/s) that swings tilt back to scanTilt while searching.
export const SCAN_TILT_GAIN = 2;

const ZERO_RATE = Object.freeze({ pan: 0, tilt: 0 });

// Gimbal: { pan, tilt, rate: { pan, tilt }, prevErr: { x, y } | null } (rad, rad/s).
// three.js convention: +pan turns the camera LEFT, +tilt turns it UP.
export function createGimbal(tilt) {
  return { pan: 0, tilt: clamp(tilt, TILT_MIN, TILT_MAX), rate: ZERO_RATE, prevErr: null };
}

// Pan-then-tilt gimbal orientation; the camera looks down its local -Z.
export function gimbalQuaternion(pan, tilt) {
  return new THREE.Quaternion().setFromEuler(new THREE.Euler(tilt, pan, 0, "YXZ"));
}

// Pinhole model: NDC offset of the target -> angle off the optical axis.
export function angularError(center, { vFov, aspect }) {
  const tanHalfV = Math.tan(vFov / 2);
  return { x: Math.atan(center.x * tanHalfV * aspect), y: Math.atan(center.y * tanHalfV) };
}

// Called on each detection tick: chooses the rate held until the next tick.
// params: { kp, kd, maxRate, scanRate, scanTilt, vFov, aspect } in rad / s.
export function commandGimbal(gimbal, status, center, dt, params) {
  if (status === TRACKER_STATUS.SEARCH) {
    const tiltRate = SCAN_TILT_GAIN * (params.scanTilt - gimbal.tilt);
    return {
      ...gimbal,
      rate: { pan: clampAbs(params.scanRate, params.maxRate), tilt: clampAbs(tiltRate, params.maxRate) },
      prevErr: null,
    };
  }
  if (status !== TRACKER_STATUS.TRACKING || !center) {
    return { ...gimbal, rate: ZERO_RATE, prevErr: null };
  }
  const err = angularError(center, params);
  const dErr =
    gimbal.prevErr && dt > 0
      ? { x: (err.x - gimbal.prevErr.x) / dt, y: (err.y - gimbal.prevErr.y) / dt }
      : { x: 0, y: 0 };
  return {
    ...gimbal,
    rate: {
      pan: clampAbs(-(params.kp * err.x + params.kd * dErr.x), params.maxRate),
      tilt: clampAbs(params.kp * err.y + params.kd * dErr.y, params.maxRate),
    },
    prevErr: err,
  };
}

// Called every rendered frame: applies the held rate.
export function integrateGimbal(gimbal, dt) {
  return {
    ...gimbal,
    pan: wrapAngle(gimbal.pan + gimbal.rate.pan * dt),
    tilt: clamp(gimbal.tilt + gimbal.rate.tilt * dt, TILT_MIN, TILT_MAX),
  };
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function clampAbs(value, limit) {
  return clamp(value, -limit, limit);
}

// Maps any angle into (-PI, PI].
function wrapAngle(angle) {
  const twoPi = 2 * Math.PI;
  const wrapped = ((((angle + Math.PI) % twoPi) + twoPi) % twoPi) - Math.PI;
  return wrapped === -Math.PI ? Math.PI : wrapped;
}
```

- [ ] **Step 4: Run all tests and the coverage gate**

Run: `npm test && npm run test:coverage`
Expected: PASS; coverage table for `src/tracking/**` ≥ 80% on all four metrics.

- [ ] **Step 5: Commit**

```bash
git add src/tracking/gimbalController.js src/tracking/gimbalController.test.js
git commit -m "feat: add pan/tilt gimbal controller with scan, hold and PD tracking

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Flying object params store, tracker store, two parameter panels

**Files:**
- Create: `src/state/useFlyingObjectParams.js`, `src/state/useFlyingObjectParams.test.js`, `src/state/useTrackerStore.js`, `src/components/ParamPanels.jsx`
- Modify: `src/components/ParamPanel.jsx` (whole file), `src/components/ParamPanel.css:1-15`, `src/App.jsx`

**Interfaces:**
- Consumes: `TRACKER_STATUS` (Task 3).
- Produces:
  - `DETECT_MODES = { GEOMETRY: "geometry", PIXEL: "pixel" }`, `DEFAULT_DETECT_MODE`
  - `DEFAULT_FLYING_OBJECT_PARAMS`, `FLYING_OBJECT_PARAM_META`, `useFlyingObjectParams` with `setParam(key, value)`, `setDetectMode(mode)`, `reset()`; state keys `posX, posZ, height, fov, gimbalKp, gimbalKd, maxRate, holdTime, scanRate, scanTilt, detectHz, detectMode`
  - `useTrackerStore` with state `{ status, bbox, center }`
  - `ParamPanel({ title, meta, values, onChange, onReset })`, `ParamPanels()`

- [ ] **Step 1: Write failing test `src/state/useFlyingObjectParams.test.js`**

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/state/useFlyingObjectParams.test.js`
Expected: FAIL — cannot resolve `./useFlyingObjectParams`.

- [ ] **Step 3: Implement `src/state/useFlyingObjectParams.js`**

```js
import { create } from "zustand";
import { persist } from "zustand/middleware";

export const DETECT_MODES = Object.freeze({ GEOMETRY: "geometry", PIXEL: "pixel" });
export const DEFAULT_DETECT_MODE = DETECT_MODES.GEOMETRY;

export const DEFAULT_FLYING_OBJECT_PARAMS = {
  posX: 0,
  posZ: 0,
  height: 20,
  fov: 60,
  gimbalKp: 4,
  gimbalKd: 0.1,
  maxRate: 90,
  holdTime: 1.5,
  scanRate: 30,
  scanTilt: -45,
  detectHz: 30,
};

export const FLYING_OBJECT_PARAM_META = {
  posX:     { label: "Position X",     min: -45, max: 45,  step: 1,    unit: "m" },
  posZ:     { label: "Position Z",     min: -45, max: 45,  step: 1,    unit: "m" },
  height:   { label: "Height",         min: 5,   max: 45,  step: 1,    unit: "m" },
  fov:      { label: "Camera FOV",     min: 20,  max: 100, step: 1,    unit: "°" },
  gimbalKp: { label: "Gimbal Kp",      min: 0,   max: 20,  step: 0.1,  unit: "1/s" },
  gimbalKd: { label: "Gimbal Kd",      min: 0,   max: 2,   step: 0.01, unit: "s" },
  maxRate:  { label: "Max slew rate",  min: 10,  max: 360, step: 5,    unit: "°/s" },
  holdTime: { label: "Hold time",      min: 0,   max: 10,  step: 0.1,  unit: "s" },
  scanRate: { label: "Scan rate",      min: 5,   max: 180, step: 5,    unit: "°/s" },
  scanTilt: { label: "Scan tilt",      min: -85, max: -5,  step: 1,    unit: "°" },
  detectHz: { label: "Detection rate", min: 1,   max: 60,  step: 1,    unit: "Hz" },
};

const VALID_MODES = Object.values(DETECT_MODES);

export const useFlyingObjectParams = create(
  persist(
    (set) => ({
      ...DEFAULT_FLYING_OBJECT_PARAMS,
      detectMode: DEFAULT_DETECT_MODE,
      setParam: (key, value) => {
        const meta = FLYING_OBJECT_PARAM_META[key];
        if (!meta) return;
        const clamped = Math.min(meta.max, Math.max(meta.min, Number(value)));
        if (Number.isNaN(clamped)) return;
        set({ [key]: clamped });
      },
      setDetectMode: (mode) => {
        if (!VALID_MODES.includes(mode)) return;
        set({ detectMode: mode });
      },
      reset: () => set({ ...DEFAULT_FLYING_OBJECT_PARAMS, detectMode: DEFAULT_DETECT_MODE }),
    }),
    { name: "flying-object-params-v1" }
  )
);
```

- [ ] **Step 4: Implement `src/state/useTrackerStore.js`**

```js
import { create } from "zustand";
import { TRACKER_STATUS } from "../tracking/trackerState";

// Written by useFlyingObjectTracking on every detection tick; read by PovOverlay via
// subscribe() so React never re-renders at detection rate.
export const useTrackerStore = create(() => ({
  status: TRACKER_STATUS.SEARCH,
  bbox: null,
  center: null,
}));
```

- [ ] **Step 5: Run the store tests**

Run: `npm test`
Expected: PASS — all files green.

- [ ] **Step 6: Make `src/components/ParamPanel.jsx` presentational** (replace the whole file)

```jsx
import { useId, useState } from "react";
import "./ParamPanel.css";

export function ParamPanel({ title, meta, values, onChange, onReset }) {
  const [open, setOpen] = useState(true);
  const idPrefix = useId();

  return (
    <div className={`param-panel ${open ? "open" : "closed"}`}>
      <button
        type="button"
        className="param-panel__toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span>{title}</span>
        <span className="param-panel__chevron">{open ? "▾" : "▸"}</span>
      </button>

      {open && (
        <div className="param-panel__body">
          {Object.entries(meta).map(([key, m]) => {
            const id = `${idPrefix}-${key}`;
            return (
              <div key={key} className="param-row">
                <label className="param-row__label" htmlFor={id}>
                  {m.label}
                  <span className="param-row__unit">{m.unit}</span>
                </label>
                <div className="param-row__controls">
                  <input
                    id={id}
                    type="range"
                    min={m.min}
                    max={m.max}
                    step={m.step}
                    value={values[key]}
                    onChange={(e) => onChange(key, e.target.value)}
                  />
                  <input
                    className="param-row__number"
                    type="number"
                    min={m.min}
                    max={m.max}
                    step={m.step}
                    value={values[key]}
                    onChange={(e) => onChange(key, e.target.value)}
                  />
                </div>
              </div>
            );
          })}

          <button type="button" className="param-panel__reset" onClick={onReset}>
            Reset to defaults
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 7: Create `src/components/ParamPanels.jsx`**

```jsx
import { useShallow } from "zustand/react/shallow";
import { ParamPanel } from "./ParamPanel";
import { useTargetParams, PARAM_META } from "../state/useTargetParams";
import { useFlyingObjectParams, FLYING_OBJECT_PARAM_META } from "../state/useFlyingObjectParams";

const pickKeys = (meta) => (state) =>
  Object.fromEntries(Object.keys(meta).map((key) => [key, state[key]]));
const pickTargetParams = pickKeys(PARAM_META);
const pickFlyingObjectParams = pickKeys(FLYING_OBJECT_PARAM_META);

function TargetParamPanel() {
  const values = useTargetParams(useShallow(pickTargetParams));
  const setParam = useTargetParams((s) => s.setParam);
  const reset = useTargetParams((s) => s.reset);
  return (
    <ParamPanel title="Target parameters" meta={PARAM_META} values={values} onChange={setParam} onReset={reset} />
  );
}

function FlyingObjectParamPanel() {
  const values = useFlyingObjectParams(useShallow(pickFlyingObjectParams));
  const setParam = useFlyingObjectParams((s) => s.setParam);
  const reset = useFlyingObjectParams((s) => s.reset);
  return (
    <ParamPanel title="Flying object parameters" meta={FLYING_OBJECT_PARAM_META} values={values} onChange={setParam} onReset={reset} />
  );
}

export function ParamPanels() {
  return (
    <div className="param-panels">
      <TargetParamPanel />
      <FlyingObjectParamPanel />
    </div>
  );
}
```

- [ ] **Step 8: Move positioning to the container in `src/components/ParamPanel.css`**

Replace the opening of the `.param-panel` rule:

```css
.param-panel {
  position: absolute;
  top: 16px;
  right: 16px;
  width: 280px;
```

with:

```css
.param-panels {
  position: absolute;
  top: 16px;
  right: 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: calc(100vh - 32px);
  overflow-y: auto;
  z-index: 10;
}

.param-panel {
  flex-shrink: 0;
  width: 280px;
```

and in the same rule replace

```css
  user-select: none;
  z-index: 10;
}
```

with

```css
  user-select: none;
}
```

- [ ] **Step 9: Mount the panels in `src/App.jsx`**

Replace `import { ParamPanel } from "./components/ParamPanel";` with `import { ParamPanels } from "./components/ParamPanels";` and replace `<ParamPanel />` with `<ParamPanels />`.

- [ ] **Step 10: Lint, build and check in the browser**

Run: `npm run lint && npm run build`
Expected: no errors.

Then start `npm run dev` (background), open `http://localhost:5173` with Playwright (`browser_navigate`), take a screenshot (`browser_take_screenshot`).
Expected: two stacked panels top-right — "Target parameters" (7 rows) and "Flying object parameters" (11 rows); moving a target slider still changes target behaviour; "Reset to defaults" works per panel; `browser_console_messages` shows no errors.

- [ ] **Step 11: Commit**

```bash
git add src/state/useFlyingObjectParams.js src/state/useFlyingObjectParams.test.js src/state/useTrackerStore.js src/components/ParamPanel.jsx src/components/ParamPanels.jsx src/components/ParamPanel.css src/App.jsx
git commit -m "feat: add flying object parameter store and a second parameter panel

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Flying object, POV render target and HUD view

**Files:**
- Create: `src/components/povLayout.js`, `src/hooks/useFlyingObjectTracking.js`, `src/components/FlyingObject.jsx`, `src/components/FlyingObjectPov.jsx`
- Modify: `src/components/Environment.jsx` (wall strip colour), `src/App.jsx`

**Interfaces:**
- Consumes: everything from Tasks 1–5: `detectByProjection`, `makeOcclusionTest`, `detectRedTarget`, `NO_DETECTION`, `createTrackerState`, `stepTracker`, `advanceDetectionClock`, `clampFrameDt`, `createGimbal`, `commandGimbal`, `integrateGimbal`, `gimbalQuaternion`, `useFlyingObjectParams`, `DETECT_MODES`, `useTrackerStore`.
- Produces:
  - `POV_WIDTH = 320`, `POV_HEIGHT = 240`, `POV_MARGIN = 16`, `POV_ASPECT`
  - `useFlyingObjectTracking({ targetRef, bodyRef, fbo })`
  - `<FlyingObject targetRef />` (must be inside `<Physics>`), `<FlyingObjectPov texture />`

- [ ] **Step 1: Create `src/components/povLayout.js`**

```js
// POV window geometry in CSS pixels, shared by the FBO, the HUD plane and the
// HTML overlay so all three stay aligned.
export const POV_WIDTH = 320;
export const POV_HEIGHT = 240;
export const POV_MARGIN = 16;
export const POV_ASPECT = POV_WIDTH / POV_HEIGHT;
```

- [ ] **Step 2: Create `src/hooks/useFlyingObjectTracking.js`**

```js
import { useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useRapier } from "@react-three/rapier";
import * as THREE from "three";
import { useFlyingObjectParams, DETECT_MODES } from "../state/useFlyingObjectParams";
import { useTrackerStore } from "../state/useTrackerStore";
import { NO_DETECTION } from "../tracking/detection";
import { detectByProjection } from "../tracking/geometryDetector";
import { makeOcclusionTest } from "../tracking/occlusion";
import { detectRedTarget } from "../tracking/pixelDetector";
import { createTrackerState, stepTracker } from "../tracking/trackerState";
import { advanceDetectionClock, clampFrameDt } from "../tracking/detectionClock";
import {
  commandGimbal,
  createGimbal,
  gimbalQuaternion,
  integrateGimbal,
} from "../tracking/gimbalController";
import { POV_ASPECT, POV_HEIGHT, POV_WIDTH } from "../components/povLayout";

const CAMERA_DROP = 0.3; // the gimbal hangs this far below the airframe (m)
const CAMERA_NEAR = 0.1;
const CAMERA_FAR = 500;
const WARN_INTERVAL_MS = 1000;
const deg = THREE.MathUtils.degToRad;

// Per frame: integrate gimbal -> sync POV camera -> (detection tick) detect,
// step tracker, command gimbal, publish -> render POV into the FBO.
export function useFlyingObjectTracking({ targetRef, bodyRef, fbo }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const { world, rapier } = useRapier();
  const cameraRef = useRef(null);
  const pixelsRef = useRef(null);
  const gimbalRef = useRef(null);
  const trackerRef = useRef(createTrackerState());
  const clockRef = useRef(0);
  const lastWarnRef = useRef(0);

  useFrame((_, delta) => {
    const target = targetRef.current;
    if (!target) return;
    const params = useFlyingObjectParams.getState();
    const gimbalParams = toGimbalParams(params);
    const camera = (cameraRef.current ??= new THREE.PerspectiveCamera(params.fov, POV_ASPECT, CAMERA_NEAR, CAMERA_FAR));
    gimbalRef.current = integrateGimbal(gimbalRef.current ?? createGimbal(gimbalParams.scanTilt), clampFrameDt(delta));
    syncPovCamera(camera, gimbalRef.current, params);

    const clock = advanceDetectionClock(clockRef.current, delta, params.detectHz);
    clockRef.current = clock.accumulated;
    if (clock.tickDt !== null) {
      const context = { target, camera, world, rapier, gl, fbo, pixelsRef };
      const detection = detectSafely(() => runDetection(params.detectMode, context), lastWarnRef);
      trackerRef.current = stepTracker(trackerRef.current, detection, clock.tickDt, { holdTime: params.holdTime });
      const { status } = trackerRef.current;
      gimbalRef.current = commandGimbal(gimbalRef.current, status, detection.center, clock.tickDt, gimbalParams);
      useTrackerStore.setState({ status, bbox: detection.bbox, center: detection.center });
    }

    renderPov(gl, scene, camera, fbo, bodyRef.current);
  });
}

function toGimbalParams(params) {
  return {
    kp: params.gimbalKp,
    kd: params.gimbalKd,
    maxRate: deg(params.maxRate),
    scanRate: deg(params.scanRate),
    scanTilt: deg(params.scanTilt),
    vFov: deg(params.fov),
    aspect: POV_ASPECT,
  };
}

function runDetection(mode, { target, camera, world, rapier, gl, fbo, pixelsRef }) {
  if (mode === DETECT_MODES.PIXEL) {
    pixelsRef.current ??= new Uint8Array(POV_WIDTH * POV_HEIGHT * 4);
    // The FBO still holds the previous frame: a one-frame camera latency.
    gl.readRenderTargetPixels(fbo, 0, 0, POV_WIDTH, POV_HEIGHT, pixelsRef.current);
    return detectRedTarget(pixelsRef.current, POV_WIDTH, POV_HEIGHT);
  }
  return detectTargetGeometry(target, camera, world, rapier);
}

function detectTargetGeometry(target, camera, world, rapier) {
  if (target.numColliders() === 0) return NO_DETECTION;
  const halfExtents = target.collider(0).halfExtents(); // main hull cuboid
  if (!halfExtents) return NO_DETECTION;
  const t = target.translation();
  const r = target.rotation();
  return detectByProjection(
    {
      center: new THREE.Vector3(t.x, t.y, t.z),
      quaternion: new THREE.Quaternion(r.x, r.y, r.z, r.w),
      halfExtents: new THREE.Vector3(halfExtents.x, halfExtents.y, halfExtents.z),
    },
    camera,
    makeOcclusionTest(world, rapier, camera.position, target.handle)
  );
}

function detectSafely(run, lastWarnRef) {
  try {
    return run();
  } catch (error) {
    const now = performance.now();
    if (now - lastWarnRef.current > WARN_INTERVAL_MS) {
      lastWarnRef.current = now;
      console.warn("[flying-object] detection failed, treating target as not visible:", error);
    }
    return NO_DETECTION;
  }
}

function syncPovCamera(camera, gimbal, params) {
  camera.position.set(params.posX, params.height - CAMERA_DROP, params.posZ);
  camera.quaternion.copy(gimbalQuaternion(gimbal.pan, gimbal.tilt));
  if (camera.fov !== params.fov) {
    camera.fov = params.fov;
    camera.updateProjectionMatrix();
  }
  camera.updateMatrixWorld();
}

function renderPov(gl, scene, camera, fbo, body) {
  const previousTarget = gl.getRenderTarget();
  if (body) body.visible = false; // the camera must not see its own airframe
  gl.setRenderTarget(fbo);
  gl.render(scene, camera);
  gl.setRenderTarget(previousTarget);
  if (body) body.visible = true;
}
```

- [ ] **Step 3: Create `src/components/FlyingObjectPov.jsx`**

```jsx
import { Hud, OrthographicCamera } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import { POV_HEIGHT, POV_MARGIN, POV_WIDTH } from "./povLayout";

// Shows the flying object camera feed in the bottom-left corner. The HUD camera is
// orthographic in CSS-pixel units, so the plane lines up with PovOverlay.
export function FlyingObjectPov({ texture }) {
  const size = useThree((s) => s.size);
  const x = -size.width / 2 + POV_MARGIN + POV_WIDTH / 2;
  const y = -size.height / 2 + POV_MARGIN + POV_HEIGHT / 2;

  return (
    <Hud>
      <OrthographicCamera makeDefault position={[0, 0, 10]} />
      <mesh position={[x, y, 0]}>
        <planeGeometry args={[POV_WIDTH, POV_HEIGHT]} />
        <meshBasicMaterial map={texture} />
      </mesh>
    </Hud>
  );
}
```

- [ ] **Step 4: Create `src/components/FlyingObject.jsx`**

```jsx
import { useRef } from "react";
import { useFBO } from "@react-three/drei";
import * as THREE from "three";
import { useFlyingObjectParams } from "../state/useFlyingObjectParams";
import { useFlyingObjectTracking } from "../hooks/useFlyingObjectTracking";
import { FlyingObjectPov } from "./FlyingObjectPov";
import { POV_HEIGHT, POV_WIDTH } from "./povLayout";

// Byte RGBA so readRenderTargetPixels works; sRGB so bytes match what is seen.
const FBO_SETTINGS = { type: THREE.UnsignedByteType, colorSpace: THREE.SRGBColorSpace };
const ARM_ANGLES = [Math.PI / 4, -Math.PI / 4];
const ROTOR_OFFSETS = [
  [0.45, 0.06, 0.45],
  [-0.45, 0.06, 0.45],
  [0.45, 0.06, -0.45],
  [-0.45, 0.06, -0.45],
];

// Stationary observer: position comes only from the flying object parameters.
export function FlyingObject({ targetRef }) {
  const bodyRef = useRef(null);
  const posX = useFlyingObjectParams((s) => s.posX);
  const posZ = useFlyingObjectParams((s) => s.posZ);
  const height = useFlyingObjectParams((s) => s.height);
  const fbo = useFBO(POV_WIDTH, POV_HEIGHT, FBO_SETTINGS);

  useFlyingObjectTracking({ targetRef, bodyRef, fbo });

  return (
    <>
      <group ref={bodyRef} position={[posX, height, posZ]}>
        <mesh castShadow>
          <boxGeometry args={[0.5, 0.15, 0.5]} />
          <meshStandardMaterial color="#263238" />
        </mesh>
        {ARM_ANGLES.map((angle) => (
          <mesh key={angle} rotation={[0, angle, 0]}>
            <boxGeometry args={[1.3, 0.05, 0.08]} />
            <meshStandardMaterial color="#37474f" />
          </mesh>
        ))}
        {ROTOR_OFFSETS.map(([x, y, z]) => (
          <mesh key={`${x}:${z}`} position={[x, y, z]}>
            <cylinderGeometry args={[0.22, 0.22, 0.02, 24]} />
            <meshStandardMaterial color="#4fc3f7" transparent opacity={0.6} />
          </mesh>
        ))}
      </group>
      <FlyingObjectPov texture={fbo.texture} />
    </>
  );
}
```

- [ ] **Step 5: Recolour the wall strips in `src/components/Environment.jsx`**

Add below `const WALL_HALF_HEIGHT = 10;`:

```js
// Amber, not red: the PIXEL detector treats red as the target.
const WALL_STRIP_COLOR = "#ffb300";
```

Replace all four occurrences (Edit with `replace_all: true`) of

```jsx
<meshStandardMaterial color="#ff5252" emissive="#ff5252" emissiveIntensity={0.3} />
```

with

```jsx
<meshStandardMaterial color={WALL_STRIP_COLOR} emissive={WALL_STRIP_COLOR} emissiveIntensity={0.3} />
```

- [ ] **Step 6: Mount the flying object in `src/App.jsx`**

Add `import { FlyingObject } from "./components/FlyingObject";` after the `Target` import, and inside `<Physics>` add `<FlyingObject targetRef={targetRef} />` right after `<Target ref={targetRef} />`.

- [ ] **Step 7: Lint, build, test**

Run: `npm run lint && npm run build && npm test`
Expected: all pass.

- [ ] **Step 8: Verify in the browser**

With `npm run dev` running, `browser_navigate` to `http://localhost:5173`, wait 2 s (`browser_wait_for` time 2), `browser_take_screenshot`.
Expected: bottom-left 320×240 view looking down at the arena from 20 m and slowly rotating (SEARCH); the flying object airframe is visible above the arena in the main view (not in the POV); wall strips are amber; `browser_console_messages` has no errors or `[flying-object]` warnings.

Then hold W for 1.5 s via `browser_run_code`:

```js
async (page) => { await page.keyboard.down("w"); await page.waitForTimeout(1500); await page.keyboard.up("w"); }
```

Take another screenshot: once the red target enters the POV the camera should stop scanning and keep it near the centre.

- [ ] **Step 9: Commit**

```bash
git add src/components/povLayout.js src/hooks/useFlyingObjectTracking.js src/components/FlyingObject.jsx src/components/FlyingObjectPov.jsx src/components/Environment.jsx src/App.jsx
git commit -m "feat: add observer flying object with gimbal camera and POV view

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: POV overlay and detection-mode switch

**Files:**
- Create: `src/components/drawPovOverlay.js`, `src/components/drawPovOverlay.test.js`, `src/components/PovOverlay.jsx`, `src/components/PovOverlay.css`
- Modify: `src/App.jsx`

**Interfaces:**
- Consumes: `ndcRectToPixels` (Task 1), `TRACKER_STATUS` (Task 3), `useTrackerStore`, `useFlyingObjectParams`, `DETECT_MODES` (Task 5), `POV_*` (Task 6).
- Produces: `drawPovOverlay(ctx: CanvasRenderingContext2D, { status, bbox })`, `<PovOverlay />`.

- [ ] **Step 1: Write failing test `src/components/drawPovOverlay.test.js`**

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/components/drawPovOverlay.test.js`
Expected: FAIL — cannot resolve `./drawPovOverlay`.

- [ ] **Step 3: Implement `src/components/drawPovOverlay.js`**

```js
import { ndcRectToPixels } from "../tracking/detection";
import { TRACKER_STATUS } from "../tracking/trackerState";

const STATUS_COLORS = {
  [TRACKER_STATUS.SEARCH]: "#90caf9",
  [TRACKER_STATUS.TRACKING]: "#69f0ae",
  [TRACKER_STATUS.LOST]: "#ffd54f",
};
const CROSSHAIR_HALF = 10;

export function drawPovOverlay(ctx, { status, bbox }) {
  const { width, height } = ctx.canvas;
  const color = STATUS_COLORS[status] ?? "#ffffff";
  ctx.clearRect(0, 0, width, height);
  drawCrosshair(ctx, width / 2, height / 2);
  if (bbox) {
    const rect = ndcRectToPixels(bbox, width, height);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
  }
  ctx.fillStyle = color;
  ctx.font = "bold 12px monospace";
  ctx.fillText(status, 8, 18);
}

function drawCrosshair(ctx, cx, cy) {
  ctx.strokeStyle = "rgba(255, 255, 255, 0.7)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx - CROSSHAIR_HALF, cy);
  ctx.lineTo(cx + CROSSHAIR_HALF, cy);
  ctx.moveTo(cx, cy - CROSSHAIR_HALF);
  ctx.lineTo(cx, cy + CROSSHAIR_HALF);
  ctx.stroke();
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Create `src/components/PovOverlay.css`**

```css
.pov-overlay {
  position: absolute;
  pointer-events: none;
  outline: 1px solid rgba(255, 255, 255, 0.35);
  border-radius: 4px;
  z-index: 10;
}

.pov-overlay canvas {
  display: block;
  width: 100%;
  height: 100%;
}

.pov-overlay__mode {
  position: absolute;
  top: 6px;
  right: 6px;
  pointer-events: auto;
  padding: 3px 8px;
  font: 600 11px monospace;
  color: #f5f5f5;
  background: rgba(20, 20, 24, 0.85);
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 4px;
  cursor: pointer;
}
```

- [ ] **Step 6: Create `src/components/PovOverlay.jsx`**

```jsx
import { useEffect, useRef } from "react";
import { useTrackerStore } from "../state/useTrackerStore";
import { useFlyingObjectParams, DETECT_MODES } from "../state/useFlyingObjectParams";
import { drawPovOverlay } from "./drawPovOverlay";
import { POV_HEIGHT, POV_MARGIN, POV_WIDTH } from "./povLayout";
import "./PovOverlay.css";

const MODE_LABELS = { [DETECT_MODES.GEOMETRY]: "GEOM", [DETECT_MODES.PIXEL]: "PIXEL" };
const BOX_STYLE = { left: POV_MARGIN, bottom: POV_MARGIN, width: POV_WIDTH, height: POV_HEIGHT };

export function PovOverlay() {
  const canvasRef = useRef(null);
  const detectMode = useFlyingObjectParams((s) => s.detectMode);
  const setDetectMode = useFlyingObjectParams((s) => s.setDetectMode);

  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return undefined;
    drawPovOverlay(ctx, useTrackerStore.getState());
    return useTrackerStore.subscribe((state) => drawPovOverlay(ctx, state));
  }, []);

  const nextMode = detectMode === DETECT_MODES.PIXEL ? DETECT_MODES.GEOMETRY : DETECT_MODES.PIXEL;

  return (
    <div className="pov-overlay" style={BOX_STYLE}>
      <canvas ref={canvasRef} width={POV_WIDTH} height={POV_HEIGHT} />
      <button
        type="button"
        className="pov-overlay__mode"
        onClick={() => setDetectMode(nextMode)}
        title="Switch detection mode"
      >
        {MODE_LABELS[detectMode] ?? MODE_LABELS[DETECT_MODES.GEOMETRY]}
      </button>
    </div>
  );
}
```

- [ ] **Step 7: Mount the overlay in `src/App.jsx`**

Add `import { PovOverlay } from "./components/PovOverlay";` and render `<PovOverlay />` right after `<ParamPanels />` (outside `<Canvas>`).

- [ ] **Step 8: Lint, build, test**

Run: `npm run lint && npm run build && npm test`
Expected: all pass.

- [ ] **Step 9: Verify in the browser (acceptance criteria 1–7)**

With `npm run dev` running:
1. `browser_navigate` → screenshot: overlay says `SEARCH`, crosshair in the centre, `GEOM` button top-right of the POV.
2. Drive the target into view (`browser_run_code` holding `w`/`a`/`d` as in Task 6) → screenshot: `TRACKING`, green box around the red target, camera follows.
3. Click the `GEOM` button (`browser_click`) → label becomes `PIXEL`; within ~0.5 s status returns to `TRACKING` with the box on the target.
4. `browser_resize` to 1024×700 and back to 1440×900 → screenshots: the overlay frame and the POV image stay aligned in the bottom-left corner.
5. Change "Height" in the Flying object panel to 35 → POV view widens; tracking continues. Press "Reset to defaults" in the Flying object panel → height back to 20, mode back to `GEOM`.
6. `browser_console_messages` — no errors.
Driving behind a crate to see `LOST` → `SEARCH` is left to the user's manual check (hard to script reliably).

- [ ] **Step 10: Commit**

```bash
git add src/components/drawPovOverlay.js src/components/drawPovOverlay.test.js src/components/PovOverlay.jsx src/components/PovOverlay.css src/App.jsx
git commit -m "feat: add POV tracking overlay with detection mode switch

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Documentation and final quality gate

**Files:**
- Modify: `CLAUDE.md`, `docs/PARAMETERS.md`

- [ ] **Step 1: Update `CLAUDE.md` commands**

In the Commands block, after `npm run lint       # ESLint over all .js/.jsx files` add:

```bash
npm test           # Vitest unit tests (src/**/*.test.js)
npm run test:coverage  # Tests + coverage gate (80% on src/tracking)
```

Replace the line `No test suite is configured.` with:

```markdown
Unit tests (Vitest, Node environment) cover the pure tracking logic in `src/tracking/` plus the flying object param store and overlay drawing. R3F/WebGL components are verified manually in the browser.
```

- [ ] **Step 2: Update `CLAUDE.md` scene composition**

After the `<Obstacles />` bullet add:

```markdown
- `<FlyingObject targetRef={targetRef} />` — stationary observer flying object (position only from flying object params); owns the POV FBO, runs `useFlyingObjectTracking`, renders `<FlyingObjectPov>` (drei `<Hud>` plane, bottom-left)

Outside the canvas: `<ParamPanels />` (target + flying object parameter panels, top-right) and `<PovOverlay />` (HTML canvas over the POV: box, crosshair, status, GEOM/PIXEL switch).
```

- [ ] **Step 3: Add a flying object section to `CLAUDE.md`** (before `## Key Conventions`)

````markdown
### Flying Object POV Tracking (`src/hooks/useFlyingObjectTracking.js`, `src/tracking/`)

Per frame (useFrame, priority 0 — drei `<Hud>` owns priority 1 and renders the main scene):

```
integrateGimbal (held rate × dt) → sync POV camera (pan/tilt, fov, position)
  → on detection tick (detectHz, advanceDetectionClock):
       detect (GEOM: detectByProjection + Rapier ray-cast occlusion | PIXEL: red pixels of last FBO frame)
       → stepTracker (SEARCH → TRACKING after 3 sightings → LOST → SEARCH after holdTime)
       → commandGimbal (SEARCH: scan | TRACKING: PD on angular error, clamped to maxRate | LOST: hold)
       → useTrackerStore.setState
  → render scene from POV camera into the 320×240 sRGB byte FBO (airframe hidden)
```

Gimbal convention (three.js): +pan turns LEFT, +tilt turns UP; tilt is limited to [−85°, −5°].
````

- [ ] **Step 4: Add conventions to `CLAUDE.md` `## Key Conventions`**

```markdown
- `src/tracking/` is pure: no React, no scene access, no input mutation — hooks/components only wire it
- The flying object never moves toward the target; its position comes only from flying object params
- The red target colour is reserved: other scene objects must not be red (PIXEL detection)
```

- [ ] **Step 5: Append flying object parameters to `docs/PARAMETERS.md`**

```markdown

# Flying Object Parameters

Runtime-tunable parameters of the stationary observer flying object and its gimbal camera, shown in the **Flying object parameters** panel and persisted under `flying-object-params-v1`. Source of truth: [`src/state/useFlyingObjectParams.js`](../src/state/useFlyingObjectParams.js).

| Parameter | Default | Min | Max | Step | Unit | What it controls |
|---|---|---|---|---|---|---|
| `posX` | 0 | -45 | 45 | 1 | m | Flying object X position |
| `posZ` | 0 | -45 | 45 | 1 | m | Flying object Z position |
| `height` | 20 | 5 | 45 | 1 | m | Flying object altitude |
| `fov` | 60 | 20 | 100 | 1 | ° | Vertical field of view of the POV camera (4:3) |
| `gimbalKp` | 4 | 0 | 20 | 0.1 | 1/s | Proportional gain: slew rate per radian of angular error |
| `gimbalKd` | 0.1 | 0 | 2 | 0.01 | s | Derivative gain on the angular error |
| `maxRate` | 90 | 10 | 360 | 5 | °/s | Gimbal slew-rate limit (also caps scanning) |
| `holdTime` | 1.5 | 0 | 10 | 0.1 | s | How long LOST holds the last direction before SEARCH |
| `scanRate` | 30 | 5 | 180 | 5 | °/s | Pan speed while searching |
| `scanTilt` | -45 | -85 | -5 | 1 | ° | Tilt used while searching |
| `detectHz` | 30 | 1 | 60 | 1 | Hz | Detection / control update rate |

`detectMode` (`geometry` | `pixel`) is switched with the GEOM/PIXEL button on the POV window.

**Notes**
- The controller updates at `detectHz` and holds its rate between updates. With period `T = 1/detectHz`, keep `gimbalKp · T` well below 2 — e.g. `Kp = 20` at `1 Hz` oscillates.
- When the target passes almost under the flying object, pan must swing quickly (two-axis gimbal "keyhole"); if that exceeds `maxRate` the target is lost briefly.
```

- [ ] **Step 6: Final quality gate**

Run: `npm run test:coverage && npm run lint && npm run build`
Expected: all tests pass, coverage ≥ 80% on `src/tracking/**`, no lint errors, build succeeds.

- [ ] **Step 7: Commit**

```bash
git add CLAUDE.md docs/PARAMETERS.md
git commit -m "docs: document flying object POV tracking and flying object parameters

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 8: Whole-branch review**

Use superpowers:requesting-code-review on `main...feat/flying-object-pov-tracking`. Fix CRITICAL/HIGH findings, re-run Step 6, commit fixes.
