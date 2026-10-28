import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type React from "react";
import { ArrowUp, ChevronLeft, ChevronRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { dispatchTodoToBot, listBotConversations, listBotMessages, markBotMessagesRead } from "@/lib/api";
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
  // 关闭时先播完滑出动画再卸载
  const [mounted, setMounted] = useState(open);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    if (open) {
      setMounted(true);
      setClosing(false);
      setDirection("forward");
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
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!mounted) {
    return null;
  }

  const botsById = new Map(bots.map((bot) => [bot.id, bot]));
  const botsWithConversations = bots.filter((bot) => conversations.some((item) => item.botId === bot.id));
  const selectedBotId = level.kind === "bots" ? null : level.botId;

  function go(next: Level, nextDirection: "forward" | "back") {
    setDirection(nextDirection);
    setLevel(next);
  }

  return (
    <div className="fixed inset-0 z-50" data-messages-drawer>
      <div
        className={cn(
          "absolute inset-0 bg-black/10",
          closing ? "drawer-scrim-exit" : "drawer-scrim-enter",
        )}
        onClick={onClose}
      />
      <aside
        className={cn(
          "absolute inset-y-0 right-0 flex max-w-[calc(100vw-48px)] flex-col overflow-hidden border-l border-easydo-border bg-easydo-bg text-easydo-cream shadow-easydo-card",
          "transition-[width] duration-300 ease-out",
          closing ? "drawer-exit" : "drawer-enter",
        )}
        style={{ width: DRAWER_WIDTH[level.kind] }}
      >
        <header className="flex h-11 shrink-0 items-center gap-2 border-b border-easydo-borderSoft bg-easydo-surfaceWarm pl-4 pr-2">
          <p className="min-w-0 flex-1 truncate text-sm font-semibold">消息</p>
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
  onBack,
}: {
  title: string;
  subtitle?: string | null;
  leading?: React.ReactNode;
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
              <p className="truncate text-xs text-easydo-textMuted">
                {item.running ? "运行中…" : (item.lastMessagePreview ?? "")}
              </p>
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

function Chat({
  bot,
  conversation,
  todoId,
  onBack,
}: {
  bot: Bot | null;
  conversation: BotConversation | null;
  todoId: string;
  onBack: () => void;
}) {
  const { version, runningBotFor } = useBotActivity();
  const [messages, setMessages] = useState<BotMessage[]>([]);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const isComposingRef = useRef(false);
  const botId = bot?.id ?? null;
  const running = runningBotFor(todoId)?.id === botId && botId !== null;

  useEffect(() => {
    if (!botId) {
      return;
    }
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

  useLayoutEffect(() => {
    const list = listRef.current;
    if (list) {
      list.scrollTop = list.scrollHeight;
    }
  }, [messages, running]);

  async function send() {
    const text = input.trim();
    if (!botId || !text || sending || running) {
      return;
    }
    setSending(true);
    setError(null);
    try {
      await dispatchTodoToBot(todoId, botId, text);
      setInput("");
    } catch (nextError) {
      setError(String(nextError));
    } finally {
      setSending(false);
    }
  }

  const subtitle = useMemo(() => {
    if (!conversation) {
      return null;
    }
    const parts = [conversation.title, conversation.sessionId ? `会话 ${conversation.sessionId.slice(0, 8)}` : null];
    return parts.filter(Boolean).join(" · ");
  }, [conversation]);

  return (
    <>
      <PaneHeader
        title={conversation ? headlineOf(conversation.todoDetail) : "对话"}
        subtitle={subtitle}
        onBack={onBack}
        leading={bot ? <BotAvatar color={bot.color} running={running} /> : null}
      />
      <div ref={listRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} />
        ))}
        {running ? <p className="text-center text-xs text-easydo-textMuted">{bot?.name} 正在处理…</p> : null}
      </div>
      <div className="shrink-0 border-t border-easydo-borderSoft p-3">
        {error ? (
          <p role="alert" className="mb-2 text-xs text-destructive">
            {error}
          </p>
        ) : null}
        <div className="flex items-end gap-2 rounded-xl border border-easydo-border bg-easydo-surface p-1.5">
          <Textarea
            aria-label="回复 Bot"
            rows={1}
            value={input}
            disabled={running}
            placeholder={running ? "Bot 运行中，结束后可以继续回复" : "继续对话，回车发送"}
            className="max-h-32 min-h-8 flex-1 resize-none border-0 bg-transparent px-2 py-1.5 text-sm text-easydo-cream shadow-none placeholder:font-light placeholder:text-[hsl(var(--easydo-text-muted)/0.55)] focus-visible:ring-0 dark:bg-transparent md:text-sm"
            onChange={(event) => setInput(event.target.value)}
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
          <button
            type="button"
            title="发送"
            disabled={running || sending || !input.trim()}
            className="mb-1 mr-1 grid size-6 shrink-0 place-items-center rounded-full bg-easydo-gold text-easydo-onAccent transition-opacity disabled:opacity-40"
            onClick={() => void send()}
          >
            <ArrowUp className="size-3" />
          </button>
        </div>
      </div>
    </>
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
