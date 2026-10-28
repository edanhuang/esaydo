import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { ChevronRight, Minus, Plus } from "lucide-react";
import {
  CANVAS_CARD_WIDTH,
  CANVAS_GAP,
  CANVAS_MIN_CARD_HEIGHT,
  CANVAS_MIN_CARD_WIDTH,
  CANVAS_ORIGIN,
  canvasCardWidth,
  estimateCanvasCardHeight,
  visibleChecklistRowCount,
  placeUnpositionedTodos,
  snapToCanvasGrid,
} from "@/lib/canvasLayout";
import {
  CANVAS_MAX_ZOOM,
  CANVAS_MIN_ZOOM,
  clampCamera,
  zoomCameraAt,
  type CanvasBounds,
  type CanvasCamera,
} from "@/lib/canvasCamera";
import { BotAvatar, UnreadBadge } from "@/components/bots/BotAvatar";
import { useBotActivity } from "@/components/bots/BotActivity";
import { fmtPoint, logCanvas, shortId } from "@/lib/canvasLog";
import { cn } from "@/lib/utils";
import type { CanvasPosition, Todo, TodoPriority } from "../../types";
import { TodoCard } from "./TodoCard";

const DRAG_THRESHOLD = 4;
const GRID_STEP = 20;
// 触控板捏合一次的滚动量很小，按指数换算成缩放倍数；鼠标 Ctrl+滚轮一格量很大，先截断
const PINCH_ZOOM_SPEED = 0.01;
const PINCH_DELTA_LIMIT = 50;
const GRID_VARIABLES = ["--dot-grid-size", "--dot-grid-x", "--dot-grid-y"];

// WebKit 的触控板捏合手势事件，标准 DOM 类型里没有
interface WebKitGestureEvent extends UIEvent {
  scale: number;
  clientX: number;
  clientY: number;
}

interface BoardCanvasProps {
  todos: Todo[];
  suspendedTodos: Todo[];
  positions: Map<string, CanvasPosition>;
  positionsReady: boolean;
  selectedTodoId: string | null;
  editingTodoId: string | null;
  editingDetail: string;
  editingError: string | null;
  onSelectTodo: (id: string) => void;
  onStartEditingTodo: (id: string) => void;
  onChangeEditingDetail: (value: string) => void;
  onSaveEditingTodo: () => void;
  onBlurEditingTodo: () => void;
  onCancelEditingTodo: () => void;
  onToggleTodoChecklistLine: (id: string, lineIndex: number) => void;
  onCompleteTodo: (id: string) => void;
  onReopenTodo: (id: string) => void;
  onArchiveTodo: (id: string) => void;
  onSetTodoPriority: (id: string, priority: TodoPriority) => void;
  onSetTodoSuspended: (id: string, suspended: boolean) => void;
  onPlaceTodos: (positions: CanvasPosition[]) => void;
  /** 双击空白处写好的新卡片：内容非空时在该位置新建 Todo */
  onCreateTodoAt: (detail: string, x: number, y: number) => void;
  /** 已挂起不在画布里看：切回列表并展开已挂起区 */
  onShowSuspended: () => void;
}

type ResizeDirection = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

const RESIZE_HANDLES: Array<{ direction: ResizeDirection; className: string }> = [
  { direction: "n", className: "left-2 right-2 top-0 h-2 -translate-y-1/2 cursor-ns-resize" },
  { direction: "s", className: "bottom-0 left-2 right-2 h-2 translate-y-1/2 cursor-ns-resize" },
  { direction: "e", className: "bottom-2 right-0 top-2 w-2 translate-x-1/2 cursor-ew-resize" },
  { direction: "w", className: "bottom-2 left-0 top-2 w-2 -translate-x-1/2 cursor-ew-resize" },
  { direction: "ne", className: "right-0 top-0 size-3 -translate-y-1/2 translate-x-1/2 cursor-nesw-resize" },
  { direction: "nw", className: "left-0 top-0 size-3 -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize" },
  { direction: "se", className: "bottom-0 right-0 size-3 translate-x-1/2 translate-y-1/2 cursor-nwse-resize" },
  { direction: "sw", className: "bottom-0 left-0 size-3 -translate-x-1/2 translate-y-1/2 cursor-nesw-resize" },
];

interface CardRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

// startX、startY 都是按下时指针所在的世界坐标，拖动中途平移或缩放画布也不会错位
interface ResizeState {
  todoId: string;
  direction: ResizeDirection;
  pointerId: number;
  startX: number;
  startY: number;
  origin: CardRect;
}

interface DragState {
  todoId: string;
  pointerId: number;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
  moved: boolean;
  // 卡片当前所在的世界坐标，只给排查日志用
  lastX: number;
  lastY: number;
}

export function BoardCanvas({
  todos,
  suspendedTodos,
  positions,
  positionsReady,
  selectedTodoId,
  editingTodoId,
  editingDetail,
  editingError,
  onSelectTodo,
  onStartEditingTodo,
  onChangeEditingDetail,
  onSaveEditingTodo,
  onBlurEditingTodo,
  onCancelEditingTodo,
  onToggleTodoChecklistLine,
  onCompleteTodo,
  onReopenTodo,
  onArchiveTodo,
  onSetTodoPriority,
  onSetTodoSuspended,
  onPlaceTodos,
  onCreateTodoAt,
  onShowSuspended,
}: BoardCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  // 拖动被中途作废后，记下来看随后的松手落在哪里
  const abortedDragRef = useRef<string | null>(null);
  const [dragOffset, setDragOffset] = useState<{ todoId: string; x: number; y: number } | null>(null);
  const resizeRef = useRef<ResizeState | null>(null);
  const [liveRect, setLiveRect] = useState<(CardRect & { todoId: string }) | null>(null);
  // 平移每帧都在变，直接改 DOM 不走 React 渲染；zoom 单独存一份给按钮和比例显示用
  const cameraRef = useRef<CanvasCamera>({ x: 0, y: 0, zoom: 1 });
  const [zoom, setZoom] = useState(1);
  const [draft, setDraft] = useState<{ x: number; y: number } | null>(null);

  // 还没有位置的 Todo 从左上角开始自动排开，并立即保存，之后位置固定
  useLayoutEffect(() => {
    if (!positionsReady || todos.every((todo) => positions.has(todo.id))) {
      return;
    }
    const width = viewportRef.current?.clientWidth ?? 0;
    const columns = width > 0 ? Math.floor((width / zoom - CANVAS_ORIGIN) / (CANVAS_CARD_WIDTH + CANVAS_GAP)) : 4;
    const placements = placeUnpositionedTodos(todos, positions, columns);
    if (placements.length > 0) {
      onPlaceTodos(placements);
    }
  }, [todos, positions, positionsReady, zoom, onPlaceTodos]);

  // 所有卡片（含正在写的草稿）的外接矩形，平移不能离它太远
  const bounds = useMemo<CanvasBounds | null>(() => {
    const rects: CardRect[] = [];
    for (const todo of todos) {
      const position = positions.get(todo.id);
      if (position) {
        rects.push({
          x: position.x,
          y: position.y,
          width: canvasCardWidth(position),
          height: estimateCanvasCardHeight(todo, position),
        });
      }
    }
    if (draft) {
      rects.push({ x: draft.x, y: draft.y, width: CANVAS_CARD_WIDTH, height: CANVAS_MIN_CARD_HEIGHT });
    }
    if (rects.length === 0) {
      return null;
    }
    return {
      minX: Math.min(...rects.map((rect) => rect.x)),
      minY: Math.min(...rects.map((rect) => rect.y)),
      maxX: Math.max(...rects.map((rect) => rect.x + rect.width)),
      maxY: Math.max(...rects.map((rect) => rect.y + rect.height)),
    };
  }, [todos, positions, draft]);
  const boundsRef = useRef(bounds);
  boundsRef.current = bounds;

  // 卡片层按相机平移缩放；点阵背景（含输入框那一条）跟着一起动
  const applyCamera = useCallback(() => {
    const camera = cameraRef.current;
    if (worldRef.current) {
      worldRef.current.style.transform = `scale(${camera.zoom}) translate(${-camera.x}px, ${-camera.y}px)`;
    }
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }
    const rect = viewport.getBoundingClientRect();
    // 缩得很小时点阵太密，间距翻倍
    let step = GRID_STEP * camera.zoom;
    while (step < GRID_STEP / 2) {
      step *= 2;
    }
    const root = document.documentElement.style;
    root.setProperty("--dot-grid-size", `${step}px`);
    root.setProperty("--dot-grid-x", `${rect.left - camera.x * camera.zoom}px`);
    root.setProperty("--dot-grid-y", `${rect.top - camera.y * camera.zoom}px`);
  }, []);

  const setCamera = useCallback(
    (next: CanvasCamera) => {
      const viewport = viewportRef.current;
      const camera = clampCamera(next, boundsRef.current, viewport?.clientWidth ?? 0, viewport?.clientHeight ?? 0);
      cameraRef.current = camera;
      applyCamera();
      setZoom(camera.zoom);
    },
    [applyCamera],
  );

  /** 视口里的屏幕坐标换成世界坐标 */
  function toWorld(clientX: number, clientY: number) {
    const rect = viewportRef.current?.getBoundingClientRect();
    const camera = cameraRef.current;
    return {
      x: camera.x + (clientX - (rect?.left ?? 0)) / camera.zoom,
      y: camera.y + (clientY - (rect?.top ?? 0)) / camera.zoom,
    };
  }

  // 每次渲染后卡片层可能是新挂上的，重新套一次相机
  useLayoutEffect(() => {
    applyCamera();
  });

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || typeof ResizeObserver === "undefined") {
      return;
    }
    // 窗口缩放、侧栏展开收起都会挪动视口，点阵的锚点要跟着重算
    const observer = new ResizeObserver(() => applyCamera());
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [applyCamera]);

  useEffect(
    () => () => {
      for (const name of GRID_VARIABLES) {
        document.documentElement.style.removeProperty(name);
      }
    },
    [],
  );

  // 两指滑动平移，捏合缩放；WebKit 捏合发 gesture 事件，Chromium 发按住 Ctrl 的滚轮事件，两种都接
  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }
    let gestureStartZoom: number | null = null;

    function anchorOf(clientX: number, clientY: number) {
      const rect = viewportRef.current?.getBoundingClientRect();
      return { x: clientX - (rect?.left ?? 0), y: clientY - (rect?.top ?? 0) };
    }

    function handleWheel(event: WheelEvent) {
      event.preventDefault();
      const camera = cameraRef.current;
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? container!.clientHeight : 1;
      if (event.ctrlKey) {
        if (gestureStartZoom !== null) {
          return;
        }
        const delta = Math.max(-PINCH_DELTA_LIMIT, Math.min(PINCH_DELTA_LIMIT, event.deltaY * unit));
        const anchor = anchorOf(event.clientX, event.clientY);
        setCamera(zoomCameraAt(camera, camera.zoom * Math.exp(-delta * PINCH_ZOOM_SPEED), anchor.x, anchor.y));
        return;
      }
      let dx = event.deltaX * unit;
      let dy = event.deltaY * unit;
      // 普通鼠标按住 Shift 滚动横向移动
      if (event.shiftKey && dx === 0) {
        dx = dy;
        dy = 0;
      }
      setCamera({ ...camera, x: camera.x + dx / camera.zoom, y: camera.y + dy / camera.zoom });
    }

    function handleGestureStart(event: Event) {
      event.preventDefault();
      gestureStartZoom = cameraRef.current.zoom;
    }

    function handleGestureChange(event: Event) {
      event.preventDefault();
      const gesture = event as WebKitGestureEvent;
      if (gestureStartZoom === null) {
        return;
      }
      const anchor = anchorOf(gesture.clientX, gesture.clientY);
      setCamera(zoomCameraAt(cameraRef.current, gestureStartZoom * gesture.scale, anchor.x, anchor.y));
    }

    function handleGestureEnd(event: Event) {
      event.preventDefault();
      gestureStartZoom = null;
    }

    container.addEventListener("wheel", handleWheel, { passive: false });
    container.addEventListener("gesturestart", handleGestureStart);
    container.addEventListener("gesturechange", handleGestureChange);
    container.addEventListener("gestureend", handleGestureEnd);
    return () => {
      container.removeEventListener("wheel", handleWheel);
      container.removeEventListener("gesturestart", handleGestureStart);
      container.removeEventListener("gesturechange", handleGestureChange);
      container.removeEventListener("gestureend", handleGestureEnd);
    };
  }, [setCamera]);

  // 双击画布空白处，在双击位置放一张空白卡片直接输入
  function handleViewportDoubleClick(event: ReactMouseEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest("[data-canvas-item], [data-canvas-draft]")) {
      return;
    }
    const point = toWorld(event.clientX, event.clientY);
    // 让光标落在卡片左上角附近，而不是卡片外
    setDraft({ x: snapToCanvasGrid(point.x - 12), y: snapToCanvasGrid(point.y - 12) });
  }

  function commitDraft(value: string) {
    const current = draft;
    setDraft(null);
    const detail = value.trim();
    if (current && detail) {
      onCreateTodoAt(detail, current.x, current.y);
    }
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>, todo: Todo) {
    if (event.button !== 0 || editingTodoId === todo.id) {
      return;
    }
    const target = event.target as HTMLElement;
    if (target.closest("button, textarea, input, a, [data-checklist-line], [data-resize-handle]")) {
      return;
    }
    const position = positions.get(todo.id);
    if (!position) {
      return;
    }
    const start = toWorld(event.clientX, event.clientY);
    dragRef.current = {
      todoId: todo.id,
      pointerId: event.pointerId,
      startX: start.x,
      startY: start.y,
      originX: position.x,
      originY: position.y,
      moved: false,
      lastX: position.x,
      lastY: position.y,
    };
    abortedDragRef.current = null;
    logCanvas(
      `drag down todo=${shortId(todo.id)} pointer=${event.pointerType}#${event.pointerId} buttons=${event.buttons} client=${fmtPoint(event.clientX, event.clientY)} origin=${fmtPoint(position.x, position.y)} zoom=${cameraRef.current.zoom.toFixed(2)}`,
    );
    // 不在按下时捕获指针：捕获后单击/双击都会落到外层容器，卡片自己的双击编辑就收不到了
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    if (event.buttons === 0 && drag.moved) {
      // WebKit 松手时会先补一个按键为 0 的移动事件，紧接着才是 pointerup；
      // 已经起拖的卡片捕获了指针，pointerup 一定会到，这里只忽略这次移动，等松手再保存
      logCanvas(
        `drag move-buttons0-ignored todo=${shortId(drag.todoId)} pointer=${event.pointerType}#${event.pointerId} client=${fmtPoint(event.clientX, event.clientY)}`,
      );
      return;
    }
    // 还没起拖时没捕获指针，在卡片外松开鼠标收不到 pointerup，这里兜底清掉
    if (event.buttons === 0) {
      logCanvas(
        `drag abort reason=buttons0 todo=${shortId(drag.todoId)} pointer=${event.pointerType}#${event.pointerId} moved=${drag.moved} client=${fmtPoint(event.clientX, event.clientY)} at=${fmtPoint(drag.lastX, drag.lastY)} origin=${fmtPoint(drag.originX, drag.originY)}`,
      );
      abortedDragRef.current = drag.todoId;
      dragRef.current = null;
      setDragOffset(null);
      return;
    }
    const point = toWorld(event.clientX, event.clientY);
    const dx = point.x - drag.startX;
    const dy = point.y - drag.startY;
    if (!drag.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) {
      return;
    }
    if (!drag.moved) {
      // 真正开始拖动后再捕获，拖出卡片范围也能继续跟手
      event.currentTarget.setPointerCapture?.(event.pointerId);
      const captured = event.currentTarget.hasPointerCapture?.(event.pointerId) ?? false;
      const sameCard = event.currentTarget.dataset.canvasItem === drag.todoId;
      logCanvas(
        `drag start todo=${shortId(drag.todoId)} pointer=${event.pointerType}#${event.pointerId} buttons=${event.buttons} captured=${captured} sameCard=${sameCard} client=${fmtPoint(event.clientX, event.clientY)}`,
      );
    }
    drag.moved = true;
    drag.lastX = drag.originX + dx;
    drag.lastY = drag.originY + dy;
    setDragOffset({ todoId: drag.todoId, x: drag.lastX, y: drag.lastY });
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      if (abortedDragRef.current) {
        logCanvas(
          `drag up-after-abort todo=${shortId(abortedDragRef.current)} pointer=${event.pointerType}#${event.pointerId} client=${fmtPoint(event.clientX, event.clientY)}`,
        );
        abortedDragRef.current = null;
      }
      return;
    }
    dragRef.current = null;
    setDragOffset(null);
    if (!drag.moved) {
      return;
    }
    const point = toWorld(event.clientX, event.clientY);
    const x = snapToCanvasGrid(drag.originX + point.x - drag.startX);
    const y = snapToCanvasGrid(drag.originY + point.y - drag.startY);
    logCanvas(
      `drag drop todo=${shortId(drag.todoId)} pointer=${event.pointerType}#${event.pointerId} client=${fmtPoint(event.clientX, event.clientY)} from=${fmtPoint(drag.originX, drag.originY)} to=${fmtPoint(x, y)}`,
    );
    const position = positions.get(drag.todoId);
    // 移动时保留拉伸过的宽高
    onPlaceTodos([
      { todoId: drag.todoId, x, y, width: position?.width ?? null, height: position?.height ?? null },
    ]);
    onSelectTodo(drag.todoId);
  }

  function handleResizeStart(event: ReactPointerEvent<HTMLDivElement>, todo: Todo, direction: ResizeDirection) {
    if (event.button !== 0) {
      return;
    }
    event.stopPropagation();
    const position = positions.get(todo.id);
    const card = event.currentTarget.parentElement;
    if (!position || !card) {
      return;
    }
    const start = toWorld(event.clientX, event.clientY);
    resizeRef.current = {
      todoId: todo.id,
      direction,
      pointerId: event.pointerId,
      startX: start.x,
      startY: start.y,
      origin: {
        x: position.x,
        y: position.y,
        width: canvasCardWidth(position),
        height: position.height ?? card.getBoundingClientRect().height / cameraRef.current.zoom,
      },
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function resizedRect(resize: ResizeState, clientX: number, clientY: number): CardRect {
    const point = toWorld(clientX, clientY);
    const dx = point.x - resize.startX;
    const dy = point.y - resize.startY;
    const { origin, direction } = resize;
    const rect = { ...origin };
    if (direction.includes("e")) {
      rect.width = Math.max(CANVAS_MIN_CARD_WIDTH, origin.width + dx);
    }
    if (direction.includes("w")) {
      rect.width = Math.max(CANVAS_MIN_CARD_WIDTH, origin.width - dx);
      rect.x = origin.x + origin.width - rect.width;
    }
    if (direction.includes("s")) {
      rect.height = Math.max(CANVAS_MIN_CARD_HEIGHT, origin.height + dy);
    }
    if (direction.includes("n")) {
      rect.height = Math.max(CANVAS_MIN_CARD_HEIGHT, origin.height - dy);
      rect.y = origin.y + origin.height - rect.height;
    }
    return rect;
  }

  function handleResizeMove(event: ReactPointerEvent<HTMLDivElement>) {
    const resize = resizeRef.current;
    if (!resize || resize.pointerId !== event.pointerId) {
      return;
    }
    event.stopPropagation();
    setLiveRect({ todoId: resize.todoId, ...resizedRect(resize, event.clientX, event.clientY) });
  }

  function handleResizeEnd(event: ReactPointerEvent<HTMLDivElement>) {
    const resize = resizeRef.current;
    if (!resize || resize.pointerId !== event.pointerId) {
      return;
    }
    event.stopPropagation();
    resizeRef.current = null;
    setLiveRect(null);
    const rect = resizedRect(resize, event.clientX, event.clientY);
    const position = positions.get(resize.todoId);
    const horizontal = resize.direction.includes("e") || resize.direction.includes("w");
    const vertical = resize.direction.includes("n") || resize.direction.includes("s");
    onPlaceTodos([
      {
        todoId: resize.todoId,
        x: snapToCanvasGrid(rect.x),
        y: snapToCanvasGrid(rect.y),
        width: horizontal ? snapToCanvasGrid(rect.width) : (position?.width ?? null),
        height: vertical ? snapToCanvasGrid(rect.height) : (position?.height ?? null),
      },
    ]);
    onSelectTodo(resize.todoId);
  }

  // 按钮以视口中心缩放；捏合后的零碎比例先对齐到整 10%
  function zoomFromCenter(nextZoom: number) {
    const viewport = viewportRef.current;
    setCamera(
      zoomCameraAt(cameraRef.current, nextZoom, (viewport?.clientWidth ?? 0) / 2, (viewport?.clientHeight ?? 0) / 2),
    );
  }

  function changeZoom(delta: number) {
    zoomFromCenter(Math.round((cameraRef.current.zoom + delta) * 10) / 10);
  }

  function cardProps(todo: Todo) {
    return {
      todo,
      selected: todo.id === selectedTodoId,
      editing: todo.id === editingTodoId,
      editingValue: editingDetail,
      editingError: todo.id === editingTodoId ? editingError : null,
      onSortableNode: () => undefined,
      onSelect: () => onSelectTodo(todo.id),
      onStartEditing: () => onStartEditingTodo(todo.id),
      onChangeEditingValue: onChangeEditingDetail,
      onSaveEditing: onSaveEditingTodo,
      onBlurEditing: onBlurEditingTodo,
      onCancelEditing: onCancelEditingTodo,
      onToggleChecklistLine: (lineIndex: number) => onToggleTodoChecklistLine(todo.id, lineIndex),
      onComplete: () => onCompleteTodo(todo.id),
      onReopen: () => onReopenTodo(todo.id),
      onArchive: () => onArchiveTodo(todo.id),
      onSetPriority: (priority: TodoPriority) => onSetTodoPriority(todo.id, priority),
      onSetSuspended: (suspended: boolean) => onSetTodoSuspended(todo.id, suspended),
    };
  }

  return (
    <div ref={containerRef} data-board-canvas className="relative min-h-0 flex-1 overflow-clip">
      {/* overflow-clip 不是滚动容器：聚焦输入框时浏览器没法偷偷滚动它，坐标只由相机决定 */}
      <div ref={viewportRef} className="absolute inset-0 overflow-clip" onDoubleClick={handleViewportDoubleClick}>
        {todos.length === 0 && !draft ? (
          <div className="grid h-full select-none place-items-center text-sm text-easydo-textMuted">
            当前 View 没有 Todo，双击空白处新建
          </div>
        ) : (
          <>
            <div ref={worldRef} className="absolute left-0 top-0 origin-top-left">
              {todos.map((todo) => {
                const position = positions.get(todo.id);
                if (!position) {
                  return null;
                }
                const dragging = dragOffset?.todoId === todo.id;
                const resizing = liveRect?.todoId === todo.id ? liveRect : null;
                const x = resizing ? resizing.x : dragging ? dragOffset.x : position.x;
                const y = resizing ? resizing.y : dragging ? dragOffset.y : position.y;
                const width = resizing ? resizing.width : canvasCardWidth(position);
                const minHeight = resizing ? resizing.height : (position.height ?? undefined);
                const selected = todo.id === selectedTodoId;
                return (
                  <div
                    key={todo.id}
                    data-canvas-item={todo.id}
                    className={cn(
                      "group/canvas-item absolute left-0 top-0 flex touch-none flex-col",
                      // 编辑中的卡片会撑高展示全部内容，放到最上层免得被别的卡片盖住
                      dragging || resizing || editingTodoId === todo.id
                        ? "z-30"
                        : selected
                          ? "z-20"
                          : "z-10 hover:z-20",
                      dragging && "cursor-grabbing",
                    )}
                    style={{ width, minHeight, transform: `translate(${x}px, ${y}px)` }}
                    onPointerDown={(event) => handlePointerDown(event, todo)}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onPointerCancel={(event) => {
                      const drag = dragRef.current;
                      if (drag) {
                        logCanvas(
                          `drag abort reason=pointercancel todo=${shortId(drag.todoId)} pointer=${event.pointerType}#${event.pointerId} moved=${drag.moved} at=${fmtPoint(drag.lastX, drag.lastY)} origin=${fmtPoint(drag.originX, drag.originY)}`,
                        );
                        abortedDragRef.current = drag.todoId;
                      }
                      dragRef.current = null;
                      setDragOffset(null);
                    }}
                    onLostPointerCapture={(event) => {
                      const drag = dragRef.current;
                      // 正常松手时 dragRef 已经清掉；还在拖却丢了捕获，说明被别的东西打断了
                      if (drag?.moved && drag.pointerId === event.pointerId) {
                        logCanvas(
                          `drag lost-capture todo=${shortId(drag.todoId)} pointer=${event.pointerType}#${event.pointerId} at=${fmtPoint(drag.lastX, drag.lastY)}`,
                        );
                      }
                    }}
                  >
                    <CanvasBotTag todoId={todo.id} />
                    <span
                      data-canvas-groups
                      className="pointer-events-none absolute bottom-full right-0 mb-1 max-w-full truncate rounded-[3px] bg-easydo-surfaceActive px-1.5 text-[11px] leading-[18px] text-easydo-textSecondary opacity-0 transition-opacity duration-150 group-hover/canvas-item:opacity-100"
                    >
                      {todo.groups.map((group) => group.name).join("、")}
                    </span>
                    <TodoCard
                      {...cardProps(todo)}
                      variant="canvas"
                      visibleChecklistRows={visibleChecklistRowCount(
                        todo,
                        resizing ? { ...position, width: resizing.width, height: resizing.height } : position,
                      )}
                      dragging={dragging || Boolean(resizing)}
                    />
                    {editingTodoId === todo.id
                      ? null
                      : RESIZE_HANDLES.map((handle) => (
                          <div
                            key={handle.direction}
                            data-resize-handle={handle.direction}
                            className={cn("absolute z-10", handle.className)}
                            onPointerDown={(event) => handleResizeStart(event, todo, handle.direction)}
                            onPointerMove={handleResizeMove}
                            onPointerUp={handleResizeEnd}
                            onPointerCancel={() => {
                              const resize = resizeRef.current;
                              if (resize) {
                                logCanvas(`resize abort reason=pointercancel todo=${shortId(resize.todoId)} direction=${resize.direction}`);
                              }
                              resizeRef.current = null;
                              setLiveRect(null);
                            }}
                          />
                        ))}
                  </div>
                );
              })}
              {draft ? <CanvasDraftCard x={draft.x} y={draft.y} onCommit={commitDraft} onCancel={() => setDraft(null)} /> : null}
            </div>
          </>
        )}
      </div>

      {/* 已挂起和缩放是两个独立的辅助控件：各自悬停才显出来 */}
      <div className="absolute bottom-2 right-3 z-40 flex items-center gap-3 text-xs">
        {suspendedTodos.length > 0 ? (
          <button
            type="button"
            title="在列表中查看已挂起"
            className="flex h-6 items-center gap-0.5 rounded px-1 text-easydo-textMuted opacity-60 transition duration-150 hover:text-easydo-cream hover:opacity-100 focus-visible:opacity-100"
            onClick={onShowSuspended}
          >
            <ChevronRight className="size-3.5" />
            已挂起 {suspendedTodos.length}
          </button>
        ) : null}
        <div className="flex items-center text-easydo-textMuted opacity-60 transition duration-150 hover:text-easydo-textSecondary hover:opacity-100 focus-within:opacity-100">
          <button
            type="button"
            title="缩小"
            className="grid size-6 place-items-center rounded hover:text-easydo-cream disabled:opacity-40"
            disabled={zoom <= CANVAS_MIN_ZOOM}
            onClick={() => changeZoom(-0.1)}
          >
            <Minus className="size-3.5" />
          </button>
          <button
            type="button"
            title="恢复 100%"
            className="h-6 w-10 rounded text-center tabular-nums hover:text-easydo-cream"
            onClick={() => zoomFromCenter(1)}
          >
            {Math.round(zoom * 100)}%
          </button>
          <button
            type="button"
            title="放大"
            className="grid size-6 place-items-center rounded hover:text-easydo-cream disabled:opacity-40"
            disabled={zoom >= CANVAS_MAX_ZOOM}
            onClick={() => changeZoom(0.1)}
          >
            <Plus className="size-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

/** 卡片外侧左上角：运行中的 Bot（头像 + 名字），再往右是未读信封；从左到右按优先级从小到大 */
function CanvasBotTag({ todoId }: { todoId: string }) {
  const { runningBotFor, unreadFor, openMessages } = useBotActivity();
  const bot = runningBotFor(todoId);
  const unread = unreadFor(todoId);
  if (!bot && !unread) {
    return null;
  }
  return (
    <span
      data-canvas-bot-tag
      className="pointer-events-none absolute bottom-full left-0 mb-1 flex max-w-full items-center gap-1.5 text-xs"
    >
      {bot ? (
        <span className="flex min-w-0 items-center gap-1" style={{ color: `hsl(var(--bot-${bot.color}))` }}>
          <BotAvatar color={bot.color} running />
          <span className="truncate">{bot.name}</span>
        </span>
      ) : null}
      {unread ? (
        <UnreadBadge
          className="pointer-events-auto"
          count={unread.count}
          onClick={() => openMessages({ todoId, botId: unread.botId })}
        />
      ) : null}
    </span>
  );
}

/** 双击空白处出现的新卡片：回车或失焦时保存，内容为空则直接丢弃，Esc 放弃 */
function CanvasDraftCard({
  x,
  y,
  onCommit,
  onCancel,
}: {
  x: number;
  y: number;
  onCommit: (value: string) => void;
  onCancel: () => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [value, setValue] = useState("");
  const doneRef = useRef(false);
  const isComposingRef = useRef(false);

  useLayoutEffect(() => {
    textareaRef.current?.focus({ preventScroll: true });
  }, []);

  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }
    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [value]);

  // 回车保存后卡片卸载还会触发一次失焦，只处理第一次
  function finish(action: () => void) {
    if (doneRef.current) {
      return;
    }
    doneRef.current = true;
    action();
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLTextAreaElement>) {
    if (isComposingRef.current || event.nativeEvent.isComposing || event.keyCode === 229) {
      return;
    }
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      finish(() => onCommit(value));
    } else if (event.key === "Escape") {
      event.preventDefault();
      finish(onCancel);
    }
  }

  return (
    <div
      data-canvas-draft
      className="absolute left-0 top-0 z-30 rounded-[4px] border border-easydo-border bg-[hsl(var(--easydo-surface)/0.82)] px-2 py-1.5"
      style={{ width: CANVAS_CARD_WIDTH, transform: `translate(${x}px, ${y}px)` }}
    >
      <textarea
        ref={textareaRef}
        aria-label="新建 Todo"
        rows={1}
        value={value}
        placeholder="要做点什么"
        className="block w-full resize-none overflow-hidden bg-transparent text-sm text-easydo-cream outline-none placeholder:font-light placeholder:text-[hsl(var(--easydo-text-muted)/0.55)]"
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={handleKeyDown}
        onCompositionStart={() => {
          isComposingRef.current = true;
        }}
        onCompositionEnd={() => {
          isComposingRef.current = false;
        }}
        onBlur={() => finish(() => onCommit(value))}
      />
    </div>
  );
}
