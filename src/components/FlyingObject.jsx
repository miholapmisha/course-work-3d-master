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
