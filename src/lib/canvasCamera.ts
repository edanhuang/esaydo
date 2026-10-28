/** 画布相机：x、y 是视口左上角对着的世界坐标，zoom 是缩放倍数。 */
export interface CanvasCamera {
  x: number;
  y: number;
  zoom: number;
}

/** 所有卡片的外接矩形（世界坐标）。 */
export interface CanvasBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export const CANVAS_MIN_ZOOM = 0.25;
export const CANVAS_MAX_ZOOM = 2;
// 内容四周最多能看到半个视口的空白
const OVERSCROLL_RATIO = 0.5;

export function clampZoom(zoom: number): number {
  return Math.min(CANVAS_MAX_ZOOM, Math.max(CANVAS_MIN_ZOOM, zoom));
}

/** 以视口内 (anchorX, anchorY) 为中心缩放，缩放前后这个点下面的世界坐标不变。 */
export function zoomCameraAt(camera: CanvasCamera, zoom: number, anchorX: number, anchorY: number): CanvasCamera {
  const next = clampZoom(zoom);
  const worldX = camera.x + anchorX / camera.zoom;
  const worldY = camera.y + anchorY / camera.zoom;
  return { x: worldX - anchorX / next, y: worldY - anchorY / next, zoom: next };
}

/**
 * 把相机限制在内容附近：内容比视口大时，四周最多露出半个视口的空白；
 * 内容比视口小时，内容可以在视口里随意挪动，但不会滑出视野。没有内容时不限制。
 */
export function clampCamera(
  camera: CanvasCamera,
  bounds: CanvasBounds | null,
  viewportWidth: number,
  viewportHeight: number,
): CanvasCamera {
  if (!bounds || viewportWidth <= 0 || viewportHeight <= 0) {
    return camera;
  }
  const visibleWidth = viewportWidth / camera.zoom;
  const visibleHeight = viewportHeight / camera.zoom;
  return {
    x: clampAxis(camera.x, bounds.minX, bounds.maxX, visibleWidth, visibleWidth * OVERSCROLL_RATIO),
    y: clampAxis(camera.y, bounds.minY, bounds.maxY, visibleHeight, visibleHeight * OVERSCROLL_RATIO),
    zoom: camera.zoom,
  };
}

function clampAxis(value: number, min: number, max: number, visible: number, margin: number): number {
  // 两个下限/上限里取宽松的那个，内容大小跨过视口时范围是连续变化的
  const lower = Math.min(min - margin, max - visible);
  const upper = Math.max(max + margin - visible, min);
  return Math.min(upper, Math.max(lower, value));
}
