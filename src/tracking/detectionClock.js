// Longest frame step we accept; protects against a resumed background tab.
export const MAX_FRAME_DT = 0.1;

export function clampFrameDt(frameDt) {
  return Number.isFinite(frameDt) && frameDt > 0 ? Math.min(frameDt, MAX_FRAME_DT) : 0;
}

// Leftover time carried past a tick, in periods; capped so a slow frame cannot
// queue up catch-up ticks.
export const MAX_CARRY_PERIODS = 0.5;

// Detection runs at detectHz, slower than rendering — like a real camera.
// Returns the new accumulator and, on a tick, the frame time the tick consumed.
// Carrying the remainder keeps the average rate at detectHz despite frame jitter,
// and tick durations plus the accumulator always add up to the elapsed time.
export function advanceDetectionClock(accumulated, frameDt, detectHz) {
  const period = 1 / (detectHz > 0 ? detectHz : 1);
  const next = accumulated + clampFrameDt(frameDt);
  if (next < period) return { accumulated: next, tickDt: null };
  const carry = Math.min(next - period, period * MAX_CARRY_PERIODS);
  return { accumulated: carry, tickDt: next - carry };
}
