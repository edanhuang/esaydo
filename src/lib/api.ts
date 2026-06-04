import { invoke } from "@tauri-apps/api/core";
import type { BoardView, Group, Todo } from "../types";

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

export function listWeeklyDone(startDate: string, endDate: string): Promise<Todo[]> {
  return invoke("list_weekly_done", { startDate, endDate });
}
