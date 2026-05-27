import { RigidBody } from "@react-three/rapier";
import { Grid } from "@react-three/drei";

export const Environment = () => {
  return (
    <>
      <ambientLight intensity={0.5} />
      <directionalLight 
        position={[10, 10, 10]} 
        intensity={1} 
        castShadow 
        shadow-mapSize={[2048, 2048]}
      />
      
      {/* Ground Plane */}
      <RigidBody type="fixed" friction={2}>
        <mesh receiveShadow position={[0, -0.5, 0]}>
          <boxGeometry args={[100, 1, 100]} />
          <meshStandardMaterial color="#303030" />
        </mesh>
      </RigidBody>

      {/* Boundaries (Invisible walls to keep objects inside) */}
      <RigidBody type="fixed" position={[0, 5, -50]}>
        <mesh visible={false}>
          <boxGeometry args={[100, 10, 1]} />
          <meshBasicMaterial transparent opacity={0} />
        </mesh>
      </RigidBody>
      <RigidBody type="fixed" position={[0, 5, 50]}>
        <mesh visible={false}>
          <boxGeometry args={[100, 10, 1]} />
          <meshBasicMaterial transparent opacity={0} />
        </mesh>
      </RigidBody>
      <RigidBody type="fixed" position={[50, 5, 0]}>
        <mesh visible={false}>
          <boxGeometry args={[1, 10, 100]} />
          <meshBasicMaterial transparent opacity={0} />
        </mesh>
      </RigidBody>
      <RigidBody type="fixed" position={[-50, 5, 0]}>
        <mesh visible={false}>
          <boxGeometry args={[1, 10, 100]} />
          <meshBasicMaterial transparent opacity={0} />
        </mesh>
      </RigidBody>

      {/* Grid helper for spatial reference */}
      <Grid 
        infiniteGrid 
        fadeDistance={50} 
        fadeStrength={5} 
        sectionSize={10} 
        cellSize={1} 
        sectionColor="#505050" 
        cellColor="#404040" 
      />
    </>
  );
};
