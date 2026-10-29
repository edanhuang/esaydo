import { describe, expect, it } from "vitest";
import type { CanvasPosition, Todo } from "../types";
import {
  CANVAS_CARD_WIDTH,
  CANVAS_GAP,
  CANVAS_ORIGIN,
  estimateCanvasCardHeight,
  placeUnpositionedTodos,
  snapToCanvasGrid,
  sortByCanvasPosition,
  todosInsideCanvasRect,
  visibleChecklistRowCount,
} from "./canvasLayout";

const step = CANVAS_CARD_WIDTH + CANVAS_GAP;

describe("canvas layout", () => {
  it("lays out unplaced todos from the top-left across columns", () => {
    const todos = [makeTodo("a", "一"), makeTodo("b", "二"), makeTodo("c", "三")];
    const placements = placeUnpositionedTodos(todos, new Map(), 2);
    const height = estimateCanvasCardHeight(todos[0]);

    expect(placements).toEqual([
      { todoId: "a", x: CANVAS_ORIGIN, y: CANVAS_ORIGIN },
      { todoId: "b", x: CANVAS_ORIGIN + step, y: CANVAS_ORIGIN },
      { todoId: "c", x: CANVAS_ORIGIN, y: CANVAS_ORIGIN + height + CANVAS_GAP },
    ]);
  });

  it("keeps placed todos and stacks new ones below them in the same column", () => {
    const placed = makeTodo("placed", "已摆好");
    const fresh = makeTodo("fresh", "新录入");
    const positions = new Map<string, CanvasPosition>([
      ["placed", { todoId: "placed", x: CANVAS_ORIGIN, y: 200 }],
    ]);

    const placements = placeUnpositionedTodos([placed, fresh], positions, 1);

    expect(placements).toEqual([
      { todoId: "fresh", x: CANVAS_ORIGIN, y: 200 + estimateCanvasCardHeight(placed) + CANVAS_GAP },
    ]);
  });

  it("grows with the full text, shrinks on wider cards and honours a stretched height", () => {
    const short = estimateCanvasCardHeight(makeTodo("short", "短"));
    const longTodo = makeTodo("long", "很长".repeat(60));
    const long = estimateCanvasCardHeight(longTodo);
    const wide = estimateCanvasCardHeight(longTodo, { todoId: "long", x: 0, y: 0, width: 480 });
    const withChecklist = estimateCanvasCardHeight(makeTodo("list", "主句\n- [ ] 子项一\n- [x] 子项二"));
    const stretched = estimateCanvasCardHeight(makeTodo("tall", "短"), {
      todoId: "tall",
      x: 0,
      y: 0,
      height: 200,
    });

    expect(long - short).toBeGreaterThan(3 * 18);
    expect(wide).toBeLessThan(long);
    expect(withChecklist).toBe(short);
    expect(stretched).toBe(200);
  });

  it("shows as many subtasks as fit below the text of a stretched card", () => {
    const todo = makeTodo("list", "主句\n- [ ] 子项一\n- [x] 子项二");
    const at = (height: number | null) => ({ todoId: "list", x: 0, y: 0, height });

    expect(visibleChecklistRowCount(todo)).toBe(0);
    expect(visibleChecklistRowCount(todo, at(null))).toBe(0);
    expect(visibleChecklistRowCount(todo, at(51))).toBe(0);
    expect(visibleChecklistRowCount(todo, at(52))).toBe(1);
    expect(visibleChecklistRowCount(todo, at(72))).toBe(2);
  });

  it("orders todos by row, then column", () => {
    const todos = [makeTodo("right", "右"), makeTodo("left", "左"), makeTodo("below", "下")];
    const positions = new Map<string, CanvasPosition>([
      ["right", { todoId: "right", x: 300, y: 24 }],
      ["left", { todoId: "left", x: 24, y: 24 }],
      ["below", { todoId: "below", x: 24, y: 200 }],
    ]);

    expect(sortByCanvasPosition(todos, positions).map((todo) => todo.id)).toEqual(["left", "right", "below"]);
    expect(snapToCanvasGrid(13.9)).toBe(12);
    expect(snapToCanvasGrid(-5)).toBe(-4);
    expect(snapToCanvasGrid(-1)).toBe(0);
  });

  it("selects only cards that lie fully inside the marquee", () => {
    const todos = [makeTodo("inside", "一"), makeTodo("partial", "二"), makeTodo("tall", "三")];
    const positions = new Map<string, CanvasPosition>([
      ["inside", { todoId: "inside", x: 24, y: 24 }],
      ["partial", { todoId: "partial", x: 200, y: 24 }],
      ["tall", { todoId: "tall", x: 24, y: 100 }],
    ]);
    const rect = { minX: 0, minY: 0, maxX: 300, maxY: 200 };

    expect(todosInsideCanvasRect(todos, positions, rect)).toEqual(["inside", "tall"]);
    // 量到的实际高度伸出了框，就不算在框里
    expect(todosInsideCanvasRect(todos, positions, rect, new Map([["tall", 120]]))).toEqual(["inside"]);
  });
});

function makeTodo(id: string, detail: string): Todo {
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
