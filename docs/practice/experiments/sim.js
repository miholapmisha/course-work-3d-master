// Headless closed-loop simulation built on the project's pure tracking modules.
// Mirrors useFlyingObjectTracking: integrate gimbal -> sync camera -> (tick) detect,
// stepTracker, commandGimbal -> stepGuidance -> move flying object.
import * as THREE from "three";
import { detectByProjection } from "../../../src/tracking/geometryDetector.js";
import { TRACKER_STATUS, createTrackerState, stepTracker } from "../../../src/tracking/trackerState.js";
import { advanceDetectionClock, clampFrameDt } from "../../../src/tracking/detectionClock.js";
import { commandGimbal, createGimbal, gimbalQuaternion, integrateGimbal } from "../../../src/tracking/gimbalController.js";
import { createGuidanceState, stepGuidance } from "../../../src/tracking/guidanceController.js";

export const deg = THREE.MathUtils.degToRad;
export const rad2deg = THREE.MathUtils.radToDeg;
export const FRAME_DT = 1 / 60;
const ASPECT = 4 / 3;
const HALF = new THREE.Vector3(0.5, 0.25, 1.0); // target hull 1 x 0.5 x 2 m
export const TARGET_Y = 0.25;
const CAMERA_DROP = 0.3;

export const DEFAULTS = Object.freeze({
  posX: 0, posZ: 0, height: 20, fov: 60, gimbalKp: 4, gimbalKd: 0.1, maxRate: 90,
  holdTime: 1.5, scanRate: 30, scanTilt: -45, detectHz: 30, approachSpeed: 0, pngGain: 3,
});

function gimbalParams(p) {
  return {
    kp: p.gimbalKp, kd: p.gimbalKd, maxRate: deg(p.maxRate), scanRate: deg(p.scanRate),
    scanTilt: deg(p.scanTilt), vFov: deg(p.fov), aspect: ASPECT,
  };
}

// Pan/tilt that point the optical axis (-Z) along dir (three.js YXZ convention).
export function aimAt(from, to) {
  const d = new THREE.Vector3().subVectors(to, from).normalize();
  return { pan: Math.atan2(-d.x, -d.z), tilt: Math.asin(d.y) };
}

// trajectory(t) -> { x, z, heading }
export function simulate({ params: overrides = {}, trajectory, duration, occluded = () => false, startTracking = false }) {
  const p = { ...DEFAULTS, ...overrides };
  const gp = gimbalParams(p);
  const camera = new THREE.PerspectiveCamera(p.fov, ASPECT, 0.1, 500);
  const drone = new THREE.Vector3(p.posX, p.height, p.posZ);
  let gimbal = createGimbal(gp.scanTilt);
  let tracker = createTrackerState();
  let guidance = createGuidanceState();
  let clock = 0;
  const log = [];

  if (startTracking) {
    const t0 = trajectory(0);
    const aim = aimAt(new THREE.Vector3(drone.x, drone.y - CAMERA_DROP, drone.z), new THREE.Vector3(t0.x, TARGET_Y, t0.z));
    gimbal = { ...createGimbal(aim.tilt), pan: aim.pan };
    tracker = { status: TRACKER_STATUS.TRACKING, seenFrames: 3, lostTime: 0 };
  }

  const frames = Math.round(duration / FRAME_DT);
  for (let i = 0; i <= frames; i++) {
    const t = i * FRAME_DT;
    const tr = trajectory(t);
    const center = new THREE.Vector3(tr.x, TARGET_Y, tr.z);
    const quaternion = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), tr.heading ?? 0);
    const dt = clampFrameDt(FRAME_DT);

    gimbal = integrateGimbal(gimbal, dt);
    camera.position.set(drone.x, drone.y - CAMERA_DROP, drone.z);
    camera.quaternion.copy(gimbalQuaternion(gimbal.pan, gimbal.tilt));
    camera.updateMatrixWorld();

    const c = advanceDetectionClock(clock, FRAME_DT, p.detectHz);
    clock = c.accumulated;
    let visible = null;
    if (c.tickDt !== null) {
      const det = detectByProjection({ center, quaternion, halfExtents: HALF }, camera, (pt) => occluded(t, pt));
      visible = det.visible;
      tracker = stepTracker(tracker, det, c.tickDt, { holdTime: p.holdTime });
      gimbal = commandGimbal(gimbal, tracker.status, det.center, c.tickDt, gp);
    }

    const g = stepGuidance(guidance, {
      dronePos: { x: drone.x, y: drone.y, z: drone.z },
      targetPos: { x: center.x, y: center.y, z: center.z },
      tracking: tracker.status === TRACKER_STATUS.TRACKING,
      dt,
      params: { approachSpeed: p.approachSpeed, pngGain: p.pngGain },
    });
    guidance = g.state;
    drone.x += g.velocity.x * dt;
    drone.y += g.velocity.y * dt;
    drone.z += g.velocity.z * dt;

    const axis = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    const los = new THREE.Vector3().subVectors(center, camera.position).normalize();
    const errDeg = rad2deg(Math.acos(Math.min(1, Math.max(-1, axis.dot(los)))));
    log.push({
      t, status: tracker.status, visible, errDeg,
      pan: rad2deg(gimbal.pan), tilt: rad2deg(gimbal.tilt),
      drone: { x: drone.x, y: drone.y, z: drone.z }, target: { x: center.x, z: center.z },
      dist: drone.distanceTo(center), intercepted: g.intercepted,
    });
    if (g.intercepted) break;
  }
  return log;
}

export function metrics(log, { settle = 1.0 } = {}) {
  const firstTrack = log.find((r) => r.status === TRACKER_STATUS.TRACKING);
  const acq = firstTrack ? firstTrack.t : null;
  let losses = 0;
  let notTracking = 0;
  for (let i = 1; i < log.length; i++) {
    if (log[i - 1].status === TRACKER_STATUS.TRACKING && log[i].status !== TRACKER_STATUS.TRACKING) losses++;
    if (acq !== null && log[i].t >= acq && log[i].status !== TRACKER_STATUS.TRACKING) notTracking += FRAME_DT;
  }
  const steady = acq === null ? [] : log.filter((r) => r.t >= acq + settle && r.status === TRACKER_STATUS.TRACKING);
  const rms = steady.length ? Math.sqrt(steady.reduce((s, r) => s + r.errDeg ** 2, 0) / steady.length) : null;
  const max = steady.length ? Math.max(...steady.map((r) => r.errDeg)) : null;
  const after = acq === null ? 0 : log[log.length - 1].t - acq;
  return {
    acq, losses, rms, max,
    trackShare: acq === null ? 0 : 1 - notTracking / Math.max(after, 1e-9),
    notTracking,
  };
}

// --- trajectories ---------------------------------------------------------
export const circle = ({ cx = 0, cz = 0, r = 15, v = 8, phase = 0 }) => (t) => {
  const w = v / r;
  const a = phase + w * t;
  return { x: cx + r * Math.cos(a), z: cz + r * Math.sin(a), heading: Math.atan2(-Math.sin(a), Math.cos(a)) };
};

export const line = ({ x0, z0, vx, vz }) => (t) => ({ x: x0 + vx * t, z: z0 + vz * t, heading: Math.atan2(vx, vz) });

export const zigzag = ({ x0 = -30, z0 = 12, v = 8, amp = 6, period = 5 }) => (t) => {
  const w = (2 * Math.PI) / period;
  const x = x0 + v * t;
  const z = z0 + amp * Math.sin(w * t);
  return { x, z, heading: Math.atan2(v, amp * w * Math.cos(w * t)) };
};

export const still = ({ x, z }) => () => ({ x, z, heading: 0 });
