import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CanvasPosition, Todo } from "../../types";
import { BoardCanvas, CARD_COLLAPSE_DELAY } from "./BoardCanvas";

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

  it("拉伸从卡片实际高度算起，边缘跟着指针走", () => {
    const onPlaceTodos = vi.fn();
    renderCanvas(onPlaceTodos, [makeTodo("todo-1", "主句\n- [ ] 子项一\n- [ ] 子项二")], { height: 40 });
    const item = canvasItem("todo-1");
    // 悬停展开后实际 120 高，比保存的 40 高
    vi.spyOn(item, "getBoundingClientRect").mockReturnValue({ height: 120 } as DOMRect);
    const handle = item.querySelector('[data-resize-handle="se"]') as HTMLElement;

    fireEvent.pointerDown(handle, { button: 0, pointerId: 1, clientX: 300, clientY: 144 });
    fireEvent.pointerMove(handle, { pointerId: 1, buttons: 1, clientX: 300, clientY: 104 });
    // 往上缩时高度就是指针给的，不被展开的内容撑住
    expect(item.style.height).toBe("80px");
    expect(item.style.minHeight).toBe("");

    fireEvent.pointerMove(handle, { pointerId: 1, buttons: 1, clientX: 300, clientY: 184 });
    expect(item.style.height).toBe("160px");
    fireEvent.pointerUp(handle, { pointerId: 1, clientX: 300, clientY: 184 });

    expect(onPlaceTodos).toHaveBeenLastCalledWith([{ todoId: "todo-1", x: 24, y: 24, width: 240, height: 160 }]);
    expect(item.style.height).toBe("");
  });

  describe("悬停展开", () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it("离开卡片后等一会儿才收起，期间回来不收", () => {
      vi.useFakeTimers();
      renderCanvas(vi.fn(), [makeTodo("todo-1", "主句\n- [ ] 子项一")]);
      const item = canvasItem("todo-1");
      expect(expanded("todo-1")).toBe(false);

      fireEvent.pointerEnter(item);
      expect(expanded("todo-1")).toBe(true);

      fireEvent.pointerLeave(item);
      advance(CARD_COLLAPSE_DELAY - 1);
      expect(expanded("todo-1")).toBe(true);
      fireEvent.pointerEnter(item);
      advance(CARD_COLLAPSE_DELAY * 2);
      expect(expanded("todo-1")).toBe(true);

      fireEvent.pointerLeave(item);
      advance(CARD_COLLAPSE_DELAY);
      expect(expanded("todo-1")).toBe(false);
    });

    it("伸出卡片的缩放手柄也算悬停，缩放中一直展开，松手在卡片外再收起", () => {
      vi.useFakeTimers();
      renderCanvas(vi.fn(), [makeTodo("todo-1", "主句\n- [ ] 子项一")]);
      const handle = canvasItem("todo-1").querySelector('[data-resize-handle="se"]') as HTMLElement;

      fireEvent.pointerEnter(handle);
      expect(expanded("todo-1")).toBe(true);

      fireEvent.pointerDown(handle, { button: 0, pointerId: 1, clientX: 100, clientY: 100 });
      fireEvent.pointerLeave(canvasItem("todo-1"));
      fireEvent.pointerMove(handle, { pointerId: 1, buttons: 1, clientX: 300, clientY: 300 });
      advance(CARD_COLLAPSE_DELAY * 2);
      expect(expanded("todo-1")).toBe(true);

      fireEvent.pointerUp(handle, { pointerId: 1, clientX: 300, clientY: 300 });
      expect(expanded("todo-1")).toBe(true);
      advance(CARD_COLLAPSE_DELAY);
      expect(expanded("todo-1")).toBe(false);
    });

    it("进入另一张卡片时上一张立刻收起", () => {
      vi.useFakeTimers();
      renderCanvas(vi.fn(), [makeTodo("todo-1", "主句\n- [ ] 子项一"), makeTodo("todo-2", "另一张\n- [ ] 子项二")]);

      fireEvent.pointerEnter(canvasItem("todo-1"));
      fireEvent.pointerLeave(canvasItem("todo-1"));
      fireEvent.pointerEnter(canvasItem("todo-2"));

      expect(expanded("todo-1")).toBe(false);
      expect(expanded("todo-2")).toBe(true);
    });
  });
});

function canvasItem(todoId: string) {
  return document.querySelector(`[data-canvas-item="${todoId}"]`) as HTMLElement;
}

function expanded(todoId: string) {
  const row = canvasItem(todoId).querySelector("[data-checklist-row]") as HTMLElement;
  return !row.classList.contains("hidden");
}

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

function worldTransform() {
  return (document.querySelector("[data-board-canvas] > div > div") as HTMLElement).style.transform;
}

function renderCanvas(onPlaceTodos = vi.fn(), todos = [makeTodo()], size: Partial<CanvasPosition> = {}) {
  const positions = new Map<string, CanvasPosition>(
    todos.map((todo, index) => [
      todo.id,
      { todoId: todo.id, x: 24 + index * 300, y: 24, width: null, height: null, ...size },
    ]),
  );
  render(
    <BoardCanvas
      todos={todos}
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

function makeTodo(id = "todo-1", detail = "第一条"): Todo {
  return {
    id,
    detail,
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
