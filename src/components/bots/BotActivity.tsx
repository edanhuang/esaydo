import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type React from "react";
import {
  listActiveBotRuns,
  listBotUnread,
  listBots,
  onBotRunsChanged,
  onConfirmQuit,
  quitApp,
  stopBotRun,
} from "@/lib/api";
import type { ActiveBotRun, Bot, Todo, TodoUnread } from "@/types";
import { DispatchDialog } from "./DispatchDialog";
import { QuitConfirmDialog } from "./QuitConfirmDialog";
import { MessagesDrawer } from "./MessagesDrawer";

export interface MessagesTarget {
  todoId: string;
  botId: string;
}

export interface BotActivityValue {
  bots: Bot[];
  /** 首次加载完成前为 false，避免已有 Bot 的人在 Bot 页先看到空状态 */
  loaded: boolean;
  runningBotFor: (todoId: string) => Bot | null;
  /** 这条 Todo 当前这次运行的开始时间，没在运行时为 null */
  runStartedAt: (todoId: string) => string | null;
  unreadFor: (todoId: string) => TodoUnread | null;
  totalUnread: number;
  /** Bot 运行状态或消息有变化就加一；看板据此刷新 Todo（Bot 可能改了内容） */
  version: number;
  refresh: () => Promise<void>;
  requestDispatch: (todo: Todo, bot: Bot) => void;
  stop: (todoId: string) => void;
  openMessages: (target?: MessagesTarget) => void;
  openBotsPage: () => void;
}

export const EMPTY_BOT_ACTIVITY: BotActivityValue = {
  bots: [],
  loaded: true,
  runningBotFor: () => null,
  runStartedAt: () => null,
  unreadFor: () => null,
  totalUnread: 0,
  version: 0,
  refresh: async () => undefined,
  requestDispatch: () => undefined,
  stop: () => undefined,
  openMessages: () => undefined,
  openBotsPage: () => undefined,
};

export const BotActivityContext = createContext<BotActivityValue>(EMPTY_BOT_ACTIVITY);

export function useBotActivity() {
  return useContext(BotActivityContext);
}

export function BotActivityProvider({
  children,
  onOpenBotsPage = () => undefined,
}: {
  children: React.ReactNode;
  onOpenBotsPage?: () => void;
}) {
  const [bots, setBots] = useState<Bot[]>([]);
  const [runs, setRuns] = useState<ActiveBotRun[]>([]);
  const [unread, setUnread] = useState<TodoUnread[]>([]);
  const [version, setVersion] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [dispatchTarget, setDispatchTarget] = useState<{ todo: Todo; bot: Bot } | null>(null);
  const [quitCount, setQuitCount] = useState<number | null>(null);
  const [drawer, setDrawer] = useState<{ open: boolean; target: MessagesTarget | null }>({
    open: false,
    target: null,
  });

  const refresh = useCallback(async () => {
    try {
      const [nextBots, nextRuns, nextUnread] = await Promise.all([listBots(), listActiveBotRuns(), listBotUnread()]);
      setBots(nextBots);
      setRuns(nextRuns);
      setUnread(nextUnread);
      setVersion((current) => current + 1);
    } catch {
      // 不在 Tauri 里（例如测试）时没有这些命令，保持空状态
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
    let unlisten: (() => void) | null = null;
    let disposed = false;
    onBotRunsChanged(() => void refresh())
      .then((dispose) => {
        if (disposed) {
          dispose();
        } else {
          unlisten = dispose;
        }
      })
      .catch(() => undefined);
    let unlistenQuit: (() => void) | null = null;
    // 弹窗开着时再按一次 ⌘Q，直接退出
    onConfirmQuit((count) =>
      setQuitCount((current) => {
        if (current !== null) {
          void quitApp();
        }
        return count;
      }),
    )
      .then((dispose) => {
        if (disposed) {
          dispose();
        } else {
          unlistenQuit = dispose;
        }
      })
      .catch(() => undefined);
    window.addEventListener("focus", refresh);
    return () => {
      disposed = true;
      unlisten?.();
      unlistenQuit?.();
      window.removeEventListener("focus", refresh);
    };
  }, [refresh]);

  const value = useMemo<BotActivityValue>(() => {
    const botsById = new Map(bots.map((bot) => [bot.id, bot]));
    const runningByTodo = new Map<string, Bot>();
    for (const run of runs) {
      const bot = botsById.get(run.botId);
      if (bot) {
        runningByTodo.set(run.todoId, bot);
      }
    }
    const unreadByTodo = new Map(unread.map((item) => [item.todoId, item]));
    return {
      bots,
      loaded,
      runningBotFor: (todoId) => runningByTodo.get(todoId) ?? null,
      runStartedAt: (todoId) => runs.find((item) => item.todoId === todoId)?.startedAt ?? null,
      unreadFor: (todoId) => unreadByTodo.get(todoId) ?? null,
      totalUnread: unread.reduce((total, item) => total + item.count, 0),
      version,
      refresh,
      requestDispatch: (todo, bot) => setDispatchTarget({ todo, bot }),
      stop: (todoId) => {
        const run = runs.find((item) => item.todoId === todoId);
        if (run) {
          void stopBotRun(todoId, run.botId).finally(() => void refresh());
        }
      },
      openMessages: (target) => setDrawer({ open: true, target: target ?? null }),
      openBotsPage: onOpenBotsPage,
    };
  }, [bots, loaded, runs, unread, version, refresh, onOpenBotsPage]);

  return (
    <BotActivityContext.Provider value={value}>
      {children}
      <DispatchDialog
        target={dispatchTarget}
        onClose={() => setDispatchTarget(null)}
        onDispatched={() => {
          setDispatchTarget(null);
          void refresh();
        }}
      />
      <QuitConfirmDialog
        runningCount={quitCount}
        onCancel={() => setQuitCount(null)}
        onConfirm={() => void quitApp()}
      />
      <MessagesDrawer
        open={drawer.open}
        target={drawer.target}
        onClose={() => setDrawer({ open: false, target: null })}
      />
    </BotActivityContext.Provider>
  );
}
