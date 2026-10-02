// Longest frame step we accept; protects against a resumed background tab.
export const MAX_FRAME_DT = 0.1;

export function clampFrameDt(frameDt) {
  return Number.isFinite(frameDt) && frameDt > 0 ? Math.min(frameDt, MAX_FRAME_DT) : 0;
}

// Detection runs at detectHz, slower than rendering — like a real camera.
// Returns the new accumulator and, on a tick, the time since the previous tick.
export function advanceDetectionClock(accumulated, frameDt, detectHz) {
  const period = 1 / (detectHz > 0 ? detectHz : 1);
  const next = accumulated + clampFrameDt(frameDt);
  return next >= period ? { accumulated: 0, tickDt: next } : { accumulated: next, tickDt: null };
}
