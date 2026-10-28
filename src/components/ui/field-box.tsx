import type React from "react";
import { CornerDownLeft } from "lucide-react";
import { cn } from "@/lib/utils";
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

/**
 * 输入框里的发送键：回车图标，平时没有底色，悬停时渐显圆角方形底色。
 * 没有文字时淡出隐藏，但仍占着位置，输入第一个字时正文不会因为按钮出现而重新换行
 */
export function FieldSendButton({
  title,
  visible,
  disabled = false,
  onClick,
}: {
  title: string;
  visible: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-hidden={visible ? undefined : true}
      tabIndex={visible ? undefined : -1}
      disabled={disabled || !visible}
      data-visible={visible ? "true" : "false"}
      className={cn(
        "mb-0.5 mr-1 grid size-7 shrink-0 place-items-center rounded-[7px] text-easydo-textMuted",
        "transition-[background-color,color,opacity,visibility] duration-150 ease-out",
        "hover:bg-easydo-surfaceHover hover:text-easydo-cream focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
        "disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-easydo-textMuted",
        visible ? "visible opacity-100" : "invisible opacity-0",
      )}
      onClick={onClick}
    >
      <CornerDownLeft className="size-4" strokeWidth={2} />
      <span className="sr-only">{title}</span>
    </button>
  );
}
