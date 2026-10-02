import { useEffect, useRef } from "react";
import { useTrackerStore } from "../state/useTrackerStore";
import { useFlyingObjectParams, DETECT_MODES } from "../state/useFlyingObjectParams";
import { drawPovOverlay } from "./drawPovOverlay";
import { POV_HEIGHT, POV_MARGIN, POV_WIDTH } from "./povLayout";
import "./PovOverlay.css";

const MODE_LABELS = { [DETECT_MODES.GEOMETRY]: "GEOM", [DETECT_MODES.PIXEL]: "PIXEL" };
const BOX_STYLE = { left: POV_MARGIN, bottom: POV_MARGIN, width: POV_WIDTH, height: POV_HEIGHT };

export function PovOverlay() {
  const canvasRef = useRef(null);
  const detectMode = useFlyingObjectParams((s) => s.detectMode);
  const setDetectMode = useFlyingObjectParams((s) => s.setDetectMode);

  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return undefined;
    drawPovOverlay(ctx, useTrackerStore.getState());
    return useTrackerStore.subscribe((state) => drawPovOverlay(ctx, state));
  }, []);

  const nextMode = detectMode === DETECT_MODES.PIXEL ? DETECT_MODES.GEOMETRY : DETECT_MODES.PIXEL;

  return (
    <div className="pov-overlay" style={BOX_STYLE}>
      <canvas ref={canvasRef} width={POV_WIDTH} height={POV_HEIGHT} />
      <button
        type="button"
        className="pov-overlay__mode"
        onClick={() => setDetectMode(nextMode)}
        title="Switch detection mode"
      >
        {MODE_LABELS[detectMode] ?? MODE_LABELS[DETECT_MODES.GEOMETRY]}
      </button>
    </div>
  );
}
