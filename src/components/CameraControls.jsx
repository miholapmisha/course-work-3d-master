import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useRef } from "react";

export const CameraControls = ({ targetRef }) => {
  const cameraOffset = new THREE.Vector3(0, 5, -10);
  const smoothedCameraPosition = useRef(new THREE.Vector3(0, 5, -10));
  const smoothedLookAt = useRef(new THREE.Vector3(0, 0, 0));

  useFrame((state, delta) => {
    if (!targetRef.current) return;

    // Get target position and rotation
    const targetPos = targetRef.current.translation();
    const targetRot = targetRef.current.rotation();
    
    const targetVec = new THREE.Vector3(targetPos.x, targetPos.y, targetPos.z);
    const targetQuat = new THREE.Quaternion(targetRot.x, targetRot.y, targetRot.z, targetRot.w);

    // Calculate desired camera position based on target's rotation
    const desiredOffset = cameraOffset.clone().applyQuaternion(targetQuat);
    const desiredCameraPosition = targetVec.clone().add(desiredOffset);

    // Smoothly interpolate camera position
    smoothedCameraPosition.current.lerp(desiredCameraPosition, delta * 3);
    state.camera.position.copy(smoothedCameraPosition.current);

    // Smoothly interpolate lookAt point
    smoothedLookAt.current.lerp(targetVec, delta * 10);
    state.camera.lookAt(smoothedLookAt.current);
  });

  return null;
};
