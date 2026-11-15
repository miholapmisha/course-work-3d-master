import { writeFileSync } from "node:fs";
import { simulate, metrics, circle, line, zigzag, still, FRAME_DT } from "./sim.js";

const out = {};
const r2 = (v) => (v === null ? null : Math.round(v * 100) / 100);
const series = (log, step = 2) => log.filter((_, i) => i % step === 0).map((r) => [r2(r.t), r2(r.errDeg), r.status]);

// E1: proportional gain vs tracking quality (30 Hz) on two manoeuvres
const KPS = [0.5, 1, 2, 4, 8, 12, 16];
const scenarios = {
  circle: { trajectory: circle({ cx: 0, cz: 0, r: 15, v: 8 }), duration: 30 },
  zigzag: { trajectory: zigzag({ x0: -30, z0: 12, v: 8, amp: 6, period: 5 }), duration: 7.5 },
};
out.e1 = {};
for (const [name, sc] of Object.entries(scenarios)) {
  out.e1[name] = KPS.map((kp) => {
    const log = simulate({ ...sc, params: { gimbalKp: kp }, startTracking: name === "zigzag" });
    return { kp, ...metrics(log) };
  });
}
out.e1series = Object.fromEntries(
  [1, 4, 12].map((kp) => [kp, series(simulate({ ...scenarios.circle, params: { gimbalKp: kp } }))])
);

// E2: discrete-time stability, Kp x detectHz, static target
const E2_KP = [1, 2, 4, 8, 12, 20];
const E2_HZ = [1, 2, 5, 10, 30];
const staticTarget = still({ x: 12, z: 9 });
out.e2 = [];
for (const hz of E2_HZ) {
  for (const kp of E2_KP) {
    const log = simulate({ trajectory: staticTarget, duration: 20, params: { gimbalKp: kp, detectHz: hz } });
    const m = metrics(log);
    const tail = log.filter((r) => r.t >= 14 && r.status === "TRACKING");
    const tailMax = tail.length ? Math.max(...tail.map((r) => r.errDeg)) : null;
    const tailShare = tail.length / Math.round(6 / FRAME_DT);
    out.e2.push({ hz, kp, kpT: kp / hz, ...m, tailMax, tailShare });
  }
}
out.e2series = Object.fromEntries(
  [[4, 30], [8, 5], [12, 5], [20, 1]].map(([kp, hz]) => [
    `${kp}@${hz}`,
    series(simulate({ trajectory: staticTarget, duration: 20, params: { gimbalKp: kp, detectHz: hz } })),
  ])
);

// E3: passing under the flying object (keyhole), straight pass at 8 m/s
const OFFSETS = [0.5, 1, 2, 3, 5, 8];
const RATES = [45, 90, 180, 360];
out.e3 = [];
for (const d of OFFSETS) {
  for (const rate of RATES) {
    const log = simulate({
      trajectory: line({ x0: -28, z0: d, vx: 8, vz: 0 }),
      duration: 7,
      params: { maxRate: rate },
      startTracking: true,
    });
    const m = metrics(log, { settle: 0 });
    const peakPan = log.reduce((acc, r, i) => (i ? Math.max(acc, Math.abs(wrapDeg(r.pan - log[i - 1].pan)) / FRAME_DT) : 0), 0);
    out.e3.push({ d, rate, ...m, peakPan, required: (8 / d) * (180 / Math.PI) });
  }
}

// E4: occlusion length vs holdTime (1.5 s); target drives straight at 6 m/s
const TAUS = [0.3, 0.8, 1.4, 1.6, 2.5, 4];
out.e4 = [6, 14].flatMap((v) => TAUS.map((tau) => {
  const t0 = 1.5;
  const log = simulate({
    trajectory: line({ x0: -20, z0: 14, vx: v, vz: 0 }),
    duration: 14,
    occluded: (t) => t >= t0 && t < t0 + tau,
    startTracking: true,
  });
  const end = t0 + tau;
  const statusAtEnd = log.find((r) => r.t >= end)?.status;
  const statesDuring = [...new Set(log.filter((r) => r.t >= t0 && r.t < end + 0.05).map((r) => r.status))];
  const back = log.find((r) => r.t >= end && r.status === "TRACKING");
  return { v, tau, statusAtEnd, statesDuring, reacquire: back ? back.t - end : null };
}));

// E5: proportional navigation approach, K sweep, full loop with gimbal
const KS = [1, 2, 3, 4, 5];
const targets = {
  static: still({ x: 15, z: 10 }),
  line: line({ x0: 15, z0: 10, vx: -1.5, vz: 2.5 }),
  circle: circle({ cx: 10, cz: 10, r: 8, v: 3, phase: 0 }),
  crossing: line({ x0: 18, z0: -20, vx: 0, vz: 4 }),
};
out.e5 = {};
out.e5paths = {};
for (const [name, trajectory] of Object.entries(targets)) {
  out.e5[name] = KS.map((k) => {
    const log = simulate({ trajectory, duration: 40, params: { approachSpeed: 6, pngGain: k } });
    const m = metrics(log, { settle: 0 });
    let path = 0;
    for (let i = 1; i < log.length; i++) {
      const a = log[i - 1].drone, b = log[i].drone;
      path += Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
    }
    const last = log[log.length - 1];
    const minDist = Math.min(...log.map((r) => r.dist));
    if (name !== "static" && [1, 3, 5].includes(k)) {
      out.e5paths[`${name}-K${k}`] = log.filter((_, i) => i % 6 === 0).map((r) => [r2(r.drone.x), r2(r.drone.y), r2(r.drone.z), r2(r.target.x), r2(r.target.z), r.status]);
    }
    return { k, acq: m.acq, losses: m.losses, intercepted: last.intercepted, time: r2(last.t), path: r2(path), minDist: r2(minDist) };
  });
}

function wrapDeg(a) {
  return ((((a + 180) % 360) + 360) % 360) - 180;
}

writeFileSync(new URL("./results.json", import.meta.url), JSON.stringify(out));
const brief = { ...out };
delete brief.e1series; delete brief.e2series; delete brief.e5paths;
console.log(JSON.stringify(brief, (k, v) => (typeof v === "number" ? Math.round(v * 1000) / 1000 : v)));
