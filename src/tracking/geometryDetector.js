import * as THREE from "three";
import { NO_DETECTION, makeDetection } from "./detection";

const CORNER_SIGNS = [
  [-1, -1, -1], [-1, -1, 1], [-1, 1, -1], [-1, 1, 1],
  [1, -1, -1], [1, -1, 1], [1, 1, -1], [1, 1, 1],
];
const TOP_CORNER_SIGNS = CORNER_SIGNS.filter(([, sy]) => sy === 1);

// target: { center: Vector3, quaternion: Quaternion, halfExtents: Vector3 }
// camera: matrixWorld / matrixWorldInverse / projectionMatrix must be current.
// isOccluded: (point: Vector3) => boolean
export function detectByProjection(target, camera, isOccluded) {
  const inFront = boxPoints(target, CORNER_SIGNS).filter((p) => isInFront(camera, p));
  if (inFront.length === 0) return NO_DETECTION;

  const bbox = clipToFrame(boundsOf(inFront.map((p) => p.clone().project(camera))));
  if (!bbox) return NO_DETECTION;

  const samples = [target.center, ...boxPoints(target, TOP_CORNER_SIGNS)];
  if (samples.every((p) => isOccluded(p))) return NO_DETECTION;

  return makeDetection(bbox);
}

function boxPoints({ center, quaternion, halfExtents }, signs) {
  return signs.map(([sx, sy, sz]) =>
    new THREE.Vector3(sx * halfExtents.x, sy * halfExtents.y, sz * halfExtents.z)
      .applyQuaternion(quaternion)
      .add(center)
  );
}

function isInFront(camera, point) {
  return point.clone().applyMatrix4(camera.matrixWorldInverse).z < -camera.near;
}

function boundsOf(points) {
  return {
    minX: Math.min(...points.map((p) => p.x)),
    maxX: Math.max(...points.map((p) => p.x)),
    minY: Math.min(...points.map((p) => p.y)),
    maxY: Math.max(...points.map((p) => p.y)),
  };
}

function clipToFrame(bounds) {
  const clipped = {
    minX: Math.max(bounds.minX, -1),
    maxX: Math.min(bounds.maxX, 1),
    minY: Math.max(bounds.minY, -1),
    maxY: Math.min(bounds.maxY, 1),
  };
  return clipped.minX < clipped.maxX && clipped.minY < clipped.maxY ? clipped : null;
}
