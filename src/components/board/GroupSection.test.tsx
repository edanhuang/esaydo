import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Group, Todo } from "../../types";
import { GroupSection } from "./GroupSection";

const group: Group = {
  id: "work",
  name: "工作",
  sortOrder: 0,
  systemKey: null,
  createdAt: "2026-06-04T00:00:00.000Z",
  updatedAt: "2026-06-04T00:00:00.000Z",
};

describe("GroupSection", () => {
  it("uses dnd-kit sortable handles instead of native draggable handles", () => {
    const onReorderTodo = vi.fn();

    render(
      <GroupSection
        group={group}
        todos={[
          makeTodo("todo-1", "第一条", 0),
          makeTodo("todo-2", "第二条", 1),
        ]}
        scrollToTodoId={null}
        selectedTodoId={null}
        editingTodoId={null}
        editingDetail=""
        editingError={null}
        onSelectGroup={vi.fn()}
        onSelectTodo={vi.fn()}
        onStartEditingTodo={vi.fn()}
        onChangeEditingDetail={vi.fn()}
        onSaveEditingTodo={vi.fn()}
        onBlurEditingTodo={vi.fn()}
        onCancelEditingTodo={vi.fn()}
        onToggleTodoChecklistLine={vi.fn()}
        onCompleteTodo={vi.fn()}
        onReopenTodo={vi.fn()}
        onArchiveTodo={vi.fn()}
        onSetTodoPriority={vi.fn()}
        dragState={null}
        onDragStartTodo={vi.fn()}
        onDragOverTodo={vi.fn()}
        onReorderTodo={onReorderTodo}
        onDragEndTodo={vi.fn()}
      />,
    );

    const firstHandle = screen.getAllByTitle("拖拽排序")[0];
    expect(firstHandle).toHaveAttribute("aria-roledescription", "sortable");
    expect(firstHandle).not.toHaveAttribute("draggable");
    expect(onReorderTodo).not.toHaveBeenCalled();

    const todoList = document.querySelector("[data-todo-list]");
    expect(todoList).toHaveClass("divide-y", "divide-border");
    expect(document.querySelector("[data-group-section]")).toHaveClass(
      "h-fit",
      "max-h-full",
      "self-start",
      "rounded-md",
    );
    for (const todoCard of document.querySelectorAll("[data-todo-card]")) {
      expect(todoCard).not.toHaveClass("rounded-sm", "border", "shadow-easydo-card");
    }
  });

  it("scrolls the todo list down when a newly created todo appears", async () => {
    const scrollTo = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollTo", {
      configurable: true,
      value: scrollTo,
    });

    render(
      <GroupSection
        group={group}
        todos={[
          makeTodo("todo-1", "第一条", 0),
          makeTodo("todo-created", "新建任务", 1),
        ]}
        scrollToTodoId="todo-created"
        selectedTodoId={null}
        editingTodoId={null}
        editingDetail=""
        editingError={null}
        onSelectGroup={vi.fn()}
        onSelectTodo={vi.fn()}
        onStartEditingTodo={vi.fn()}
        onChangeEditingDetail={vi.fn()}
        onSaveEditingTodo={vi.fn()}
        onBlurEditingTodo={vi.fn()}
        onCancelEditingTodo={vi.fn()}
        onToggleTodoChecklistLine={vi.fn()}
        onCompleteTodo={vi.fn()}
        onReopenTodo={vi.fn()}
        onArchiveTodo={vi.fn()}
        onSetTodoPriority={vi.fn()}
        dragState={null}
        onDragStartTodo={vi.fn()}
        onDragOverTodo={vi.fn()}
        onReorderTodo={vi.fn()}
        onDragEndTodo={vi.fn()}
      />,
    );

    await waitFor(() =>
      expect(scrollTo).toHaveBeenCalledWith({ top: expect.any(Number), behavior: "smooth" }),
    );
  });
});

function makeTodo(id: string, detail: string, sortOrder: number): Todo {
  return {
    id,
    detail,
    status: "active",
    priority: "normal",
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
    groupSortOrders: [
      {
        groupId: group.id,
        sortOrder,
      },
    ],
  };
}
