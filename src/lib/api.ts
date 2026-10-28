import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type {
  ActiveBotRun,
  Bot,
  BotConversation,
  BotInput,
  BotMessage,
  DispatchPreview,
  TerminalSettings,
  TodoUnread,
  BoardLayoutMode,
  CanvasPosition,
  AppearanceSettings,
  BoardView,
  CliInstallStatus,
  Group,
  LayoutSettings,
  ShortcutSettings,
  SkillDefinition,
  SkillInstallLocationStatus,
  Todo,
  TodoPriority,
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

export function setTodoPriority(id: string, priority: TodoPriority): Promise<Todo> {
  return invoke("set_todo_priority", { id, priority });
}

export function setTodoSuspended(id: string, suspended: boolean): Promise<Todo> {
  return invoke("set_todo_suspended", { id, suspended });
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

export function listCanvasPositions(boardViewId: string): Promise<CanvasPosition[]> {
  return invoke("list_canvas_positions", { boardViewId });
}

export function appendCanvasLog(lines: string[]): Promise<void> {
  return invoke("append_canvas_log", { lines });
}

export function saveCanvasPositions(boardViewId: string, positions: CanvasPosition[]): Promise<void> {
  return invoke("save_canvas_positions", { boardViewId, positions });
}

export async function getBoardLayoutMode(boardViewId: string): Promise<BoardLayoutMode> {
  return (await invoke<string>("get_board_layout_mode", { boardViewId })) === "canvas" ? "canvas" : "list";
}

export function saveBoardLayoutMode(boardViewId: string, mode: BoardLayoutMode): Promise<string> {
  return invoke("save_board_layout_mode", { boardViewId, mode });
}

export function listBots(): Promise<Bot[]> {
  return invoke("list_bots");
}

export function createBot(input: BotInput): Promise<Bot> {
  return invoke("create_bot", { input });
}

export function updateBot(id: string, input: BotInput): Promise<Bot> {
  return invoke("update_bot", { id, input });
}

export function countBotMessages(id: string): Promise<number> {
  return invoke("count_bot_messages", { id });
}

export function deleteBot(id: string): Promise<void> {
  return invoke("delete_bot", { id });
}

export function chooseBotDirectory(): Promise<string | null> {
  return invoke("choose_bot_directory");
}

export function getBotDispatchPreview(todoId: string, botId: string): Promise<DispatchPreview> {
  return invoke("get_bot_dispatch_preview", { todoId, botId });
}

export function dispatchTodoToBot(todoId: string, botId: string, instruction: string): Promise<void> {
  return invoke("dispatch_todo_to_bot", { todoId, botId, instruction });
}

export function stopBotRun(todoId: string, botId: string): Promise<void> {
  return invoke("stop_bot_run", { todoId, botId });
}

export function getTerminalSettings(): Promise<TerminalSettings> {
  return invoke("get_terminal_settings");
}

export function saveTerminalSettings(settings: TerminalSettings): Promise<TerminalSettings> {
  return invoke("save_terminal_settings", { settings });
}

/** 在设置里选定的终端 App 里进入 Bot 的工作目录，用 resume 打开这段会话 */
export function openBotSessionInTerminal(todoId: string, botId: string): Promise<void> {
  return invoke("open_bot_session_in_terminal", { todoId, botId });
}

export function listActiveBotRuns(): Promise<ActiveBotRun[]> {
  return invoke("list_active_bot_runs");
}

export function listBotUnread(): Promise<TodoUnread[]> {
  return invoke("list_bot_unread");
}

export function listBotConversations(): Promise<BotConversation[]> {
  return invoke("list_bot_conversations");
}

export function listBotMessages(todoId: string, botId: string): Promise<BotMessage[]> {
  return invoke("list_bot_messages", { todoId, botId });
}

export function markBotMessagesRead(todoId: string, botId: string): Promise<void> {
  return invoke("mark_bot_messages_read", { todoId, botId });
}

/** Bot 开始、结束运行或消息已读时触发；返回取消监听的函数 */
export function onBotRunsChanged(handler: () => void): Promise<() => void> {
  return listen("bot-runs-changed", handler);
}

/** 有 Bot 在运行时按 ⌘Q 或关窗口，后端先发这个事件让前端确认；参数是运行中的 Bot 数 */
export function onConfirmQuit(handler: (runningCount: number) => void): Promise<() => void> {
  return listen<number>("confirm-quit", (event) => handler(event.payload));
}

export function quitApp(): Promise<void> {
  return invoke("quit_app");
}
