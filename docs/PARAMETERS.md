# Target Parameters

This document describes the seven runtime-tunable parameters that control the target vehicle's locomotion. All parameters are exposed in the in-browser **Target parameters** panel (top-right corner of the canvas), backed by a Zustand store with `localStorage` persistence, and consumed by `src/components/Target.jsx` and the global physics world.

Related references:
- Mathematical model: [`PHYSICS.md`](./PHYSICS.md)
- Source of truth (defaults, ranges, units): [`src/state/useTargetParams.js`](../src/state/useTargetParams.js)
- Engine portability: [`UNITY_PORTABILITY.md`](./UNITY_PORTABILITY.md)

## Quick reference

| Parameter | Default | Min | Max | Step | Unit | What it controls |
|---|---|---|---|---|---|---|
| `acceleration` | 45 | 0 | 100 | 1 | N·s | Forward / backward thrust magnitude |
| `turnSpeed` | 25 | 0 | 50 | 1 | N·m·s | Yaw torque magnitude |
| `maxVelocity` | 22 | 1 | 50 | 1 | m/s | Hard cap on horizontal speed |
| `linearDamping` | 0.35 | 0 | 5 | 0.05 | 1/s | How fast the target coasts to a stop |
| `angularDamping` | 5.5 | 0 | 20 | 0.1 | 1/s | How fast spin decays after a turn |
| `mass` | 0.6 | 0.1 | 100 | 0.1 | kg | Effective inertia of the body |
| `gravity` | -9.81 | -30 | 0 | 0.1 | m/s² | Global Y-axis gravitational acceleration |

## 1. `acceleration`

The magnitude of the linear impulse applied every physics step while a forward or backward key is held. Each step the target receives:

```
impulse = forward_vector × acceleration × Δt
```

Because the impulse is scaled by `Δt`, the value is frame-rate independent. Higher values produce faster pickup; very high values combined with a low `linearDamping` will reach `maxVelocity` almost instantly.

Tuning intuition: raise this to make the vehicle feel more powerful; lower it to simulate a heavier, slower-to-build-up target.

## 2. `turnSpeed`

The magnitude of the Y-axis torque impulse applied each step while a left/right key is held **and** a forward/backward key is held. This mimics steering on a real vehicle: you cannot turn in place.

```
τ_y = turnSpeed × modifier × Δt
```

`modifier` is `+1` while moving forward and `-1` while reversing, so steering input reverses direction when backing up. Higher values give tighter, snappier turns. Excessive values combined with low `angularDamping` will cause oscillation around the desired heading.

## 3. `maxVelocity`

A scalar cap on the magnitude of horizontal velocity, computed as `sqrt(v_x² + v_z²)`. While the current speed is at or above this cap, no further forward/backward impulse is applied — gravity and damping still act normally. The cap is applied **before** the impulse, so the engine can overshoot slightly within a single step.

Increasing this raises the absolute top speed; decreasing it makes the vehicle feel governed.

## 4. `linearDamping`

Per-Rapier semantics, this is an exponential velocity decay applied each step:

```
v ← v × (1 / (1 + linearDamping × Δt))
```

A value of `0` means the target coasts forever (only collisions stop it). Higher values simulate rolling resistance, air drag, or thick mud. Typical values for a "vehicle-like" feel sit in the `0.2` – `0.8` range; values above ~2 produce a feeling of sliding on glue.

## 5. `angularDamping`

Same decay model as `linearDamping`, but applied to angular velocity. This is the main lever that determines how quickly steering input dies out after a key release. Values below ~1 cause the target to keep spinning visibly after a turn input ends; values above ~10 produce instant, almost click-to-snap heading changes.

## 6. `mass`

The effective inertia of the rigid body. The cuboid collider gives the body an auto-computed base mass; the parameter is forwarded to Rapier's `setAdditionalMass`, so it adds to (rather than replaces) the geometric default. Higher mass means a given `acceleration` impulse produces a smaller velocity change per step — the vehicle feels heavier and more resistant to nudges from obstacle collisions.

A useful rule of thumb: if you double `mass`, you may want to roughly double `acceleration` to keep the same pickup feel.

## 7. `gravity`

The global Y-component of the gravity vector, applied to every dynamic body in the scene. Less negative values (e.g. `-3`) feel like a low-gravity planet — obstacles take longer to settle and the target rides looser. More negative values (e.g. `-20`) press the target firmly to the ground and make collisions feel weightier.

Because gravity is global, this parameter also affects the dynamic crates and balls in the obstacle field.

## Persistence and reset

Values are persisted in `localStorage` under the key `target-params-v2`. Changes are written on every adjustment, so a page reload restores the last-tuned configuration. Press **Reset to defaults** in the panel to restore the values listed in the table above. To invalidate stored values globally (e.g. after a schema change), the storage key version suffix is bumped in `src/state/useTargetParams.js`.

## Adding a new parameter

To extend the panel:

1. Add the field, a default, and a `PARAM_META` entry (label, min, max, step, unit) to `src/state/useTargetParams.js`.
2. Read it from `useTargetParams` wherever it is consumed (e.g. `Target.jsx`, `App.jsx`).
3. The panel renders one row per `DEFAULT_PARAMS` key automatically; no UI changes are required.
4. Bump the persist key (`target-params-v2` → `target-params-v3`) if the change breaks back-compatibility with stored values.
