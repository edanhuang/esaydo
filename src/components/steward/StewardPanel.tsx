import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import type React from "react";
import { MessageSquarePlus, PenLine, Square } from "lucide-react";
import { MessageMarkdown } from "@/components/bots/MessageMarkdown";
import { FIELD_TEXTAREA_CLASS, FieldSendButton } from "@/components/ui/field-box";
import { Textarea } from "@/components/ui/textarea";
import { listStewardMessages, markStewardRead, newStewardConversation, sendToSteward, stopSteward } from "@/lib/api";
import { readBotDraft, writeBotDraft } from "@/lib/botDrafts";
import { getSquirclePath } from "@/lib/squircle";
import { cn } from "@/lib/utils";
import type { BotMessage } from "@/types";
import { useSteward } from "./StewardContext";

// 草稿和派发的对话共用一份本地存储，用固定的键区分
const DRAFT_KEY = ["steward", ""] as const;

/**
 * 和小石头的对话：从小石头身上冒出的气泡。外形和底部录入框一样是平滑圆角、细描边，尖角和气泡连成同一条轮廓。
 * 空着时整个气泡就是一条胶囊输入框；有对话后向上长高，只用一条发丝线隔开输入行。
 * 开在小石头头顶上方、尖角朝下指着它，从侧栏里越过侧栏边缘长到看板上方；侧栏收起时跟着它贴到窗口边缘，
 * 切换时一起滑过去（见 styles.css 的 .steward-bubble）。
 * 不加遮罩，开着时看板照常能看能点；按 Esc、再点一下小石头收起，输入框空着时点别处也会收起
 */
export function StewardPanel({ collapsed }: { collapsed: boolean }) {
  const { state, open, setOpen, version } = useSteward();
  const [messages, setMessages] = useState<BotMessage[]>([]);
  const [input, setInput] = useState(() => readBotDraft(...DRAFT_KEY));
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const isComposingRef = useRef(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const inputValueRef = useRef(input);
  inputValueRef.current = input;
  const running = state.running;

  // 点气泡和小石头以外的地方：输入框空着就收起；写了一半的不收，免得误点丢了上下文
  useEffect(() => {
    if (!open) {
      return;
    }
    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node | null;
      if (!target || panelRef.current?.contains(target)) {
        return;
      }
      if (target instanceof Element && target.closest("[data-steward-pet]")) {
        return;
      }
      if (!inputValueRef.current.trim()) {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", handlePointerDown, true);
    return () => document.removeEventListener("pointerdown", handlePointerDown, true);
  }, [open, setOpen]);

  useEffect(() => {
    if (!open) {
      return;
    }
    listStewardMessages()
      .then((next) => {
        setMessages(next);
        // 气泡开着就算看过了
        if (next.some((message) => message.role !== "user" && message.readAt === null)) {
          void markStewardRead();
        }
      })
      .catch(() => setMessages([]));
  }, [open, version]);

  // 重新打开时接着上次没写完的话：光标放到末尾，而不是默认的开头
  useEffect(() => {
    const field = inputRef.current;
    if (open && field) {
      field.focus();
      field.setSelectionRange(field.value.length, field.value.length);
    }
  }, [open]);

  // 有新消息或开始处理时滚到底
  const seenCountRef = useRef(0);
  const wasRunningRef = useRef(running);
  useLayoutEffect(() => {
    const list = listRef.current;
    const grew = messages.length > seenCountRef.current;
    const started = running && !wasRunningRef.current;
    seenCountRef.current = messages.length;
    wasRunningRef.current = running;
    if (list && (grew || started)) {
      list.scrollTop = list.scrollHeight;
    }
  }, [messages, running, open]);

  if (!open) {
    return null;
  }

  // 处理中照样能打字，只是发不出去：回车不发、发送键不可点，等这一句处理完再发
  async function send() {
    const text = input.trim();
    if (!text || sending || running) {
      return;
    }
    setSending(true);
    setError(null);
    try {
      await sendToSteward(text);
      setInput("");
      writeBotDraft(...DRAFT_KEY, "");
    } catch (nextError) {
      setError(String(nextError));
    } finally {
      setSending(false);
    }
  }

  async function startOver() {
    setError(null);
    try {
      await newStewardConversation();
    } catch (nextError) {
      setError(String(nextError));
    }
  }

  const empty = messages.length === 0 && !running;

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label="小石头"
      data-steward-panel
      data-collapsed={collapsed || undefined}
      className="steward-bubble steward-panel-enter fixed z-40 w-[340px] max-w-[calc(100vw-56px)] origin-bottom-left"
      onKeyDown={(event) => {
        if (event.key === "Escape" && !isComposingRef.current) {
          event.stopPropagation();
          setOpen(false);
        }
      }}
    >
      <BubbleSurface
        radius={empty ? 22 : 16}
        className={cn("flex flex-col text-easydo-cream", !empty && "max-h-[min(480px,calc(100vh-160px))]")}
      >
        {empty ? null : (
          <div ref={listRef} className="mx-px mt-px min-h-0 flex-1 overflow-y-auto rounded-t-[15px] px-3.5 pb-3 pt-3.5">
            <div className="space-y-3">
              {messages.map((message) => (
                <Message key={message.id} message={message} />
              ))}
              {running ? <Writing /> : null}
            </div>
          </div>
        )}

        {error ? (
          <p role="alert" className="px-3.5 pt-2 text-xs text-destructive">
            {error}
          </p>
        ) : null}
        <div
          className={cn(
            "flex shrink-0 items-end gap-0.5 py-1 pl-2.5 pr-1",
            !empty && "border-t border-easydo-borderSoft",
          )}
        >
          <Textarea
            ref={inputRef}
            aria-label="对小石头说"
            rows={1}
            value={input}
            className={cn(FIELD_TEXTAREA_CLASS, "max-h-32 min-w-0 flex-1")}
            onChange={(event) => {
              setInput(event.target.value);
              writeBotDraft(...DRAFT_KEY, event.target.value);
            }}
            onCompositionStart={() => {
              isComposingRef.current = true;
            }}
            onCompositionEnd={() => {
              isComposingRef.current = false;
            }}
            onKeyDown={(event) => {
              if (
                event.key === "Enter" &&
                !event.shiftKey &&
                !isComposingRef.current &&
                !event.nativeEvent.isComposing
              ) {
                event.preventDefault();
                void send();
              }
            }}
          />
          {running ? (
            <RowButton
              label="停止"
              onClick={() => void stopSteward().catch((nextError) => setError(String(nextError)))}
            >
              <Square className="size-3.5" />
            </RowButton>
          ) : messages.length > 0 ? (
            <RowButton label="新对话" onClick={() => void startOver()}>
              <MessageSquarePlus className="size-4" />
            </RowButton>
          ) : null}
          <FieldSendButton
            title="发送"
            visible={Boolean(input.trim())}
            disabled={running || sending}
            onClick={() => void send()}
          />
        </div>
      </BubbleSurface>
    </div>
  );
}

/**
 * 气泡的底板：和录入框同一套平滑圆角（getSquirclePath），底边左侧接一个朝下的尖角，两者是同一条轮廓。
 * 做法是先给气泡和尖角各描一圈 1px 的边，再在上面用底色把两者填一遍：重叠处的描边被盖掉，
 * 只剩外轮廓露出半像素的发丝线，接缝处看不出拼接
 */
function BubbleSurface({
  radius,
  className,
  children,
}: {
  radius: number;
  className?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) {
      return;
    }
    const update = () => setSize({ width: node.offsetWidth, height: node.offsetHeight });
    update();
    if (typeof ResizeObserver === "undefined") {
      return;
    }
    // 和 Squircle 一样同步提交，输入框换行变高时底板不晚一帧
    const observer = new ResizeObserver(() => flushSync(update));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const { width, height } = size;
  const body = getSquirclePath(width, height, radius);
  // 尖角从底边左侧往下伸，尖端指着正下方的小石头
  const tail = height
    ? `M 18 ${height - 6} C 22 ${height + 2} 24 ${height + 6} 22 ${height + 10} C 30 ${height + 6} 36 ${height + 2} 42 ${height - 6} Z`
    : "";

  return (
    <div ref={ref} className={cn("relative isolate", className)}>
      {body ? (
        <svg
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 overflow-visible"
          width={width}
          height={height}
        >
          <g fill="hsl(var(--easydo-surface))" stroke="hsl(var(--easydo-border))" strokeWidth={1}>
            <path d={body} />
            <path d={tail} />
          </g>
          <g fill="hsl(var(--easydo-surface))">
            <path d={body} />
            <path d={tail} />
          </g>
        </svg>
      ) : null}
      {children}
    </div>
  );
}

/** 气泡里的消息不再套边框：自己说的话是一块浅底，小石头的回复直接是正文，系统提示是一行小字 */
function Message({ message }: { message: BotMessage }) {
  if (message.role === "system") {
    return <p className="text-center text-xs text-easydo-textMuted">{message.content}</p>;
  }
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] select-text break-words rounded-xl bg-easydo-surfaceActive px-3 py-1.5 text-sm">
          <MessageMarkdown content={message.content} />
        </div>
      </div>
    );
  }
  return (
    <div className="select-text break-words text-sm">
      <MessageMarkdown content={message.content} />
    </div>
  );
}

/** 处理中占在回复的位置：只有一支来回写的笔 */
function Writing() {
  return (
    <div data-steward-writing>
      <span className="bot-writing relative block h-5 w-11" aria-hidden>
        <span className="bot-writing-line absolute bottom-0.5 left-0 h-px w-full origin-left bg-easydo-textMuted" />
        <PenLine className="bot-writing-pen absolute bottom-1 left-0 size-4 text-easydo-cream" />
      </span>
      <span className="sr-only">小石头处理中</span>
    </div>
  );
}

function RowButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={label}
      className="mb-0.5 grid size-7 shrink-0 place-items-center rounded-[7px] text-easydo-textMuted transition-colors duration-150 hover:bg-easydo-surfaceHover hover:text-easydo-cream focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
      onClick={onClick}
    >
      {children}
      <span className="sr-only">{label}</span>
    </button>
  );
}
