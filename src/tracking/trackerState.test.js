import { describe, expect, it } from "vitest";
import { CONFIRM_FRAMES, TRACKER_STATUS, createTrackerState, stepTracker } from "./trackerState";

const SEEN = { visible: true };
const UNSEEN = { visible: false };
const OPTS = { holdTime: 1.5 };
const { SEARCH, TRACKING, LOST } = TRACKER_STATUS;

const run = (state, detections, dt = 0.1) =>
  detections.reduce((s, d) => stepTracker(s, d, dt, OPTS), state);

describe("trackerState", () => {
  it("starts in SEARCH", () => {
    expect(createTrackerState()).toEqual({ status: SEARCH, seenFrames: 0, lostTime: 0 });
  });

  it(`needs ${CONFIRM_FRAMES} consecutive sightings to start TRACKING`, () => {
    const almost = run(createTrackerState(), [SEEN, SEEN]);
    expect(almost.status).toBe(SEARCH);
    expect(run(almost, [SEEN]).status).toBe(TRACKING);
  });

  it("resets the confirmation count on a miss", () => {
    const state = run(createTrackerState(), [SEEN, SEEN, UNSEEN, SEEN, SEEN]);
    expect(state.status).toBe(SEARCH);
    expect(state.seenFrames).toBe(2);
  });

  it("goes LOST when a tracked target disappears", () => {
    const tracking = run(createTrackerState(), [SEEN, SEEN, SEEN]);
    expect(run(tracking, [UNSEEN])).toEqual({ status: LOST, seenFrames: 0, lostTime: 0 });
  });

  it("returns to TRACKING when a lost target reappears", () => {
    const lost = run(createTrackerState(), [SEEN, SEEN, SEEN, UNSEEN, UNSEEN]);
    expect(run(lost, [SEEN]).status).toBe(TRACKING);
  });

  it("falls back to SEARCH only after holdTime is exceeded", () => {
    const lost = run(createTrackerState(), [SEEN, SEEN, SEEN, UNSEEN]);
    const atLimit = run(lost, [UNSEEN, UNSEEN, UNSEEN], 0.5); // lostTime = 1.5
    expect(atLimit.status).toBe(LOST);
    expect(run(atLimit, [UNSEEN], 0.5)).toEqual(createTrackerState());
  });

  it("treats a missing detection as not visible", () => {
    const tracking = run(createTrackerState(), [SEEN, SEEN, SEEN]);
    expect(stepTracker(tracking, null, 0.1, OPTS).status).toBe(LOST);
  });

  it("recovers from an unknown status", () => {
    expect(stepTracker({ status: "BOGUS" }, SEEN, 0.1, OPTS)).toEqual(createTrackerState());
  });

  it("does not mutate the previous state", () => {
    const prev = Object.freeze(createTrackerState());
    expect(() => stepTracker(prev, SEEN, 0.1, OPTS)).not.toThrow();
  });
});
