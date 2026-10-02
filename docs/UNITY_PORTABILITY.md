# Portability to Unity

This document explains how the physics model and runtime behavior implemented in this React Three Fiber + Rapier prototype can be transferred to a Unity (C# + PhysX) project. The motivation is forward-compatibility with a future master's thesis on flying-object-based ground-target tracking, where Unity is a likely target engine.

## 1. Conceptual mapping

The simulator is built on three orthogonal layers, all of which have direct Unity equivalents:

| Layer | This project | Unity equivalent |
|---|---|---|
| Scene graph | React Three Fiber `<mesh>`, `<group>` | `GameObject` hierarchy |
| Physics solver | Rapier (Rust/WASM) via `@react-three/rapier` | Built-in PhysX |
| Game loop | R3F `useFrame(delta)` | `FixedUpdate()` + `Time.fixedDeltaTime` |
| Input | Custom `useKeyboardControls` hook | `Input.GetAxis` / new Input System |
| State / tunable params | Zustand store with `persist` middleware | `ScriptableObject` + `PlayerPrefs` |
| UI panel | HTML overlay (`ParamPanel.jsx`) | `Canvas` + `UI.Slider` (uGUI) or UI Toolkit |

The model is engine-agnostic: every concept used here (rigid bodies, impulses, torques, damping, gravity, axis-locked rotation) is a first-class concept in PhysX. No custom integrator or contact resolver was written in the prototype, so nothing engine-specific needs to be ported.

## 2. Physics API translation

The table below maps each Rapier call used in [`Target.jsx`](../src/components/Target.jsx) to its Unity equivalent.

| Rapier (this project) | Unity (`UnityEngine.Rigidbody`) | Notes |
|---|---|---|
| `<RigidBody type="dynamic">` | `Rigidbody` component on a `GameObject` | PhysX bodies default to dynamic |
| `applyImpulse({ x, y, z }, true)` | `rb.AddForce(vec, ForceMode.Impulse)` | Same instantaneous Δp semantics |
| `applyTorqueImpulse({ x, y, z }, true)` | `rb.AddTorque(vec, ForceMode.Impulse)` | Same Δ(angular momentum) semantics |
| `rb.linvel()` | `rb.linearVelocity` (Unity 6+) / `rb.velocity` (older) | Vector3, world space |
| `rb.rotation()` (quaternion) | `transform.rotation` (Quaternion) | Identical math |
| `q.applyTo((0,0,1))` | `transform.forward` | Built-in convenience accessor |
| `linearDamping` prop | `rb.linearDamping` / `rb.drag` | Equivalent meaning (1/s decay) |
| `angularDamping` prop | `rb.angularDamping` / `rb.angularDrag` | Equivalent meaning |
| `setAdditionalMass(m, true)` | `rb.mass = m` | Unity uses absolute mass directly |
| `enabledRotations={[false, true, false]}` | `rb.constraints = FreezeRotationX \| FreezeRotationZ` | Same effect: only yaw allowed |
| `<Physics gravity={[0, g, 0]}>` | `Physics.gravity = new Vector3(0, g, 0)` | Global setting in both |
| `<CuboidCollider args={[hx, hy, hz]}>` | `BoxCollider` with `size = (2hx, 2hy, 2hz)` | Rapier uses half-extents, Unity uses full extents |
| `colliders="cuboid"` (auto) | Attach matching primitive collider component | Unity has no auto-derivation |

### Coordinate system

Both engines use a right-handed Y-up convention by default. **No axis flipping is required.** Forward = +Z in this project and `transform.forward` defaults to +Z in Unity — the same `(0, 0, 1)` reference vector applies.

## 3. Game-loop translation

The per-frame logic in `Target.jsx` ports to Unity almost line-for-line:

```csharp
// Unity port of the Target useFrame body (illustrative).
void FixedUpdate()
{
    float dt = Time.fixedDeltaTime;
    Vector3 forward = transform.forward;
    Vector3 v = rb.linearVelocity;
    float speed = new Vector2(v.x, v.z).magnitude;

    Vector3 impulse = Vector3.zero;
    Vector3 torque  = Vector3.zero;

    if (input.forward  && speed < maxVelocity) impulse =  forward * acceleration * dt;
    if (input.backward && speed < maxVelocity) impulse = -forward * acceleration * dt;

    if (input.forward || input.backward) {
        float mod = (input.backward && !input.forward) ? -1f : 1f;
        if (input.left)  torque.y =  turnSpeed * mod * dt;
        if (input.right) torque.y = -turnSpeed * mod * dt;
    }

    rb.AddForce(impulse, ForceMode.Impulse);
    rb.AddTorque(torque, ForceMode.Impulse);
}
```

Two structural differences worth noting:

- **Fixed timestep.** Unity runs physics at a fixed rate (default 50 Hz). `FixedUpdate` is the correct callback; multiplying by `Time.fixedDeltaTime` keeps impulses time-scaled, identical to the `delta` multiplier in `useFrame`.
- **Frame-rate independence.** Both engines decouple physics integration from render frame rate, so the existing `* delta` pattern transfers without modification.

## 4. Parameter values

The tunable parameters in [`useTargetParams.js`](../src/state/useTargetParams.js) use SI-compatible scales (impulses in N·s, mass in kg, gravity in m/s²). Rapier and PhysX both interpret these units consistently, so the numerical defaults transfer **as-is** — no rescaling is needed beyond gameplay tuning.

| Parameter | Default | Unit | Direct Unity field |
|---|---|---|---|
| `acceleration` | 45 | N·s | impulse magnitude in `AddForce` |
| `turnSpeed` | 25 | N·m·s | torque magnitude in `AddTorque` |
| `maxVelocity` | 22 | m/s | speed cap on `rb.linearVelocity` |
| `linearDamping` | 0.35 | 1/s | `rb.linearDamping` |
| `angularDamping` | 5.5 | 1/s | `rb.angularDamping` |
| `mass` | 0.6 | kg | `rb.mass` |
| `gravity` | -9.81 | m/s² | `Physics.gravity.y` |

## 5. UI tuning panel

The Zustand-based `ParamPanel` translates to a `ScriptableObject` that holds the same fields, edited at runtime by a Unity UI Toolkit or uGUI canvas of sliders. Persistence (`localStorage` in this project) maps to `PlayerPrefs` on a small wrapper that serializes the parameter block as JSON. The data flow remains identical:

```
[UI slider] -> [params asset] -> [Target component reads in FixedUpdate]
```

## 6. What does not port directly

- **React component model.** JSX, hooks, and the Zustand store are React-only. The control flow and data model port; the syntax does not.
- **`@react-three/drei` helpers.** Drei utilities (e.g., `Grid`) need to be re-implemented with Unity primitives or third-party packages.
- **Auto collider derivation.** Rapier can infer cuboid/ball colliders from a child mesh. Unity requires the collider component to be authored explicitly.
- **WASM bundling.** Rapier ships as a WASM blob; in Unity, PhysX is part of the engine — no equivalent bundling step.

## 7. Suggested porting order

If or when the project is rebuilt in Unity for the thesis work, the recommended sequence is:

1. Create the empty Unity scene with a flat ground plane and four wall colliders (mirrors `Environment.jsx`).
2. Author the player `GameObject` with `Rigidbody`, `BoxCollider`, and the constraints listed above.
3. Port the control script using the snippet in §3 above.
4. Implement the `ScriptableObject` for parameters and wire up the UI sliders.
5. Replace dynamic obstacles (`Obstacles.jsx`) with prefab instances.
6. Add the follow-camera as a `LateUpdate` `Vector3.Lerp` from the camera rig to the target transform.

After step 3, the simulator already has feature parity with the current prototype's locomotion model. Steps 4–6 are quality-of-life rather than physics-model work.

## 8. Summary

The prototype was intentionally built on a thin layer over a standard rigid-body solver. Every piece of physics behavior — impulse-driven locomotion, axis-locked rotation, damping-based deceleration, velocity capping — maps to a one-line PhysX equivalent. The control script in `Target.jsx` is around 50 lines; the Unity port is comparable in size. The same parameter values, in the same SI units, will produce the same gameplay feel. This makes the current course-work module a viable starting point for a Unity-based flying object tracking simulator at the master's stage.
