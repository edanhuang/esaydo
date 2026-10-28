import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { CanvasPosition, Todo } from "../../types";
import { BoardCanvas } from "./BoardCanvas";

describe("BoardCanvas", () => {
  it("两指滑动平移画布，往左上滑也可以", () => {
    renderCanvas();
    const canvas = document.querySelector("[data-board-canvas]") as HTMLElement;

    fireEvent.wheel(canvas, { deltaX: -120, deltaY: -80 });

    expect(worldTransform()).toBe("scale(1) translate(120px, 80px)");
  });

  it("捏合以光标为中心缩放，比例跟着变", () => {
    renderCanvas();
    const canvas = document.querySelector("[data-board-canvas]") as HTMLElement;

    fireEvent.wheel(canvas, { ctrlKey: true, deltaY: -50, clientX: 200, clientY: 100 });

    const zoom = Math.exp(0.5);
    expect(screen.getByTitle("恢复 100%")).toHaveTextContent(`${Math.round(zoom * 100)}%`);
    // 光标下的世界坐标 (200, 100) 缩放后仍在光标下
    const [, x, y] = /translate\((-?[\d.]+)px, (-?[\d.]+)px\)/.exec(worldTransform())!.map(Number);
    expect(200 / zoom - x).toBeCloseTo(200);
    expect(100 / zoom - y).toBeCloseTo(100);

    fireEvent.click(screen.getByTitle("恢复 100%"));
    expect(screen.getByTitle("恢复 100%")).toHaveTextContent("100%");
  });

  it("松手前补发的按键为 0 的移动事件不会作废拖动", () => {
    const onPlaceTodos = vi.fn();
    renderCanvas(onPlaceTodos);
    const item = document.querySelector('[data-canvas-item="todo-1"]') as HTMLElement;

    fireEvent.pointerDown(item, { button: 0, pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(item, { pointerId: 1, buttons: 1, clientX: 200, clientY: 160 });
    // 日志里看到的顺序：同一坐标先来按键为 0 的移动，再来 pointerup
    fireEvent.pointerMove(item, { pointerId: 1, buttons: 0, clientX: 200, clientY: 160 });
    fireEvent.pointerUp(item, { pointerId: 1, clientX: 200, clientY: 160 });

    expect(onPlaceTodos).toHaveBeenLastCalledWith([{ todoId: "todo-1", x: 124, y: 84, width: null, height: null }]);
  });

  it("还没起拖就在卡片外松手，残留的拖动会被清掉", () => {
    const onPlaceTodos = vi.fn();
    renderCanvas(onPlaceTodos);
    const item = document.querySelector('[data-canvas-item="todo-1"]') as HTMLElement;

    fireEvent.pointerDown(item, { button: 0, pointerId: 1, clientX: 100, clientY: 100 });
    // 松手发生在卡片外，卡片只在之后鼠标悬停时收到按键为 0 的移动
    fireEvent.pointerMove(item, { pointerId: 1, buttons: 0, clientX: 300, clientY: 300 });
    fireEvent.pointerMove(item, { pointerId: 1, buttons: 0, clientX: 320, clientY: 320 });

    expect(onPlaceTodos).not.toHaveBeenCalled();
    expect(item.style.transform).toBe("translate(24px, 24px)");
  });

  it("卡片可以拖到原点左上方的负坐标", () => {
    const onPlaceTodos = vi.fn();
    renderCanvas(onPlaceTodos);
    const item = document.querySelector('[data-canvas-item="todo-1"]') as HTMLElement;

    fireEvent.pointerDown(item, { button: 0, pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(item, { pointerId: 1, buttons: 1, clientX: 0, clientY: 20 });
    fireEvent.pointerUp(item, { pointerId: 1, clientX: 0, clientY: 20 });

    expect(onPlaceTodos).toHaveBeenLastCalledWith([{ todoId: "todo-1", x: -76, y: -56, width: null, height: null }]);
  });
});

function worldTransform() {
  return (document.querySelector("[data-board-canvas] > div > div") as HTMLElement).style.transform;
}

function renderCanvas(onPlaceTodos = vi.fn()) {
  const todo = makeTodo();
  const positions = new Map<string, CanvasPosition>([
    ["todo-1", { todoId: "todo-1", x: 24, y: 24, width: null, height: null }],
  ]);
  render(
    <BoardCanvas
      todos={[todo]}
      suspendedTodos={[]}
      positions={positions}
      positionsReady
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
      onToggleTodoChecklistLine={vi.fn()}
      onCompleteTodo={vi.fn()}
      onReopenTodo={vi.fn()}
      onArchiveTodo={vi.fn()}
      onSetTodoPriority={vi.fn()}
      onSetTodoSuspended={vi.fn()}
      onPlaceTodos={onPlaceTodos}
      onCreateTodoAt={vi.fn()}
      onShowSuspended={vi.fn()}
    />,
  );
}

function makeTodo(): Todo {
  return {
    id: "todo-1",
    detail: "第一条",
    status: "active",
    priority: "normal",
    suspendedAt: null,
    extraText: null,
    groups: [],
    tags: [],
    createdAt: "2026-06-04T00:00:00.000Z",
    updatedAt: "2026-06-04T00:00:00.000Z",
    completedAt: null,
    archivedAt: null,
    expiresAt: null,
    deletedAt: null,
    deleteReason: null,
    groupSortOrders: [],
  };
}
