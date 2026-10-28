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
        onSetTodoSuspended={vi.fn()}
        suspendedExpanded={false}
        onToggleSuspendedExpanded={vi.fn()}
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
    expect(todoList).toHaveClass("overflow-y-auto");
    expect(document.querySelector("[data-group-section]")).toHaveClass(
      "h-fit",
      "max-h-full",
      "self-start",
      "rounded-xl",
      "min-w-[360px]",
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
        onSetTodoSuspended={vi.fn()}
        suspendedExpanded={false}
        onToggleSuspendedExpanded={vi.fn()}
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

describe("GroupSection suspended todos", () => {
  function renderSection(suspendedExpanded: boolean, onToggleSuspendedExpanded = vi.fn()) {
    return render(
      <GroupSection
        group={group}
        todos={[
          makeTodo("todo-1", "第一条", 0),
          { ...makeTodo("todo-2", "挂起的第二条", 1), suspendedAt: "2026-06-05T00:00:00.000Z" },
          makeTodo("todo-3", "第三条", 2),
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
        onSetTodoSuspended={vi.fn()}
        suspendedExpanded={suspendedExpanded}
        onToggleSuspendedExpanded={onToggleSuspendedExpanded}
        dragState={null}
        onDragStartTodo={vi.fn()}
        onDragOverTodo={vi.fn()}
        onReorderTodo={vi.fn()}
        onDragEndTodo={vi.fn()}
      />,
    );
  }

  it("collapses suspended todos under the group and excludes them from the count", () => {
    const onToggle = vi.fn();
    renderSection(false, onToggle);

    expect(screen.queryByText("挂起的第二条")).not.toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    const toggle = screen.getByRole("button", { name: /已挂起 1/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.getAllByTitle("拖拽排序")).toHaveLength(2);

    toggle.click();
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("shows suspended todos without drag handles when expanded", () => {
    renderSection(true);

    const suspendedArea = document.querySelector("[data-suspended-todos]") as HTMLElement;
    expect(document.querySelector("[data-todo-list]")?.firstElementChild).toBe(suspendedArea);
    expect(suspendedArea).toHaveTextContent("挂起的第二条");
    expect(suspendedArea.querySelector("[title='拖拽排序']")).toBeNull();
    expect(screen.getAllByTitle("拖拽排序")).toHaveLength(2);
  });
});

function makeTodo(id: string, detail: string, sortOrder: number): Todo {
  return {
    id,
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
    groupSortOrders: [
      {
        groupId: group.id,
        sortOrder,
      },
    ],
  };
}
