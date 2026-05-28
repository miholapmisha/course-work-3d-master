import { forwardRef } from "react";
import { useFrame } from "@react-three/fiber";
import { RigidBody } from "@react-three/rapier";
import { useKeyboardControls } from "../hooks/useKeyboardControls";
import * as THREE from "three";

export const Target = forwardRef((props, ref) => {
  const keys = useKeyboardControls();
  
  // Movement parameters
  const ACCELERATION = 25; // Decreased for slower, longer acceleration
  const TURN_SPEED = 17; // Further decreased sensitivity
  const MAX_VELOCITY = 15;

  useFrame((state, delta) => {
    if (!ref.current) return;

    const impulse = { x: 0, y: 0, z: 0 };
    const torqueImpulse = { x: 0, y: 0, z: 0 };

    // Get current rotation
    const rotation = ref.current.rotation();
    const quaternion = new THREE.Quaternion(rotation.x, rotation.y, rotation.z, rotation.w);
    
    // Calculate forward direction based on current rotation
    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(quaternion);
    
    // Current velocity to limit speed
    const linvel = ref.current.linvel();
    const currentSpeed = Math.sqrt(linvel.x ** 2 + linvel.z ** 2);

    if (keys.forward && currentSpeed < MAX_VELOCITY) {
      impulse.x = forward.x * ACCELERATION * delta;
      impulse.z = forward.z * ACCELERATION * delta;
    }
    if (keys.backward && currentSpeed < MAX_VELOCITY) {
      impulse.x = -forward.x * ACCELERATION * delta;
      impulse.z = -forward.z * ACCELERATION * delta;
    }

    // Realistic turning: only allow turn when accelerating or reversing
    if (keys.forward || keys.backward) {
      // Reverse turn direction when backing up to mimic real car steering
      const turnModifier = keys.backward && !keys.forward ? -1 : 1;

      if (keys.left) {
        torqueImpulse.y = TURN_SPEED * turnModifier * delta;
      }
      if (keys.right) {
        torqueImpulse.y = -TURN_SPEED * turnModifier * delta;
      }
    }

    ref.current.applyImpulse(impulse, true);
    ref.current.applyTorqueImpulse(torqueImpulse, true);
  });

  return (
    <RigidBody 
      ref={ref} 
      position={[0, 1, 0]} 
      linearDamping={0.2} 
      angularDamping={5}
      colliders="cuboid"
      enabledRotations={[false, true, false]}
    >
      <mesh castShadow>
        <boxGeometry args={[1, 0.5, 2]} />
        <meshStandardMaterial color="red" />
      </mesh>
      {/* Visual indicator for front */}
      <mesh position={[0, 0.3, 0.8]}>
        <boxGeometry args={[0.5, 0.2, 0.2]} />
        <meshStandardMaterial color="white" />
      </mesh>
    </RigidBody>
  );
});
