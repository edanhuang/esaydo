export type TodoStatus = "active" | "done" | "archived";
export type TodoPriority = "normal" | "high";

export interface Group {
  id: string;
  name: string;
  sortOrder: number;
  systemKey: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Tag {
  id: string;
  name: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface Todo {
  id: string;
  detail: string;
  status: TodoStatus;
  priority: TodoPriority;
  suspendedAt: string | null;
  extraText: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  archivedAt: string | null;
  expiresAt: string | null;
  deletedAt: string | null;
  deleteReason: string | null;
  dailyActivityDates?: string[];
  groups: Group[];
  groupSortOrders: Array<{
    groupId: string;
    sortOrder: number;
  }>;
  tags: Tag[];
}

export interface BoardView {
  id: string;
  name: string;
  sortOrder: number;
  systemKey: string | null;
  createdAt: string;
  updatedAt: string;
  groups: Group[];
}

export interface ShortcutBinding {
  key: string;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  ctrlKey: boolean;
}

export interface ShortcutSettings {
  version: number;
  openSettings: ShortcutBinding;
  selectPreviousTodo: ShortcutBinding;
  selectNextTodo: ShortcutBinding;
  editSelectedTodo: ShortcutBinding;
  toggleSelectedTodoDone: ShortcutBinding;
}

export type ThemeMode = "system" | "light" | "dark";
export type ResolvedThemeMode = "light" | "dark";

export interface AppearanceSettings {
  version: number;
  mode: ThemeMode;
}

export interface LayoutSettings {
  version: number;
  sidebarCollapsed: boolean;
}

export type CliInstallState =
  | "notInstalled"
  | "installed"
  | "stale"
  | "conflict"
  | "error";

export interface CliInstallStatus {
  state: CliInstallState;
  sourcePath: string | null;
  linkPath: string;
  message: string;
}

export interface SkillDefinition {
  name: string;
  version: string;
  description: string;
  path: string;
}

export type SkillInstallState =
  | "notInstalled"
  | "installed"
  | "outdated"
  | "conflict"
  | "error";

export interface SkillInstallLocationStatus {
  skill: string;
  target: "agents" | "codex" | "claude" | "custom" | string;
  path: string;
  state: SkillInstallState;
  message: string;
}

export type AppView = "board" | "daily" | "bots";

export type BotProvider = "claude" | "codex";

export type BotColor = "amber" | "olive" | "moss" | "teal" | "indigo" | "plum" | "rose" | "graphite";

export interface BotUsage {
  runs: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export interface Bot {
  id: string;
  name: string;
  color: BotColor;
  provider: BotProvider;
  model: string;
  directory: string;
  createdAt: string;
  updatedAt: string;
  usage: BotUsage;
}

export interface BotInput {
  name: string;
  color: BotColor;
  provider: BotProvider;
  model: string;
  directory: string;
}

export interface ActiveBotRun {
  runId: string;
  todoId: string;
  botId: string;
  startedAt: string;
}

export interface TodoUnread {
  todoId: string;
  count: number;
  /** 最新一条未读来自哪个 Bot，点信封时跳到这段会话 */
  botId: string;
}

export interface BotConversation {
  botId: string;
  todoId: string;
  todoDetail: string;
  title: string | null;
  sessionId: string | null;
  unreadCount: number;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  running: boolean;
}

export interface BotMessage {
  id: string;
  runId: string | null;
  role: "user" | "bot" | "system";
  content: string;
  createdAt: string;
  readAt: string | null;
}

export interface DispatchPreview {
  sessionTitle: string | null;
  sessionWillReset: boolean;
  running: boolean;
}

export type BoardLayoutMode = "list" | "canvas";

export interface CanvasPosition {
  todoId: string;
  x: number;
  y: number;
  /** 拉伸后的宽高；为空时用默认宽度和内容高度 */
  width?: number | null;
  height?: number | null;
}
