import { Hud, OrthographicCamera } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import { POV_HEIGHT, POV_MARGIN, POV_WIDTH } from "./povLayout";

// Shows the flying object camera feed in the bottom-left corner. The HUD camera is
// orthographic in CSS-pixel units, so the plane lines up with PovOverlay.
export function FlyingObjectPov({ texture }) {
  const size = useThree((s) => s.size);
  const x = -size.width / 2 + POV_MARGIN + POV_WIDTH / 2;
  const y = -size.height / 2 + POV_MARGIN + POV_HEIGHT / 2;

  return (
    <Hud>
      <OrthographicCamera makeDefault position={[0, 0, 10]} />
      <mesh position={[x, y, 0]}>
        <planeGeometry args={[POV_WIDTH, POV_HEIGHT]} />
        <meshBasicMaterial map={texture} />
      </mesh>
    </Hud>
  );
}
