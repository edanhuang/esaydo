import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BotActivityContext, EMPTY_BOT_ACTIVITY } from "@/components/bots/BotActivity";
import type { Bot, Group, Todo } from "../../types";
import { TodoCard } from "./TodoCard";

const group: Group = {
  id: "work",
  name: "工作",
  sortOrder: 0,
  systemKey: null,
  createdAt: "2026-06-04T00:00:00.000Z",
  updatedAt: "2026-06-04T00:00:00.000Z",
};

describe("TodoCard", () => {
  it("在画布卡片上双击正文进入编辑", () => {
    const onStartEditing = vi.fn();
    renderCard("canvas", onStartEditing);

    fireEvent.doubleClick(screen.getByText("子项一"));
    fireEvent.doubleClick(screen.getByText("主句"));

    expect(onStartEditing).toHaveBeenCalledTimes(2);
  });

  it("在列表里双击正文只选中文字，不进入编辑", () => {
    const onStartEditing = vi.fn();
    renderCard("list", onStartEditing);

    fireEvent.doubleClick(screen.getByText("主句"));

    expect(onStartEditing).not.toHaveBeenCalled();
  });
});

const bot: Bot = {
  id: "bot-1",
  name: "周报助手",
  color: "teal",
  provider: "claude",
  model: "sonnet",
  directory: "/work",
  createdAt: "2026-06-04T00:00:00.000Z",
  updatedAt: "2026-06-04T00:00:00.000Z",
  usage: { runs: 0, inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, costUsd: 0 },
};

describe("TodoCard 与 Bot", () => {
  it("Bot 运行中：完成按钮换成头像，不出归档按钮", () => {
    renderCard("list", vi.fn(), { running: true });

    expect(screen.queryByTitle("完成")).not.toBeInTheDocument();
    expect(screen.getByTitle("周报助手 运行中")).toHaveAttribute("data-running", "true");
    expect(screen.queryByTitle("归档")).not.toBeInTheDocument();
  });

  it("有未读时信封常驻在归档按钮右边，点击打开对应会话", () => {
    const openMessages = vi.fn();
    renderCard("list", vi.fn(), { unread: 2, openMessages });

    const badge = screen.getByTitle("2 条未读消息");
    const archive = screen.getByTitle("归档");
    expect(archive.compareDocumentPosition(badge) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(badge);
    expect(openMessages).toHaveBeenCalledWith({ todoId: "todo-1", botId: "bot-1" });
  });
});

function renderCard(
  variant: "list" | "canvas",
  onStartEditing: () => void,
  activity: { running?: boolean; unread?: number; openMessages?: () => void } = {},
) {
  const value = {
    ...EMPTY_BOT_ACTIVITY,
    bots: [bot],
    runningBotFor: () => (activity.running ? bot : null),
    unreadFor: () => (activity.unread ? { todoId: "todo-1", count: activity.unread, botId: bot.id } : null),
    openMessages: activity.openMessages ?? vi.fn(),
  };
  render(
    <BotActivityContext.Provider value={value}>
    <TodoCard
      todo={makeTodo("主句\n- [ ] 子项一")}
      variant={variant}
      visibleChecklistRows={1}
      selected={false}
      editing={false}
      editingValue=""
      editingError={null}
      dragging={false}
      onSortableNode={vi.fn()}
      onSelect={vi.fn()}
      onStartEditing={onStartEditing}
      onChangeEditingValue={vi.fn()}
      onSaveEditing={vi.fn()}
      onBlurEditing={vi.fn()}
      onCancelEditing={vi.fn()}
      onToggleChecklistLine={vi.fn()}
      onComplete={vi.fn()}
      onReopen={vi.fn()}
      onArchive={vi.fn()}
      onSetPriority={vi.fn()}
      onSetSuspended={vi.fn()}
    />
    </BotActivityContext.Provider>,
  );
}

function makeTodo(detail: string): Todo {
  return {
    id: "todo-1",
    detail,
    status: "active",
    priority: "normal",
    suspendedAt: null,
    extraText: null,
    groups: [group],
    tags: [],
    createdAt: "2026-06-04T00:00:00.000Z",
    updatedAt: "2026-06-04T00:00:00.000Z",
    completedAt: null,
    archivedAt: null,
    expiresAt: null,
    deletedAt: null,
    deleteReason: null,
    groupSortOrders: [{ groupId: group.id, sortOrder: 0 }],
  };
}
