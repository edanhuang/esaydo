import { invoke } from "@tauri-apps/api/core";
import type { AppearanceSettings, BoardView, Group, ShortcutSettings, Todo } from "../types";

export function listGroups(): Promise<Group[]> {
  return invoke("list_groups");
}

export function createGroup(name: string): Promise<Group> {
  return invoke("create_group", { name });
}

export function listBoardViews(): Promise<BoardView[]> {
  return invoke("list_board_views");
}

export function listTodos(boardViewId?: string): Promise<Todo[]> {
  return invoke("list_todos", { boardViewId: boardViewId ?? null });
}

export function listDailyTodos(): Promise<Todo[]> {
  return invoke("list_daily_todos");
}

export function createTodo(detail: string, groupIds: string[]): Promise<Todo> {
  return invoke("create_todo", { detail, groupIds, tagIds: [] });
}

export function completeTodo(id: string): Promise<Todo> {
  return invoke("complete_todo", { id });
}

export function reopenTodo(id: string): Promise<Todo> {
  return invoke("reopen_todo", { id });
}

export function archiveTodo(id: string): Promise<Todo> {
  return invoke("archive_todo", { id });
}

export function deleteTodo(id: string): Promise<void> {
  return invoke("delete_todo", { id });
}

export function updateTodoDetail(id: string, detail: string): Promise<Todo> {
  return invoke("update_todo_detail", { id, detail });
}

export function reorderTodosInGroup(groupId: string, todoIds: string[]): Promise<void> {
  return invoke("reorder_todos_in_group", { groupId, todoIds });
}

export function listWeeklyDone(startDate: string, endDate: string): Promise<Todo[]> {
  return invoke("list_weekly_done", { startDate, endDate });
}

export function getShortcutSettings(): Promise<ShortcutSettings> {
  return invoke("get_shortcut_settings");
}

export function saveShortcutSettings(settings: ShortcutSettings): Promise<ShortcutSettings> {
  return invoke("save_shortcut_settings", { settings });
}

export function getAppearanceSettings(): Promise<AppearanceSettings> {
  return invoke("get_appearance_settings");
}

export function saveAppearanceSettings(settings: AppearanceSettings): Promise<AppearanceSettings> {
  return invoke("save_appearance_settings", { settings });
}
