import type React from "react";
import { Squircle } from "./squircle";

/**
 * EasyDo 的输入框外壳：和底部录入框同一套——平滑圆角、表面色底、细描边、很轻的投影，悬停或聚焦时略微浮起。
 * 里面放无边框的 input / textarea（配合 FIELD_INPUT_CLASS / FIELD_TEXTAREA_CLASS）。
 */
export function FieldBox({
  radius = 14,
  className,
  children,
}: {
  /** 单行输入框用 10，多行输入框用 14（与底部录入框一致） */
  radius?: number;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Squircle
      radius={radius}
      fill="hsl(var(--easydo-surface))"
      stroke="hsl(var(--easydo-border))"
      shadow="var(--easydo-shadow-composer)"
      raisedShadow="var(--easydo-shadow-composer-focus)"
      className={className}
    >
      {children}
    </Squircle>
  );
}

/** 放在 FieldBox 里的单行 input：外观交给外壳，自己只管文字、占位符和光标 */
export const FIELD_INPUT_CLASS =
  "h-8 rounded-none border-0 bg-transparent px-2.5 text-[14px] text-easydo-cream shadow-none caret-[hsl(var(--easydo-text-muted)/0.7)] placeholder:text-[14px] placeholder:font-light placeholder:text-[hsl(var(--easydo-text-muted)/0.55)] focus-visible:border-0 focus-visible:ring-0 dark:bg-transparent md:text-[14px]";

/** 放在 FieldBox 里的多行 textarea：与底部录入框的输入区一致 */
export const FIELD_TEXTAREA_CLASS =
  "min-h-8 resize-none rounded-none border-0 bg-transparent px-1 py-1.5 text-[15px] leading-5 text-easydo-cream shadow-none caret-[hsl(var(--easydo-text-muted)/0.7)] placeholder:text-[14px] placeholder:font-light placeholder:text-[hsl(var(--easydo-text-muted)/0.55)] focus-visible:border-0 focus-visible:ring-0 dark:bg-transparent md:text-[15px] md:leading-5";

/** 与底部录入框一致的发送按钮 */
export const FIELD_SEND_BUTTON_CLASS =
  "mb-1 mr-1.5 grid size-6 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground transition-opacity duration-150 hover:opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:cursor-not-allowed disabled:opacity-35";
