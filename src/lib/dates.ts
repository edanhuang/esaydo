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

export function addWeeks(range: WeekRange, offset: number): WeekRange {
  const start = new Date(range.start);
  start.setDate(start.getDate() + offset * 7);
  const end = new Date(range.end);
  end.setDate(end.getDate() + offset * 7);
  return { start, end };
}

export function formatWeekLabel(range: WeekRange): string {
  return `${range.start.toLocaleDateString()} - ${range.end.toLocaleDateString()}`;
}

export function formatDateHeading(dateLike: string): string {
  const date = new Date(dateLike);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${month}-${day}`;
}

const WEEKDAY_LABELS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

/** Daily 页的日期标题，如 10月27日 */
export function formatDayHeading(dateLike: string): string {
  const date = parseDateKey(dateLike);
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

export function formatWeekday(dateLike: string): string {
  return WEEKDAY_LABELS[parseDateKey(dateLike).getDay()];
}

/** 周范围，如 10月26日 至 11月1日：数字和中文紧排，「至」两侧留空格把两个日期分开 */
export function formatWeekRangeLabel(range: WeekRange): string {
  return `${formatDayHeading(toDateKey(range.start))} 至 ${formatDayHeading(toDateKey(range.end))}`;
}

export function todayDateKey(now = new Date()): string {
  return toDateKey(now);
}

function parseDateKey(dateLike: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateLike);
  return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : new Date(dateLike);
}

export function groupTodosByDailyDate(todos: Todo[], range: WeekRange): Array<[string, Todo[]]> {
  const groups = new Map<string, Todo[]>();
  for (let index = 0; index < 7; index += 1) {
    const date = new Date(range.start);
    date.setDate(range.start.getDate() + index);
    groups.set(toDateKey(date), []);
  }

  for (const todo of todos) {
    const seenKeys = new Set<string>();
    for (const dateLike of getDailyDates(todo)) {
      const date = new Date(dateLike);
      if (date < range.start || date > range.end) {
        continue;
      }
      const key = toDateKey(date);
      if (seenKeys.has(key)) {
        continue;
      }
      seenKeys.add(key);
      groups.get(key)?.push(todo);
    }
  }

  return [...groups.entries()].map(([date, items]) => [
    date,
    items.sort((left, right) => {
      return getDailyTimeForDate(left, date) - getDailyTimeForDate(right, date);
    }),
  ]);
}

function getDailyDates(todo: Todo): string[] {
  if (todo.dailyActivityDates && todo.dailyActivityDates.length > 0) {
    return todo.dailyActivityDates;
  }
  return [getDailyDate(todo)];
}

function getDailyTimeForDate(todo: Todo, dateKey: string): number {
  const times = getDailyDates(todo)
    .filter((dateLike) => toDateKey(new Date(dateLike)) === dateKey)
    .map((dateLike) => new Date(dateLike).getTime())
    .filter((time) => !Number.isNaN(time));
  return times.length > 0 ? Math.min(...times) : 0;
}

function getDailyDate(todo: Todo): string {
  if (todo.status === "archived" && todo.archivedAt) {
    return todo.archivedAt;
  }
  if (todo.status === "done" && todo.completedAt) {
    return todo.completedAt;
  }
  return todo.createdAt;
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

function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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
