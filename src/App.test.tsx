import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { defaultShortcutSettings } from "./lib/shortcuts";
import { defaultAppearanceSettings } from "./lib/theme";
import {
  archiveTodo,
  completeTodo,
  createTodo,
  deleteTodo,
  getAppearanceSettings,
  getShortcutSettings,
  listBoardViews,
  listGroups,
  listTodos,
  reopenTodo,
  reorderTodosInGroup,
  saveAppearanceSettings,
  saveShortcutSettings,
  updateTodoDetail,
} from "./lib/api";
import type { BoardView, Group, Todo } from "./types";

vi.mock("./lib/api", () => ({
  archiveTodo: vi.fn(),
  completeTodo: vi.fn(),
  createTodo: vi.fn(),
  deleteTodo: vi.fn(),
  getAppearanceSettings: vi.fn(),
  getShortcutSettings: vi.fn(),
  listBoardViews: vi.fn(),
  listGroups: vi.fn(),
  listTodos: vi.fn(),
  reopenTodo: vi.fn(),
  reorderTodosInGroup: vi.fn(),
  saveAppearanceSettings: vi.fn(),
  saveShortcutSettings: vi.fn(),
  updateTodoDetail: vi.fn(),
}));

const groups: Group[] = [makeGroup("work", "工作", 0)];
const boardViews: BoardView[] = [makeBoardView("all", "所有", 0, [])];
const todos: Todo[] = [makeTodo("todo-1", "已有任务", "active", groups)];

describe("App settings shortcuts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAppearanceSettings).mockResolvedValue(defaultAppearanceSettings);
    vi.mocked(getShortcutSettings).mockResolvedValue(defaultShortcutSettings);
    vi.mocked(saveAppearanceSettings).mockImplementation(async (settings) => settings);
    vi.mocked(saveShortcutSettings).mockResolvedValue(defaultShortcutSettings);
    vi.mocked(listGroups).mockResolvedValue(groups);
    vi.mocked(listBoardViews).mockResolvedValue(boardViews);
    vi.mocked(listTodos).mockResolvedValue(todos);
    vi.mocked(createTodo).mockRejectedValue(new Error("not used"));
    vi.mocked(deleteTodo).mockRejectedValue(new Error("not used"));
    vi.mocked(completeTodo).mockRejectedValue(new Error("not used"));
    vi.mocked(reopenTodo).mockRejectedValue(new Error("not used"));
    vi.mocked(reorderTodosInGroup).mockRejectedValue(new Error("not used"));
    vi.mocked(archiveTodo).mockRejectedValue(new Error("not used"));
    vi.mocked(updateTodoDetail).mockRejectedValue(new Error("not used"));
  });

  it("opens Settings with Command comma while the app window is focused", async () => {
    render(<App />);

    await screen.findByText("已有任务");
    fireEvent.keyDown(window, { key: ",", metaKey: true });

    expect(screen.getByRole("dialog", { name: "Settings" })).toBeInTheDocument();
  });

  it("saves Light mode from Settings", async () => {
    render(<App />);

    await screen.findByText("已有任务");
    fireEvent.keyDown(window, { key: ",", metaKey: true });
    fireEvent.click(screen.getByRole("radio", { name: "Light" }));
    fireEvent.click(screen.getByText("Save"));

    await waitFor(() => {
      expect(saveAppearanceSettings).toHaveBeenCalledWith({ version: 1, mode: "light" });
    });
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

function makeTodo(id: string, detail: string, status: Todo["status"], todoGroups: Group[]): Todo {
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
      sortOrder: index,
    })),
  };
}
