import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BoardPage } from "./BoardPage";
import {
  archiveTodo,
  completeTodo,
  createTodo,
  listBoardViews,
  listGroups,
  listTodos,
  reopenTodo,
  reorderTodosInGroup,
  updateTodoDetail,
} from "../lib/api";
import type { BoardView, Group, Todo } from "../types";

vi.mock("../lib/api", () => ({
  archiveTodo: vi.fn(),
  completeTodo: vi.fn(),
  createTodo: vi.fn(),
  listBoardViews: vi.fn(),
  listGroups: vi.fn(),
  listTodos: vi.fn(),
  reopenTodo: vi.fn(),
  reorderTodosInGroup: vi.fn(),
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
];

let todos: Todo[];

describe("BoardPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    todos = [makeTodo("todo-1", "已有任务", "active", [groups[0]])];

    vi.mocked(listGroups).mockResolvedValue(groups);
    vi.mocked(listBoardViews).mockResolvedValue(boardViews);
    vi.mocked(listTodos).mockImplementation(async () => todos.filter((todo) => todo.status !== "archived"));
    vi.mocked(createTodo).mockImplementation(async (detail, groupIds) => {
      const created = makeTodo("todo-created", detail, "active", groups.filter((group) => groupIds.includes(group.id)));
      todos = [...todos, created];
      return created;
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
    await user.keyboard("[Enter]");
    expect(createTodo).not.toHaveBeenCalled();

    await user.type(input, "整理 MVP 验证");
    await user.keyboard("[Enter]");

    expect(createTodo).toHaveBeenCalledWith("整理 MVP 验证", ["work"]);
    expect(await screen.findByText("整理 MVP 验证")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "所有2" })).toBeInTheDocument();
    expect(input).toHaveValue("");
  });

  it("switches input groups with Tab and wraps around", async () => {
    const user = userEvent.setup();
    render(<BoardPage onNavigate={vi.fn()} />);

    const input = await screen.findByPlaceholderText("输入一条 Todo，按 Enter 保存");
    expect(screen.getByText("所有 / 输入到 工作")).toBeInTheDocument();

    await user.click(input);
    await user.keyboard("[Tab]");
    expect(screen.getByText("所有 / 输入到 学习")).toBeInTheDocument();

    await user.keyboard("[Tab]");
    expect(screen.getByText("所有 / 输入到 健身")).toBeInTheDocument();

    await user.keyboard("[Tab]");
    expect(screen.getByText("所有 / 输入到 工作")).toBeInTheDocument();
  });

  it("switches board views with Shift Tab and keeps all view unfiltered", async () => {
    const user = userEvent.setup();
    render(<BoardPage onNavigate={vi.fn()} />);

    const input = await screen.findByPlaceholderText("输入一条 Todo，按 Enter 保存");
    await user.click(input);
    await user.keyboard("[ShiftLeft>][Tab][/ShiftLeft]");

    expect(await screen.findByText("工作 / 输入到 工作")).toBeInTheDocument();
    expect(listTodos).toHaveBeenLastCalledWith("work-view");
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

  it("reorders todos in the same group with drag and drop", async () => {
    todos = [
      makeTodo("todo-1", "第一条", "active", [groups[0]], 0),
      makeTodo("todo-2", "第二条", "active", [groups[0]], 1),
    ];
    render(<BoardPage onNavigate={vi.fn()} />);

    const first = await screen.findByText("第一条");
    const second = await screen.findByText("第二条");
    const transfer = createDataTransfer();

    fireEvent.dragStart(screen.getAllByTitle("拖拽排序")[0], { dataTransfer: transfer });
    fireEvent.dragOver(second.closest("article")!, {
      dataTransfer: transfer,
      clientY: -1,
    });
    fireEvent.drop(second.closest("article")!, {
      dataTransfer: transfer,
      clientY: -1,
    });

    await waitFor(() => {
      expect(reorderTodosInGroup).toHaveBeenCalledWith("work", ["todo-2", "todo-1"]);
    });
    expect(first).toBeInTheDocument();
  });

  it("edits the selected todo inline with Space and Enter", async () => {
    render(<BoardPage onNavigate={vi.fn()} />);

    await screen.findByText("已有任务");
    fireEvent.keyDown(window, { key: "ArrowDown", metaKey: true });
    fireEvent.keyDown(window, { key: " " });

    const editInput = screen.getByDisplayValue("已有任务");
    fireEvent.change(editInput, { target: { value: "更新后的任务" } });
    fireEvent.keyDown(editInput, { key: "Enter" });

    await waitFor(() => expect(updateTodoDetail).toHaveBeenCalledWith("todo-1", "更新后的任务"));
    expect(await screen.findByText("更新后的任务")).toBeInTheDocument();
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
});

function makeGroup(id: string, name: string, sortOrder: number): Group {
  return {
    id,
    name,
    sortOrder,
    createdAt: "2026-06-04T00:00:00.000Z",
    updatedAt: "2026-06-04T00:00:00.000Z",
  };
}

function makeBoardView(id: string, name: string, sortOrder: number, viewGroups: Group[]): BoardView {
  return {
    id,
    name,
    sortOrder,
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
    groupSortOrders: todoGroups.map((group, index) => ({
      groupId: group.id,
      sortOrder: sortOrder + index,
    })),
  };
}

function createDataTransfer(): DataTransfer {
  const store = new Map<string, string>();
  return {
    dropEffect: "move",
    effectAllowed: "move",
    files: [] as unknown as FileList,
    items: [] as unknown as DataTransferItemList,
    types: [],
    clearData: vi.fn((type?: string) => {
      if (type) {
        store.delete(type);
      } else {
        store.clear();
      }
    }),
    getData: vi.fn((type: string) => store.get(type) ?? ""),
    setData: vi.fn((type: string, value: string) => {
      store.set(type, value);
    }),
    setDragImage: vi.fn(),
  };
}
