import * as THREE from "three";
import { detectRedTarget } from "../../../src/tracking/pixelDetector.js";
import { detectByProjection } from "../../../src/tracking/geometryDetector.js";
import { stepTracker, createTrackerState } from "../../../src/tracking/trackerState.js";
import { commandGimbal, createGimbal } from "../../../src/tracking/gimbalController.js";
import { stepGuidance, createGuidanceState } from "../../../src/tracking/guidanceController.js";
const W = 320, H = 240;
const empty = new Uint8Array(W * H * 4).fill(60);
const withTarget = new Uint8Array(empty);
for (let r = 100; r < 130; r++) for (let c = 140; c < 160; c++) { const i = (r * W + c) * 4; withTarget[i] = 200; withTarget[i + 1] = 20; withTarget[i + 2] = 20; }
const cam = new THREE.PerspectiveCamera(60, 4 / 3, 0.1, 500); cam.position.set(0, 19.7, 0); cam.lookAt(10, 0.25, 8); cam.updateMatrixWorld();
const tgt = { center: new THREE.Vector3(10, 0.25, 8), quaternion: new THREE.Quaternion(), halfExtents: new THREE.Vector3(0.5, 0.25, 1) };
const gp = { kp: 4, kd: 0.1, maxRate: 1.57, scanRate: 0.52, scanTilt: -0.78, vFov: 1.047, aspect: 4 / 3 };
function bench(name, fn, n) {
  for (let i = 0; i < Math.min(n, 200); i++) fn();
  const t0 = performance.now(); for (let i = 0; i < n; i++) fn(); const ms = (performance.now() - t0) / n;
  return { name, us: Math.round(ms * 1000 * 10) / 10 };
}
const res = [
  bench("pixel-empty", () => detectRedTarget(empty, W, H), 500),
  bench("pixel-target", () => detectRedTarget(withTarget, W, H), 500),
  bench("geometry", () => detectByProjection(tgt, cam, () => false), 20000),
  bench("tracker+gimbal", () => commandGimbal(createGimbal(-0.7), "TRACKING", { x: 0.1, y: -0.05 }, 1 / 30, gp) && stepTracker(createTrackerState(), { visible: true }, 1 / 30, { holdTime: 1.5 }), 100000),
  bench("guidance", () => stepGuidance(createGuidanceState(), { dronePos: { x: 0, y: 20, z: 0 }, targetPos: { x: 10, y: 0.25, z: 8 }, tracking: true, dt: 1 / 60 }), 100000),
];
console.log(JSON.stringify(res));
