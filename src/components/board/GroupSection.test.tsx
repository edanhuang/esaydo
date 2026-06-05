import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Group, Todo } from "../../types";
import { GroupSection } from "./GroupSection";

const group: Group = {
  id: "work",
  name: "工作",
  sortOrder: 0,
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
        selectedTodoId={null}
        editingTodoId={null}
        editingDetail=""
        editingError={null}
        onSelectTodo={vi.fn()}
        onStartEditingTodo={vi.fn()}
        onChangeEditingDetail={vi.fn()}
        onSaveEditingTodo={vi.fn()}
        onBlurEditingTodo={vi.fn()}
        onCancelEditingTodo={vi.fn()}
        onCompleteTodo={vi.fn()}
        onReopenTodo={vi.fn()}
        onArchiveTodo={vi.fn()}
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
  });
});

function makeTodo(id: string, detail: string, sortOrder: number): Todo {
  return {
    id,
    detail,
    status: "active",
    extraText: null,
    groups: [group],
    tags: [],
    createdAt: "2026-06-04T00:00:00.000Z",
    updatedAt: "2026-06-04T00:00:00.000Z",
    completedAt: null,
    archivedAt: null,
    groupSortOrders: [
      {
        groupId: group.id,
        sortOrder,
      },
    ],
  };
}
