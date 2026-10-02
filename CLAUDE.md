# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # Start Vite dev server (HMR enabled)
npm run build      # Production build to dist/
npm run preview    # Preview production build locally
npm run lint       # ESLint over all .js/.jsx files
npm test           # Vitest unit tests (src/**/*.test.js)
npm run test:coverage  # Tests + coverage gate (80% on src/tracking)
```

Unit tests (Vitest, Node environment) cover the pure tracking logic in `src/tracking/` plus the flying object param store and overlay drawing. R3F/WebGL components are verified manually in the browser.

## Project Purpose

Ground target movement simulator — a component of a future flying object tracking system. The user controls a vehicle (the "target") across a 3D terrain. Built with React + Vite, Three.js rendered via React Three Fiber, and Rapier (Rust/WASM) for physics.

## Architecture

### Data Flow (per frame)

```
useKeyboardControls (state)
  → Target.jsx useFrame: reads keys → computes quaternion-rotated impulse → applyImpulse / applyTorqueImpulse on RigidBody
    → Rapier solves physics (collision, velocity, damping)
      → R3F syncs mesh position to RigidBody
        → CameraControls.jsx useFrame: lerp camera to follow target
```

### Scene Composition (`App.jsx`)

`<Canvas>` → `<Physics gravity={[0,-9.81,0]}>` wraps all 3D components:
- `<Environment />` — ground plane (fixed RigidBody), lighting, invisible boundary walls, Grid helper
- `<Target ref={targetRef} />` — player vehicle; `ref` is forwarded to the Rapier RigidBody
- `<CameraControls targetRef={targetRef} />` — reads target's `translation()` and `rotation()` each frame, lerp-smoothed follow camera; renders nothing
- `<Obstacles />` — 30 dynamic crates + 15 dynamic balls, positions randomized via `useMemo`
- `<FlyingObject targetRef={targetRef} />` — stationary observer flying object (position only from flying object params); owns the POV FBO, runs `useFlyingObjectTracking`, renders `<FlyingObjectPov>` (drei `<Hud>` plane, bottom-left)

Outside the canvas: `<ParamPanels />` (target + flying object parameter panels, top-right) and `<PovOverlay />` (HTML canvas over the POV: box, crosshair, status, GEOM/PIXEL switch).

### Target Physics Model (`src/components/Target.jsx`)

Movement is **impulse-based** (never direct position mutation):
- Forward direction computed by applying the RigidBody's quaternion to `(0,0,1)` each frame
- Impulse = `forwardDir * ACCELERATION * delta` — delta-scaled for frame-rate independence
- Speed capped at `MAX_VELOCITY` by checking `linvel` magnitude on XZ plane before applying impulse
- Turn is torque on Y-axis; only fires while forward/backward is held; direction inverts when reversing
- `enabledRotations={[false, true, false]}` locks X/Z rotation — prevents the vehicle from tipping over
- `linearDamping` / `angularDamping` on RigidBody provides friction/stopping without explicit key-up logic

### Input (`src/hooks/useKeyboardControls.js`)

Returns `{ forward, backward, left, right }` booleans. Listens to `keydown`/`keyup` on `window`. Supports both WASD and Arrow Keys.

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

## Key Conventions

- All 3D objects that need physics wrap their mesh in `<RigidBody>` from `@react-three/rapier`
- `type="fixed"` for immovable geometry (ground, walls, ramp); default dynamic for moveable objects
- Per-frame logic lives in `useFrame` — never in React state updates or effects
- Camera is implemented as a render-less component (`return null`) that mutates `state.camera` imperatively inside `useFrame`
- The `Target` component uses `forwardRef` so `App.jsx` can pass the RigidBody ref to `CameraControls`
- `src/tracking/` is pure: no React, no scene access, no input mutation — hooks/components only wire it
- The flying object never moves toward the target; its position comes only from flying object params
- The red target colour is reserved: other scene objects must not be red (PIXEL detection)
