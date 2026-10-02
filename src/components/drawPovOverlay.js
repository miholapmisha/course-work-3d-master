import { ndcRectToPixels } from "../tracking/detection";
import { TRACKER_STATUS } from "../tracking/trackerState";

const STATUS_COLORS = {
  [TRACKER_STATUS.SEARCH]: "#90caf9",
  [TRACKER_STATUS.TRACKING]: "#69f0ae",
  [TRACKER_STATUS.LOST]: "#ffd54f",
};
const CROSSHAIR_HALF = 10;

export function drawPovOverlay(ctx, { status, bbox }) {
  const { width, height } = ctx.canvas;
  const color = STATUS_COLORS[status] ?? "#ffffff";
  ctx.clearRect(0, 0, width, height);
  drawCrosshair(ctx, width / 2, height / 2);
  if (bbox) {
    const rect = ndcRectToPixels(bbox, width, height);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
  }
  ctx.fillStyle = color;
  ctx.font = "bold 12px monospace";
  ctx.fillText(status, 8, 18);
}

function drawCrosshair(ctx, cx, cy) {
  ctx.strokeStyle = "rgba(255, 255, 255, 0.7)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx - CROSSHAIR_HALF, cy);
  ctx.lineTo(cx + CROSSHAIR_HALF, cy);
  ctx.moveTo(cx, cy - CROSSHAIR_HALF);
  ctx.lineTo(cx, cy + CROSSHAIR_HALF);
  ctx.stroke();
}
