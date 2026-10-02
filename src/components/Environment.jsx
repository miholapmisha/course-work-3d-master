import { RigidBody, CuboidCollider } from "@react-three/rapier";
import { Grid } from "@react-three/drei";

const ARENA_HALF = 50;
const WALL_HALF_HEIGHT = 10;
// Amber, not red: the PIXEL detector treats red as the target.
const WALL_STRIP_COLOR = "#ffb300";

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
          <boxGeometry args={[ARENA_HALF * 2, 1, ARENA_HALF * 2]} />
          <meshStandardMaterial color="#303030" />
        </mesh>
      </RigidBody>

      {/* Boundaries — explicit colliders, no mesh dependency. Visible thin
          walls give the player a clear arena edge. */}
      <RigidBody type="fixed" colliders={false}>
        {/* North (+Z) */}
        <CuboidCollider
          args={[ARENA_HALF, WALL_HALF_HEIGHT, 0.5]}
          position={[0, WALL_HALF_HEIGHT, ARENA_HALF]}
        />
        {/* South (-Z) */}
        <CuboidCollider
          args={[ARENA_HALF, WALL_HALF_HEIGHT, 0.5]}
          position={[0, WALL_HALF_HEIGHT, -ARENA_HALF]}
        />
        {/* East (+X) */}
        <CuboidCollider
          args={[0.5, WALL_HALF_HEIGHT, ARENA_HALF]}
          position={[ARENA_HALF, WALL_HALF_HEIGHT, 0]}
        />
        {/* West (-X) */}
        <CuboidCollider
          args={[0.5, WALL_HALF_HEIGHT, ARENA_HALF]}
          position={[-ARENA_HALF, WALL_HALF_HEIGHT, 0]}
        />

        {/* Thin visible strip along each wall base for arena edge cue */}
        <mesh position={[0, 0.25, ARENA_HALF]}>
          <boxGeometry args={[ARENA_HALF * 2, 0.5, 0.2]} />
          <meshStandardMaterial color={WALL_STRIP_COLOR} emissive={WALL_STRIP_COLOR} emissiveIntensity={0.3} />
        </mesh>
        <mesh position={[0, 0.25, -ARENA_HALF]}>
          <boxGeometry args={[ARENA_HALF * 2, 0.5, 0.2]} />
          <meshStandardMaterial color={WALL_STRIP_COLOR} emissive={WALL_STRIP_COLOR} emissiveIntensity={0.3} />
        </mesh>
        <mesh position={[ARENA_HALF, 0.25, 0]}>
          <boxGeometry args={[0.2, 0.5, ARENA_HALF * 2]} />
          <meshStandardMaterial color={WALL_STRIP_COLOR} emissive={WALL_STRIP_COLOR} emissiveIntensity={0.3} />
        </mesh>
        <mesh position={[-ARENA_HALF, 0.25, 0]}>
          <boxGeometry args={[0.2, 0.5, ARENA_HALF * 2]} />
          <meshStandardMaterial color={WALL_STRIP_COLOR} emissive={WALL_STRIP_COLOR} emissiveIntensity={0.3} />
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
