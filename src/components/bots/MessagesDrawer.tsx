import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type React from "react";
import { ChevronDown, ChevronLeft, ChevronRight, Maximize2, Minimize2, PenLine, SquareTerminal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FIELD_TEXTAREA_CLASS, FieldBox, FieldSendButton } from "@/components/ui/field-box";
import { Textarea } from "@/components/ui/textarea";
import {
  dispatchTodoToBot,
  listBotConversations,
  listBotMessages,
  markBotMessagesRead,
  openBotSessionInTerminal,
} from "@/lib/api";
import { readBotDraft, writeBotDraft } from "@/lib/botDrafts";
import { cn } from "@/lib/utils";
import type { Bot, BotConversation, BotMessage } from "@/types";
import { useBotActivity, type MessagesTarget } from "./BotActivity";
import { BotAvatar, UnreadBadge } from "./BotAvatar";
import { MessageMarkdown } from "./MessageMarkdown";

type Level = { kind: "bots" } | { kind: "todos"; botId: string } | { kind: "chat"; botId: string; todoId: string };

// 只有 Bot 列表时窄一些；选了 Bot 后展宽成左右两栏；进入对话再宽一点，方便读长回复
const DRAWER_WIDTH: Record<Level["kind"], number> = { bots: 320, todos: 720, chat: 880 };
const CLOSE_DURATION = 200;

/** 消息抽屉：从右侧滑出。左栏 Bot 列表；选了 Bot 后右栏是它名下的 Todo，点 Todo 右栏滑入对话 */
export function MessagesDrawer({
  open,
  target,
  onClose,
}: {
  open: boolean;
  target: MessagesTarget | null;
  onClose: () => void;
}) {
  const { bots, version } = useBotActivity();
  const [level, setLevel] = useState<Level>({ kind: "bots" });
  // 右栏切换方向：进入对话从右往左滑入，返回列表从左往右滑入
  const [direction, setDirection] = useState<"forward" | "back">("forward");
  const [conversations, setConversations] = useState<BotConversation[]>([]);
  // 全屏只在对话这一级有：铺满整个窗口，不再像弹出层
  const [fullscreen, setFullscreen] = useState(false);
  // 关闭时先播完滑出动画再卸载
  const [mounted, setMounted] = useState(open);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    if (open) {
      setMounted(true);
      setClosing(false);
      setDirection("forward");
      setFullscreen(false);
      setLevel(target ? { kind: "chat", ...target } : { kind: "bots" });
      return;
    }
    if (!mounted) {
      return;
    }
    setClosing(true);
    const timer = window.setTimeout(() => {
      setMounted(false);
      setClosing(false);
    }, CLOSE_DURATION);
    return () => window.clearTimeout(timer);
    // mounted 只用来判断是不是从打开状态关上，不放进依赖
  }, [open, target]);

  useEffect(() => {
    if (!open) {
      return;
    }
    listBotConversations()
      .then(setConversations)
      .catch(() => setConversations([]));
  }, [open, version]);

  useEffect(() => {
    if (!open) {
      return;
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        // 和 macOS 全屏一样，Esc 先退出全屏，再按一次才关闭
        if (fullscreen) {
          setFullscreen(false);
        } else {
          onClose();
        }
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose, fullscreen]);

  if (!mounted) {
    return null;
  }

  const botsById = new Map(bots.map((bot) => [bot.id, bot]));
  const botsWithConversations = bots.filter((bot) => conversations.some((item) => item.botId === bot.id));
  const selectedBotId = level.kind === "bots" ? null : level.botId;

  function go(next: Level, nextDirection: "forward" | "back") {
    setDirection(nextDirection);
    setLevel(next);
    // 列表那一级没有全屏按钮，回到列表就恢复抽屉宽度
    if (next.kind !== "chat") {
      setFullscreen(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50" data-messages-drawer>
      <div
        className={cn(
          "absolute inset-0 bg-black/10 transition-opacity duration-300",
          closing ? "drawer-scrim-exit" : "drawer-scrim-enter",
          fullscreen && "opacity-0",
        )}
        onClick={onClose}
      />
      <aside
        data-fullscreen={fullscreen ? "true" : undefined}
        className={cn(
          "absolute inset-y-0 right-0 flex flex-col overflow-hidden bg-easydo-bg text-easydo-cream",
          "transition-[width] duration-300 ease-out",
          fullscreen ? "max-w-[100vw]" : "max-w-[calc(100vw-48px)] border-l border-easydo-border shadow-easydo-card",
          closing ? "drawer-exit" : "drawer-enter",
        )}
        style={{ width: fullscreen ? "100vw" : DRAWER_WIDTH[level.kind] }}
      >
        <header
          // 全屏时这一条就是窗口顶栏：给左上角红绿灯让位，也能拖动窗口
          data-tauri-drag-region={fullscreen ? true : undefined}
          className={cn(
            "flex h-11 shrink-0 items-center gap-2 border-b border-easydo-borderSoft bg-easydo-surfaceWarm pr-2 transition-[padding] duration-300",
            fullscreen ? "pl-[calc(var(--traffic-light-inset)+14px)]" : "pl-4",
          )}
        >
          <p data-tauri-drag-region={fullscreen ? true : undefined} className="min-w-0 flex-1 truncate text-sm font-semibold">
            消息
          </p>
          {level.kind === "chat" ? (
            <IconButton title={fullscreen ? "退出全屏" : "全屏"} onClick={() => setFullscreen((current) => !current)}>
              {fullscreen ? <Minimize2 data-icon="inline-start" /> : <Maximize2 data-icon="inline-start" />}
            </IconButton>
          ) : null}
          <IconButton title="关闭" onClick={onClose}>
            <X data-icon="inline-start" />
          </IconButton>
        </header>

        <div className="flex min-h-0 flex-1">
          <nav
            className={cn(
              "flex min-h-0 shrink-0 flex-col overflow-y-auto p-2 transition-[width] duration-300 ease-out",
              selectedBotId ? "w-[240px] border-r border-easydo-borderSoft" : "w-full",
            )}
          >
            {botsWithConversations.length === 0 ? (
              <p className="px-2 py-10 text-center text-sm text-easydo-textMuted">
                还没有 Bot 消息。右键 Todo 选择「派发给 Bot」开始。
              </p>
            ) : (
              botsWithConversations.map((bot) => {
                const own = conversations.filter((item) => item.botId === bot.id);
                return (
                  <BotRow
                    key={bot.id}
                    bot={bot}
                    todoCount={own.length}
                    unread={own.reduce((total, item) => total + item.unreadCount, 0)}
                    running={own.some((item) => item.running)}
                    selected={bot.id === selectedBotId}
                    onClick={() => go({ kind: "todos", botId: bot.id }, "forward")}
                  />
                );
              })
            )}
          </nav>

          {level.kind === "bots" ? null : (
            <section className="relative min-w-0 flex-1 overflow-hidden">
              <div
                // 每次切换右栏都重新挂载，播一次滑入
                key={level.kind === "chat" ? `chat-${level.todoId}` : `todos-${level.botId}`}
                className={cn(
                  "absolute inset-0 flex flex-col",
                  direction === "forward" ? "drawer-pane-forward" : "drawer-pane-back",
                )}
              >
                {level.kind === "todos" ? (
                  <TodoList
                    bot={botsById.get(level.botId) ?? null}
                    conversations={conversations.filter((item) => item.botId === level.botId)}
                    onOpen={(todoId) => go({ kind: "chat", botId: level.botId, todoId }, "forward")}
                  />
                ) : (
                  <Chat
                    botId={level.botId}
                    bot={botsById.get(level.botId) ?? null}
                    conversation={
                      conversations.find((item) => item.botId === level.botId && item.todoId === level.todoId) ??
                      null
                    }
                    todoId={level.todoId}
                    onBack={() => go({ kind: "todos", botId: level.botId }, "back")}
                  />
                )}
              </div>
            </section>
          )}
        </div>
      </aside>
    </div>
  );
}

function IconButton({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      title={title}
      className="rounded-lg text-easydo-textMuted hover:bg-easydo-surfaceHover hover:text-easydo-cream"
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

function BotRow({
  bot,
  todoCount,
  unread,
  running,
  selected,
  onClick,
}: {
  bot: Bot;
  todoCount: number;
  unread: number;
  running: boolean;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-current={selected ? "true" : undefined}
      className={cn(
        "flex h-11 w-full shrink-0 items-center gap-2.5 rounded-lg px-2 text-left text-sm transition-colors",
        selected ? "bg-easydo-surfaceActive" : "hover:bg-easydo-surfaceHover",
      )}
      onClick={onClick}
    >
      <BotAvatar color={bot.color} running={running} />
      <span className="min-w-0 flex-1 truncate font-medium">{bot.name}</span>
      {unread > 0 ? (
        <UnreadBadge count={unread} onClick={onClick} />
      ) : (
        <span className="text-xs tabular-nums text-easydo-textMuted">{todoCount}</span>
      )}
      <ChevronRight className="size-4 shrink-0 text-easydo-textMuted" />
    </button>
  );
}

function headlineOf(detail: string) {
  return detail.split("\n").find((line) => line.trim())?.trim() ?? "";
}

function PaneHeader({
  title,
  subtitle,
  leading,
  trailing,
  onBack,
}: {
  title: string;
  subtitle?: string | null;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  onBack?: () => void;
}) {
  return (
    <div className="flex h-12 shrink-0 items-center gap-2 border-b border-easydo-borderSoft px-2">
      {onBack ? (
        <IconButton title="返回" onClick={onBack}>
          <ChevronLeft data-icon="inline-start" />
        </IconButton>
      ) : (
        <span className="w-1" />
      )}
      {leading}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{title}</p>
        {subtitle ? <p className="truncate text-[11px] text-easydo-textMuted">{subtitle}</p> : null}
      </div>
      {trailing}
    </div>
  );
}

function TodoList({
  bot,
  conversations,
  onOpen,
}: {
  bot: Bot | null;
  conversations: BotConversation[];
  onOpen: (todoId: string) => void;
}) {
  return (
    <>
      <PaneHeader
        title={bot?.name ?? "Bot"}
        subtitle={`${conversations.length} 条 Todo`}
        leading={bot ? <BotAvatar color={bot.color} /> : null}
      />
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {conversations.map((item) => (
          <button
            key={item.todoId}
            type="button"
            className="flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-easydo-surfaceHover"
            onClick={() => onOpen(item.todoId)}
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm">{headlineOf(item.todoDetail)}</p>
              <ConversationPreview item={item} />
            </div>
            {item.unreadCount > 0 ? (
              <UnreadBadge count={item.unreadCount} onClick={() => onOpen(item.todoId)} />
            ) : null}
          </button>
        ))}
      </div>
    </>
  );
}

/** 列表里每段对话的第二行：运行中 > 没发出去的草稿 > 最后一条消息 */
function ConversationPreview({ item }: { item: BotConversation }) {
  const draft = item.running ? "" : readBotDraft(item.botId, item.todoId).trim();
  return (
    <p className="truncate text-xs text-easydo-textMuted">
      {item.running ? (
        "运行中…"
      ) : draft ? (
        <>
          <span className="mr-1 text-easydo-gold">草稿</span>
          {draft.replace(/\s+/g, " ")}
        </>
      ) : (
        (item.lastMessagePreview ?? "")
      )}
    </p>
  );
}

function Chat({
  botId,
  bot,
  conversation,
  todoId,
  onBack,
}: {
  botId: string;
  bot: Bot | null;
  conversation: BotConversation | null;
  todoId: string;
  onBack: () => void;
}) {
  const { version, runningBotFor, runStartedAt } = useBotActivity();
  const [messages, setMessages] = useState<BotMessage[]>([]);
  // 输入一半离开（切对话、返回、关抽屉、退出 App）都保留，回来接着写
  const [input, setInput] = useState(() => readBotDraft(botId, todoId));
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const handleListScroll = useKeepScrollPosition(listRef, contentRef);
  const isComposingRef = useRef(false);
  const running = runningBotFor(todoId)?.id === botId;

  useEffect(() => {
    listBotMessages(todoId, botId)
      .then((next) => {
        setMessages(next);
        // 打开会话窗即视为已读
        if (next.some((message) => message.readAt === null)) {
          void markBotMessagesRead(todoId, botId);
        }
      })
      .catch(() => setMessages([]));
  }, [todoId, botId, version]);

  // 只在第一次打开、有新消息或开始运行时滚到底；数据刷新（例如窗口重新获得焦点）不打断正在往上翻的人
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
  }, [messages, running]);

  async function send() {
    const text = input.trim();
    if (!text || sending || running) {
      return;
    }
    setSending(true);
    setError(null);
    try {
      await dispatchTodoToBot(todoId, botId, text);
      setInput("");
      writeBotDraft(botId, todoId, "");
    } catch (nextError) {
      setError(String(nextError));
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <PaneHeader
        title={conversation ? headlineOf(conversation.todoDetail) : "对话"}
        onBack={onBack}
        leading={bot ? <BotAvatar color={bot.color} running={running} /> : null}
        trailing={
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            // 同一段会话不要两边同时写：Bot 运行中先不让在终端打开
            disabled={!conversation?.sessionId || running}
            title={
              !conversation?.sessionId
                ? "还没有会话，Bot 跑起来后可以在终端打开"
                : running
                  ? "Bot 运行中，结束后再在终端打开"
                  : "在终端打开这段会话"
            }
            className="rounded-lg text-easydo-textMuted hover:bg-easydo-surfaceHover hover:text-easydo-cream"
            onClick={() => {
              openBotSessionInTerminal(todoId, botId).catch((nextError) => setError(String(nextError)));
            }}
          >
            <SquareTerminal data-icon="inline-start" />
            <span className="sr-only">在终端打开</span>
          </Button>
        }
      />
      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto px-5 py-4" onScroll={handleListScroll}>
        {/* 全屏时窗口很宽，对话限宽居中，一行不会长得没法读 */}
        <div ref={contentRef} className="mx-auto w-full max-w-[760px] space-y-4">
          {conversation ? <ConversationContext conversation={conversation} /> : null}
          {messages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))}
          {running ? <BotWriting name={bot?.name ?? "Bot"} startedAt={runStartedAt(todoId)} /> : null}
        </div>
      </div>
      <div className="mx-auto w-full max-w-[784px] shrink-0 border-t border-easydo-borderSoft p-3">
        {error ? (
          <p role="alert" className="mb-2 text-xs text-destructive">
            {error}
          </p>
        ) : null}
        <FieldBox className="flex items-end gap-2 p-1.5">
          <Textarea
            aria-label="回复 Bot"
            rows={1}
            value={input}
            disabled={running}
            placeholder={running ? "Bot 运行中，结束后可以继续回复" : "继续对话，回车发送"}
            className={cn(FIELD_TEXTAREA_CLASS, "max-h-32 min-w-0 flex-1 px-2")}
            onChange={(event) => {
              setInput(event.target.value);
              writeBotDraft(botId, todoId, event.target.value);
            }}
            onCompositionStart={() => {
              isComposingRef.current = true;
            }}
            onCompositionEnd={() => {
              isComposingRef.current = false;
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey && !isComposingRef.current && !event.nativeEvent.isComposing) {
                event.preventDefault();
                void send();
              }
            }}
          />
          <FieldSendButton
            title="发送"
            visible={Boolean(input.trim())}
            disabled={running || sending}
            onClick={() => void send()}
          />
        </FieldBox>
      </div>
    </>
  );
}

// 离底部这么近就算「在最底下」
const STICK_TO_BOTTOM_THRESHOLD = 4;

/**
 * 对话区宽度或内容高度变了（全屏、退出全屏、拖窗口），滚动位置跟着修正：
 * 原来在最底下就继续贴底；停在中间就让屏幕最上面那条消息留在原处。
 * 修正放在 ResizeObserver 回调里，浏览器排好版、画到屏幕之前就改好，不会先闪一帧旧位置
 */
function useKeepScrollPosition(
  listRef: React.RefObject<HTMLDivElement | null>,
  contentRef: React.RefObject<HTMLDivElement | null>,
) {
  const stickRef = useRef(true);
  const anchorRef = useRef<{ element: Element; offset: number } | null>(null);

  function remember() {
    const list = listRef.current;
    const content = contentRef.current;
    if (!list || !content) {
      return;
    }
    stickRef.current = list.scrollHeight - list.scrollTop - list.clientHeight <= STICK_TO_BOTTOM_THRESHOLD;
    const top = list.getBoundingClientRect().top;
    const element = Array.from(content.children).find((child) => child.getBoundingClientRect().bottom > top);
    anchorRef.current = element ? { element, offset: element.getBoundingClientRect().top - top } : null;
  }

  useEffect(() => {
    const list = listRef.current;
    const content = contentRef.current;
    if (!list || !content || typeof ResizeObserver === "undefined") {
      return;
    }
    const observer = new ResizeObserver(() => {
      if (stickRef.current) {
        // 直接设值，不用平滑滚动：动画中每帧都在变，平滑滚动会一直追不上
        list.scrollTop = list.scrollHeight;
      } else {
        const anchor = anchorRef.current;
        if (anchor?.element.isConnected) {
          const offset = anchor.element.getBoundingClientRect().top - list.getBoundingClientRect().top;
          list.scrollTop += offset - anchor.offset;
        }
      }
      remember();
    });
    observer.observe(list);
    observer.observe(content);
    return () => observer.disconnect();
    // 两个 ref 指向的节点在对话窗存在期间不变
  }, []);

  return remember;
}

/** Bot 运行中占在回复的位置：一支笔来回写，下面一行字说明在干什么、跑了多久 */
function BotWriting({ name, startedAt }: { name: string; startedAt: string | null }) {
  const elapsed = useElapsed(startedAt);
  return (
    <div data-bot-writing className="flex flex-col items-start gap-1">
      <div className="flex items-center gap-3 rounded-xl border border-easydo-borderSoft bg-easydo-surface px-3.5 py-2.5">
        <span className="bot-writing relative block h-5 w-11 shrink-0" aria-hidden>
          <span className="bot-writing-line absolute bottom-0.5 left-0 h-px w-full origin-left bg-easydo-textMuted" />
          <PenLine className="bot-writing-pen absolute bottom-1 left-0 size-4 text-easydo-cream" />
        </span>
        <div className="min-w-0">
          <p className="text-sm text-easydo-cream">{name} 正在处理…</p>
          <p className="text-xs text-easydo-textMuted">处理完会通知你，可以先去忙别的</p>
        </div>
      </div>
      {elapsed ? <span className="text-[11px] tabular-nums text-easydo-textMuted">已用时 {elapsed}</span> : null}
    </div>
  );
}

/** 从开始时间到现在过了多久，每秒刷新：「42 秒」「3 分 05 秒」「1 小时 02 分」 */
function useElapsed(startedAt: string | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!startedAt) {
      return;
    }
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [startedAt]);
  if (!startedAt) {
    return null;
  }
  const seconds = Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 1000));
  if (!Number.isFinite(seconds)) {
    return null;
  }
  if (seconds < 60) {
    return `${seconds} 秒`;
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes} 分 ${String(seconds % 60).padStart(2, "0")} 秒`;
  }
  return `${Math.floor(minutes / 60)} 小时 ${String(minutes % 60).padStart(2, "0")} 分`;
}

/** 会话名在 Claude / Codex 里带「EasyDo · 」前缀方便那边认出来，在 EasyDo 里就不用重复了 */
function displaySessionTitle(title: string | null) {
  return title?.replace(/^EasyDo\s*·\s*/, "").trim() || null;
}

/** 对话最上方的前提：这段对话处理的是哪条 Todo（可展开全文），以及会话名和会话 ID */
function ConversationContext({ conversation }: { conversation: BotConversation }) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const headline = headlineOf(conversation.todoDetail);
  const hasMore = conversation.todoDetail.trim() !== headline;
  const title = displaySessionTitle(conversation.title);
  const sessionId = conversation.sessionId;

  async function copySessionId() {
    if (!sessionId) {
      return;
    }
    try {
      await navigator.clipboard.writeText(sessionId);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // 剪贴板不可用时不提示
    }
  }

  return (
    <div
      data-conversation-context
      className="mx-auto w-full max-w-[85%] rounded-xl border border-easydo-borderSoft bg-easydo-surfaceWarm px-3.5 py-2.5"
    >
      <button
        type="button"
        aria-expanded={hasMore ? expanded : undefined}
        disabled={!hasMore}
        title={hasMore ? (expanded ? "收起 Todo" : "展开完整 Todo") : undefined}
        className="flex w-full items-center justify-center gap-1 text-center text-sm font-medium text-easydo-cream disabled:cursor-default"
        onClick={() => setExpanded((current) => !current)}
      >
        <span className="min-w-0 truncate">{headline}</span>
        {hasMore ? (
          <ChevronDown
            className={cn("size-3.5 shrink-0 text-easydo-textMuted transition-transform duration-200", expanded && "rotate-180")}
          />
        ) : null}
      </button>
      {expanded ? (
        <div className="mt-2 select-text border-t border-easydo-borderSoft pt-2 text-sm text-easydo-textSecondary">
          <MessageMarkdown content={conversation.todoDetail} />
        </div>
      ) : null}
      {title || sessionId ? (
        <div className="mt-1.5 flex items-center gap-3 text-[11px] text-easydo-textMuted">
          <span className="min-w-0 flex-1 truncate" title={title ?? undefined}>
            {title}
          </span>
          {sessionId ? (
            <button
              type="button"
              title={`${sessionId}\n点击复制完整会话 ID`}
              className="shrink-0 tabular-nums transition-colors hover:text-easydo-cream"
              onClick={() => void copySessionId()}
            >
              {copied ? "已复制" : `会话 ${sessionId.slice(0, 8)}`}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function formatTime(iso: string) {
  const date = new Date(iso);
  const time = `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  const today = new Date();
  return date.toDateString() === today.toDateString() ? time : `${date.getMonth() + 1}月${date.getDate()}日 ${time}`;
}

function MessageBubble({ message }: { message: BotMessage }) {
  if (message.role === "system") {
    return <p className="text-center text-xs text-easydo-textMuted">{message.content}</p>;
  }
  const mine = message.role === "user";
  return (
    <div className={cn("flex flex-col gap-1", mine ? "items-end" : "items-start")}>
      <div
        className={cn(
          "max-w-[88%] select-text break-words rounded-xl px-3.5 py-2.5 text-sm",
          mine ? "bg-easydo-surfaceActive text-easydo-cream" : "border border-easydo-borderSoft bg-easydo-surface text-easydo-cream",
        )}
      >
        <MessageMarkdown content={message.content} />
      </div>
      <span className="text-[11px] text-easydo-textMuted">{formatTime(message.createdAt)}</span>
    </div>
  );
}
