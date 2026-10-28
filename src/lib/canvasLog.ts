import { appendCanvasLog } from "./api";

// 拖动排查日志：攒一小会儿再一起写，写失败也不影响操作
const FLUSH_DELAY = 200;
let pending: string[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;

export function logCanvas(message: string) {
  pending.push(message);
  if (timer !== null) {
    return;
  }
  timer = setTimeout(() => {
    const lines = pending;
    pending = [];
    timer = null;
    try {
      void appendCanvasLog(lines).catch(() => undefined);
    } catch {
      // 测试环境或没有 Tauri 时直接丢掉
    }
  }, FLUSH_DELAY);
}

/** 坐标保留一位小数，Todo id 只留前 8 位，日志读起来短一些 */
export function fmtPoint(x: number, y: number) {
  return `(${Math.round(x * 10) / 10},${Math.round(y * 10) / 10})`;
}

export function shortId(id: string) {
  return id.slice(0, 8);
}
