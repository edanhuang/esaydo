import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { StewardState } from "@/types";
import { useSteward } from "./StewardContext";

type Mood = "idle" | "busy" | "done" | "confused";

/** 处理完的那一下表情保持多久 */
const DONE_MS = 2400;
/** 疑问的表情多留一会儿，问号冒完再收 */
const CONFUSED_MS = 3200;

/**
 * 运行中为 busy；处理完的一刻看结果：成功执行了 easydo 命令就眯眼开心（done），
 * 什么都没执行成功就一脸疑问（confused），过一会儿回到 idle
 */
function useMood(running: boolean, lastOutcome: StewardState["lastOutcome"]): Mood {
  const [after, setAfter] = useState<"done" | "confused" | null>(null);
  const wasRunning = useRef(running);
  useEffect(() => {
    if (wasRunning.current && !running) {
      wasRunning.current = running;
      if (!lastOutcome) {
        return;
      }
      const next = lastOutcome === "happy" ? "done" : "confused";
      setAfter(next);
      const timer = window.setTimeout(() => setAfter(null), next === "done" ? DONE_MS : CONFUSED_MS);
      return () => window.clearTimeout(timer);
    }
    wasRunning.current = running;
    if (running) {
      setAfter(null);
    }
  }, [running, lastOutcome]);
  return running ? "busy" : (after ?? "idle");
}

/**
 * 小石头的样子：一颗暖石色的鹅卵石，只有两只眼睛。状态全靠眼睛和身子表达，不配文字：
 * 空闲时浮动、眨眼；悬停时眯成月牙眼、一蹦一蹦；处理中皱着眉、睁眼盯着面前的小键盘猛敲；
 * 刚做完：动了手就眯眼开心，什么都没做成就一高一低两只眼、头顶冒个问号；
 * 有回复时右上角亮一个重点色小点。
 * looking 时眼睛往上看，对着头顶打开的对话气泡
 */
export function StewardPebble({
  mood,
  unread = false,
  looking = false,
  wave = false,
  className,
}: {
  mood: Mood;
  unread?: boolean;
  looking?: boolean;
  /** 侧栏收起时探头用：带一个招手的小圆点，悬停时才显示 */
  wave?: boolean;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 56 40"
      aria-hidden
      data-mood={mood}
      className={cn("overflow-visible", mood === "busy" ? null : "steward-float", className)}
      style={{ transformOrigin: "50% 100%" }}
    >
      <path
        d="M6 36 C1 24 8 6 26 5 C44 4 55 16 52 30 C50 39 38 40 28 40 C18 40 9 41 6 36 Z"
        fill="hsl(var(--steward-body))"
      />
      {/* 埋头干活时一心盯着键盘，不跟着气泡抬头 */}
      <g className="steward-eyes" style={{ translate: looking && mood !== "busy" ? "1px -2px" : "0 0" }}>
        {mood === "busy" ? (
          <>
            {/* 刻苦：睁着眼往下盯着键盘，眉头往里压 */}
            <circle cx="24" cy="23" r="2.4" fill="hsl(var(--steward-eye))" />
            <circle cx="37" cy="23" r="2.4" fill="hsl(var(--steward-eye))" />
            <path
              d="M20.5 16.6 L26.6 18.6 M40.5 16.6 L34.4 18.6"
              stroke="hsl(var(--steward-eye))"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </>
        ) : mood === "done" ? (
          <HappyEyes />
        ) : mood === "confused" ? (
          <>
            {/* 一大一小、一高一低：没搞明白 */}
            <circle cx="24" cy="21" r="2" fill="hsl(var(--steward-eye))" />
            <circle cx="37" cy="19.5" r="2.8" fill="hsl(var(--steward-eye))" />
          </>
        ) : (
          <>
            {/* 平时是圆眼睛；悬停时换成月牙眼，由样式切换 */}
            <g className="steward-eyes-plain">
              <circle className="steward-eye" cx="24" cy="20" r="2.6" fill="hsl(var(--steward-eye))" />
              <circle className="steward-eye" cx="37" cy="20" r="2.6" fill="hsl(var(--steward-eye))" />
            </g>
            <HappyEyes className="steward-eyes-happy" />
          </>
        )}
      </g>
      {mood === "busy" ? <Keyboard /> : null}
      {mood === "confused" ? (
        // 小问号冒在脸的右侧、不高过头顶，免得钻到头顶的对话气泡下面
        <g className="steward-ask" fill="none" stroke="hsl(var(--steward-eye))" strokeWidth="1.6" strokeLinecap="round">
          <path d="M54 8 Q54 5 57 5 Q60 5 60 7.5 Q60 9.5 57.5 10.5 L57.3 12.3" />
          <circle cx="57.3" cy="15.2" r="0.3" strokeWidth="1.8" />
        </g>
      ) : null}
      {unread ? <circle cx="50" cy="7" r="3.6" fill="var(--color-easydo-gold)" /> : null}
      {wave ? <circle className="steward-wave" cx="57" cy="30" r="4.5" fill="hsl(var(--steward-nub))" /> : null}
    </svg>
  );
}

/** 处理中：身前一块小键盘，两只小手轮流敲 */
function Keyboard() {
  return (
    <g data-steward-keyboard>
      <rect x="11" y="35.5" width="34" height="6" rx="2" fill="hsl(var(--steward-keyboard))" />
      <path
        d="M15.5 38.5 h3 M21 38.5 h3 M26.5 38.5 h3 M32 38.5 h3 M37.5 38.5 h3"
        stroke="hsl(var(--steward-keys))"
        strokeWidth="1.1"
        strokeLinecap="round"
      />
      <circle className="steward-tap" cx="21" cy="34" r="3" fill="hsl(var(--steward-nub))" />
      <circle className="steward-tap steward-tap-alt" cx="35" cy="34" r="3" fill="hsl(var(--steward-nub))" />
    </g>
  );
}

function HappyEyes({ className }: { className?: string }) {
  return (
    <path
      className={className}
      d="M21.2 21 Q24 17.6 26.8 21 M34.2 21 Q37 17.6 39.8 21"
      stroke="hsl(var(--steward-eye))"
      strokeWidth="1.8"
      strokeLinecap="round"
      fill="none"
    />
  );
}

/**
 * 窗口左下角唯一的小石头，点它打开或收起对话气泡。侧栏展开时坐在底栏分隔线上；
 * 侧栏收起时斜着趴在窗口左边缘探头，悬停时探出更多并招手。
 * 两种位置之间的移动和侧栏宽度一起过渡（见 styles.css 的 .steward-pet）
 */
export function StewardDockedPebble({ collapsed }: { collapsed: boolean }) {
  const { state, open, setOpen } = useSteward();
  const mood = useMood(state.running, state.lastOutcome);
  const unread = state.unreadCount > 0;
  return (
    <button
      type="button"
      data-steward-pet
      data-collapsed={collapsed || undefined}
      aria-expanded={open}
      aria-label={unread ? `小石头，${state.unreadCount} 条新回复` : "小石头"}
      className="steward-pet fixed z-30 h-[30px] w-[42px] rounded-md outline-none focus-visible:ring-2 focus-visible:ring-easydo-gold/50"
      onClick={() => setOpen(!open)}
    >
      <StewardPebble mood={mood} unread={unread} looking={open} wave className="block size-full" />
    </button>
  );
}
