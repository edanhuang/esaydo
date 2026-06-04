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

export type AppView = "board" | "weekly";
