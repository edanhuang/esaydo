import { describe, expect, it } from "vitest";
import { getSquirclePath } from "./squircle";

describe("getSquirclePath", () => {
  it("每个角都从边上 (1 + smoothing) * radius 处开始", () => {
    const path = getSquirclePath(200, 46, 14, 0.6);
    expect(path.startsWith("M 177.6 0")).toBe(true);
    expect(path).toContain("L 200 23.6");
    expect(path).toContain("L 22.4 46");
    expect(path).toContain("L 0 22.4");
    expect(path.endsWith("Z")).toBe(true);
  });

  it("高度不够时降低平滑度，圆角起点不越过边的中点", () => {
    const path = getSquirclePath(200, 30, 14, 0.6);
    expect(path).toContain("L 200 15");
    expect(path).toContain("L 0 15");
  });

  it("尺寸为 0 时不输出路径", () => {
    expect(getSquirclePath(0, 40, 14)).toBe("");
  });
});
