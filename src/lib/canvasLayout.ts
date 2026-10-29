import { parseChecklistLine } from "./checklist";
import type { CanvasPosition, Todo } from "../types";

export const CANVAS_CARD_WIDTH = 240;
export const CANVAS_GAP = 12;
export const CANVAS_ORIGIN = 24;

export const CANVAS_MIN_CARD_WIDTH = 160;
export const CANVAS_MIN_CARD_HEIGHT = 32;

const LINE_HEIGHT = 18;
const CARD_CHROME_HEIGHT = 14;
// 卡片左右内边距和边框约 18px，13px 字号下每个汉字约 13px 宽
const HORIZONTAL_PADDING = 18;
const CHAR_WIDTH = 13;

export function canvasCardWidth(position?: CanvasPosition): number {
  return position?.width ?? CANVAS_CARD_WIDTH;
}

/** 估算收起状态下卡片的高度：正文全部显示，子项不显示；用户拉高过时取较大值。 */
export function estimateCanvasCardHeight(todo: Todo, position?: CanvasPosition): number {
  const capacity = Math.max(4, (canvasCardWidth(position) - HORIZONTAL_PADDING) / CHAR_WIDTH);
  const textLines = todo.detail.split("\n").filter((line) => line.trim() && !parseChecklistLine(line));
  const lineCount = textLines.reduce((total, line) => total + Math.max(1, Math.ceil(textWeight(line) / capacity)), 0);
  const contentHeight = CARD_CHROME_HEIGHT + Math.max(1, lineCount) * LINE_HEIGHT;
  return Math.max(contentHeight, position?.height ?? 0);
}

// 子项行：14px 勾选框 + 8px 间距，行高 18px，行间距 2px
const CHECKLIST_INDENT = 22;
const CHECKLIST_ROW_MIN_HEIGHT = 18;
const CHECKLIST_ROW_GAP = 2;

/**
 * 卡片被拉高后，正文下方剩余空间按顺序放得下几条子项；这些子项默认显示，其余悬停时再展开。
 * 没有拉伸过高度的卡片返回 0。
 */
export function visibleChecklistRowCount(todo: Todo, position?: CanvasPosition): number {
  if (!position?.height) {
    return 0;
  }
  const contentHeight = estimateCanvasCardHeight(todo, { ...position, height: null });
  let remaining = position.height - contentHeight;
  const capacity = Math.max(
    4,
    (canvasCardWidth(position) - HORIZONTAL_PADDING - CHECKLIST_INDENT) / CHAR_WIDTH,
  );
  let count = 0;
  for (const line of todo.detail.split("\n")) {
    const checklist = parseChecklistLine(line);
    if (!checklist) {
      continue;
    }
    const lines = Math.max(1, Math.ceil(textWeight(checklist.text) / capacity));
    const rowHeight = Math.max(CHECKLIST_ROW_MIN_HEIGHT, lines * LINE_HEIGHT) + CHECKLIST_ROW_GAP;
    if (rowHeight > remaining) {
      break;
    }
    remaining -= rowHeight;
    count += 1;
  }
  return count;
}

/**
 * 给还没有位置的 Todo 从左上角开始排位置：按列堆叠，每次放进当前最短的一列，
 * 已摆好的卡片所在的列会把新卡片推到它下面，避免互相覆盖。
 */
export function placeUnpositionedTodos(
  todos: Todo[],
  positions: Map<string, CanvasPosition>,
  columns: number,
): CanvasPosition[] {
  const columnCount = Math.max(1, Math.floor(columns));
  const step = CANVAS_CARD_WIDTH + CANVAS_GAP;
  const columnBottoms = Array.from({ length: columnCount }, () => CANVAS_ORIGIN);

  for (const todo of todos) {
    const position = positions.get(todo.id);
    if (!position) {
      continue;
    }
    const bottom = position.y + estimateCanvasCardHeight(todo, position) + CANVAS_GAP;
    const width = canvasCardWidth(position);
    for (let column = 0; column < columnCount; column += 1) {
      const left = CANVAS_ORIGIN + column * step;
      if (position.x < left + CANVAS_CARD_WIDTH && position.x + width > left) {
        columnBottoms[column] = Math.max(columnBottoms[column], bottom);
      }
    }
  }

  const placements: CanvasPosition[] = [];
  for (const todo of todos) {
    if (positions.has(todo.id)) {
      continue;
    }
    let column = 0;
    for (let index = 1; index < columnCount; index += 1) {
      if (columnBottoms[index] < columnBottoms[column]) {
        column = index;
      }
    }
    placements.push({ todoId: todo.id, x: CANVAS_ORIGIN + column * step, y: columnBottoms[column] });
    columnBottoms[column] += estimateCanvasCardHeight(todo) + CANVAS_GAP;
  }
  return placements;
}

/** 画布里的键盘上下顺序：先按行（y），同一行再按列（x）。 */
export function sortByCanvasPosition(todos: Todo[], positions: Map<string, CanvasPosition>): Todo[] {
  return [...todos].sort((left, right) => {
    const a = positions.get(left.id);
    const b = positions.get(right.id);
    if (!a || !b) {
      return a ? -1 : b ? 1 : 0;
    }
    return a.y - b.y || a.x - b.x;
  });
}

/** 框选矩形（世界坐标），左上角到右下角。 */
export interface CanvasRect {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * 完全落在框选矩形里的卡片。高度优先用屏幕上量到的（悬停展开、拉伸过的卡片都准），
 * 量不到时按估算高度算。
 */
export function todosInsideCanvasRect(
  todos: Todo[],
  positions: Map<string, CanvasPosition>,
  rect: CanvasRect,
  measuredHeights: Map<string, number> = new Map(),
): string[] {
  return todos
    .filter((todo) => {
      const position = positions.get(todo.id);
      if (!position) {
        return false;
      }
      const measured = measuredHeights.get(todo.id);
      const height = measured && measured > 0 ? measured : estimateCanvasCardHeight(todo, position);
      return (
        position.x >= rect.minX &&
        position.y >= rect.minY &&
        position.x + canvasCardWidth(position) <= rect.maxX &&
        position.y + height <= rect.maxY
      );
    })
    .map((todo) => todo.id);
}

// 画布没有边界，坐标可以是负数；加 0 把 -0 归成 0
export function snapToCanvasGrid(value: number): number {
  return Math.round(value / 4) * 4 + 0;
}

function textWeight(line: string): number {
  let weight = 0;
  for (const char of line) {
    weight += char.charCodeAt(0) > 0x2e80 ? 1 : 0.55;
  }
  return weight;
}
