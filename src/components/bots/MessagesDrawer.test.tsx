import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  dispatchTodoToBot,
  listBotConversations,
  listBotMessages,
  markBotMessagesRead,
  openBotSessionInTerminal,
} from "@/lib/api";
import type { Bot, BotConversation, BotMessage } from "@/types";
import { BotActivityContext, EMPTY_BOT_ACTIVITY, type BotActivityValue } from "./BotActivity";
import { MessagesDrawer } from "./MessagesDrawer";

vi.mock("@/lib/api", () => ({
  dispatchTodoToBot: vi.fn(),
  listBotConversations: vi.fn(),
  listBotMessages: vi.fn(),
  markBotMessagesRead: vi.fn(async () => undefined),
  openBotSessionInTerminal: vi.fn(async () => undefined),
}));

const bot: Bot = {
  id: "bot-1",
  name: "周报助手",
  color: "teal",
  provider: "claude",
  model: "sonnet",
  directory: "/work",
  createdAt: "2026-10-28T00:00:00.000Z",
  updatedAt: "2026-10-28T00:00:00.000Z",
  usage: { runs: 1, inputTokens: 10, cachedInputTokens: 0, outputTokens: 5, costUsd: 0 },
};

const conversation: BotConversation = {
  botId: "bot-1",
  todoId: "todo-1",
  todoDetail: "整理 Q4 工时周报\n- [ ] 汇总",
  title: "EasyDo · 整理 Q4 工时周报",
  sessionId: "0123456789",
  unreadCount: 1,
  lastMessageAt: "2026-10-28T08:00:00.000Z",
  lastMessagePreview: "汇总好了",
  running: false,
};

const messages: BotMessage[] = [
  { id: "m1", runId: "r1", role: "user", content: "按 **项目** 汇总", createdAt: "2026-10-28T07:59:00.000Z", readAt: "x" },
  {
    id: "m2",
    runId: "r1",
    role: "bot",
    content: "汇总好了：\n\n| 项目 | 工时 |\n| --- | --- |\n| EasyDo | 12 |\n\n- [x] 拉取记录\n- [ ] 填工时系统\n\n<script>window.__injected = true</script>",
    createdAt: "2026-10-28T08:00:00.000Z",
    readAt: null,
  },
];

function renderDrawer(
  { onClose = vi.fn(), activity = {} }: { onClose?: () => void; activity?: Partial<BotActivityValue> } = {},
) {
  return render(
    <BotActivityContext.Provider value={{ ...EMPTY_BOT_ACTIVITY, bots: [bot], ...activity }}>
      <MessagesDrawer open target={null} onClose={onClose} />
    </BotActivityContext.Provider>,
  );
}

async function openChat() {
  fireEvent.click(await screen.findByRole("button", { name: /周报助手/ }));
  fireEvent.click(screen.getByText("整理 Q4 工时周报"));
  await screen.findByRole("textbox", { name: "回复 Bot" });
}

const drawer = () => document.querySelector("[data-messages-drawer] aside") as HTMLElement;

describe("MessagesDrawer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    vi.mocked(listBotConversations).mockResolvedValue([conversation]);
    vi.mocked(listBotMessages).mockResolvedValue(messages);
  });

  it("先只列 Bot，选中后左栏保留 Bot、右栏列出 Todo，抽屉随之展宽", async () => {
    renderDrawer();

    const botButton = await screen.findByRole("button", { name: /周报助手/ });
    expect(drawer().style.width).toBe("320px");

    fireEvent.click(botButton);
    expect(drawer().style.width).toBe("720px");
    expect(botButton).toHaveAttribute("aria-current", "true");
    expect(screen.getByText("整理 Q4 工时周报")).toBeInTheDocument();
    expect(screen.getByText("汇总好了")).toBeInTheDocument();
  });

  it("点 Todo 进入对话：消息按 Markdown 渲染，原始 HTML 不执行，打开即已读", async () => {
    renderDrawer();
    fireEvent.click(await screen.findByRole("button", { name: /周报助手/ }));
    fireEvent.click(screen.getByText("整理 Q4 工时周报"));

    expect(await screen.findByRole("table")).toHaveTextContent("EasyDo12");
    expect(screen.getByText("项目", { selector: "strong" })).toBeInTheDocument();
    expect(document.querySelectorAll(".message-markdown input[type=checkbox]")).toHaveLength(2);
    expect(document.querySelector(".message-markdown script")).toBeNull();
    expect((window as unknown as { __injected?: boolean }).__injected).toBeUndefined();
    await waitFor(() => expect(markBotMessagesRead).toHaveBeenCalledWith("todo-1", "bot-1"));

    // 对话最上方的前提框：Todo 第一行、会话名（去掉 EasyDo 前缀）、会话 ID，可展开完整 Todo
    const context = document.querySelector("[data-conversation-context]") as HTMLElement;
    expect(context).toHaveTextContent("整理 Q4 工时周报");
    expect(context).toHaveTextContent("会话 01234567");
    expect(context).not.toHaveTextContent("EasyDo ·");
    expect(context).not.toHaveTextContent("汇总");
    fireEvent.click(screen.getByTitle("展开完整 Todo"));
    expect(context).toHaveTextContent("汇总");

    fireEvent.click(screen.getByTitle("在终端打开这段会话"));
    expect(openBotSessionInTerminal).toHaveBeenCalledWith("todo-1", "bot-1");

    fireEvent.click(screen.getByTitle("返回"));
    expect(screen.getByText("汇总好了")).toBeInTheDocument();
  });

  it("对话里可以全屏铺满窗口，Esc 先退出全屏再关闭，回到列表自动恢复宽度", async () => {
    const onClose = vi.fn();
    renderDrawer({ onClose });
    fireEvent.click(await screen.findByRole("button", { name: /周报助手/ }));
    expect(screen.queryByTitle("全屏")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("整理 Q4 工时周报"));

    fireEvent.click(await screen.findByTitle("全屏"));
    expect(drawer().style.width).toBe("100vw");
    expect(drawer()).toHaveAttribute("data-fullscreen", "true");

    fireEvent.keyDown(window, { key: "Escape" });
    expect(drawer().style.width).toBe("880px");
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTitle("全屏"));
    fireEvent.click(screen.getByTitle("返回"));
    expect(drawer().style.width).toBe("720px");
    expect(drawer()).not.toHaveAttribute("data-fullscreen");
  });

  it("输入一半离开，回来还在；列表里标出草稿", async () => {
    const view = renderDrawer();
    await openChat();
    fireEvent.change(screen.getByRole("textbox", { name: "回复 Bot" }), { target: { value: "再按人汇总一份" } });

    fireEvent.click(screen.getByTitle("返回"));
    expect(screen.getByText("草稿")).toBeInTheDocument();
    expect(screen.getByText("再按人汇总一份")).toBeInTheDocument();

    view.unmount();
    renderDrawer();
    await openChat();
    expect(screen.getByRole("textbox", { name: "回复 Bot" })).toHaveValue("再按人汇总一份");
  });

  it("发送成功后清掉草稿", async () => {
    renderDrawer();
    await openChat();
    const input = screen.getByRole("textbox", { name: "回复 Bot" });
    fireEvent.change(input, { target: { value: "继续" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => expect(dispatchTodoToBot).toHaveBeenCalledWith("todo-1", "bot-1", "继续"));
    await waitFor(() => expect(input).toHaveValue(""));
    fireEvent.click(screen.getByTitle("返回"));
    expect(screen.queryByText("草稿")).not.toBeInTheDocument();
  });

  it("Bot 运行中在回复的位置显示写字动效和已用时", async () => {
    const startedAt = new Date(Date.now() - 65_000).toISOString();
    renderDrawer({ activity: { runningBotFor: () => bot, runStartedAt: () => startedAt } });
    await openChat();

    const writing = document.querySelector("[data-bot-writing]") as HTMLElement;
    expect(writing).toHaveTextContent("周报助手 正在处理…");
    expect(writing).toHaveTextContent(/已用时 1 分 0[5-6] 秒/);
    expect(writing.querySelector(".bot-writing-pen")).not.toBeNull();
  });

  describe("宽度变化时的滚动位置", () => {
    let resize: () => void = () => undefined;

    beforeEach(() => {
      vi.stubGlobal(
        "ResizeObserver",
        class {
          constructor(callback: () => void) {
            resize = callback;
          }
          observe() {}
          disconnect() {}
        },
      );
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    // jsdom 没有布局：给对话区装上可控的高度和滚动位置
    function fakeLayout(list: HTMLElement, layout: { scrollHeight: number; clientHeight: number; scrollTop: number }) {
      Object.defineProperty(list, "scrollHeight", { configurable: true, get: () => layout.scrollHeight });
      Object.defineProperty(list, "clientHeight", { configurable: true, get: () => layout.clientHeight });
      Object.defineProperty(list, "scrollTop", {
        configurable: true,
        get: () => layout.scrollTop,
        set: (value: number) => {
          layout.scrollTop = Math.min(Math.max(0, value), layout.scrollHeight - layout.clientHeight);
        },
      });
      return layout;
    }

    function rect(top: number, height: number) {
      return { top, bottom: top + height, height } as DOMRect;
    }

    async function chatList() {
      renderDrawer();
      await openChat();
      await screen.findByRole("table");
      return document.querySelector("[data-messages-drawer] section .overflow-y-auto") as HTMLElement;
    }

    it("原来在最底下，退出全屏内容变高后仍然贴底", async () => {
      const list = await chatList();
      const layout = fakeLayout(list, { scrollHeight: 900, clientHeight: 400, scrollTop: 500 });
      fireEvent.scroll(list);

      layout.scrollHeight = 1500;
      act(() => resize());

      expect(list.scrollTop).toBe(1100);
    });

    it("停在中间时，屏幕最上面那条消息留在原处", async () => {
      const list = await chatList();
      const layout = fakeLayout(list, { scrollHeight: 1500, clientHeight: 400, scrollTop: 300 });
      const [context, first] = Array.from(list.firstElementChild!.children) as HTMLElement[];
      vi.spyOn(list, "getBoundingClientRect").mockReturnValue(rect(100, 400));
      vi.spyOn(context, "getBoundingClientRect").mockReturnValue(rect(-200, 120));
      // 第一条消息顶部露在屏幕上方 30px 处
      const firstRect = vi.spyOn(first, "getBoundingClientRect").mockReturnValue(rect(70, 200));
      fireEvent.scroll(list);

      // 换行后它前面的内容变高，它被往下推了 90px
      layout.scrollHeight = 1700;
      firstRect.mockReturnValue(rect(160, 260));
      act(() => resize());

      expect(layout.scrollTop).toBe(390);
    });
  });
});
