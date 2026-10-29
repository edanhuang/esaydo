import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BotActivityContext, EMPTY_BOT_ACTIVITY } from "@/components/bots/BotActivity";
import { chooseBotDirectory, createBot } from "../lib/api";
import type { Bot } from "../types";
import { BotsPage } from "./BotsPage";

vi.mock("../lib/api", () => ({
  chooseBotDirectory: vi.fn(),
  countBotMessages: vi.fn(async () => 0),
  createBot: vi.fn(),
  deleteBot: vi.fn(),
  updateBot: vi.fn(),
}));

const existing: Bot = {
  id: "bot-1",
  name: "周报助手",
  color: "amber",
  provider: "codex",
  model: "",
  directory: "/work/reports",
  createdAt: "2026-06-04T00:00:00.000Z",
  updatedAt: "2026-06-04T00:00:00.000Z",
  usage: { runs: 2, inputTokens: 41381, cachedInputTokens: 33664, outputTokens: 10, costUsd: 0 },
};

function renderPage(refresh = vi.fn(async () => undefined), bots: Bot[] = [existing]) {
  render(
    <BotActivityContext.Provider value={{ ...EMPTY_BOT_ACTIVITY, bots, refresh }}>
      <BotsPage onNavigate={vi.fn()} />
    </BotActivityContext.Provider>,
  );
  return refresh;
}

describe("BotsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("列出 Bot 的 AI、模型、目录和 token 用量", () => {
    renderPage();
    const row = document.querySelector('[data-bot-row="bot-1"]') as HTMLElement;
    expect(row).toHaveTextContent("Codex · 默认模型");
    expect(row).toHaveTextContent("/work/reports");
    expect(row).toHaveTextContent("运行 2 次 · 输入 41.4k（缓存 33.7k）· 输出 10");
  });

  it("没有 Bot 时压暗页面，提示指向新建按钮，点提示也能新建", () => {
    renderPage(undefined, []);

    expect(document.querySelector("[data-bot-spotlight]")).toBeInTheDocument();

    const hint = screen.getByRole("button", { name: "新建 Bot，就能在 Todo 右键派发给它" });
    fireEvent.click(hint);
    expect(screen.getByRole("dialog", { name: "新建 Bot" })).toBeInTheDocument();
  });

  it("新建 Bot：颜色默认随机，从没用过的颜色里挑；选目录后保存", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    vi.mocked(chooseBotDirectory).mockResolvedValue("/work/easydo");
    vi.mocked(createBot).mockResolvedValue({ ...existing, id: "bot-2" });
    const refresh = renderPage();

    fireEvent.click(screen.getByRole("button", { name: /新建 Bot/ }));
    expect(screen.getByRole("radio", { name: "随机" })).toHaveAttribute("aria-checked", "true");
    fireEvent.change(screen.getByLabelText("Bot 名称"), { target: { value: "看板助手" } });
    fireEvent.click(screen.getByRole("radio", { name: "Claude Code" }));
    fireEvent.change(screen.getByLabelText("模型"), { target: { value: "sonnet" } });
    fireEvent.click(screen.getByRole("button", { name: /选择/ }));
    await waitFor(() => expect(screen.getByLabelText("工作目录")).toHaveValue("/work/easydo"));
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() =>
      expect(createBot).toHaveBeenCalledWith({
        name: "看板助手",
        color: "olive",
        provider: "claude",
        model: "sonnet",
        directory: "/work/easydo",
      }),
    );
    expect(refresh).toHaveBeenCalled();
  });
});
