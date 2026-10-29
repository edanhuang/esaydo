import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type React from "react";
import { getStewardState, onBotRunsChanged } from "@/lib/api";
import type { StewardState } from "@/types";

export interface StewardValue {
  state: StewardState;
  /** 对话面板是否打开 */
  open: boolean;
  setOpen: (open: boolean) => void;
  /** 运行状态或消息有变化就加一，面板据此重新拉消息 */
  version: number;
  refresh: () => Promise<void>;
}

const EMPTY_STATE: StewardState = {
  running: false,
  startedAt: null,
  unreadCount: 0,
  hasMessages: false,
  lastOutcome: null,
};

export const StewardContext = createContext<StewardValue>({
  state: EMPTY_STATE,
  open: false,
  setOpen: () => undefined,
  version: 0,
  refresh: async () => undefined,
});

export function useSteward() {
  return useContext(StewardContext);
}

export function StewardProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<StewardState>(EMPTY_STATE);
  const [open, setOpen] = useState(false);
  const [version, setVersion] = useState(0);

  const refresh = useCallback(async () => {
    try {
      setState(await getStewardState());
      setVersion((current) => current + 1);
    } catch {
      // 不在 Tauri 里（例如测试）时没有这些命令，保持空状态
    }
  }, []);

  useEffect(() => {
    void refresh();
    let unlisten: (() => void) | null = null;
    let disposed = false;
    // 小石头和派发的 Bot 共用一个变化事件：开始、结束运行或已读时都会发
    onBotRunsChanged(() => void refresh())
      .then((dispose) => {
        if (disposed) {
          dispose();
        } else {
          unlisten = dispose;
        }
      })
      .catch(() => undefined);
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [refresh]);

  const value = useMemo(() => ({ state, open, setOpen, version, refresh }), [state, open, version, refresh]);
  return <StewardContext.Provider value={value}>{children}</StewardContext.Provider>;
}
