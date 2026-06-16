import { invoke } from "@tauri-apps/api/core";
import type {
  AppearanceSettings,
  BoardView,
  CliInstallStatus,
  Group,
  LayoutSettings,
  ShortcutSettings,
  SkillDefinition,
  SkillInstallLocationStatus,
  Todo,
} from "../types";

export function listGroups(): Promise<Group[]> {
  return invoke("list_groups");
}

export function createGroup(name: string): Promise<Group> {
  return invoke("create_group", { name });
}

export function listBoardViews(): Promise<BoardView[]> {
  return invoke("list_board_views");
}

export function getSelectedBoardViewId(): Promise<string | null> {
  return invoke("get_selected_board_view_id");
}

export function saveSelectedBoardViewId(boardViewId: string): Promise<string> {
  return invoke("save_selected_board_view_id", { boardViewId });
}

export function setBoardViewGroupMembership(
  boardViewId: string,
  groupId: string,
  included: boolean,
): Promise<BoardView> {
  return invoke("set_board_view_group_membership", { boardViewId, groupId, included });
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

export function createInboxTodo(detail: string): Promise<Todo> {
  return invoke("create_inbox_todo", { detail });
}

export function countInboxTodos(): Promise<number> {
  return invoke("count_inbox_todos");
}

export function moveTodoFromInbox(id: string, targetGroupId: string): Promise<Todo> {
  return invoke("move_todo_from_inbox", { id, targetGroupId });
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

export function getLayoutSettings(): Promise<LayoutSettings> {
  return invoke("get_layout_settings");
}

export function saveLayoutSettings(settings: LayoutSettings): Promise<LayoutSettings> {
  return invoke("save_layout_settings", { settings });
}

export function getCliInstallStatus(): Promise<CliInstallStatus> {
  return invoke("get_cli_install_status");
}

export function installCliTool(): Promise<CliInstallStatus> {
  return invoke("install_cli_tool");
}

export function listAvailableSkills(): Promise<SkillDefinition[]> {
  return invoke("list_available_skills");
}

export function getSkillInstallStatuses(
  skillName: string,
  customRoots: string[],
): Promise<SkillInstallLocationStatus[]> {
  return invoke("get_skill_install_statuses", { skillName, customRoots });
}

export function installSkillToTarget(
  skillName: string,
  target: string,
  customRoot?: string,
): Promise<SkillInstallLocationStatus> {
  return invoke("install_skill_to_target", {
    skillName,
    target,
    customRoot: customRoot ?? null,
  });
}

export function chooseSkillInstallDirectory(): Promise<string | null> {
  return invoke("choose_skill_install_directory");
}
