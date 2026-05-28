import { forwardRef, useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import { RigidBody } from "@react-three/rapier";
import { useKeyboardControls } from "../hooks/useKeyboardControls";
import { useTargetParams } from "../state/useTargetParams";
import * as THREE from "three";

export const Target = forwardRef((props, ref) => {
  const keys = useKeyboardControls();

  const linearDamping = useTargetParams((s) => s.linearDamping);
  const angularDamping = useTargetParams((s) => s.angularDamping);
  const mass = useTargetParams((s) => s.mass);

  // Live-sync Rapier body properties without remounting the RigidBody.
  useEffect(() => {
    if (!ref.current) return;
    ref.current.setLinearDamping(linearDamping);
  }, [ref, linearDamping]);

  useEffect(() => {
    if (!ref.current) return;
    ref.current.setAngularDamping(angularDamping);
  }, [ref, angularDamping]);

  useEffect(() => {
    if (!ref.current) return;
    // setAdditionalMass adds to the auto-computed collider mass; use it as the
    // tunable inertia knob while keeping the base cuboid mass for stability.
    ref.current.setAdditionalMass(mass, true);
  }, [ref, mass]);

  useFrame((state, delta) => {
    if (!ref.current) return;

    const { acceleration, turnSpeed, maxVelocity } = useTargetParams.getState();

    const impulse = { x: 0, y: 0, z: 0 };
    const torqueImpulse = { x: 0, y: 0, z: 0 };

    const rotation = ref.current.rotation();
    const quaternion = new THREE.Quaternion(rotation.x, rotation.y, rotation.z, rotation.w);
    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(quaternion);

    const linvel = ref.current.linvel();
    const currentSpeed = Math.sqrt(linvel.x ** 2 + linvel.z ** 2);

    if (keys.forward && currentSpeed < maxVelocity) {
      impulse.x = forward.x * acceleration * delta;
      impulse.z = forward.z * acceleration * delta;
    }
    if (keys.backward && currentSpeed < maxVelocity) {
      impulse.x = -forward.x * acceleration * delta;
      impulse.z = -forward.z * acceleration * delta;
    }

    if (keys.forward || keys.backward) {
      const turnModifier = keys.backward && !keys.forward ? -1 : 1;
      if (keys.left) torqueImpulse.y = turnSpeed * turnModifier * delta;
      if (keys.right) torqueImpulse.y = -turnSpeed * turnModifier * delta;
    }

    ref.current.applyImpulse(impulse, true);
    ref.current.applyTorqueImpulse(torqueImpulse, true);
  });

  return (
    <RigidBody
      ref={ref}
      position={[0, 1, 0]}
      linearDamping={linearDamping}
      angularDamping={angularDamping}
      colliders="cuboid"
      enabledRotations={[false, true, false]}
    >
      <mesh castShadow>
        <boxGeometry args={[1, 0.5, 2]} />
        <meshStandardMaterial color="red" />
      </mesh>
      <mesh position={[0, 0.3, 0.8]}>
        <boxGeometry args={[0.5, 0.2, 0.2]} />
        <meshStandardMaterial color="white" />
      </mesh>
    </RigidBody>
  );
});
