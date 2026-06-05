import { fireEvent, render, screen } from "@testing-library/react";
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
  it("reorders onto a reserved placeholder", () => {
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
        dragState={{
          groupId: "work",
          draggedTodoId: "todo-1",
          targetTodoId: "todo-2",
          position: "before",
        }}
        onDragStartTodo={vi.fn()}
        onDragOverTodo={vi.fn()}
        onReorderTodo={onReorderTodo}
        onDragEndTodo={vi.fn()}
      />,
    );

    fireEvent.drop(screen.getByTitle("放到此任务之前"), {
      dataTransfer: createDataTransfer(),
    });

    expect(onReorderTodo).toHaveBeenCalledWith("work", "todo-1", "todo-2", "before");
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

function createDataTransfer(): DataTransfer {
  return {
    dropEffect: "move",
    effectAllowed: "move",
    files: [] as unknown as FileList,
    items: [] as unknown as DataTransferItemList,
    types: [],
    clearData: vi.fn(),
    getData: vi.fn(() => ""),
    setData: vi.fn(),
    setDragImage: vi.fn(),
  };
}
