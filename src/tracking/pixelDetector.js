import { NO_DETECTION, makeDetection } from "./detection";

// Thresholds apply to sRGB-encoded bytes (the POV render target is sRGB).
export const MIN_RED = 80;
export const MAX_GB_TO_R_RATIO = 0.35;
export const MIN_PIXELS = 4;

export function isTargetRed(r, g, b) {
  return r >= MIN_RED && g <= MAX_GB_TO_R_RATIO * r && b <= MAX_GB_TO_R_RATIO * r;
}

// pixels: RGBA bytes from readRenderTargetPixels. Row 0 is the BOTTOM of the
// image, which already matches the upward Y axis of NDC.
export function detectRedTarget(pixels, width, height) {
  if (!pixels || width <= 0 || height <= 0 || pixels.length < width * height * 4) {
    return NO_DETECTION;
  }
  const bounds = scanRedBounds(pixels, width, height);
  if (bounds.count < MIN_PIXELS) return NO_DETECTION;
  return makeDetection({
    minX: (bounds.minCol / width) * 2 - 1,
    maxX: ((bounds.maxCol + 1) / width) * 2 - 1,
    minY: (bounds.minRow / height) * 2 - 1,
    maxY: ((bounds.maxRow + 1) / height) * 2 - 1,
  });
}

function scanRedBounds(pixels, width, height) {
  let count = 0;
  let minCol = width;
  let maxCol = -1;
  let minRow = height;
  let maxRow = -1;
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const i = (row * width + col) * 4;
      if (!isTargetRed(pixels[i], pixels[i + 1], pixels[i + 2])) continue;
      count++;
      if (col < minCol) minCol = col;
      if (col > maxCol) maxCol = col;
      if (row < minRow) minRow = row;
      if (row > maxRow) maxRow = row;
    }
  }
  return { count, minCol, maxCol, minRow, maxRow };
}
