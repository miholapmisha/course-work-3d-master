import { RigidBody } from "@react-three/rapier";
import { useMemo } from "react";

export const Obstacles = () => {
  // Generate random positions for the crates
  const boxes = useMemo(() => {
    return Array.from({ length: 30 }).map((_, i) => ({
      id: i,
      position: [
        (Math.random() - 0.5) * 40,
        Math.random() * 5 + 1,
        (Math.random() - 0.5) * 40
      ],
      rotation: [
        Math.random() * Math.PI,
        Math.random() * Math.PI,
        Math.random() * Math.PI
      ],
      scale: Math.random() * 1.5 + 0.5,
    }));
  }, []);

  const spheres = useMemo(() => {
    return Array.from({ length: 15 }).map((_, i) => ({
      id: i,
      position: [
        (Math.random() - 0.5) * 40,
        Math.random() * 5 + 2,
        (Math.random() - 0.5) * 40
      ],
      radius: Math.random() * 1.5 + 0.5,
    }));
  }, []);

  return (
    <>
      {boxes.map((box) => (
        <RigidBody 
          key={`box-${box.id}`} 
          position={box.position} 
          rotation={box.rotation}
          colliders="cuboid"
          mass={box.scale * 2}
        >
          <mesh castShadow receiveShadow>
            <boxGeometry args={[box.scale, box.scale, box.scale]} />
            <meshStandardMaterial color="orange" />
          </mesh>
        </RigidBody>
      ))}

      {spheres.map((sphere) => (
        <RigidBody 
          key={`sphere-${sphere.id}`} 
          position={sphere.position} 
          colliders="ball"
          mass={sphere.radius * 3}
          restitution={0.7} // Make spheres bouncy
        >
          <mesh castShadow receiveShadow>
            <sphereGeometry args={[sphere.radius, 32, 32]} />
            <meshStandardMaterial color="cyan" roughness={0.2} metalness={0.5} />
          </mesh>
        </RigidBody>
      ))}

      {/* Add a central ramp just for fun */}
      <RigidBody type="fixed" position={[0, -0.5, 10]} rotation={[0.2, 0, 0]} friction={2}>
        <mesh receiveShadow castShadow>
          <boxGeometry args={[10, 1, 10]} />
          <meshStandardMaterial color="darkgreen" />
        </mesh>
      </RigidBody>
    </>
  );
};
