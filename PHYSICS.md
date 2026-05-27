# Physics and Mathematics in the Simulation

This document explains the physical principles, mathematical models, and software libraries used to create the realistic movement of the ground target in this interactive 3D environment.

## 1. The Physics Library: Rapier

Instead of manually calculating complex collision detection and continuous integration of velocity and acceleration (which is prone to errors and performance issues), this project utilizes **Rapier** via the `@react-three/rapier` wrapper.

Rapier is a high-performance physics engine written in Rust (compiled to WebAssembly). It handles:
- **Rigid Body Dynamics:** Simulating how solid objects move and rotate.
- **Collision Detection:** Calculating when objects touch (e.g., the target hitting a crate or the invisible boundary walls).
- **Constraints & Joints:** Restricting movement (e.g., preventing the target from tipping over).

## 2. Mathematical Model of the Target

The target is modeled as a **Dynamic Rigid Body**. Its movement is governed by Newtonian mechanics, specifically applied through discrete **Impulses** per frame rather than directly setting its position.

### Linear Movement (Acceleration)
When the user presses 'Forward', we don't just add to the $Z$-coordinate. We apply a linear impulse (force applied over a short time $\Delta t$).

1. **Direction Vector ($v_{forward}$):** The target can face any direction. We must calculate its forward vector relative to the global 3D space.
   We achieve this using **Quaternions**, which represent 3D rotation without the problem of Gimbal Lock.
   $$q = (x, y, z, w)$$
   We take a standard forward vector $(0, 0, 1)$ and apply the target's current quaternion to it.
   $$v_{actual\_forward} = q \times (0, 0, 1)$$

2. **Applying Force ($F$):**
   $$Impulse = v_{actual\_forward} \cdot Acceleration \cdot \Delta t$$
   This impulse is applied to the center of mass of the rigid body.

3. **Speed Limiting:**
   To prevent infinite acceleration, we calculate the current linear velocity ($v_{current}$) magnitude on the X-Z plane:
   $$Speed = \sqrt{v_x^2 + v_z^2}$$
   If $Speed < MaxVelocity$, we allow the impulse to be applied.

### Rotational Movement (Torque)
Turning is achieved by applying a **Torque Impulse** around the local $Y$-axis (the vertical axis pointing up from the target).

$$Torque_{y} = TurnSpeed \cdot Modifier \cdot \Delta t$$

**Realistic Steering:**
To simulate vehicle physics, torque is only applied if there is simultaneous linear movement (forward or backward). Furthermore, the $Modifier$ inverts the turning direction when the vehicle is reversing, mimicking the behavior of front-wheel steering.

### Damping (Friction and Air Resistance)
To make the movement feel natural and stop when keys are released, the physics engine applies **Damping**:
- **Linear Damping:** Gradually reduces linear velocity over time (simulating rolling resistance/friction).
- **Angular Damping:** Gradually reduces rotational velocity (preventing the target from spinning forever like a top).

## 3. The Coordinate System

The simulation uses a standard Right-Handed Cartesian coordinate system (default in Three.js):
- **+Y:** Up
- **-Y:** Down (Gravity)
- **+X:** Right
- **-X:** Left
- **+Z:** Forward (Towards the viewer)
- **-Z:** Backward (Away from the viewer)

Gravity is configured globally as a vector: `[0, -9.81, 0]`, simulating standard Earth gravity ($9.81 m/s^2$).

## 4. Collision Shapes (Colliders)

Objects in the scene use simplified geometric shapes for physics calculations to save performance:
- The **Target** and **Crates** use `cuboid` colliders (AABB - Axis-Aligned Bounding Boxes or OBB - Oriented Bounding Boxes).
- The **Bouncy Balls** use `ball` (sphere) colliders.
- The **Ground Plane** and **Boundary Walls** are `fixed` Rigid Bodies; they have infinite mass, meaning dynamic objects bounce off them, but they never move.
