import { Bot as BotIcon, Mail } from "lucide-react";
import type React from "react";
import { botColorVar } from "@/lib/bots";
import { cn } from "@/lib/utils";
import type { BotColor } from "@/types";

/** Bot 头像：只有机器人头部的图标，垫一个同色淡底的圆角方块；运行中外圈呼吸 */
export function BotAvatar({
  color,
  running = false,
  className,
  title,
}: {
  color: BotColor;
  running?: boolean;
  className?: string;
  title?: string;
}) {
  return (
    <span
      data-bot-avatar
      data-running={running || undefined}
      title={title}
      className={cn(
        "grid size-5 shrink-0 place-items-center rounded-[5px] bg-[hsl(var(--bot-color)/0.14)] text-[hsl(var(--bot-color))]",
        running && "bot-breathing",
        className,
      )}
      style={{ "--bot-color": botColorVar(color) } as React.CSSProperties}
    >
      <BotIcon className="size-3.5" strokeWidth={2} aria-hidden />
    </span>
  );
}

// 色板本身饱和度低，直接拿来做渐变发浑；「随机」图标按色板的色相走一圈，但提亮、提饱和
const RANDOM_STOPS = [36, 75, 145, 182, 222, 300, 350, 36].map((hue) => `hsl(${hue} 78% 58%)`).join(", ");

/** 「随机颜色」选项：色相转一圈的炫彩头像 */
export function RandomColorAvatar({ className }: { className?: string }) {
  const stops = RANDOM_STOPS;
  return (
    <span
      data-random-color
      className={cn("grid size-5 shrink-0 place-items-center rounded-[5px] text-white", className)}
      style={{ backgroundImage: `conic-gradient(from 210deg, ${stops})` }}
    >
      <BotIcon className="size-3.5 drop-shadow-[0_0_1px_rgb(0_0_0/0.35)]" strokeWidth={2} aria-hidden />
    </span>
  );
}

/** 未读消息：重点色底的圆角长方形，信封加数字 */
export function UnreadBadge({
  count,
  onClick,
  className,
}: {
  count: number;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      data-unread-badge
      title={`${count} 条未读消息`}
      className={cn(
        "inline-flex h-[18px] shrink-0 items-center gap-[3px] rounded px-[5px] text-[11px] font-medium tabular-nums leading-none text-easydo-onAccent transition-colors bg-easydo-gold hover:bg-easydo-goldHover",
        className,
      )}
      onPointerDown={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        onClick?.();
      }}
    >
      <Mail className="size-3" aria-hidden />
      {count}
    </button>
  );
}
