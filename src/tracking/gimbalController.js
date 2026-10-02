import * as THREE from "three";
import { TRACKER_STATUS } from "./trackerState";

export const TILT_MIN = THREE.MathUtils.degToRad(-85);
export const TILT_MAX = THREE.MathUtils.degToRad(-5);
// Fixed gain (1/s) that swings tilt back to scanTilt while searching.
export const SCAN_TILT_GAIN = 2;

const ZERO_RATE = Object.freeze({ pan: 0, tilt: 0 });

// Gimbal: { pan, tilt, rate: { pan, tilt }, prevErr: { x, y } | null } (rad, rad/s).
// three.js convention: +pan turns the camera LEFT, +tilt turns it UP.
export function createGimbal(tilt) {
  return { pan: 0, tilt: clamp(tilt, TILT_MIN, TILT_MAX), rate: ZERO_RATE, prevErr: null };
}

// Pan-then-tilt gimbal orientation; the camera looks down its local -Z.
export function gimbalQuaternion(pan, tilt) {
  return new THREE.Quaternion().setFromEuler(new THREE.Euler(tilt, pan, 0, "YXZ"));
}

// Pinhole model: NDC offset of the target -> angle off the optical axis.
export function angularError(center, { vFov, aspect }) {
  const tanHalfV = Math.tan(vFov / 2);
  return { x: Math.atan(center.x * tanHalfV * aspect), y: Math.atan(center.y * tanHalfV) };
}

// Called on each detection tick: chooses the rate held until the next tick.
// params: { kp, kd, maxRate, scanRate, scanTilt, vFov, aspect } in rad / s.
export function commandGimbal(gimbal, status, center, dt, params) {
  if (status === TRACKER_STATUS.SEARCH) {
    // gain·dt ≤ 1 (deadbeat at most), so low detection rates cannot overshoot.
    const gain = dt > 0 ? Math.min(SCAN_TILT_GAIN, 1 / dt) : SCAN_TILT_GAIN;
    const tiltRate = gain * (params.scanTilt - gimbal.tilt);
    return {
      ...gimbal,
      rate: { pan: clampAbs(params.scanRate, params.maxRate), tilt: clampAbs(tiltRate, params.maxRate) },
      prevErr: null,
    };
  }
  if (status !== TRACKER_STATUS.TRACKING || !center) {
    return { ...gimbal, rate: ZERO_RATE, prevErr: null };
  }
  const err = angularError(center, params);
  const dErr =
    gimbal.prevErr && dt > 0
      ? { x: (err.x - gimbal.prevErr.x) / dt, y: (err.y - gimbal.prevErr.y) / dt }
      : { x: 0, y: 0 };
  return {
    ...gimbal,
    rate: {
      pan: clampAbs(-(params.kp * err.x + params.kd * dErr.x), params.maxRate),
      tilt: clampAbs(params.kp * err.y + params.kd * dErr.y, params.maxRate),
    },
    prevErr: err,
  };
}

// Called every rendered frame: applies the held rate.
export function integrateGimbal(gimbal, dt) {
  return {
    ...gimbal,
    pan: wrapAngle(gimbal.pan + gimbal.rate.pan * dt),
    tilt: clamp(gimbal.tilt + gimbal.rate.tilt * dt, TILT_MIN, TILT_MAX),
  };
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function clampAbs(value, limit) {
  return clamp(value, -limit, limit);
}

// Maps any angle into (-PI, PI].
function wrapAngle(angle) {
  const twoPi = 2 * Math.PI;
  const wrapped = ((((angle + Math.PI) % twoPi) + twoPi) % twoPi) - Math.PI;
  return wrapped === -Math.PI ? Math.PI : wrapped;
}
