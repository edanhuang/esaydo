import { afterEach, describe, expect, it, vi } from "vitest";
import { appendCanvasLog } from "./api";
import { fmtPoint, logCanvas } from "./canvasLog";

vi.mock("./api", () => ({
  appendCanvasLog: vi.fn(async () => undefined),
}));

describe("logCanvas", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("把短时间内的几条记录合成一次写入", () => {
    vi.useFakeTimers();

    logCanvas("drag down");
    logCanvas("drag drop");
    expect(appendCanvasLog).not.toHaveBeenCalled();

    vi.advanceTimersByTime(200);
    expect(appendCanvasLog).toHaveBeenCalledTimes(1);
    expect(appendCanvasLog).toHaveBeenCalledWith(["drag down", "drag drop"]);
  });

  it("写失败不抛出", () => {
    vi.useFakeTimers();
    vi.mocked(appendCanvasLog).mockRejectedValueOnce(new Error("no tauri"));

    logCanvas("drag down");
    expect(() => vi.advanceTimersByTime(200)).not.toThrow();
  });

  it("坐标保留一位小数", () => {
    expect(fmtPoint(12.345, -7.06)).toBe("(12.3,-7.1)");
  });
});
