// iOS 式平滑圆角（连续曲率）路径，算法与 Figma 的 corner smoothing 一致：
// 每个角从边上 p = (1 + smoothing) * radius 处开始，用「贝塞尔 → 圆弧 → 贝塞尔」过渡，曲率不会在圆角起点突变。
export function getSquirclePath(width: number, height: number, radius: number, smoothing = 0.6): string {
  if (width <= 0 || height <= 0) {
    return "";
  }
  const maxRadius = Math.min(width, height) / 2;
  const r = Math.min(radius, maxRadius);
  if (r <= 0) {
    return `M 0 0 H ${width} V ${height} H 0 Z`;
  }
  // 空间不够放下完整的平滑段时，降低平滑度而不是让路径越界
  const s = Math.max(0, Math.min(smoothing, maxRadius / r - 1));
  const p = (1 + s) * r;

  const arcMeasure = 90 * (1 - s);
  const arc = Math.sin(toRadians(arcMeasure / 2)) * r * Math.SQRT2;
  const angleAlpha = (90 - arcMeasure) / 2;
  const p3ToP4 = r * Math.tan(toRadians(angleAlpha / 2));
  const angleBeta = 45 * s;
  const c = p3ToP4 * Math.cos(toRadians(angleBeta));
  const d = c * Math.tan(toRadians(angleBeta));
  const b = (p - arc - c - d) / 3;
  const a = 2 * b;

  const n = (value: number) => Number(value.toFixed(3));
  const ab = a + b;
  const abc = a + b + c;
  const bc = b + c;

  return [
    `M ${n(width - p)} 0`,
    `c ${n(a)} 0 ${n(ab)} 0 ${n(abc)} ${n(d)}`,
    `a ${n(r)} ${n(r)} 0 0 1 ${n(arc)} ${n(arc)}`,
    `c ${n(d)} ${n(c)} ${n(d)} ${n(bc)} ${n(d)} ${n(abc)}`,
    `L ${n(width)} ${n(height - p)}`,
    `c 0 ${n(a)} 0 ${n(ab)} ${n(-d)} ${n(abc)}`,
    `a ${n(r)} ${n(r)} 0 0 1 ${n(-arc)} ${n(arc)}`,
    `c ${n(-c)} ${n(d)} ${n(-bc)} ${n(d)} ${n(-abc)} ${n(d)}`,
    `L ${n(p)} ${n(height)}`,
    `c ${n(-a)} 0 ${n(-ab)} 0 ${n(-abc)} ${n(-d)}`,
    `a ${n(r)} ${n(r)} 0 0 1 ${n(-arc)} ${n(-arc)}`,
    `c ${n(-d)} ${n(-c)} ${n(-d)} ${n(-bc)} ${n(-d)} ${n(-abc)}`,
    `L 0 ${n(p)}`,
    `c 0 ${n(-a)} 0 ${n(-ab)} ${n(d)} ${n(-abc)}`,
    `a ${n(r)} ${n(r)} 0 0 1 ${n(arc)} ${n(-arc)}`,
    `c ${n(c)} ${n(-d)} ${n(bc)} ${n(-d)} ${n(abc)} ${n(-d)}`,
    "Z",
  ].join(" ");
}

function toRadians(degrees: number) {
  return (degrees * Math.PI) / 180;
}
