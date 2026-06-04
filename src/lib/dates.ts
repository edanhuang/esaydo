import type { Todo } from "../types";

export interface WeekRange {
  start: Date;
  end: Date;
}

export function getCurrentWeekRange(now = new Date()): WeekRange {
  const start = new Date(now);
  const day = start.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  start.setDate(start.getDate() + diffToMonday);
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);

  return { start, end };
}

export function formatDateHeading(dateLike: string): string {
  const date = new Date(dateLike);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${month}-${day}`;
}

export function groupTodosByCompletedDate(todos: Todo[]): Array<[string, Todo[]]> {
  const groups = new Map<string, Todo[]>();

  for (const todo of todos) {
    if (!todo.completedAt) {
      continue;
    }
    const key = formatDateHeading(todo.completedAt);
    const list = groups.get(key) ?? [];
    list.push(todo);
    groups.set(key, list);
  }

  return [...groups.entries()]
    .map(([date, items]) => [
      date,
      items.sort((a, b) => {
        const left = a.completedAt ? new Date(a.completedAt).getTime() : 0;
        const right = b.completedAt ? new Date(b.completedAt).getTime() : 0;
        return left - right;
      }),
    ] as [string, Todo[]])
    .sort(([left], [right]) => left.localeCompare(right));
}

export function buildWeeklyMarkdown(groups: Array<[string, Todo[]]>): string {
  if (groups.length === 0) {
    return "## 本周完成内容\n\n本周暂无完成事项。";
  }

  const lines = ["## 本周完成内容", ""];
  for (const [date, todos] of groups) {
    lines.push(`### ${date}`);
    for (const todo of todos) {
      lines.push(`- ${todo.detail}`);
    }
    lines.push("");
  }

  return lines.join("\n").trimEnd();
}
