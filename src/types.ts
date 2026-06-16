export type TodoStatus = "active" | "done" | "archived";

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
  extraText: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  archivedAt: string | null;
  expiresAt: string | null;
  deletedAt: string | null;
  deleteReason: string | null;
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

export type AppView = "board" | "daily";
