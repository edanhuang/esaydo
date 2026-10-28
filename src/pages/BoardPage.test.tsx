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
  getBoardLayoutMode,
  getSelectedBoardViewId,
  listCanvasPositions,
  listBoardViews,
  listGroups,
  listTodos,
  moveTodoFromInbox,
  reopenTodo,
  reorderTodosInGroup,
  saveBoardLayoutMode,
  saveCanvasPositions,
  saveSelectedBoardViewId,
  setBoardViewGroupMembership,
  setTodoPriority,
  setTodoSuspended,
  updateTodoDetail,
} from "../lib/api";
import type { BoardView, Group, Todo } from "../types";

vi.mock("../lib/api", () => ({
  getBoardLayoutMode: vi.fn(async () => "list"),
  listCanvasPositions: vi.fn(async () => []),
  saveBoardLayoutMode: vi.fn(async (_id: string, mode: string) => mode),
  saveCanvasPositions: vi.fn(async () => undefined),
  appendCanvasLog: vi.fn(async () => undefined),
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
  setTodoPriority: vi.fn(),
  setTodoSuspended: vi.fn(),
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
    vi.mocked(setTodoPriority).mockImplementation(async (id, priority) => {
      const updated = {
        ...todos.find((todo) => todo.id === id)!,
        priority,
      };
      todos = todos.map((todo) => (todo.id === id ? updated : todo));
      return updated;
    });
    vi.mocked(setTodoSuspended).mockImplementation(async (id, suspended) => {
      const updated = {
        ...todos.find((todo) => todo.id === id)!,
        suspendedAt: suspended ? "2026-06-04T11:00:00.000Z" : null,
      };
      todos = todos.map((todo) => (todo.id === id ? updated : todo));
      return updated;
    });
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

    const input = await screen.findByPlaceholderText("要做点什么");
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
      "要做点什么",
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

    await screen.findByPlaceholderText("要做点什么");
    await user.click(getInputGroupLabel());
    await user.click(await screen.findByRole("option", { name: "学习" }));

    expect(getInputGroupLabel()).toHaveTextContent("学习");
  });

  it("does not create a todo while the input IME composition is active", async () => {
    render(<BoardPage onNavigate={vi.fn()} />);

    const input = await screen.findByPlaceholderText("要做点什么");
    fireEvent.change(input, { target: { value: "pin" } });
    fireEvent.compositionStart(input);
    fireEvent.keyDown(input, { key: "Enter" });

    expect(createTodo).not.toHaveBeenCalled();
    expect(input).toHaveValue("pin");
  });

  it("switches input groups with Tab and wraps around", async () => {
    const user = userEvent.setup();
    render(<BoardPage onNavigate={vi.fn()} />);

    const input = await screen.findByPlaceholderText("要做点什么");
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

    const input = await screen.findByPlaceholderText("要做点什么");
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

    const input = await screen.findByPlaceholderText("要做点什么");
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

    const input = await screen.findByPlaceholderText("要做点什么");
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

  it("toggles high priority from the todo context menu", async () => {
    const user = userEvent.setup();
    render(<BoardPage onNavigate={vi.fn()} />);

    await screen.findByText("已有任务");
    const card = getTodoCardByText("已有任务");
    fireEvent.contextMenu(card);
    await user.click(await screen.findByRole("menuitem", { name: "标记高优" }));

    await waitFor(() => expect(setTodoPriority).toHaveBeenCalledWith("todo-1", "high"));
    expect(getTodoCardByText("已有任务")).toHaveAttribute("data-priority", "high");
    expect(screen.getByTitle("高优")).toBeInTheDocument();

    fireEvent.contextMenu(getTodoCardByText("已有任务"));
    await user.click(await screen.findByRole("menuitem", { name: "取消高优" }));

    await waitFor(() => expect(setTodoPriority).toHaveBeenLastCalledWith("todo-1", "normal"));
    expect(getTodoCardByText("已有任务")).toHaveAttribute("data-priority", "normal");
    expect(screen.queryByTitle("高优")).not.toBeInTheDocument();
  });

  it("suspends a todo into the collapsed area and resumes it to its original position", async () => {
    const user = userEvent.setup();
    todos = [
      makeTodo("todo-1", "第一条", "active", [groups[0]], 0),
      makeTodo("todo-2", "第二条", "active", [groups[0]], 1),
      makeTodo("todo-3", "第三条", "active", [groups[0]], 2),
    ];
    render(<BoardPage onNavigate={vi.fn()} />);

    await screen.findByText("第二条");
    fireEvent.contextMenu(getTodoCardByText("第二条"));
    await user.click(await screen.findByRole("menuitem", { name: "挂起" }));

    await waitFor(() => expect(setTodoSuspended).toHaveBeenCalledWith("todo-2", true));
    await waitFor(() => expect(screen.queryByText("第二条")).not.toBeInTheDocument());
    const toggle = screen.getByRole("button", { name: /已挂起 1/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");

    await user.click(toggle);
    expect(screen.getByRole("button", { name: /已挂起 1/ })).toHaveAttribute("aria-expanded", "true");
    expect(getTodoCardByText("第二条")).toHaveAttribute("data-suspended", "true");
    expect(
      Array.from(document.querySelectorAll("[data-todo-card]")).map((card) => card.textContent),
    ).toEqual(["完成第二条归档", "拖拽排序完成第一条归档", "拖拽排序完成第三条归档"]);

    fireEvent.contextMenu(getTodoCardByText("第二条"));
    await user.click(await screen.findByRole("menuitem", { name: "取消挂起" }));

    await waitFor(() => expect(setTodoSuspended).toHaveBeenLastCalledWith("todo-2", false));
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /已挂起/ })).not.toBeInTheDocument(),
    );
    const cardTexts = Array.from(document.querySelectorAll("[data-todo-card]")).map(
      (card) => card.textContent,
    );
    expect(cardTexts).toEqual(["第一条", "第二条", "第三条"].map((text) => `拖拽排序完成${text}归档`));
    expect(reorderTodosInGroup).not.toHaveBeenCalled();
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

  it("switches to the canvas, lays todos out from the top-left and saves dragged positions", async () => {
    const user = userEvent.setup();
    todos = [
      makeTodo("todo-1", "第一条", "active", [groups[0]], 0),
      makeTodo("todo-2", "第二条", "active", [groups[0]], 1),
      { ...makeTodo("todo-3", "挂起的", "active", [groups[0]], 2), suspendedAt: "2026-06-05T00:00:00.000Z" },
    ];
    render(<BoardPage onNavigate={vi.fn()} />);

    await screen.findByText("第一条");
    await user.click(screen.getByRole("button", { name: "画布" }));

    expect(saveBoardLayoutMode).toHaveBeenCalledWith("all", "canvas");
    await waitFor(() => expect(saveCanvasPositions).toHaveBeenCalled());
    const [viewId, placements] = vi.mocked(saveCanvasPositions).mock.calls[0];
    expect(viewId).toBe("all");
    expect(placements.map((position) => position.todoId)).toEqual(["todo-1", "todo-2"]);
    expect(placements[0]).toMatchObject({ x: 24, y: 24 });
    expect(document.querySelector("[data-board-canvas]")).toBeInTheDocument();
    expect(screen.queryByText("挂起的")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /已挂起 1/ })).toBeInTheDocument();

    const item = await waitFor(() => {
      const element = document.querySelector('[data-canvas-item="todo-1"]');
      expect(element).toBeInTheDocument();
      return element as HTMLElement;
    });
    fireEvent.pointerDown(item, { button: 0, pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(item, { pointerId: 1, buttons: 1, clientX: 250, clientY: 180 });
    fireEvent.pointerUp(item, { pointerId: 1, clientX: 250, clientY: 180 });

    await waitFor(() =>
      expect(saveCanvasPositions).toHaveBeenLastCalledWith("all", [
        { todoId: "todo-1", x: 176, y: 104, width: null, height: null },
      ]),
    );

    const rightEdge = item.querySelector('[data-resize-handle="e"]') as HTMLElement;
    fireEvent.pointerDown(rightEdge, { button: 0, pointerId: 2, clientX: 400, clientY: 120 });
    fireEvent.pointerMove(rightEdge, { pointerId: 2, clientX: 500, clientY: 120 });
    fireEvent.pointerUp(rightEdge, { pointerId: 2, clientX: 500, clientY: 120 });

    await waitFor(() =>
      expect(saveCanvasPositions).toHaveBeenLastCalledWith("all", [
        { todoId: "todo-1", x: 176, y: 104, width: 340, height: null },
      ]),
    );

    const topLeft = item.querySelector('[data-resize-handle="nw"]') as HTMLElement;
    fireEvent.pointerDown(topLeft, { button: 0, pointerId: 3, clientX: 176, clientY: 104 });
    fireEvent.pointerMove(topLeft, { pointerId: 3, clientX: 136, clientY: 64 });
    fireEvent.pointerUp(topLeft, { pointerId: 3, clientX: 136, clientY: 64 });

    await waitFor(() =>
      expect(saveCanvasPositions).toHaveBeenLastCalledWith("all", [
        { todoId: "todo-1", x: 136, y: 64, width: 380, height: 40 },
      ]),
    );
  });

  it("双击画布空白处新建卡片，回车保存到当前位置，空内容不保存", async () => {
    const user = userEvent.setup();
    todos = [makeTodo("todo-1", "第一条", "active", [groups[0]], 0)];
    render(<BoardPage onNavigate={vi.fn()} />);

    await screen.findByText("第一条");
    await user.click(screen.getByRole("button", { name: "画布" }));
    await waitFor(() => expect(document.querySelector('[data-canvas-item="todo-1"]')).toBeInTheDocument());
    const viewport = document.querySelector("[data-board-canvas] > div") as HTMLElement;

    // 空内容失焦：不新建
    fireEvent.doubleClick(viewport, { clientX: 400, clientY: 300 });
    const emptyDraft = await screen.findByRole("textbox", { name: "新建 Todo" });
    fireEvent.blur(emptyDraft);
    await waitFor(() => expect(screen.queryByRole("textbox", { name: "新建 Todo" })).not.toBeInTheDocument());
    expect(createTodo).not.toHaveBeenCalled();

    // 双击卡片本身不会新建草稿
    fireEvent.doubleClick(document.querySelector('[data-canvas-item="todo-1"]') as HTMLElement);
    expect(screen.queryByRole("textbox", { name: "新建 Todo" })).not.toBeInTheDocument();

    fireEvent.doubleClick(viewport, { clientX: 400, clientY: 300 });
    const draft = await screen.findByRole("textbox", { name: "新建 Todo" });
    await user.type(draft, "画布上新建的");
    fireEvent.keyDown(draft, { key: "Enter" });

    await waitFor(() => expect(createTodo).toHaveBeenCalledWith("画布上新建的", ["work"]));
    expect(createTodo).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(saveCanvasPositions).toHaveBeenCalledWith("all", [
        { todoId: "todo-created", x: 388, y: 288, width: null, height: null },
      ]),
    );
    expect(await screen.findByText("画布上新建的")).toBeInTheDocument();
  });

  it("keeps canvas cards button-free and moves complete and archive into the context menu", async () => {
    const user = userEvent.setup();
    vi.mocked(getBoardLayoutMode).mockResolvedValueOnce("canvas");
    render(<BoardPage onNavigate={vi.fn()} />);

    await waitFor(() => expect(document.querySelector('[data-canvas-item="todo-1"]')).toBeInTheDocument());
    const item = document.querySelector('[data-canvas-item="todo-1"]') as HTMLElement;
    expect(item.querySelectorAll("button")).toHaveLength(0);
    expect(item.querySelector("[data-canvas-groups]")).toHaveTextContent("工作");
    expect(within(item).queryByText(/子项/)).not.toBeInTheDocument();

    fireEvent.contextMenu(getTodoCardByText("已有任务"));
    await user.click(await screen.findByRole("menuitem", { name: "完成" }));
    await waitFor(() => expect(completeTodo).toHaveBeenCalledWith("todo-1"));

    fireEvent.contextMenu(getTodoCardByText("已有任务"));
    await user.click(await screen.findByRole("menuitem", { name: "归档" }));
    await waitFor(() => expect(archiveTodo).toHaveBeenCalledWith("todo-1"));
  });

  it("reveals canvas subtasks on hover and keeps them open while selected by keyboard", async () => {
    vi.mocked(getBoardLayoutMode).mockResolvedValueOnce("canvas");
    todos = [makeTodo("todo-1", "主句\n- [ ] 子项一\n- [x] 子项二", "active", [groups[0]])];
    render(<BoardPage onNavigate={vi.fn()} />);

    await waitFor(() => expect(document.querySelector('[data-canvas-item="todo-1"]')).toBeInTheDocument());
    const rows = () => document.querySelectorAll('[data-canvas-item="todo-1"] [data-checklist-row]');
    expect(rows()).toHaveLength(2);
    for (const row of rows()) {
      expect(row).toHaveClass("hidden", "group-hover:flex");
    }

    fireEvent.click(getTodoCardByText("主句"));
    expect(rows()[0]).toHaveClass("hidden");

    fireEvent.keyDown(window, { key: "ArrowDown", metaKey: true });

    await waitFor(() => expect(rows()[0]).toHaveClass("flex"));
    for (const row of rows()) {
      expect(row).not.toHaveClass("hidden");
    }
  });

  it("skips blank lines on canvas cards but still toggles the right subtask line", async () => {
    vi.mocked(getBoardLayoutMode).mockResolvedValueOnce("canvas");
    vi.mocked(updateTodoDetail).mockImplementation(async (id, detail) => ({
      ...todos.find((todo) => todo.id === id)!,
      detail,
    }));
    todos = [makeTodo("todo-1", "主句\n\n- [ ] 子项一", "active", [groups[0]])];
    render(<BoardPage onNavigate={vi.fn()} />);

    await waitFor(() => expect(document.querySelector('[data-canvas-item="todo-1"]')).toBeInTheDocument());
    const item = document.querySelector('[data-canvas-item="todo-1"]') as HTMLElement;
    const emptyLines = Array.from(item.querySelectorAll("span.block")).filter((span) => !span.textContent?.trim());
    expect(emptyLines).toHaveLength(0);

    fireEvent.click(getTodoCardByText("主句"));
    fireEvent.click(await screen.findByTitle("标记子任务完成"));

    await waitFor(() => expect(updateTodoDetail).toHaveBeenCalledWith("todo-1", "主句\n\n- [x] 子项一"));
  });

  it("shows the subtasks that fit in a stretched canvas card without hovering", async () => {
    vi.mocked(getBoardLayoutMode).mockResolvedValueOnce("canvas");
    vi.mocked(listCanvasPositions).mockResolvedValueOnce([
      { todoId: "todo-1", x: 24, y: 24, width: null, height: 56 },
    ]);
    todos = [makeTodo("todo-1", "主句\n- [ ] 子项一\n- [x] 子项二", "active", [groups[0]])];
    render(<BoardPage onNavigate={vi.fn()} />);

    await waitFor(() =>
      expect(document.querySelectorAll('[data-canvas-item="todo-1"] [data-checklist-row]')).toHaveLength(2),
    );
    const [first, second] = document.querySelectorAll('[data-canvas-item="todo-1"] [data-checklist-row]');
    expect(first).toHaveClass("flex");
    expect(first).not.toHaveClass("hidden");
    expect(second).toHaveClass("hidden", "group-hover:flex");
  });

  it("lets a single-group view fill the width in list mode", async () => {
    render(<BoardPage onNavigate={vi.fn()} />);
    await screen.findByText("已有任务");
    await userEvent.setup().hover(getViewSwitcher());
    fireEvent.click(await screen.findByRole("tab", { name: "工作" }));

    await waitFor(() => expect(document.querySelectorAll("[data-group-section]")).toHaveLength(1));
    expect(document.querySelector("[data-group-section]")).toHaveClass("w-full");
    expect(document.querySelector("[data-group-section]")).not.toHaveClass("min-w-[360px]");
  });

  it("opens suspended todos in the list view instead of the canvas", async () => {
    const user = userEvent.setup();
    vi.mocked(getBoardLayoutMode).mockResolvedValueOnce("canvas");
    todos = [
      makeTodo("todo-1", "进行中", "active", [groups[0]]),
      { ...makeTodo("todo-2", "挂起的", "active", [groups[0]], 1), suspendedAt: "2026-06-05T00:00:00.000Z" },
    ];
    render(<BoardPage onNavigate={vi.fn()} />);

    await user.click(await screen.findByRole("button", { name: /已挂起 1/ }));

    expect(saveBoardLayoutMode).toHaveBeenLastCalledWith("all", "list");
    await waitFor(() => expect(document.querySelector("[data-board-canvas]")).not.toBeInTheDocument());
    expect(await screen.findByText("挂起的")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /已挂起 1/ })).toHaveAttribute("aria-expanded", "true");
  });

  it("toggles canvas and list with Option Tab from the input and from the page", async () => {
    render(<BoardPage onNavigate={vi.fn()} />);
    const input = await screen.findByPlaceholderText("要做点什么");
    await screen.findByText("已有任务");

    fireEvent.keyDown(input, { key: "Tab", altKey: true });
    await waitFor(() => expect(document.querySelector("[data-board-canvas]")).toBeInTheDocument());
    expect(saveBoardLayoutMode).toHaveBeenLastCalledWith("all", "canvas");
    expect(getInputGroupLabel()).toHaveTextContent("工作");

    fireEvent.keyDown(window, { key: "Tab", altKey: true });
    await waitFor(() => expect(document.querySelector("[data-board-canvas]")).not.toBeInTheDocument());
    expect(saveBoardLayoutMode).toHaveBeenLastCalledWith("all", "list");
  });

  it("restores the canvas layout saved for the view", async () => {
    vi.mocked(getBoardLayoutMode).mockResolvedValueOnce("canvas");
    render(<BoardPage onNavigate={vi.fn()} />);

    await screen.findByText("已有任务");
    await waitFor(() => expect(document.querySelector("[data-board-canvas]")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "画布" })).toHaveAttribute("aria-pressed", "true");
  });

  it("returns from the inbox to the board when clicking 看板 in the sidebar", async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    const inboxGroup = { ...makeGroup("inbox", "收件箱", 9), systemKey: "inbox" };
    const inboxView = {
      ...makeBoardView("inbox-view", "收件箱", 9, [inboxGroup]),
      systemKey: "inbox",
    };
    todos = [
      makeTodo("todo-1", "已有任务", "active", [groups[0]]),
      makeTodo("inbox-todo", "待归类工作", "active", [inboxGroup]),
    ];
    vi.mocked(listGroups).mockResolvedValue([...groups, inboxGroup]);
    vi.mocked(listBoardViews).mockResolvedValue([...boardViews, inboxView]);
    vi.mocked(countInboxTodos).mockResolvedValue(1);
    vi.mocked(getSelectedBoardViewId).mockResolvedValue("inbox-view");

    render(<BoardPage onNavigate={onNavigate} />);

    expect(await screen.findByText("待归类工作")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "看板" }));

    expect(await screen.findByText("已有任务")).toBeInTheDocument();
    expect(screen.queryByText("待归类工作")).not.toBeInTheDocument();
    expect(saveSelectedBoardViewId).toHaveBeenLastCalledWith("all");
    expect(onNavigate).not.toHaveBeenCalled();
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
    priority: "normal",
    suspendedAt: null,
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
