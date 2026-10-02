import { Canvas } from "@react-three/fiber";
import { Physics } from "@react-three/rapier";
import { Suspense, useRef } from "react";
import { Environment } from "./components/Environment";
import { Target } from "./components/Target";
import { FlyingObject } from "./components/FlyingObject";
import { CameraControls } from "./components/CameraControls";
import { Obstacles } from "./components/Obstacles";
import { ParamPanels } from "./components/ParamPanels";
import { PovOverlay } from "./components/PovOverlay";
import { useTargetParams } from "./state/useTargetParams";
import "./App.css";

function App() {
  const targetRef = useRef();
  const gravity = useTargetParams((s) => s.gravity);

  return (
    <div id="canvas-container">
      <Canvas shadows camera={{ position: [0, 5, -10], fov: 50 }}>
        <Suspense fallback={null}>
          <Physics gravity={[0, gravity, 0]}>
            <Environment />
            <Target ref={targetRef} />
            <FlyingObject targetRef={targetRef} />
            <CameraControls targetRef={targetRef} />
            <Obstacles />
          </Physics>
        </Suspense>
      </Canvas>
      <div className="ui-overlay">
        <h1>Target Tracking Simulator</h1>
        <p>Use WASD or Arrow Keys to move the target.</p>
        <p>Crash into crates and balls to see physics in action!</p>
      </div>
      <ParamPanels />
      <PovOverlay />
    </div>
  );
}

export default App;
