import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BoardPage } from "./BoardPage";
import {
  archiveTodo,
  completeTodo,
  countInboxTodos,
  createTodo,
  deleteTodo,
  getSelectedBoardViewId,
  listBoardViews,
  listGroups,
  listTodos,
  moveTodoFromInbox,
  reopenTodo,
  reorderTodosInGroup,
  saveSelectedBoardViewId,
  setBoardViewGroupMembership,
  updateTodoDetail,
} from "../lib/api";
import type { BoardView, Group, Todo } from "../types";

vi.mock("../lib/api", () => ({
  archiveTodo: vi.fn(),
  completeTodo: vi.fn(),
  countInboxTodos: vi.fn(),
  createTodo: vi.fn(),
  deleteTodo: vi.fn(),
  getSelectedBoardViewId: vi.fn(),
  listBoardViews: vi.fn(),
  listGroups: vi.fn(),
  listTodos: vi.fn(),
  moveTodoFromInbox: vi.fn(),
  reopenTodo: vi.fn(),
  reorderTodosInGroup: vi.fn(),
  saveSelectedBoardViewId: vi.fn(),
  setBoardViewGroupMembership: vi.fn(),
  updateTodoDetail: vi.fn(),
}));

const groups: Group[] = [
  makeGroup("work", "工作", 0),
  makeGroup("study", "学习", 1),
  makeGroup("fitness", "健身", 2),
];

const boardViews: BoardView[] = [
  makeBoardView("all", "所有", 0, []),
  makeBoardView("work-view", "工作", 1, [groups[0]]),
  makeBoardView("personal-view", "个人", 2, [groups[1], groups[2]]),
];

let todos: Todo[];

describe("BoardPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    todos = [makeTodo("todo-1", "已有任务", "active", [groups[0]])];

    vi.mocked(listGroups).mockResolvedValue(groups);
    vi.mocked(listBoardViews).mockResolvedValue(boardViews);
    vi.mocked(getSelectedBoardViewId).mockResolvedValue(null);
    vi.mocked(countInboxTodos).mockResolvedValue(0);
    vi.mocked(saveSelectedBoardViewId).mockImplementation(async (id) => id);
    vi.mocked(listTodos).mockImplementation(async (boardViewId) => {
      const visible = todos.filter((todo) => todo.status !== "archived");
      if (!boardViewId || boardViewId === "all") {
        return visible.filter(
          (todo) => !todo.groups.some((group) => group.systemKey === "inbox"),
        );
      }
      if (boardViewId === "inbox-view") {
        return visible.filter((todo) =>
          todo.groups.some((group) => group.systemKey === "inbox"),
        );
      }
      const view = boardViews.find((item) => item.id === boardViewId);
      const allowed = new Set(view?.groups.map((group) => group.id) ?? []);
      return visible.filter((todo) => todo.groups.some((group) => allowed.has(group.id)));
    });
    vi.mocked(createTodo).mockImplementation(async (detail, groupIds) => {
      const created = makeTodo("todo-created", detail, "active", groups.filter((group) => groupIds.includes(group.id)));
      todos = [...todos, created];
      return created;
    });
    vi.mocked(deleteTodo).mockImplementation(async (id) => {
      todos = todos.filter((todo) => todo.id !== id);
    });
    vi.mocked(completeTodo).mockImplementation(async (id) => {
      const updated = {
        ...todos.find((todo) => todo.id === id)!,
        status: "done" as const,
        completedAt: "2026-06-04T10:00:00.000Z",
      };
      todos = todos.map((todo) => (todo.id === id ? updated : todo));
      return updated;
    });
    vi.mocked(reopenTodo).mockImplementation(async (id) => {
      const updated = {
        ...todos.find((todo) => todo.id === id)!,
        status: "active" as const,
        completedAt: null,
      };
      todos = todos.map((todo) => (todo.id === id ? updated : todo));
      return updated;
    });
    vi.mocked(reorderTodosInGroup).mockResolvedValue();
    vi.mocked(moveTodoFromInbox).mockImplementation(async (id, targetGroupId) => {
      const target = groups.find((group) => group.id === targetGroupId)!;
      const updated = {
        ...todos.find((todo) => todo.id === id)!,
        groups: [target],
        expiresAt: null,
      };
      todos = todos.map((todo) => (todo.id === id ? updated : todo));
      return updated;
    });
    vi.mocked(setBoardViewGroupMembership).mockImplementation(
      async (boardViewId, groupId, included) => {
        const view = boardViews.find((item) => item.id === boardViewId)!;
        return {
          ...view,
          groups: included
            ? [...view.groups, groups.find((group) => group.id === groupId)!]
            : view.groups.filter((group) => group.id !== groupId),
        };
      },
    );
    vi.mocked(archiveTodo).mockImplementation(async (id) => {
      const updated = {
        ...todos.find((todo) => todo.id === id)!,
        status: "archived" as const,
        archivedAt: "2026-06-04T10:01:00.000Z",
      };
      todos = todos.map((todo) => (todo.id === id ? updated : todo));
      return updated;
    });
    vi.mocked(updateTodoDetail).mockImplementation(async (id, detail) => {
      const updated = {
        ...todos.find((todo) => todo.id === id)!,
        detail,
      };
      todos = todos.map((todo) => (todo.id === id ? updated : todo));
      return updated;
    });
  });

  it("creates a detail-only todo with Enter and ignores empty input", async () => {
    const user = userEvent.setup();
    render(<BoardPage onNavigate={vi.fn()} />);

    const input = await screen.findByPlaceholderText("输入一条 Todo，按 Enter 保存");
    expect(input.tagName).toBe("TEXTAREA");
    await user.keyboard("[Enter]");
    expect(createTodo).not.toHaveBeenCalled();

    await user.type(input, "整理 MVP 验证");
    await user.keyboard("[Enter]");

    expect(createTodo).toHaveBeenCalledWith("整理 MVP 验证", ["work"]);
    expect(await screen.findByText("整理 MVP 验证")).toBeInTheDocument();
    expect(within(getViewSwitcher()).getByText("所有")).toBeInTheDocument();
    expect(input).toHaveValue("");
  });

  it("supports multiline input with Shift Enter and grows with its content", async () => {
    const user = userEvent.setup();
    render(<BoardPage onNavigate={vi.fn()} />);

    const input = await screen.findByPlaceholderText(
      "输入一条 Todo，按 Enter 保存",
    ) as HTMLTextAreaElement;
    Object.defineProperty(input, "scrollHeight", {
      configurable: true,
      value: 72,
    });

    await user.type(input, "第一行");
    await user.keyboard("[ShiftLeft>][Enter][/ShiftLeft]");
    await user.type(input, "第二行");

    expect(createTodo).not.toHaveBeenCalled();
    expect(input).toHaveValue("第一行\n第二行");
    await waitFor(() => expect(input.style.height).toBe("72px"));

    await user.keyboard("[Enter]");
    expect(createTodo).toHaveBeenCalledWith("第一行\n第二行", ["work"]);
  });

  it("selects the input group from the group menu", async () => {
    const user = userEvent.setup();
    render(<BoardPage onNavigate={vi.fn()} />);

    await screen.findByPlaceholderText("输入一条 Todo，按 Enter 保存");
    await user.click(getInputGroupLabel());
    await user.click(await screen.findByRole("option", { name: "学习" }));

    expect(getInputGroupLabel()).toHaveTextContent("学习");
  });

  it("does not create a todo while the input IME composition is active", async () => {
    render(<BoardPage onNavigate={vi.fn()} />);

    const input = await screen.findByPlaceholderText("输入一条 Todo，按 Enter 保存");
    fireEvent.change(input, { target: { value: "pin" } });
    fireEvent.compositionStart(input);
    fireEvent.keyDown(input, { key: "Enter" });

    expect(createTodo).not.toHaveBeenCalled();
    expect(input).toHaveValue("pin");
  });

  it("switches input groups with Tab and wraps around", async () => {
    const user = userEvent.setup();
    render(<BoardPage onNavigate={vi.fn()} />);

    const input = await screen.findByPlaceholderText("输入一条 Todo，按 Enter 保存");
    expect(getInputGroupLabel()).toHaveTextContent("工作");

    await user.click(input);
    await user.keyboard("[Tab]");
    expect(getInputGroupLabel()).toHaveTextContent("学习");

    await user.keyboard("[Tab]");
    expect(getInputGroupLabel()).toHaveTextContent("健身");

    await user.keyboard("[Tab]");
    expect(getInputGroupLabel()).toHaveTextContent("工作");
  });

  it("switches board views with Shift Tab, preserves input group, and wraps", async () => {
    const user = userEvent.setup();
    render(<BoardPage onNavigate={vi.fn()} />);

    const input = await screen.findByPlaceholderText("输入一条 Todo，按 Enter 保存");
    await user.click(input);
    await user.keyboard("[Tab]");
    expect(getInputGroupLabel()).toHaveTextContent("学习");

    await user.keyboard("[ShiftLeft>][Tab][/ShiftLeft]");

    await waitFor(() => expect(within(getViewSwitcher()).getByText("工作")).toBeInTheDocument());
    expect(listTodos).toHaveBeenLastCalledWith("work-view");
    expect(saveSelectedBoardViewId).toHaveBeenCalledWith("work-view");
    expect(getInputGroupLabel()).toHaveTextContent("学习");

    await user.keyboard("[ShiftLeft>][Tab][/ShiftLeft]");
    await waitFor(() => expect(within(getViewSwitcher()).getByText("个人")).toBeInTheDocument());
    await user.keyboard("[ShiftLeft>][Tab][/ShiftLeft]");
    await waitFor(() => expect(within(getViewSwitcher()).getByText("所有")).toBeInTheDocument());
    expect(listTodos).toHaveBeenLastCalledWith("all");
    expect(saveSelectedBoardViewId).toHaveBeenLastCalledWith("all");
  });

  it("restores the last selected board view on entry", async () => {
    vi.mocked(getSelectedBoardViewId).mockResolvedValue("personal-view");

    render(<BoardPage onNavigate={vi.fn()} />);

    await waitFor(() => expect(within(getViewSwitcher()).getByText("个人")).toBeInTheDocument());
    expect(listTodos).toHaveBeenLastCalledWith("personal-view");
    expect(saveSelectedBoardViewId).not.toHaveBeenCalled();
  });

  it("refreshes the current board view when the window regains focus", async () => {
    render(<BoardPage onNavigate={vi.fn()} />);

    await screen.findByText("已有任务");
    vi.mocked(listTodos).mockClear();
    vi.mocked(countInboxTodos).mockClear();
    todos = [...todos, makeTodo("todo-cli", "CLI 新增任务", "active", [groups[0]])];

    fireEvent.blur(window);
    fireEvent.focus(window);

    await waitFor(() => expect(listTodos).toHaveBeenCalledWith("all"));
    expect(countInboxTodos).toHaveBeenCalled();
    expect(await screen.findByText("CLI 新增任务")).toBeInTheDocument();
  });

  it("falls back to the All view when the saved board view no longer exists", async () => {
    vi.mocked(getSelectedBoardViewId).mockResolvedValue("deleted-view");

    render(<BoardPage onNavigate={vi.fn()} />);

    await waitFor(() => expect(within(getViewSwitcher()).getByText("所有")).toBeInTheDocument());
    expect(listTodos).toHaveBeenLastCalledWith("all");
    expect(saveSelectedBoardViewId).toHaveBeenCalledWith("all");
  });

  it("creates in the selected input group even when that group is outside the current view", async () => {
    const user = userEvent.setup();
    render(<BoardPage onNavigate={vi.fn()} />);

    const input = await screen.findByPlaceholderText("输入一条 Todo，按 Enter 保存");
    await user.click(input);
    await user.keyboard("[ShiftLeft>][Tab][/ShiftLeft]");
    await waitFor(() => expect(listTodos).toHaveBeenLastCalledWith("work-view"));
    await user.keyboard("[Tab]");
    expect(getInputGroupLabel()).toHaveTextContent("学习");

    await user.type(input, "学习新任务");
    await user.keyboard("[Enter]");

    expect(createTodo).toHaveBeenCalledWith("学习新任务", ["study"]);
    await waitFor(() => expect(listTodos).toHaveBeenLastCalledWith("work-view"));
    expect(screen.queryByText("学习新任务")).not.toBeInTheDocument();
  });

  it("uses the clicked group or todo group as the next input group", async () => {
    todos = [
      makeTodo("todo-1", "工作任务", "active", [groups[0]]),
      makeTodo("todo-2", "学习任务", "active", [groups[1]]),
    ];
    render(<BoardPage onNavigate={vi.fn()} />);

    await screen.findByText("学习任务");
    fireEvent.click(document.querySelector('[data-group-section="study"]')!);
    expect(getInputGroupLabel()).toHaveTextContent("学习");

    fireEvent.click(screen.getByText("工作任务"));
    expect(getInputGroupLabel()).toHaveTextContent("工作");
  });

  it("updates regular view group membership from the sidebar", async () => {
    const user = userEvent.setup();
    render(<BoardPage onNavigate={vi.fn()} />);

    const input = await screen.findByPlaceholderText("输入一条 Todo，按 Enter 保存");
    await user.click(input);
    await user.keyboard("[ShiftLeft>][Tab][/ShiftLeft]");
    await waitFor(() => expect(listTodos).toHaveBeenLastCalledWith("work-view"));

    await user.click(screen.getByTitle("添加 学习 到当前 View"));

    await waitFor(() =>
      expect(setBoardViewGroupMembership).toHaveBeenCalledWith("work-view", "study", true),
    );
  });

  it("selects with arrows, completes with Command Enter, and hides archived todos", async () => {
    const user = userEvent.setup();
    todos = [
      makeTodo("todo-1", "第一条", "active", [groups[0]]),
      makeTodo("todo-2", "第二条", "active", [groups[0]]),
    ];
    render(<BoardPage onNavigate={vi.fn()} />);

    await screen.findByText("第一条");
    fireEvent.keyDown(window, { key: "ArrowDown", metaKey: true });
    fireEvent.keyDown(window, { key: "ArrowDown", metaKey: true });
    fireEvent.keyDown(window, { key: "Enter", metaKey: true });

    await waitFor(() => expect(completeTodo).toHaveBeenCalledWith("todo-2"));
    await waitFor(() => expect(screen.getByText("第二条")).toHaveClass("line-through"));

    await user.click(screen.getAllByTitle("归档")[1]);
    expect(archiveTodo).toHaveBeenCalledWith("todo-2");
    await waitFor(() => expect(screen.queryByText("第二条")).not.toBeInTheDocument());
  });

  it("toggles a done todo from the status circle and Command Enter", async () => {
    todos = [makeTodo("todo-1", "已完成事项", "done", [groups[0]])];
    render(<BoardPage onNavigate={vi.fn()} />);

    await screen.findByText("已完成事项");
    fireEvent.click(screen.getByTitle("取消完成"));

    await waitFor(() => expect(reopenTodo).toHaveBeenCalledWith("todo-1"));
    await waitFor(() => expect(screen.getByText("已完成事项")).not.toHaveClass("line-through"));

    vi.mocked(reopenTodo).mockClear();
    vi.mocked(completeTodo).mockClear();
    fireEvent.click(screen.getByText("已完成事项"));
    fireEvent.keyDown(window, { key: "Enter", metaKey: true });
    await waitFor(() => expect(completeTodo).toHaveBeenCalledWith("todo-1"));

    vi.mocked(completeTodo).mockClear();
    fireEvent.keyDown(window, { key: "Enter", metaKey: true });
    await waitFor(() => expect(reopenTodo).toHaveBeenCalledWith("todo-1"));
  });

  it("edits the selected todo inline with Space and Enter", async () => {
    render(<BoardPage onNavigate={vi.fn()} />);

    await screen.findByText("已有任务");
    fireEvent.keyDown(window, { key: "ArrowDown", metaKey: true });
    fireEvent.keyDown(window, { key: " " });

    const editInput = screen.getByDisplayValue("已有任务") as HTMLTextAreaElement;
    await waitFor(() => expect(editInput).toHaveFocus());
    expect(editInput.selectionStart).toBe("已有任务".length);
    expect(editInput.selectionEnd).toBe("已有任务".length);

    fireEvent.change(editInput, { target: { value: "更新后的任务" } });
    fireEvent.keyDown(editInput, { key: "Enter" });

    await waitFor(() => expect(updateTodoDetail).toHaveBeenCalledWith("todo-1", "更新后的任务"));
    expect(await screen.findByText("更新后的任务")).toBeInTheDocument();
  });

  it("turns the current editing line into a completed checklist item with Command Shift S", async () => {
    render(<BoardPage onNavigate={vi.fn()} />);

    await screen.findByText("已有任务");
    fireEvent.doubleClick(getTodoCardByText("已有任务"));
    const editInput = screen.getByDisplayValue("已有任务") as HTMLTextAreaElement;
    await waitFor(() => expect(editInput).toHaveFocus());

    editInput.setSelectionRange(0, 0);
    fireEvent.keyDown(editInput, { key: "s", metaKey: true, shiftKey: true });

    expect(updateTodoDetail).not.toHaveBeenCalled();
    expect(await screen.findByDisplayValue("- [x] 已有任务")).toBeInTheDocument();

    fireEvent.keyDown(screen.getByDisplayValue("- [x] 已有任务"), { key: "Enter" });

    await waitFor(() => expect(updateTodoDetail).toHaveBeenCalledWith("todo-1", "- [x] 已有任务"));
    expect(await screen.findByTitle("标记子任务未完成")).toBeInTheDocument();
  });

  it("does not save inline editing while an IME composition is active", async () => {
    render(<BoardPage onNavigate={vi.fn()} />);

    await screen.findByText("已有任务");
    fireEvent.doubleClick(getTodoCardByText("已有任务"));
    const editInput = screen.getByDisplayValue("已有任务") as HTMLTextAreaElement;
    await waitFor(() => expect(editInput).toHaveFocus());

    fireEvent.compositionStart(editInput);
    fireEvent.keyDown(editInput, { key: "Enter" });

    expect(updateTodoDetail).not.toHaveBeenCalled();
    expect(screen.getByDisplayValue("已有任务")).toBeInTheDocument();
  });

  it("toggles a rendered checklist line without completing the parent todo", async () => {
    todos = [makeTodo("todo-1", "发布前检查\n- [ ] 安装新 app\n- [x] 打包", "active", [groups[0]])];
    render(<BoardPage onNavigate={vi.fn()} />);

    await screen.findByText("安装新 app");
    fireEvent.click(screen.getByTitle("标记子任务完成"));

    await waitFor(() =>
      expect(updateTodoDetail).toHaveBeenCalledWith(
        "todo-1",
        "发布前检查\n- [x] 安装新 app\n- [x] 打包",
      ),
    );
    expect(completeTodo).not.toHaveBeenCalled();
    expect(await screen.findAllByTitle("标记子任务未完成")).toHaveLength(2);
  });

  it("starts inline editing with plain Enter and double click", async () => {
    render(<BoardPage onNavigate={vi.fn()} />);

    await screen.findByText("已有任务");
    fireEvent.keyDown(window, { key: "ArrowDown", metaKey: true });
    fireEvent.keyDown(window, { key: "Enter" });

    let editInput = screen.getByDisplayValue("已有任务") as HTMLTextAreaElement;
    await waitFor(() => expect(editInput).toHaveFocus());
    fireEvent.keyDown(editInput, { key: "Escape" });

    fireEvent.doubleClick(getTodoCardByText("已有任务"));
    editInput = screen.getByDisplayValue("已有任务") as HTMLTextAreaElement;
    await waitFor(() => expect(editInput).toHaveFocus());
    expect(editInput.selectionStart).toBe("已有任务".length);
  });

  it("keeps non-editing todo text selectable without entering edit mode on text double click", async () => {
    render(<BoardPage onNavigate={vi.fn()} />);

    const detail = await screen.findByText("已有任务");

    expect(detail).toHaveClass("select-text");
    expect(detail).toHaveClass("cursor-text");

    fireEvent.doubleClick(detail);

    expect(screen.queryByDisplayValue("已有任务")).not.toBeInTheDocument();
  });

  it("exits inline editing on blur and saves multiline detail with Shift Enter", async () => {
    render(<BoardPage onNavigate={vi.fn()} />);

    await screen.findByText("已有任务");
    fireEvent.doubleClick(getTodoCardByText("已有任务"));
    const editInput = screen.getByDisplayValue("已有任务") as HTMLTextAreaElement;
    await waitFor(() => expect(editInput).toHaveFocus());

    fireEvent.keyDown(editInput, { key: "Enter", shiftKey: true });
    expect(updateTodoDetail).not.toHaveBeenCalled();

    fireEvent.change(editInput, { target: { value: "已有任务\n第二行" } });
    fireEvent.blur(editInput);

    await waitFor(() => expect(updateTodoDetail).toHaveBeenCalledWith("todo-1", "已有任务\n第二行"));
    await waitFor(() => expect(screen.queryByDisplayValue("已有任务\n第二行")).not.toBeInTheDocument());
    expect(await screen.findByText(/已有任务\s+第二行/)).toBeInTheDocument();
  });

  it("deletes a todo when inline editing is cleared and blurred", async () => {
    render(<BoardPage onNavigate={vi.fn()} />);

    await screen.findByText("已有任务");
    fireEvent.doubleClick(getTodoCardByText("已有任务"));
    const editInput = screen.getByDisplayValue("已有任务") as HTMLTextAreaElement;
    await waitFor(() => expect(editInput).toHaveFocus());

    fireEvent.change(editInput, { target: { value: "   " } });
    fireEvent.blur(editInput);

    await waitFor(() => expect(screen.queryByDisplayValue("   ")).not.toBeInTheDocument());
    expect(deleteTodo).toHaveBeenCalledWith("todo-1");
    expect(updateTodoDetail).not.toHaveBeenCalled();
    expect(screen.queryByText("已有任务")).not.toBeInTheDocument();
  });

  it("deletes a todo when empty inline editing is submitted with Enter", async () => {
    render(<BoardPage onNavigate={vi.fn()} />);

    await screen.findByText("已有任务");
    fireEvent.doubleClick(getTodoCardByText("已有任务"));
    const editInput = screen.getByDisplayValue("已有任务") as HTMLTextAreaElement;
    await waitFor(() => expect(editInput).toHaveFocus());

    fireEvent.change(editInput, { target: { value: "" } });
    fireEvent.keyDown(editInput, { key: "Enter" });

    await waitFor(() => expect(deleteTodo).toHaveBeenCalledWith("todo-1"));
    expect(updateTodoDetail).not.toHaveBeenCalled();
    expect(screen.queryByText("已有任务")).not.toBeInTheDocument();
  });

  it("keeps todo shortcuts paused while settings is open", async () => {
    todos = [
      makeTodo("todo-1", "第一条", "active", [groups[0]]),
      makeTodo("todo-2", "第二条", "active", [groups[0]]),
    ];
    render(<BoardPage onNavigate={vi.fn()} settingsOpen />);

    await screen.findByText("第一条");
    fireEvent.keyDown(window, { key: "ArrowDown", metaKey: true });
    fireEvent.keyDown(window, { key: "Enter", metaKey: true });

    expect(completeTodo).not.toHaveBeenCalled();
  });

  it("opens the hidden inbox view, shows the banner, and excludes inbox from input groups", async () => {
    const user = userEvent.setup();
    const inboxGroup = { ...makeGroup("inbox", "收件箱", 9), systemKey: "inbox" };
    const inboxView = {
      ...makeBoardView("inbox-view", "收件箱", 9, [inboxGroup]),
      systemKey: "inbox",
    };
    todos = [
      {
        ...makeTodo("inbox-todo", "待归类工作", "active", [inboxGroup]),
        expiresAt: "2026-06-13T03:00:00.000+08:00",
      },
    ];
    vi.mocked(listGroups).mockResolvedValue([...groups, inboxGroup]);
    vi.mocked(listBoardViews).mockResolvedValue([...boardViews, inboxView]);
    vi.mocked(countInboxTodos).mockResolvedValue(1);

    render(<BoardPage onNavigate={vi.fn()} />);

    await user.click(await screen.findByRole("button", { name: /收件箱/ }));
    expect(await screen.findByText("待归类工作")).toBeInTheDocument();
    expect(document.querySelector("[data-inbox-banner]")).toHaveTextContent(
      "次日 03:00 后自动删除",
    );
    expect(document.querySelector("[data-input-group-label]")).toHaveTextContent("工作");

    await user.click(getInputGroupLabel());
    expect(screen.queryByRole("option", { name: "收件箱" })).not.toBeInTheDocument();
    expect(within(getViewSwitcher()).queryByRole("tab", { name: "收件箱" })).not.toBeInTheDocument();
  });

  it("keeps the empty inbox page and regular view choices visible", async () => {
    const user = userEvent.setup();
    const inboxGroup = { ...makeGroup("inbox", "收件箱", 9), systemKey: "inbox" };
    const inboxView = {
      ...makeBoardView("inbox-view", "收件箱", 9, [inboxGroup]),
      systemKey: "inbox",
    };
    todos = [makeTodo("inbox-todo", "最后一条", "active", [inboxGroup])];
    vi.mocked(listGroups).mockResolvedValue([...groups, inboxGroup]);
    vi.mocked(listBoardViews).mockResolvedValue([...boardViews, inboxView]);
    vi.mocked(countInboxTodos).mockResolvedValue(1);

    render(<BoardPage onNavigate={vi.fn()} />);
    await user.click(await screen.findByRole("button", { name: /收件箱/ }));
    await user.click(await screen.findByTitle("归档"));

    await waitFor(() => expect(screen.queryByText("最后一条")).not.toBeInTheDocument());
    expect(document.querySelector("[data-inbox-banner]")).toBeInTheDocument();
    expect(getViewSwitcher()).toHaveAttribute("data-force-expanded", "true");
    expect(within(getViewSwitcher()).getByRole("tab", { name: "所有" })).toBeInTheDocument();
  });
});

function getViewSwitcher() {
  return document.querySelector("[data-board-view-switcher]") as HTMLElement;
}

function getInputGroupLabel() {
  return document.querySelector("[data-input-group-label]") as HTMLElement;
}

function getTodoCardByText(text: string) {
  const card = screen.getByText(text).closest("[data-todo-card]");
  if (!card) {
    throw new Error(`Todo card not found for text: ${text}`);
  }
  return card as HTMLElement;
}

function makeGroup(id: string, name: string, sortOrder: number): Group {
  return {
    id,
    name,
    sortOrder,
    systemKey: null,
    createdAt: "2026-06-04T00:00:00.000Z",
    updatedAt: "2026-06-04T00:00:00.000Z",
  };
}

function makeBoardView(id: string, name: string, sortOrder: number, viewGroups: Group[]): BoardView {
  return {
    id,
    name,
    sortOrder,
    systemKey: name === "所有" ? "all" : null,
    groups: viewGroups,
    createdAt: "2026-06-04T00:00:00.000Z",
    updatedAt: "2026-06-04T00:00:00.000Z",
  };
}

function makeTodo(
  id: string,
  detail: string,
  status: Todo["status"],
  todoGroups: Group[],
  sortOrder = 0,
): Todo {
  return {
    id,
    detail,
    status,
    extraText: null,
    groups: todoGroups,
    tags: [],
    createdAt: "2026-06-04T00:00:00.000Z",
    updatedAt: "2026-06-04T00:00:00.000Z",
    completedAt: status === "done" ? "2026-06-04T10:00:00.000Z" : null,
    archivedAt: status === "archived" ? "2026-06-04T10:01:00.000Z" : null,
    expiresAt: null,
    deletedAt: null,
    deleteReason: null,
    groupSortOrders: todoGroups.map((group, index) => ({
      groupId: group.id,
      sortOrder: sortOrder + index,
    })),
  };
}
