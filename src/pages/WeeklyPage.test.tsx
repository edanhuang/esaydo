import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { listTodos } from "../lib/api";
import { addWeeks, getCurrentWeekRange } from "../lib/dates";
import type { Todo } from "../types";
import { DailyPage } from "./WeeklyPage";

vi.mock("../lib/api", () => ({
  listTodos: vi.fn(),
}));

describe("DailyPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders done todos by completed date and active todos by created date", async () => {
    const range = getCurrentWeekRange();
    const completedAt = dateInRange(range.start, 3);
    const activeCreatedAt = dateInRange(range.start, 4);
    const nextWeekCreatedAt = dateInRange(addWeeks(range, 1).start, 1);
    vi.mocked(listTodos).mockResolvedValue([
      makeTodo("todo-1", "完成检查合并方案", "done", dateInRange(range.start, 1), completedAt),
      makeTodo("todo-2", "整理周报材料", "active", activeCreatedAt, null),
      makeTodo("todo-3", "下周任务", "active", nextWeekCreatedAt, null),
    ]);

    render(<DailyPage onNavigate={vi.fn()} />);

    expect(await screen.findByText(formatShortDate(completedAt))).toBeInTheDocument();
    expect(screen.getByText(formatShortDate(activeCreatedAt))).toBeInTheDocument();
    expect(screen.getByText("完成检查合并方案")).toBeInTheDocument();
    expect(screen.getByText("整理周报材料")).toBeInTheDocument();
    expect(screen.queryByText("下周任务")).not.toBeInTheDocument();
  });

  it("switches to another week with the week controls", async () => {
    const nextWeekCreatedAt = dateInRange(addWeeks(getCurrentWeekRange(), 1).start, 1);
    vi.mocked(listTodos).mockResolvedValue([
      makeTodo("todo-1", "下周任务", "active", nextWeekCreatedAt, null),
    ]);

    render(<DailyPage onNavigate={vi.fn()} />);

    expect(await screen.findByText("这周暂无事项")).toBeInTheDocument();
    fireEvent.click(screen.getByTitle("下一周"));

    await waitFor(() => expect(screen.getByText("下周任务")).toBeInTheDocument());
  });
});

function makeTodo(
  id: string,
  detail: string,
  status: Todo["status"],
  createdAt: string,
  completedAt: string | null,
): Todo {
  return {
    id,
    detail,
    status,
    extraText: null,
    groups: [],
    tags: [],
    createdAt,
    updatedAt: completedAt ?? createdAt,
    completedAt,
    archivedAt: null,
    groupSortOrders: [],
  };
}

function dateInRange(start: Date, offsetDays: number): string {
  const date = new Date(start);
  date.setDate(start.getDate() + offsetDays);
  date.setHours(10, 0, 0, 0);
  return date.toISOString();
}

function formatShortDate(dateLike: string): string {
  const date = new Date(dateLike);
  return `${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
