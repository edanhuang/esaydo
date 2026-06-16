import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { defaultShortcutSettings } from "./lib/shortcuts";
import { defaultAppearanceSettings } from "./lib/theme";
import {
  archiveTodo,
  completeTodo,
  countInboxTodos,
  createTodo,
  deleteTodo,
  getAppearanceSettings,
  getCliInstallStatus,
  getLayoutSettings,
  getSelectedBoardViewId,
  getSkillInstallStatuses,
  getShortcutSettings,
  installCliTool,
  installSkillToTarget,
  listBoardViews,
  listAvailableSkills,
  listGroups,
  listTodos,
  moveTodoFromInbox,
  reopenTodo,
  reorderTodosInGroup,
  saveAppearanceSettings,
  saveLayoutSettings,
  saveSelectedBoardViewId,
  saveShortcutSettings,
  setBoardViewGroupMembership,
  updateTodoDetail,
} from "./lib/api";
import type { BoardView, Group, Todo } from "./types";

vi.mock("./lib/api", () => ({
  archiveTodo: vi.fn(),
  chooseSkillInstallDirectory: vi.fn(),
  completeTodo: vi.fn(),
  countInboxTodos: vi.fn(),
  createTodo: vi.fn(),
  deleteTodo: vi.fn(),
  getAppearanceSettings: vi.fn(),
  getCliInstallStatus: vi.fn(),
  getLayoutSettings: vi.fn(),
  getSelectedBoardViewId: vi.fn(),
  getSkillInstallStatuses: vi.fn(),
  getShortcutSettings: vi.fn(),
  installCliTool: vi.fn(),
  installSkillToTarget: vi.fn(),
  listAvailableSkills: vi.fn(),
  listBoardViews: vi.fn(),
  listGroups: vi.fn(),
  listTodos: vi.fn(),
  moveTodoFromInbox: vi.fn(),
  reopenTodo: vi.fn(),
  reorderTodosInGroup: vi.fn(),
  saveAppearanceSettings: vi.fn(),
  saveLayoutSettings: vi.fn(),
  saveSelectedBoardViewId: vi.fn(),
  saveShortcutSettings: vi.fn(),
  setBoardViewGroupMembership: vi.fn(),
  updateTodoDetail: vi.fn(),
}));

const groups: Group[] = [makeGroup("work", "工作", 0)];
const boardViews: BoardView[] = [makeBoardView("all", "所有", 0, [])];
const todos: Todo[] = [makeTodo("todo-1", "已有任务", "active", groups)];

describe("App settings shortcuts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAppearanceSettings).mockResolvedValue(defaultAppearanceSettings);
    vi.mocked(getCliInstallStatus).mockResolvedValue({
      state: "notInstalled",
      sourcePath: null,
      linkPath: "/usr/local/bin/easydo",
      message: "命令行工具尚未安装",
    });
    vi.mocked(getSkillInstallStatuses).mockResolvedValue([]);
    vi.mocked(getLayoutSettings).mockResolvedValue({
      version: 1,
      sidebarCollapsed: false,
    });
    vi.mocked(getSelectedBoardViewId).mockResolvedValue(null);
    vi.mocked(countInboxTodos).mockResolvedValue(0);
    vi.mocked(getShortcutSettings).mockResolvedValue(defaultShortcutSettings);
    vi.mocked(installCliTool).mockRejectedValue(new Error("not used"));
    vi.mocked(installSkillToTarget).mockRejectedValue(new Error("not used"));
    vi.mocked(listAvailableSkills).mockResolvedValue([]);
    vi.mocked(saveAppearanceSettings).mockImplementation(async (settings) => settings);
    vi.mocked(saveLayoutSettings).mockImplementation(async (settings) => settings);
    vi.mocked(saveSelectedBoardViewId).mockImplementation(async (id) => id);
    vi.mocked(saveShortcutSettings).mockResolvedValue(defaultShortcutSettings);
    vi.mocked(setBoardViewGroupMembership).mockRejectedValue(new Error("not used"));
    vi.mocked(listGroups).mockResolvedValue(groups);
    vi.mocked(listBoardViews).mockResolvedValue(boardViews);
    vi.mocked(listTodos).mockResolvedValue(todos);
    vi.mocked(createTodo).mockRejectedValue(new Error("not used"));
    vi.mocked(deleteTodo).mockRejectedValue(new Error("not used"));
    vi.mocked(completeTodo).mockRejectedValue(new Error("not used"));
    vi.mocked(reopenTodo).mockRejectedValue(new Error("not used"));
    vi.mocked(reorderTodosInGroup).mockRejectedValue(new Error("not used"));
    vi.mocked(moveTodoFromInbox).mockRejectedValue(new Error("not used"));
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

  it("restores and persists the collapsed sidebar state", async () => {
    vi.mocked(getLayoutSettings).mockResolvedValue({
      version: 1,
      sidebarCollapsed: true,
    });
    render(<App />);

    expect(await screen.findByTitle("展开侧栏")).toBeInTheDocument();
    fireEvent.click(screen.getByTitle("展开侧栏"));

    await waitFor(() => {
      expect(saveLayoutSettings).toHaveBeenCalledWith({
        version: 1,
        sidebarCollapsed: false,
      });
    });
    expect(screen.getByTitle("收起侧栏")).toBeInTheDocument();

    fireEvent.click(screen.getByTitle("收起侧栏"));
    await waitFor(() => {
      expect(saveLayoutSettings).toHaveBeenLastCalledWith({
        version: 1,
        sidebarCollapsed: true,
      });
    });
    expect(screen.getByTitle("展开侧栏")).toBeInTheDocument();
  });
});

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
    expiresAt: null,
    deletedAt: null,
    deleteReason: null,
    groupSortOrders: todoGroups.map((group, index) => ({
      groupId: group.id,
      sortOrder: index,
    })),
  };
}
