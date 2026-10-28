import * as React from "react";
import { flushSync } from "react-dom";

import { getSquirclePath } from "@/lib/squircle";
import { cn } from "@/lib/utils";

interface SquircleProps extends React.HTMLAttributes<HTMLDivElement> {
  radius: number;
  smoothing?: number;
  // 底色、描边、投影都是 CSS 颜色/阴影值，跟主题变量走
  fill: string;
  stroke?: string;
  shadow?: string;
  // 悬停或内部有焦点时换成的投影
  raisedShadow?: string;
}

// border-radius 只能画正圆弧；这里用 SVG 画平滑圆角的底板，内容叠在上面，尺寸变化时重算路径
export function Squircle({
  radius,
  smoothing = 0.6,
  fill,
  stroke,
  shadow,
  raisedShadow,
  className,
  children,
  ...props
}: SquircleProps) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [size, setSize] = React.useState({ width: 0, height: 0 });

  React.useLayoutEffect(() => {
    const node = ref.current;
    if (!node) {
      return;
    }
    const update = () => setSize({ width: node.offsetWidth, height: node.offsetHeight });
    update();
    if (typeof ResizeObserver === "undefined") {
      return;
    }
    // 回调在排版后、绘制前执行；普通 setState 会被 React 推到绘制之后，
    // 输入框换行变高的那一帧底板还是旧尺寸，新的一行露在外面像闪了一下，所以这里同步提交
    const observer = new ResizeObserver(() => flushSync(update));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // 1px 描边落在像素格中间才清晰，所以路径整体内缩半像素
  const inset = stroke ? 0.5 : 0;
  const path = getSquirclePath(size.width - inset * 2, size.height - inset * 2, radius, smoothing);

  function layer(layerShadow: string | undefined, layerClassName?: string) {
    return (
      <svg
        aria-hidden
        className={cn("pointer-events-none absolute inset-0 -z-10 overflow-visible", layerClassName)}
        width={size.width}
        height={size.height}
        style={layerShadow ? { filter: `drop-shadow(${layerShadow})` } : undefined}
      >
        <path
          d={path}
          transform={inset ? `translate(${inset} ${inset})` : undefined}
          fill={fill}
          stroke={stroke}
          strokeWidth={stroke ? 1 : undefined}
        />
      </svg>
    );
  }

  return (
    <div ref={ref} className={cn("group/squircle relative isolate", className)} {...props}>
      {path ? layer(shadow) : null}
      {/* 浮起投影单独一层，只渐变透明度；直接渐变 filter 时 WebKit 每帧重算阴影，会抖 */}
      {path && raisedShadow
        ? layer(
            raisedShadow,
            "opacity-0 transition-opacity duration-200 ease-out [will-change:opacity] group-hover/squircle:opacity-100 group-focus-within/squircle:opacity-100",
          )
        : null}
      {children}
    </div>
  );
}
