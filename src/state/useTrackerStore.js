import { create } from "zustand";
import { TRACKER_STATUS } from "../tracking/trackerState";

// Written by useFlyingObjectTracking on every detection tick; read by PovOverlay via
// subscribe() so React never re-renders at detection rate.
export const useTrackerStore = create(() => ({
  status: TRACKER_STATUS.SEARCH,
  bbox: null,
  center: null,
}));
