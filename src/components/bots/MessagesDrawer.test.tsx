import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { listBotConversations, listBotMessages, markBotMessagesRead } from "@/lib/api";
import type { Bot, BotConversation, BotMessage } from "@/types";
import { BotActivityContext, EMPTY_BOT_ACTIVITY } from "./BotActivity";
import { MessagesDrawer } from "./MessagesDrawer";

vi.mock("@/lib/api", () => ({
  dispatchTodoToBot: vi.fn(),
  listBotConversations: vi.fn(),
  listBotMessages: vi.fn(),
  markBotMessagesRead: vi.fn(async () => undefined),
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

function renderDrawer() {
  render(
    <BotActivityContext.Provider value={{ ...EMPTY_BOT_ACTIVITY, bots: [bot] }}>
      <MessagesDrawer open target={null} onClose={vi.fn()} />
    </BotActivityContext.Provider>,
  );
}

describe("MessagesDrawer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listBotConversations).mockResolvedValue([conversation]);
    vi.mocked(listBotMessages).mockResolvedValue(messages);
  });

  it("先只列 Bot，选中后左栏保留 Bot、右栏列出 Todo，抽屉随之展宽", async () => {
    renderDrawer();
    const drawer = () => document.querySelector("[data-messages-drawer] aside") as HTMLElement;

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
    expect(screen.getAllByRole("checkbox")).toHaveLength(2);
    expect(document.querySelector(".message-markdown script")).toBeNull();
    expect((window as unknown as { __injected?: boolean }).__injected).toBeUndefined();
    await waitFor(() => expect(markBotMessagesRead).toHaveBeenCalledWith("todo-1", "bot-1"));

    fireEvent.click(screen.getByTitle("返回"));
    expect(screen.getByText("汇总好了")).toBeInTheDocument();
  });
});
