import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { listWeeklyDone } from "../lib/api";
import type { Todo } from "../types";
import { WeeklyPage } from "./WeeklyPage";

vi.mock("../lib/api", () => ({
  listWeeklyDone: vi.fn(),
}));

describe("WeeklyPage", () => {
  let writeText: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText,
      },
    });
  });

  it("renders completed todos grouped by date and copies markdown", async () => {
    vi.mocked(listWeeklyDone).mockResolvedValue([
      makeTodo("todo-1", "完成检查合并方案", "2026-06-04T09:00:00.000Z"),
      makeTodo("todo-2", "修复映射问题", "2026-06-04T10:00:00.000Z"),
      makeTodo("todo-3", "整理周报材料", "2026-06-05T10:00:00.000Z"),
    ]);

    render(<WeeklyPage onNavigate={vi.fn()} />);

    expect(await screen.findByText("06-04")).toBeInTheDocument();
    expect(screen.getByText("06-05")).toBeInTheDocument();
    expect(screen.getByText("完成检查合并方案")).toBeInTheDocument();
    expect(screen.getByText("修复映射问题")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "复制" }));

    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(
        [
          "## 本周完成内容",
          "",
          "### 06-04",
          "- 完成检查合并方案",
          "- 修复映射问题",
          "",
          "### 06-05",
          "- 整理周报材料",
        ].join("\n"),
      ),
    );
  });

  it("copies a valid empty-week markdown message", async () => {
    vi.mocked(listWeeklyDone).mockResolvedValue([]);

    render(<WeeklyPage onNavigate={vi.fn()} />);

    expect(await screen.findByText("本周暂无完成事项")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "复制" }));

    expect(writeText).toHaveBeenCalledWith("## 本周完成内容\n\n本周暂无完成事项。");
  });
});

function makeTodo(id: string, detail: string, completedAt: string): Todo {
  return {
    id,
    detail,
    status: "done",
    extraText: null,
    groups: [],
    tags: [],
    createdAt: "2026-06-04T00:00:00.000Z",
    updatedAt: completedAt,
    completedAt,
    archivedAt: null,
  };
}
