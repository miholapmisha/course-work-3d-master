import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useRapier } from "@react-three/rapier";
import * as THREE from "three";
import { useFlyingObjectParams, DETECT_MODES, droneResetEmitter } from "../state/useFlyingObjectParams";
import { useTrackerStore } from "../state/useTrackerStore";
import { NO_DETECTION } from "../tracking/detection";
import { detectByProjection } from "../tracking/geometryDetector";
import { makeOcclusionTest } from "../tracking/occlusion";
import { detectRedTarget } from "../tracking/pixelDetector";
import { TRACKER_STATUS, createTrackerState, stepTracker } from "../tracking/trackerState";
import { advanceDetectionClock, clampFrameDt } from "../tracking/detectionClock";
import { createGuidanceState, stepGuidance } from "../tracking/guidanceController";
import {
  commandGimbal,
  createGimbal,
  gimbalQuaternion,
  integrateGimbal,
} from "../tracking/gimbalController";
import { POV_ASPECT, POV_HEIGHT, POV_WIDTH } from "../components/povLayout";

const CAMERA_DROP = 0.3; // the gimbal hangs this far below the airframe (m)
const CAMERA_NEAR = 0.1;
const CAMERA_FAR = 500;
const WARN_INTERVAL_MS = 1000;
const deg = THREE.MathUtils.degToRad;

// Per frame: integrate gimbal -> sync POV camera -> (detection tick) detect,
// step tracker, command gimbal, publish -> step flight guidance -> render POV into the FBO.
export function useFlyingObjectTracking({ targetRef, bodyRef, rigidBodyRef, fbo }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const { world, rapier } = useRapier();
  const cameraRef = useRef(null);
  const pixelsRef = useRef(null);
  const gimbalRef = useRef(null);
  const trackerRef = useRef(createTrackerState());
  const guidanceRef = useRef(createGuidanceState());
  const prevConfigRef = useRef(null);
  const clockRef = useRef(0);
  const lastWarnRef = useRef(0);

  useEffect(() => {
    return droneResetEmitter.subscribe(() => {
      const p = useFlyingObjectParams.getState();
      rigidBodyRef?.current?.setTranslation({ x: p.posX, y: p.height, z: p.posZ }, true);
      rigidBodyRef?.current?.setLinvel({ x: 0, y: 0, z: 0 }, true);
      guidanceRef.current = createGuidanceState();
      prevConfigRef.current = { posX: p.posX, posZ: p.posZ, height: p.height };
    });
  }, [rigidBodyRef]);

  useFrame((_, delta) => {
    const target = targetRef.current;
    if (!target) return;
    const params = useFlyingObjectParams.getState();
    const gimbalParams = toGimbalParams(params);
    const camera = (cameraRef.current ??= new THREE.PerspectiveCamera(params.fov, POV_ASPECT, CAMERA_NEAR, CAMERA_FAR));

    // Handle parameter slider adjustments by teleporting to configured position
    if (
      !prevConfigRef.current ||
      prevConfigRef.current.posX !== params.posX ||
      prevConfigRef.current.posZ !== params.posZ ||
      prevConfigRef.current.height !== params.height
    ) {
      rigidBodyRef?.current?.setTranslation({ x: params.posX, y: params.height, z: params.posZ }, true);
      rigidBodyRef?.current?.setLinvel({ x: 0, y: 0, z: 0 }, true);
      guidanceRef.current = createGuidanceState();
      prevConfigRef.current = { posX: params.posX, posZ: params.posZ, height: params.height };
    }

    const dronePos = rigidBodyRef?.current
      ? rigidBodyRef.current.translation()
      : { x: params.posX, y: params.height, z: params.posZ };

    const frameDt = clampFrameDt(delta);
    gimbalRef.current = integrateGimbal(gimbalRef.current ?? createGimbal(gimbalParams.scanTilt), frameDt);
    syncPovCamera(camera, gimbalRef.current, dronePos, params);

    const clock = advanceDetectionClock(clockRef.current, delta, params.detectHz);
    clockRef.current = clock.accumulated;
    if (clock.tickDt !== null) {
      const context = { target, camera, world, rapier, gl, fbo, pixelsRef };
      const detection = detectSafely(() => runDetection(params.detectMode, context), lastWarnRef);
      trackerRef.current = stepTracker(trackerRef.current, detection, clock.tickDt, { holdTime: params.holdTime });
      const { status } = trackerRef.current;
      gimbalRef.current = commandGimbal(gimbalRef.current, status, detection.center, clock.tickDt, gimbalParams);
      useTrackerStore.setState({ status, bbox: detection.bbox, center: detection.center });
    }

    // Step PNG flight guidance towards the target
    const targetT = target.translation();
    const targetPos = { x: targetT.x, y: targetT.y, z: targetT.z };
    const guidanceResult = stepGuidance(guidanceRef.current, {
      dronePos,
      targetPos,
      tracking: trackerRef.current.status === TRACKER_STATUS.TRACKING,
      dt: frameDt,
      params: {
        approachSpeed: params.approachSpeed,
        pngGain: params.pngGain,
      },
    });
    guidanceRef.current = guidanceResult.state;

    if (rigidBodyRef?.current) {
      rigidBodyRef.current.setLinvel(guidanceResult.velocity, true);
    }

    if (bodyRef.current) {
      const horizSpeed = Math.hypot(guidanceResult.velocity.x, guidanceResult.velocity.z);
      if (horizSpeed > 0.3) {
        bodyRef.current.rotation.y = Math.atan2(guidanceResult.velocity.x, guidanceResult.velocity.z);
      }
    }

    renderPov(gl, scene, camera, fbo, bodyRef.current);
  });
}

function toGimbalParams(params) {
  return {
    kp: params.gimbalKp,
    kd: params.gimbalKd,
    maxRate: deg(params.maxRate),
    scanRate: deg(params.scanRate),
    scanTilt: deg(params.scanTilt),
    vFov: deg(params.fov),
    aspect: POV_ASPECT,
  };
}

function runDetection(mode, { target, camera, world, rapier, gl, fbo, pixelsRef }) {
  if (mode === DETECT_MODES.PIXEL) {
    pixelsRef.current ??= new Uint8Array(POV_WIDTH * POV_HEIGHT * 4);
    // The FBO still holds the previous frame: a one-frame camera latency.
    gl.readRenderTargetPixels(fbo, 0, 0, POV_WIDTH, POV_HEIGHT, pixelsRef.current);
    return detectRedTarget(pixelsRef.current, POV_WIDTH, POV_HEIGHT);
  }
  return detectTargetGeometry(target, camera, world, rapier);
}

function detectTargetGeometry(target, camera, world, rapier) {
  if (target.numColliders() === 0) return NO_DETECTION;
  const halfExtents = target.collider(0).halfExtents(); // main hull cuboid
  if (!halfExtents) return NO_DETECTION;
  const t = target.translation();
  const r = target.rotation();
  return detectByProjection(
    {
      center: new THREE.Vector3(t.x, t.y, t.z),
      quaternion: new THREE.Quaternion(r.x, r.y, r.z, r.w),
      halfExtents: new THREE.Vector3(halfExtents.x, halfExtents.y, halfExtents.z),
    },
    camera,
    makeOcclusionTest(world, rapier, camera.position, target.handle)
  );
}

function detectSafely(run, lastWarnRef) {
  try {
    return run();
  } catch (error) {
    const now = performance.now();
    if (now - lastWarnRef.current > WARN_INTERVAL_MS) {
      lastWarnRef.current = now;
      console.warn("[flying-object] detection failed, treating target as not visible:", error);
    }
    return NO_DETECTION;
  }
}

function syncPovCamera(camera, gimbal, dronePos, params) {
  camera.position.set(dronePos.x, dronePos.y - CAMERA_DROP, dronePos.z);
  camera.quaternion.copy(gimbalQuaternion(gimbal.pan, gimbal.tilt));
  if (camera.fov !== params.fov) {
    camera.fov = params.fov;
    camera.updateProjectionMatrix();
  }
  camera.updateMatrixWorld();
}

function renderPov(gl, scene, camera, fbo, body) {
  const previousTarget = gl.getRenderTarget();
  if (body) body.visible = false; // the camera must not see its own airframe
  gl.setRenderTarget(fbo);
  gl.render(scene, camera);
  gl.setRenderTarget(previousTarget);
  if (body) body.visible = true;
}
