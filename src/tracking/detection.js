// Shared detection contract: bbox and center are in NDC [-1, 1], Y axis up.
export const NO_DETECTION = Object.freeze({ visible: false, bbox: null, center: null });

export function makeDetection(bbox) {
  return {
    visible: true,
    bbox,
    center: { x: (bbox.minX + bbox.maxX) / 2, y: (bbox.minY + bbox.maxY) / 2 },
  };
}

// NDC rectangle -> canvas pixels (origin top-left, Y down).
export function ndcRectToPixels(bbox, width, height) {
  return {
    x: ((bbox.minX + 1) / 2) * width,
    y: ((1 - bbox.maxY) / 2) * height,
    width: ((bbox.maxX - bbox.minX) / 2) * width,
    height: ((bbox.maxY - bbox.minY) / 2) * height,
  };
}
