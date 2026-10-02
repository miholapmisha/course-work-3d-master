// Proportional Navigation Guidance (PNG) and IBVS approach controller for multicopter.
// Based on: "Precise Interception Flight Targets by Image-based Visual Servoing of Multicopter" (arXiv:2409.17497v2)

export const DEFAULT_GUIDANCE_PARAMS = Object.freeze({
  approachSpeed: 6, // desired cruising/approach speed (m/s)
  pngGain: 3, // navigation constant K (typically 2-5, paper recommends 3)
  maxAccel: 6, // maximum flight acceleration (m/s^2)
  minHeight: 0.5, // minimum flight altitude above ground (m)
  interceptRadius: 1.2, // proximity distance considered as interception (m)
});

export function createGuidanceState() {
  return {
    active: false,
    sigma: { azim: 0, elev: 0 }, // velocity heading angles (rad)
    prevQ: null, // previous LOS angles { azim, elev }
    velocity: { x: 0, y: 0, z: 0 }, // current velocity (m/s)
    intercepted: false,
  };
}

/**
 * Computes LOS (Line-Of-Sight) angles and relative distance in Three.js coordinates:
 * X: right, Y: up, Z: back/forward
 */
export function computeLos(dronePos, targetPos) {
  const dx = targetPos.x - dronePos.x;
  const dy = targetPos.y - dronePos.y;
  const dz = targetPos.z - dronePos.z;
  const horizontalDist = Math.hypot(dx, dz);
  const distance = Math.hypot(dx, dy, dz);

  const azim = Math.atan2(dx, dz); // angle in horizontal XZ plane
  const elev = Math.atan2(dy, Math.max(1e-4, horizontalDist)); // angle in vertical plane

  return { azim, elev, distance, dx, dy, dz };
}

/**
 * Normalizes an angle into [-PI, PI].
 */
export function wrapAngle(angle) {
  let a = angle % (2 * Math.PI);
  if (a > Math.PI) a -= 2 * Math.PI;
  if (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

/**
 * Executes one step of the PNG flight controller.
 *
 * @param {object} prevState Current guidance state
 * @param {object} input Step input
 * @param {object} input.dronePos { x, y, z }
 * @param {object} input.targetPos { x, y, z }
 * @param {boolean} input.tracking Whether target is confirmed and actively tracked
 * @param {number} input.dt Delta time in seconds
 * @param {object} input.params Guidance tuning parameters
 */
export function stepGuidance(prevState, { dronePos, targetPos, tracking, dt, params = DEFAULT_GUIDANCE_PARAMS }) {
  const mergedParams = { ...DEFAULT_GUIDANCE_PARAMS, ...params };
  const { approachSpeed, pngGain, maxAccel, minHeight, interceptRadius } = mergedParams;

  // If tracking is lost or approach speed is 0, decelerate to hover
  if (!tracking || approachSpeed <= 0 || !dronePos || !targetPos) {
    const decelRate = maxAccel * dt;
    const currentSpeed = Math.hypot(prevState.velocity.x, prevState.velocity.y, prevState.velocity.z);
    if (currentSpeed <= 1e-4 || dt <= 0) {
      return {
        state: { ...prevState, active: false, prevQ: null, velocity: { x: 0, y: 0, z: 0 }, intercepted: false },
        velocity: { x: 0, y: 0, z: 0 },
        intercepted: false,
      };
    }
    const factor = Math.max(0, (currentSpeed - decelRate) / currentSpeed);
    const stoppedVel = {
      x: prevState.velocity.x * factor,
      y: prevState.velocity.y * factor,
      z: prevState.velocity.z * factor,
    };
    return {
      state: { ...prevState, active: false, prevQ: null, velocity: stoppedVel, intercepted: false },
      velocity: stoppedVel,
      intercepted: false,
    };
  }

  const los = computeLos(dronePos, targetPos);

  // Check interception / proximity condition
  if (los.distance <= interceptRadius) {
    return {
      state: { ...prevState, active: true, prevQ: { azim: los.azim, elev: los.elev }, velocity: { x: 0, y: 0, z: 0 }, intercepted: true },
      velocity: { x: 0, y: 0, z: 0 },
      intercepted: true,
    };
  }

  let sigmaAzim = prevState.sigma.azim;
  let sigmaElev = prevState.sigma.elev;

  if (!prevState.active || prevState.prevQ === null) {
    // Initial acquisition: point velocity directly along LOS
    sigmaAzim = los.azim;
    sigmaElev = los.elev;
  } else {
    // PNG update law: Δσ = K * Δq
    const dQAzim = wrapAngle(los.azim - prevState.prevQ.azim);
    const dQElev = los.elev - prevState.prevQ.elev;

    sigmaAzim = wrapAngle(sigmaAzim + pngGain * dQAzim);
    sigmaElev = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, sigmaElev + pngGain * dQElev));
  }

  // Desired unit velocity vector
  const cosElev = Math.cos(sigmaElev);
  const nvx = cosElev * Math.sin(sigmaAzim);
  let nvy = Math.sin(sigmaElev);
  const nvz = cosElev * Math.cos(sigmaAzim);

  // Prevent descent if altitude is below or approaching minHeight
  if (dronePos.y <= minHeight && nvy < 0) {
    nvy = 0;
  }

  let targetVx = nvx * approachSpeed;
  let targetVy = nvy * approachSpeed;
  let targetVz = nvz * approachSpeed;

  // Apply acceleration limit to achieve smooth multicopter dynamics
  let vx = prevState.velocity.x;
  let vy = prevState.velocity.y;
  let vz = prevState.velocity.z;

  if (dt > 0) {
    const maxDeltaV = maxAccel * dt;
    const diffX = targetVx - vx;
    const diffY = targetVy - vy;
    const diffZ = targetVz - vz;
    const diffMag = Math.hypot(diffX, diffY, diffZ);

    if (diffMag > maxDeltaV) {
      const scale = maxDeltaV / diffMag;
      vx += diffX * scale;
      vy += diffY * scale;
      vz += diffZ * scale;
    } else {
      vx = targetVx;
      vy = targetVy;
      vz = targetVz;
    }
  } else {
    vx = targetVx;
    vy = targetVy;
    vz = targetVz;
  }

  const nextState = {
    active: true,
    sigma: { azim: sigmaAzim, elev: sigmaElev },
    prevQ: { azim: los.azim, elev: los.elev },
    velocity: { x: vx, y: vy, z: vz },
    intercepted: false,
  };

  return {
    state: nextState,
    velocity: { x: vx, y: vy, z: vz },
    intercepted: false,
  };
}
