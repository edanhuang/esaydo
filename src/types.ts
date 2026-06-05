export type TodoStatus = "active" | "done" | "archived";

export interface Group {
  id: string;
  name: string;
  sortOrder: number;
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

export type AppView = "board" | "daily";
