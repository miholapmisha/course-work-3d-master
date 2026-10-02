export const TRACKER_STATUS = Object.freeze({
  SEARCH: "SEARCH",
  TRACKING: "TRACKING",
  LOST: "LOST",
});

// Consecutive sightings needed before SEARCH turns into TRACKING (debounces noise).
export const CONFIRM_FRAMES = 3;

export function createTrackerState() {
  return { status: TRACKER_STATUS.SEARCH, seenFrames: 0, lostTime: 0 };
}

// Called once per detection tick. dt = seconds since the previous tick.
export function stepTracker(prev, detection, dt, { holdTime }) {
  const visible = Boolean(detection?.visible);
  switch (prev.status) {
    case TRACKER_STATUS.SEARCH: {
      const seenFrames = visible ? prev.seenFrames + 1 : 0;
      return seenFrames >= CONFIRM_FRAMES
        ? { status: TRACKER_STATUS.TRACKING, seenFrames, lostTime: 0 }
        : { ...prev, seenFrames };
    }
    case TRACKER_STATUS.TRACKING:
      return visible ? prev : { status: TRACKER_STATUS.LOST, seenFrames: 0, lostTime: 0 };
    case TRACKER_STATUS.LOST: {
      if (visible) return { status: TRACKER_STATUS.TRACKING, seenFrames: 0, lostTime: 0 };
      const lostTime = prev.lostTime + dt;
      return lostTime > holdTime ? createTrackerState() : { ...prev, lostTime };
    }
    default:
      return createTrackerState();
  }
}
