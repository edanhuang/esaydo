import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { listStewardMessages, markStewardRead, newStewardConversation, sendToSteward } from "@/lib/api";
import type { BotMessage, StewardState } from "@/types";
import { StewardContext, type StewardValue } from "./StewardContext";
import { StewardPanel } from "./StewardPanel";
import { StewardDockedPebble } from "./StewardPet";

vi.mock("@/lib/api", () => ({
  listStewardMessages: vi.fn(),
  markStewardRead: vi.fn(async () => undefined),
  newStewardConversation: vi.fn(async () => undefined),
  sendToSteward: vi.fn(async () => undefined),
  stopSteward: vi.fn(async () => undefined),
}));

const idle: StewardState = { running: false, startedAt: null, unreadCount: 0, hasMessages: false, lastOutcome: null };

const messages: BotMessage[] = [
  { id: "m1", runId: "r1", role: "user", content: "把两条归档", createdAt: "2026-10-29T10:00:00.000Z", readAt: "x" },
  { id: "m2", runId: "r1", role: "bot", content: "已归档 2 条", createdAt: "2026-10-29T10:01:00.000Z", readAt: null },
];

function renderWith(ui: React.ReactNode, value: Partial<StewardValue> = {}) {
  const context: StewardValue = {
    state: idle,
    open: true,
    setOpen: vi.fn(),
    version: 0,
    refresh: async () => undefined,
    ...value,
  };
  render(<StewardContext.Provider value={context}>{ui}</StewardContext.Provider>);
  return context;
}

describe("小石头", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    vi.mocked(listStewardMessages).mockResolvedValue([]);
  });

  it("展开时坐在侧栏里，不配文字，未读只亮小点，点击切换对话", () => {
    const context = renderWith(<StewardDockedPebble collapsed={false} />, {
      open: false,
      state: { ...idle, unreadCount: 2 },
    });
    const pet = screen.getByRole("button", { name: "小石头，2 条新回复" });
    expect(pet).toHaveTextContent("");
    expect(pet).not.toHaveAttribute("data-collapsed");
    expect(pet.querySelector("circle[fill='var(--color-easydo-gold)']")).not.toBeNull();
    fireEvent.click(pet);
    expect(context.setOpen).toHaveBeenCalledWith(true);
  });

  it("处理中敲键盘；动了手就眯眼开心，什么都没做成就冒问号", () => {
    vi.useFakeTimers();
    const value = (state: StewardState, version: number) => ({
      state,
      open: false,
      setOpen: vi.fn(),
      version,
      refresh: async () => undefined,
    });
    const view = (state: StewardState, version: number) => (
      <StewardContext.Provider value={value(state, version)}>
        <StewardDockedPebble collapsed={false} />
      </StewardContext.Provider>
    );
    const { rerender } = render(view({ ...idle, running: true }, 0));
    const svg = () => screen.getByRole("button", { name: "小石头" }).querySelector("svg");
    expect(svg()?.dataset.mood).toBe("busy");
    expect(svg()?.querySelector("[data-steward-keyboard]")).not.toBeNull();

    rerender(view({ ...idle, lastOutcome: "happy" }, 1));
    expect(svg()?.dataset.mood).toBe("done");
    expect(svg()?.querySelector("[data-steward-keyboard]")).toBeNull();
    act(() => vi.advanceTimersByTime(3000));
    expect(svg()?.dataset.mood).toBe("idle");
    expect(svg()?.querySelector(".steward-eyes-happy")).not.toBeNull();

    rerender(view({ ...idle, running: true }, 2));
    rerender(view({ ...idle, lastOutcome: "confused" }, 3));
    expect(svg()?.dataset.mood).toBe("confused");
    expect(svg()?.querySelector(".steward-ask")).not.toBeNull();
    act(() => vi.advanceTimersByTime(3500));
    expect(svg()?.dataset.mood).toBe("idle");
    vi.useRealTimers();
  });

  it("侧栏收起时趴在边上，点它直接打开对话，气泡跟着贴到边上", () => {
    const context = renderWith(
      <>
        <StewardDockedPebble collapsed />
        <StewardPanel collapsed />
      </>,
      { open: false },
    );
    const pet = screen.getByRole("button", { name: "小石头" });
    expect(pet).toHaveAttribute("data-collapsed");
    fireEvent.click(pet);
    expect(context.setOpen).toHaveBeenCalledWith(true);
  });

  it("收起状态下打开的气泡贴着小石头", async () => {
    renderWith(<StewardPanel collapsed />);
    expect(await screen.findByRole("dialog", { name: "小石头" })).toHaveAttribute("data-collapsed");
  });

  it("空对话只有输入框，回车发送并清空", async () => {
    renderWith(<StewardPanel collapsed={false} />);
    const input = await screen.findByRole("textbox", { name: "对小石头说" });
    expect(input).not.toHaveAttribute("placeholder");
    expect(screen.queryByRole("button", { name: "新对话" })).toBeNull();

    fireEvent.change(input, { target: { value: "今天新建的 Todo 有哪些？" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(sendToSteward).toHaveBeenCalledWith("今天新建的 Todo 有哪些？"));
    await waitFor(() => expect(input).toHaveValue(""));
  });

  it("打开即已读，处理中能打字但发不出去，也不能开新对话", async () => {
    vi.mocked(listStewardMessages).mockResolvedValue(messages);
    renderWith(<StewardPanel collapsed={false} />, {
      state: {
        running: true,
        startedAt: "2026-10-29T10:02:00.000Z",
        unreadCount: 1,
        hasMessages: true,
        lastOutcome: null,
      },
    });
    expect(await screen.findByText("已归档 2 条")).toBeInTheDocument();
    await waitFor(() => expect(markStewardRead).toHaveBeenCalled());
    expect(screen.getByText("小石头处理中")).toHaveClass("sr-only");
    const input = screen.getByRole("textbox", { name: "对小石头说" });
    expect(input).not.toBeDisabled();
    fireEvent.change(input, { target: { value: "再把另一条也归档" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(sendToSteward).not.toHaveBeenCalled();
    expect(input).toHaveValue("再把另一条也归档");
    expect(screen.getByRole("button", { name: "发送" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "新对话" })).toBeNull();
    expect(screen.getByRole("button", { name: "停止" })).toBeInTheDocument();
    // 回复不再套边框，直接是正文
    expect(screen.getByText("已归档 2 条").closest("[class*='border']")).toBeNull();
    expect(newStewardConversation).not.toHaveBeenCalled();
  });

  it("点别处时，输入框空着就收起，写了内容就不收", async () => {
    const context = renderWith(<StewardPanel collapsed={false} />);
    const input = await screen.findByRole("textbox", { name: "对小石头说" });
    fireEvent.pointerDown(document.body);
    expect(context.setOpen).toHaveBeenCalledWith(false);

    vi.mocked(context.setOpen).mockClear();
    fireEvent.change(input, { target: { value: "把这条归档" } });
    fireEvent.pointerDown(document.body);
    expect(context.setOpen).not.toHaveBeenCalled();

    // 点气泡里面不收
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.pointerDown(input);
    expect(context.setOpen).not.toHaveBeenCalled();
  });

  it("重新打开时光标在草稿末尾", async () => {
    window.localStorage.setItem("easydo.botDrafts.v1", JSON.stringify({ "steward:": "把这两条归档" }));
    renderWith(<StewardPanel collapsed={false} />);
    const input = (await screen.findByRole("textbox", { name: "对小石头说" })) as HTMLTextAreaElement;
    expect(input).toHaveValue("把这两条归档");
    expect(input).toHaveFocus();
    expect(input.selectionStart).toBe("把这两条归档".length);
  });

  it("关上再打开时停在最新消息，而不是回到最上面", async () => {
    vi.mocked(listStewardMessages).mockResolvedValue(messages);
    // jsdom 不排版：把滚动高度固定成 640，并记下每次设置的 scrollTop
    const scrolledTo: number[] = [];
    const height = vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockReturnValue(640);
    const top = vi.spyOn(HTMLElement.prototype, "scrollTop", "set").mockImplementation((value) => {
      scrolledTo.push(value);
    });
    const base = { state: idle, setOpen: vi.fn(), version: 0, refresh: async () => undefined };
    const view = (open: boolean) => (
      <StewardContext.Provider value={{ ...base, open }}>
        <StewardPanel collapsed={false} />
      </StewardContext.Provider>
    );
    const { rerender } = render(view(true));
    await screen.findByText("已归档 2 条");
    rerender(view(false));
    scrolledTo.length = 0;
    rerender(view(true));
    expect(scrolledTo).toContain(640);
    height.mockRestore();
    top.mockRestore();
  });

  it("按 Esc 收起面板", async () => {
    const context = renderWith(<StewardPanel collapsed={false} />);
    fireEvent.keyDown(await screen.findByRole("textbox", { name: "对小石头说" }), { key: "Escape" });
    expect(context.setOpen).toHaveBeenCalledWith(false);
  });
});
