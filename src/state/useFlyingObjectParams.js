import { create } from "zustand";
import { persist } from "zustand/middleware";

export const DETECT_MODES = Object.freeze({ GEOMETRY: "geometry", PIXEL: "pixel" });
export const DEFAULT_DETECT_MODE = DETECT_MODES.GEOMETRY;

export const DEFAULT_FLYING_OBJECT_PARAMS = {
  posX: 0,
  posZ: 0,
  height: 20,
  fov: 60,
  gimbalKp: 4,
  gimbalKd: 0.1,
  maxRate: 90,
  holdTime: 1.5,
  scanRate: 30,
  scanTilt: -45,
  detectHz: 30,
};

export const FLYING_OBJECT_PARAM_META = {
  posX:     { label: "Position X",     min: -45, max: 45,  step: 1,    unit: "m" },
  posZ:     { label: "Position Z",     min: -45, max: 45,  step: 1,    unit: "m" },
  height:   { label: "Height",         min: 5,   max: 45,  step: 1,    unit: "m" },
  fov:      { label: "Camera FOV",     min: 20,  max: 100, step: 1,    unit: "°" },
  gimbalKp: { label: "Gimbal Kp",      min: 0,   max: 20,  step: 0.1,  unit: "1/s" },
  gimbalKd: { label: "Gimbal Kd",      min: 0,   max: 2,   step: 0.01, unit: "s" },
  maxRate:  { label: "Max slew rate",  min: 10,  max: 360, step: 5,    unit: "°/s" },
  holdTime: { label: "Hold time",      min: 0,   max: 10,  step: 0.1,  unit: "s" },
  scanRate: { label: "Scan rate",      min: 5,   max: 180, step: 5,    unit: "°/s" },
  scanTilt: { label: "Scan tilt",      min: -85, max: -5,  step: 1,    unit: "°" },
  detectHz: { label: "Detection rate", min: 1,   max: 60,  step: 1,    unit: "Hz" },
};

const VALID_MODES = Object.values(DETECT_MODES);

export const useFlyingObjectParams = create(
  persist(
    (set) => ({
      ...DEFAULT_FLYING_OBJECT_PARAMS,
      detectMode: DEFAULT_DETECT_MODE,
      setParam: (key, value) => {
        const meta = FLYING_OBJECT_PARAM_META[key];
        if (!meta) return;
        const clamped = Math.min(meta.max, Math.max(meta.min, Number(value)));
        if (Number.isNaN(clamped)) return;
        set({ [key]: clamped });
      },
      setDetectMode: (mode) => {
        if (!VALID_MODES.includes(mode)) return;
        set({ detectMode: mode });
      },
      reset: () => set({ ...DEFAULT_FLYING_OBJECT_PARAMS, detectMode: DEFAULT_DETECT_MODE }),
    }),
    { name: "flying-object-params-v1" }
  )
);
