import { describe, expect, it } from "vitest";
import { clampCamera, zoomCameraAt } from "./canvasCamera";

describe("zoomCameraAt", () => {
  it("keeps the world point under the anchor fixed", () => {
    const camera = zoomCameraAt({ x: 100, y: 50, zoom: 1 }, 2, 300, 200);
    expect(camera).toEqual({ x: 250, y: 150, zoom: 2 });
    // 锚点下的世界坐标：缩放前 100+300/1，缩放后 250+300/2
    expect(camera.x + 300 / camera.zoom).toBe(400);
  });

  it("clamps the zoom range", () => {
    expect(zoomCameraAt({ x: 0, y: 0, zoom: 1 }, 10, 0, 0).zoom).toBe(2);
    expect(zoomCameraAt({ x: 0, y: 0, zoom: 1 }, 0.01, 0, 0).zoom).toBe(0.25);
  });
});

describe("clampCamera", () => {
  const big = { minX: 0, minY: 0, maxX: 3000, maxY: 2000 };

  it("lets large content overscroll by half a viewport on each side", () => {
    expect(clampCamera({ x: -900, y: -900, zoom: 1 }, big, 1000, 800)).toEqual({ x: -500, y: -400, zoom: 1 });
    expect(clampCamera({ x: 5000, y: 5000, zoom: 1 }, big, 1000, 800)).toEqual({ x: 2500, y: 1600, zoom: 1 });
    // 范围内不动
    expect(clampCamera({ x: -200, y: 300, zoom: 1 }, big, 1000, 800)).toEqual({ x: -200, y: 300, zoom: 1 });
  });

  it("measures the overscroll in screen pixels at any zoom", () => {
    expect(clampCamera({ x: -2000, y: 0, zoom: 2 }, big, 1000, 800).x).toBe(-250);
  });

  it("keeps small content inside the viewport and accepts the default camera", () => {
    const small = { minX: 24, minY: 24, maxX: 264, maxY: 80 };
    expect(clampCamera({ x: 0, y: 0, zoom: 1 }, small, 1000, 800)).toEqual({ x: 0, y: 0, zoom: 1 });
    expect(clampCamera({ x: 500, y: 500, zoom: 1 }, small, 1000, 800)).toEqual({ x: 24, y: 24, zoom: 1 });
    expect(clampCamera({ x: -2000, y: -2000, zoom: 1 }, small, 1000, 800)).toEqual({ x: -736, y: -720, zoom: 1 });
  });

  it("does not restrict an empty canvas", () => {
    expect(clampCamera({ x: -2000, y: 9, zoom: 1 }, null, 1000, 800)).toEqual({ x: -2000, y: 9, zoom: 1 });
  });
});
