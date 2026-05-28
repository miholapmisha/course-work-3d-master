import { create } from "zustand";
import { persist } from "zustand/middleware";

export const DEFAULT_PARAMS = {
  acceleration: 45,
  turnSpeed: 27,
  maxVelocity: 22,
  linearDamping: 0.35,
  angularDamping: 5.5,
  mass: 0.6,
  gravity: -9.81,
};

export const PARAM_META = {
  acceleration:   { label: "Acceleration",    min: 0,   max: 100, step: 1,    unit: "N·s" },
  turnSpeed:      { label: "Turn speed",      min: 0,   max: 50,  step: 1,    unit: "N·m·s" },
  maxVelocity:    { label: "Max velocity",    min: 1,   max: 50,  step: 1,    unit: "m/s" },
  linearDamping:  { label: "Linear damping",  min: 0,   max: 5,   step: 0.05, unit: "1/s" },
  angularDamping: { label: "Angular damping", min: 0,   max: 20,  step: 0.1,  unit: "1/s" },
  mass:           { label: "Mass",            min: 0.1, max: 100, step: 0.1,  unit: "kg" },
  gravity:        { label: "Gravity (Y)",     min: -30, max: 0,   step: 0.1,  unit: "m/s²" },
};

export const useTargetParams = create(
  persist(
    (set) => ({
      ...DEFAULT_PARAMS,
      setParam: (key, value) => {
        const meta = PARAM_META[key];
        if (!meta) return;
        const clamped = Math.min(meta.max, Math.max(meta.min, Number(value)));
        if (Number.isNaN(clamped)) return;
        set({ [key]: clamped });
      },
      reset: () => set({ ...DEFAULT_PARAMS }),
    }),
    { name: "target-params-v3" }
  )
);
