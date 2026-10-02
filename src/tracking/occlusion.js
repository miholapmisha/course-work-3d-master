import * as THREE from "three";

// A ray hit closer than this to the sample point counts as hitting the point.
export const OCCLUSION_EPSILON = 0.05;

// Builds isOccluded(point) for detectByProjection from a Rapier world: the point
// is occluded when the first collider on the ray origin -> point belongs to a
// different body and lies before the point.
export function makeOcclusionTest(world, rapier, origin, targetHandle) {
  return (point) => {
    const direction = new THREE.Vector3().subVectors(point, origin);
    const distance = direction.length();
    if (distance < OCCLUSION_EPSILON) return false;
    direction.divideScalar(distance);

    const hit = world.castRay(new rapier.Ray(origin, direction), distance, true);
    if (!hit) return false;
    if (hit.collider.parent()?.handle === targetHandle) return false;
    return hit.timeOfImpact < distance - OCCLUSION_EPSILON;
  };
}
