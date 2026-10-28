import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  archiveTodo,
  completeTodo,
  countInboxTodos,
  createTodo,
  deleteTodo,
  getBoardLayoutMode,
  getSelectedBoardViewId,
  listCanvasPositions,
  listBoardViews,
  listGroups,
  listTodos,
  moveTodoFromInbox,
  reopenTodo,
  reorderTodosInGroup,
  saveBoardLayoutMode,
  saveCanvasPositions,
  saveSelectedBoardViewId,
  setBoardViewGroupMembership,
  setTodoPriority,
  setTodoSuspended,
  updateTodoDetail,
} from "../lib/api";
import {
  defaultShortcutSettings,
  isTextEditingTarget,
  shortcutMatches,
} from "../lib/shortcuts";
import { toggleChecklistLineAtIndex } from "../lib/checklist";
import { sortByCanvasPosition } from "../lib/canvasLayout";
import { fmtPoint, logCanvas, shortId } from "../lib/canvasLog";
import type {
  AppView,
  BoardLayoutMode,
  BoardView,
  CanvasPosition,
  Group,
  ShortcutSettings,
  Todo,
  TodoPriority,
} from "../types";
import { BoardCanvas } from "../components/board/BoardCanvas";
import { GroupSection } from "../components/board/GroupSection";
import {
  BoardViewSwitcher,
  type BoardViewTransitionDirection,
} from "../components/board/BoardViewSwitcher";
import { TodoInput } from "../components/board/TodoInput";
import { AppSidebar, SidebarExpandButton } from "@/components/layout/AppSidebar";
import { useBotActivity } from "@/components/bots/BotActivity";
import { MessagesButton } from "@/components/bots/MessagesButton";
import { cn } from "@/lib/utils";

interface BoardPageProps {
  onNavigate: (view: AppView) => void;
  shortcutSettings?: ShortcutSettings;
  settingsOpen?: boolean;
  sidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
}

export function BoardPage({
  onNavigate,
  shortcutSettings = defaultShortcutSettings,
  settingsOpen = false,
  sidebarCollapsed = false,
  onToggleSidebar = () => undefined,
}: BoardPageProps) {
  const [groups, setGroups] = useState<Group[]>([]);
  const [boardViews, setBoardViews] = useState<BoardView[]>([]);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [inboxCount, setInboxCount] = useState(0);
  const [input, setInput] = useState("");
  const [currentGroupIndex, setCurrentGroupIndex] = useState(0);
  const [currentBoardViewIndex, setCurrentBoardViewIndex] = useState(0);
  const [boardViewTransitionDirection, setBoardViewTransitionDirection] =
    useState<BoardViewTransitionDirection>("right");
  const [boardViewTransitionKey, setBoardViewTransitionKey] = useState(0);
  const [selectedTodoId, setSelectedTodoId] = useState<string | null>(null);
  const selectedTodoIdRef = useRef<string | null>(null);
  const todoRequestIdRef = useRef(0);
  const windowFocusedRef = useRef(true);
  const [editingTodoId, setEditingTodoId] = useState<string | null>(null);
  const [editingDetail, setEditingDetail] = useState("");
  const [editingError, setEditingError] = useState<string | null>(null);
  const [lastCreatedTodoId, setLastCreatedTodoId] = useState<string | null>(null);
  const [dragState, setDragState] = useState<{
    groupId: string;
    draggedTodoId: string;
    targetTodoId: string | null;
    position: "before" | "after";
  } | null>(null);
  const [inboxDraggedTodoId, setInboxDraggedTodoId] = useState<string | null>(null);
  const [highlightSelection, setHighlightSelection] = useState(false);
  const [layoutMode, setLayoutMode] = useState<BoardLayoutMode>("list");
  const [canvasPositions, setCanvasPositions] = useState<Map<string, CanvasPosition>>(() => new Map());
  const [canvasPositionsViewId, setCanvasPositionsViewId] = useState<string | null>(null);
  const [expandedSuspendedGroupIds, setExpandedSuspendedGroupIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const inboxGroup = useMemo(
    () => groups.find((group) => group.systemKey === "inbox") ?? null,
    [groups],
  );
  const regularGroups = useMemo(
    () => groups.filter((group) => group.systemKey === null),
    [groups],
  );
  const regularBoardViews = useMemo(
    () => boardViews.filter((view) => view.systemKey !== "inbox"),
    [boardViews],
  );
  const currentGroup = regularGroups[currentGroupIndex] ?? null;
  const currentBoardView = boardViews[currentBoardViewIndex] ?? null;
  const isInboxView = currentBoardView?.systemKey === "inbox";
  const lastRegularBoardViewIdRef = useRef<string | null>(null);
  if (currentBoardView && !isInboxView) {
    lastRegularBoardViewIdRef.current = currentBoardView.id;
  }
  const regularBoardViewIndex = currentBoardView
    ? regularBoardViews.findIndex((view) => view.id === currentBoardView.id)
    : -1;
  const inboxDragSensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 4 },
    }),
  );

  const visibleTodos = useMemo(
    () => todos.filter((todo) => todo.status !== "archived"),
    [todos],
  );

  // 折叠中的挂起 Todo 不可见，不参与键盘选择与编辑
  const canvasMode = layoutMode === "canvas" && !isInboxView;
  const highlightedTodoId = highlightSelection ? selectedTodoId : null;
  const canvasTodos = useMemo(
    () => visibleTodos.filter((todo) => todo.suspendedAt === null),
    [visibleTodos],
  );
  const canvasSuspendedTodos = useMemo(
    () => visibleTodos.filter((todo) => todo.suspendedAt !== null),
    [visibleTodos],
  );
  const visibleTodoIds = useMemo(() => {
    if (canvasMode) {
      return sortByCanvasPosition(canvasTodos, canvasPositions).map((todo) => todo.id);
    }
    return visibleTodos
      .filter(
        (todo) =>
          todo.suspendedAt === null ||
          todo.groups.some((group) => expandedSuspendedGroupIds.has(group.id)),
      )
      .map((todo) => todo.id);
  }, [canvasMode, canvasTodos, canvasPositions, visibleTodos, expandedSuspendedGroupIds]);
  // 鼠标点选只记录当前 Todo（供快捷键使用），不留高亮；只有键盘上下切换时才高亮
  function selectTodo(id: string | null, options: { highlight?: boolean } = {}) {
    selectedTodoIdRef.current = id;
    setSelectedTodoId(id);
    setHighlightSelection(id !== null && Boolean(options.highlight));
  }

  const groupsForView = useMemo(() => {
    if (!currentBoardView) {
      return [];
    }
    if (currentBoardView.systemKey === "inbox") {
      return inboxGroup ? [inboxGroup] : [];
    }
    if (currentBoardView.systemKey === "all") {
      return regularGroups;
    }
    const allowed = new Set(currentBoardView.groups.map((group) => group.id));
    return regularGroups.filter((group) => allowed.has(group.id));
  }, [currentBoardView, inboxGroup, regularGroups]);

  const todosByGroup = useMemo(() => {
    const map = new Map<string, Todo[]>();
    for (const group of groupsForView) {
      map.set(group.id, []);
    }
    for (const todo of visibleTodos) {
      for (const group of todo.groups) {
        if (map.has(group.id)) {
          map.get(group.id)?.push(todo);
        }
      }
    }
    for (const [groupId, groupTodos] of map) {
      groupTodos.sort((left, right) => {
        const leftOrder = getTodoGroupSortOrder(left, groupId);
        const rightOrder = getTodoGroupSortOrder(right, groupId);
        if (leftOrder !== rightOrder) {
          return leftOrder - rightOrder;
        }
        return left.createdAt.localeCompare(right.createdAt);
      });
    }
    return map;
  }, [groupsForView, visibleTodos]);

  const loadTodosForView = useCallback(async (boardViewId?: string) => {
    const requestId = todoRequestIdRef.current + 1;
    todoRequestIdRef.current = requestId;
    const nextTodos = await listTodos(boardViewId);
    if (todoRequestIdRef.current === requestId) {
      setTodos(nextTodos);
    }
  }, []);

  const loadBoard = useCallback(async () => {
    setError(null);
    const [nextGroups, nextBoardViews, savedBoardViewId, nextInboxCount] = await Promise.all([
      listGroups(),
      listBoardViews(),
      getSelectedBoardViewId(),
      countInboxTodos(),
    ]);
    setGroups(nextGroups);
    setBoardViews(nextBoardViews);
    setInboxCount(nextInboxCount);

    const selectedIndex = resolveInitialBoardViewIndex(
      nextBoardViews,
      savedBoardViewId,
      nextInboxCount,
    );
    const selectedView = nextBoardViews[selectedIndex];
    await loadTodosForView(selectedView?.id);
    if (selectedView && savedBoardViewId && selectedView.id !== savedBoardViewId) {
      await saveSelectedBoardViewId(selectedView.id);
    }
    setLoading(false);

    setCurrentGroupIndex(0);
    setCurrentBoardViewIndex(selectedIndex);
  }, [loadTodosForView]);

  useEffect(() => {
    loadBoard().catch((nextError: unknown) => {
      setLoading(false);
      setError(String(nextError));
    });
  }, [loadBoard]);

  useEffect(() => {
    if (selectedTodoId && !visibleTodoIds.includes(selectedTodoId)) {
      selectTodo(null);
    }
  }, [selectedTodoId, visibleTodoIds]);

  useEffect(() => {
    if (editingTodoId && !visibleTodoIds.includes(editingTodoId)) {
      setEditingTodoId(null);
      setEditingDetail("");
      setEditingError(null);
    }
  }, [editingTodoId, visibleTodoIds]);

  const refreshTodosForCurrentView = useCallback(async () => {
    await loadTodosForView(currentBoardView?.id);
  }, [currentBoardView?.id, loadTodosForView]);

  // Bot 运行结束时可能用 easydo update 改过 Todo，跟着刷新
  const { version: botActivityVersion } = useBotActivity();
  const refreshTodosRef = useRef(refreshTodosForCurrentView);
  refreshTodosRef.current = refreshTodosForCurrentView;
  useEffect(() => {
    if (botActivityVersion > 0) {
      void refreshTodosRef.current();
    }
  }, [botActivityVersion]);

  useEffect(() => {
    function handleWindowBlur() {
      windowFocusedRef.current = false;
    }

    function handleWindowFocus() {
      if (windowFocusedRef.current) {
        return;
      }
      windowFocusedRef.current = true;
      setError(null);
      Promise.all([
        refreshTodosForCurrentView(),
        countInboxTodos().then(setInboxCount),
      ]).catch((nextError: unknown) => {
        setError(String(nextError));
      });
    }

    window.addEventListener("blur", handleWindowBlur);
    window.addEventListener("focus", handleWindowFocus);
    return () => {
      window.removeEventListener("blur", handleWindowBlur);
      window.removeEventListener("focus", handleWindowFocus);
    };
  }, [refreshTodosForCurrentView]);

  function nextInputGroup() {
    if (regularGroups.length === 0) {
      return;
    }
    setCurrentGroupIndex((index) => (index + 1) % regularGroups.length);
  }

  async function nextBoardView() {
    if (regularBoardViews.length === 0) {
      return;
    }
    const nextRegularIndex =
      regularBoardViewIndex === -1
        ? Math.max(
            0,
            regularBoardViews.findIndex((view) => view.systemKey === "all"),
          )
        : (regularBoardViewIndex + 1) % regularBoardViews.length;
    const nextView = regularBoardViews[nextRegularIndex];
    const nextIndex = boardViews.findIndex((view) => view.id === nextView.id);
    await selectBoardView(nextIndex, "right");
  }

  async function selectBoardView(
    index: number,
    direction: BoardViewTransitionDirection = index > currentBoardViewIndex ? "right" : "left",
  ) {
    const boardView = boardViews[index];
    if (!boardView || index === currentBoardViewIndex) {
      return;
    }
    setError(null);
    setBoardViewTransitionDirection(direction);
    setBoardViewTransitionKey((key) => key + 1);
    setCurrentBoardViewIndex(index);
    selectTodo(null);
    setDragState(null);
    try {
      await Promise.all([
        loadTodosForView(boardView.id),
        saveSelectedBoardViewId(boardView.id),
      ]);
    } catch (nextError) {
      setError(String(nextError));
    }
  }

  // 每个视图分别记住列表 / 画布，以及画布上每条 Todo 的位置
  const currentBoardViewId = currentBoardView?.id ?? null;
  useEffect(() => {
    if (!currentBoardViewId || isInboxView) {
      setLayoutMode("list");
      return;
    }
    let cancelled = false;
    getBoardLayoutMode(currentBoardViewId)
      .then((mode) => {
        if (!cancelled) {
          setLayoutMode(mode);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLayoutMode("list");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [currentBoardViewId, isInboxView]);

  useEffect(() => {
    if (!canvasMode || !currentBoardViewId || canvasPositionsViewId === currentBoardViewId) {
      return;
    }
    let cancelled = false;
    listCanvasPositions(currentBoardViewId)
      .then((positions) => {
        if (cancelled) {
          return;
        }
        setCanvasPositions(new Map(positions.map((position) => [position.todoId, position])));
        setCanvasPositionsViewId(currentBoardViewId);
      })
      .catch((nextError) => {
        if (!cancelled) {
          setError(String(nextError));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [canvasMode, currentBoardViewId, canvasPositionsViewId]);

  async function handleChangeLayoutMode(mode: BoardLayoutMode) {
    if (!currentBoardViewId || mode === layoutMode) {
      return;
    }
    setLayoutMode(mode);
    try {
      await saveBoardLayoutMode(currentBoardViewId, mode);
    } catch (nextError) {
      setError(String(nextError));
    }
  }

  function toggleLayoutMode() {
    if (isInboxView) {
      return;
    }
    void handleChangeLayoutMode(layoutMode === "canvas" ? "list" : "canvas");
  }

  const handlePlaceCanvasTodos = useCallback(
    (positions: CanvasPosition[]) => {
      if (!currentBoardViewId) {
        return;
      }
      setCanvasPositions((current) => {
        const next = new Map(current);
        for (const position of positions) {
          next.set(position.todoId, position);
        }
        return next;
      });
      const summary = positions
        .map((position) => `${shortId(position.todoId)}${fmtPoint(position.x, position.y)}`)
        .join(" ");
      saveCanvasPositions(currentBoardViewId, positions)
        .then(() => logCanvas(`save ok view=${shortId(currentBoardViewId)} ${summary}`))
        .catch((nextError) => {
          logCanvas(`save failed view=${shortId(currentBoardViewId)} ${summary} error=${String(nextError)}`);
          setError(String(nextError));
        });
    },
    [currentBoardViewId],
  );

  // 收件箱也是看板里的一个视图：在收件箱里点侧栏「看板」时，回到上一次的普通视图
  function handleSidebarNavigate(target: AppView) {
    if (target !== "board" || !isInboxView) {
      onNavigate(target);
      return;
    }
    const candidates = [
      boardViews.findIndex((view) => view.id === lastRegularBoardViewIdRef.current),
      boardViews.findIndex((view) => view.systemKey === "all"),
      boardViews.findIndex((view) => view.systemKey !== "inbox"),
    ];
    const index = candidates.find((candidate) => candidate >= 0);
    if (index !== undefined) {
      void selectBoardView(index, "left");
    }
  }

  async function submitTodo() {
    const detail = input.trim();
    if (!detail || !currentGroup) {
      return;
    }
    const created = await createTodo(detail, [currentGroup.id]);
    setLastCreatedTodoId(created.id);
    setInput("");
    await refreshTodosForCurrentView();
  }

  // 画布上双击空白处新建：落到录入框当前选中的 Group，并先记下位置，免得被自动排版挪走
  async function createTodoAt(detail: string, x: number, y: number) {
    if (!currentGroup) {
      return;
    }
    setError(null);
    try {
      const created = await createTodo(detail, [currentGroup.id]);
      handlePlaceCanvasTodos([{ todoId: created.id, x, y, width: null, height: null }]);
      await refreshTodosForCurrentView();
    } catch (nextError) {
      setError(String(nextError));
    }
  }

  async function handleSetBoardViewGroupMembership(groupId: string, included: boolean) {
    if (!currentBoardView || currentBoardView.systemKey !== null) {
      return;
    }
    setError(null);
    try {
      const updated = await setBoardViewGroupMembership(
        currentBoardView.id,
        groupId,
        included,
      );
      setBoardViews((views) =>
        views.map((view) => (view.id === updated.id ? updated : view)),
      );
      await loadTodosForView(updated.id);
    } catch (nextError) {
      setError(String(nextError));
    }
  }

  async function handleCompleteTodo(id: string) {
    const todo = todos.find((item) => item.id === id);
    if (!todo || todo.status !== "active") {
      return;
    }
    const updated = await completeTodo(id);
    setTodos((items) => items.map((item) => (item.id === id ? updated : item)));
  }

  async function handleReopenTodo(id: string) {
    const todo = todos.find((item) => item.id === id);
    if (!todo || todo.status !== "done") {
      return;
    }
    const updated = await reopenTodo(id);
    setTodos((items) => items.map((item) => (item.id === id ? updated : item)));
  }

  async function handleArchiveTodo(id: string) {
    const updated = await archiveTodo(id);
    setTodos((items) => items.map((item) => (item.id === id ? updated : item)));
  }

  async function handleSetTodoPriority(id: string, priority: TodoPriority) {
    const todo = todos.find((item) => item.id === id);
    if (!todo || todo.priority === priority) {
      return;
    }
    setError(null);
    try {
      const updated = await setTodoPriority(id, priority);
      setTodos((items) => items.map((item) => (item.id === id ? updated : item)));
      selectTodo(updated.id);
    } catch (nextError) {
      setError(String(nextError));
    }
  }

  async function handleSetTodoSuspended(id: string, suspended: boolean) {
    const todo = todos.find((item) => item.id === id);
    if (!todo || (todo.suspendedAt !== null) === suspended) {
      return;
    }
    setError(null);
    try {
      const updated = await setTodoSuspended(id, suspended);
      setTodos((items) => items.map((item) => (item.id === id ? updated : item)));
      if (!suspended) {
        selectTodo(updated.id);
      }
    } catch (nextError) {
      setError(String(nextError));
    }
  }

  function toggleSuspendedExpanded(groupId: string) {
    setExpandedSuspendedGroupIds((current) => {
      const next = new Set(current);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  }

  function startEditingTodo(id: string) {
    const todo = todos.find((item) => item.id === id);
    if (!todo) {
      return;
    }
    selectTodo(todo.id);
    setEditingTodoId(todo.id);
    setEditingDetail(todo.detail);
    setEditingError(null);
  }

  function startEditingSelectedTodo() {
    const id = selectedTodoIdRef.current;
    if (!id) {
      return;
    }
    startEditingTodo(id);
  }

  function cancelEditingTodo() {
    setEditingTodoId(null);
    setEditingDetail("");
    setEditingError(null);
  }

  async function saveEditingTodo() {
    if (!editingTodoId) {
      return;
    }

    const todoId = editingTodoId;
    const detail = editingDetail.trim();
    if (!detail) {
      await deleteTodo(todoId);
      setTodos((items) => items.filter((item) => item.id !== todoId));
      selectTodo(null);
      cancelEditingTodo();
      return;
    }

    const updated = await updateTodoDetail(todoId, detail);
    setTodos((items) => items.map((item) => (item.id === todoId ? updated : item)));
    selectTodo(updated.id);
    cancelEditingTodo();
  }

  async function toggleTodoChecklistLine(id: string, lineIndex: number) {
    const todo = todos.find((item) => item.id === id);
    if (!todo) {
      return;
    }

    const nextDetail = toggleChecklistLineAtIndex(todo.detail, lineIndex);
    if (nextDetail === todo.detail) {
      return;
    }

    const updated = await updateTodoDetail(id, nextDetail);
    setTodos((items) => items.map((item) => (item.id === id ? updated : item)));
    selectTodo(updated.id);
  }

  async function toggleSelectedTodoDone() {
    const id = selectedTodoIdRef.current;
    const todo = todos.find((item) => item.id === id);
    if (!id || !todo) {
      return;
    }
    if (todo.status === "done") {
      await handleReopenTodo(id);
    } else {
      await handleCompleteTodo(id);
    }
  }

  async function handleReorderTodo(
    groupId: string,
    draggedTodoId: string,
    targetTodoId: string,
    position: "before" | "after",
  ) {
    const currentGroupTodos = todosByGroup.get(groupId) ?? [];
    const activeTodos = currentGroupTodos.filter((todo) => todo.suspendedAt === null);
    const draggedIndex = activeTodos.findIndex((todo) => todo.id === draggedTodoId);
    const targetIndex = activeTodos.findIndex((todo) => todo.id === targetTodoId);
    if (draggedIndex === -1 || targetIndex === -1) {
      return;
    }

    const orderedActiveIds = activeTodos.map((todo) => todo.id);
    orderedActiveIds.splice(draggedIndex, 1);
    const targetIndexAfterRemoval = orderedActiveIds.indexOf(targetTodoId);
    const insertIndex = position === "before" ? targetIndexAfterRemoval : targetIndexAfterRemoval + 1;
    orderedActiveIds.splice(insertIndex, 0, draggedTodoId);

    // 挂起的 Todo 保持原有槽位不动，只重排未挂起的 Todo，取消挂起后才能回到原位置
    let nextActiveIndex = 0;
    const orderedIds = currentGroupTodos.map((todo) =>
      todo.suspendedAt === null ? orderedActiveIds[nextActiveIndex++] : todo.id,
    );

    if (orderedIds.join("|") === currentGroupTodos.map((todo) => todo.id).join("|")) {
      return;
    }

    const previousTodos = todos;
    setTodos((items) => applyGroupTodoOrder(items, groupId, orderedIds));
    selectTodo(null);
    setDragState(null);

    try {
      await reorderTodosInGroup(groupId, orderedIds);
    } catch (nextError) {
      setTodos(previousTodos);
      setError(String(nextError));
    }
  }

  function handleInboxDragStart(event: DragStartEvent) {
    if (!isInboxView) {
      return;
    }
    const todoId = String(event.active.id);
    setInboxDraggedTodoId(todoId);
    selectTodo(null);
  }

  async function handleInboxDragEnd(event: DragEndEvent) {
    const todoId = String(event.active.id);
    const target = event.over?.id ? String(event.over.id) : "";
    setInboxDraggedTodoId(null);
    if (!isInboxView || !target.startsWith("inbox-group:")) {
      return;
    }
    const targetGroupId = target.slice("inbox-group:".length);
    setError(null);
    try {
      await moveTodoFromInbox(todoId, targetGroupId);
      setTodos((items) => items.filter((todo) => todo.id !== todoId));
      setInboxCount((count) => Math.max(0, count - 1));
      selectTodo(null);
    } catch (nextError) {
      setError(String(nextError));
    }
  }

  async function openInbox() {
    const index = boardViews.findIndex((view) => view.systemKey === "inbox");
    if (index >= 0) {
      await selectBoardView(index, "right");
    }
  }

  function updateDragTarget(
    groupId: string,
    draggedTodoId: string,
    targetTodoId: string,
    position: "before" | "after",
  ) {
    setDragState({ groupId, draggedTodoId, targetTodoId, position });
  }

  function clearDragState() {
    setDragState(null);
  }

  function moveSelection(direction: 1 | -1) {
    if (visibleTodoIds.length === 0) {
      return;
    }
    const currentId = selectedTodoIdRef.current;
    const currentIndex = currentId ? visibleTodoIds.indexOf(currentId) : -1;
    const fallbackIndex = direction === 1 ? 0 : visibleTodoIds.length - 1;
    const nextIndex =
      currentIndex === -1
        ? fallbackIndex
        : Math.max(0, Math.min(visibleTodoIds.length - 1, currentIndex + direction));
    selectTodo(visibleTodoIds[nextIndex], { highlight: true });
  }

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (settingsOpen || editingTodoId) {
        return;
      }

      const isTextInput = isTextEditingTarget(event.target);

      if (!isTextInput && shortcutMatches(event, shortcutSettings.selectNextTodo)) {
        event.preventDefault();
        moveSelection(1);
        return;
      }

      if (!isTextInput && shortcutMatches(event, shortcutSettings.selectPreviousTodo)) {
        event.preventDefault();
        moveSelection(-1);
        return;
      }

      if (!isTextInput && shortcutMatches(event, shortcutSettings.editSelectedTodo)) {
        event.preventDefault();
        startEditingSelectedTodo();
        return;
      }

      if (!isTextInput && shortcutMatches(event, shortcutSettings.toggleSelectedTodoDone)) {
        event.preventDefault();
        void toggleSelectedTodoDone();
        return;
      }

      if (!isTextInput && event.key === "Enter" && !event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey) {
        event.preventDefault();
        startEditingSelectedTodo();
        return;
      }

      if (event.key === "Tab" && event.altKey && !isTextInput) {
        event.preventDefault();
        toggleLayoutMode();
        return;
      }

      if (event.key === "Tab" && event.shiftKey && !isTextInput) {
        event.preventDefault();
        void nextBoardView();
        return;
      }

      if (isTextInput) {
        return;
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  useEffect(() => {
    function clearSelectionWhenClickingOutside(event: PointerEvent) {
      const target = event.target as HTMLElement | null;
      if (!target || target.closest("[data-todo-card]") || isTextEditingTarget(target)) {
        return;
      }
      selectTodo(null);
    }

    window.addEventListener("pointerdown", clearSelectionWhenClickingOutside, true);
    return () => window.removeEventListener("pointerdown", clearSelectionWhenClickingOutside, true);
  }, []);

  useEffect(() => {
    function clearSelectionWhenFocusingOutside(event: FocusEvent) {
      const target = event.target as HTMLElement | null;
      if (!(target instanceof HTMLElement) || target.closest("[data-todo-card]")) {
        return;
      }
      selectTodo(null);
    }

    window.addEventListener("focusin", clearSelectionWhenFocusingOutside);
    return () => window.removeEventListener("focusin", clearSelectionWhenFocusingOutside);
  }, []);

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center bg-easydo-bg text-easydo-textSecondary">
        Loading EasyDo
      </div>
    );
  }

  return (
    <DndContext
      sensors={inboxDragSensors}
      collisionDetection={pointerWithin}
      onDragStart={handleInboxDragStart}
      onDragEnd={(event) => void handleInboxDragEnd(event)}
      onDragCancel={() => setInboxDraggedTodoId(null)}
    >
    <div className="flex h-screen overflow-hidden bg-easydo-bg text-easydo-text">
      <AppSidebar
        view="board"
        collapsed={sidebarCollapsed}
        currentBoardView={currentBoardView}
        groups={regularGroups}
        showBoardControls
        shortcutSettings={shortcutSettings}
        onNavigate={handleSidebarNavigate}
        onToggleCollapsed={onToggleSidebar}
        onSelectGroup={setCurrentGroupIndex}
        onSetBoardViewGroupMembership={(groupId, included) => {
          void handleSetBoardViewGroupMembership(groupId, included);
        }}
        inboxCount={inboxCount}
        inboxActive={isInboxView}
        inboxDropEnabled={isInboxView}
        onOpenInbox={() => void openInbox()}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <header
          data-tauri-drag-region
          className={cn(
            "flex h-11 shrink-0 items-center gap-3 border-b border-easydo-borderSoft bg-easydo-surfaceWarm px-4",
            // 侧栏折叠时顶栏让出红绿灯；展开按钮到红绿灯、到标题的距离都约 23px
            sidebarCollapsed && "pl-[calc(var(--traffic-light-inset)+14px)]",
          )}
        >
          {sidebarCollapsed ? <SidebarExpandButton onClick={onToggleSidebar} /> : null}
          <BoardViewSwitcher
            boardViews={regularBoardViews}
            currentIndex={regularBoardViewIndex}
            currentView={currentBoardView}
            forceExpanded={visibleTodos.length === 0}
            transitionDirection={boardViewTransitionDirection}
            transitionKey={boardViewTransitionKey}
            onSelectView={(index, direction) => {
              const selected = regularBoardViews[index];
              const fullIndex = boardViews.findIndex((view) => view.id === selected?.id);
              if (fullIndex >= 0) {
                void selectBoardView(fullIndex, direction);
              }
            }}
          />
          {error ? <p className="truncate text-sm text-destructive">{error}</p> : null}
          <div className="ml-auto flex shrink-0">
            <MessagesButton />
          </div>
          {!isInboxView && currentBoardView ? (
            <div
              role="group"
              aria-label="看板布局"
              className="flex shrink-0 rounded-lg border border-easydo-borderSoft bg-easydo-bgSoft p-0.5"
            >
              {(
                [
                  ["list", "列表"],
                  ["canvas", "画布"],
                ] as const
              ).map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  aria-pressed={layoutMode === mode}
                  onClick={() => void handleChangeLayoutMode(mode)}
                  className={cn(
                    "h-6 rounded-md px-2.5 text-xs transition-colors duration-150",
                    layoutMode === mode
                      ? "bg-easydo-surface text-easydo-cream shadow-easydo-lavender"
                      : "text-easydo-textMuted hover:text-easydo-cream",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          ) : null}
        </header>

        {canvasMode ? (
          <main className="bg-dot-grid flex min-h-0 flex-1 flex-col overflow-hidden">
            <BoardCanvas
              // 切换 View 时相机回到左上角、100%
              key={currentBoardViewId}
              todos={canvasTodos}
              suspendedTodos={canvasSuspendedTodos}
              positions={canvasPositionsViewId === currentBoardViewId ? canvasPositions : EMPTY_POSITIONS}
              positionsReady={canvasPositionsViewId === currentBoardViewId}
              selectedTodoId={highlightedTodoId}
              editingTodoId={editingTodoId}
              editingDetail={editingDetail}
              editingError={editingError}
              onSelectTodo={selectTodo}
              onStartEditingTodo={startEditingTodo}
              onChangeEditingDetail={setEditingDetail}
              onSaveEditingTodo={() => void saveEditingTodo()}
              onBlurEditingTodo={() => void saveEditingTodo()}
              onCancelEditingTodo={cancelEditingTodo}
              onToggleTodoChecklistLine={(id, lineIndex) => void toggleTodoChecklistLine(id, lineIndex)}
              onCompleteTodo={(id) => void handleCompleteTodo(id)}
              onReopenTodo={(id) => void handleReopenTodo(id)}
              onArchiveTodo={(id) => void handleArchiveTodo(id)}
              onSetTodoPriority={(id, priority) => void handleSetTodoPriority(id, priority)}
              onSetTodoSuspended={(id, suspended) => void handleSetTodoSuspended(id, suspended)}
              onPlaceTodos={handlePlaceCanvasTodos}
              onCreateTodoAt={(detail, x, y) => void createTodoAt(detail, x, y)}
              onShowSuspended={() => {
                setExpandedSuspendedGroupIds(new Set(groupsForView.map((group) => group.id)));
                void handleChangeLayoutMode("list");
              }}
            />
          </main>
        ) : (
        <main
          className={cn(
            "bg-dot-grid flex min-h-0 flex-1 flex-col gap-3 overflow-hidden px-6 pb-2",
            isInboxView ? "pt-0" : "pt-5",
          )}
        >
          {isInboxView ? (
            <div
              data-inbox-banner
              className="-mx-6 shrink-0 border-b border-easydo-borderSoft bg-easydo-surfaceWarm px-6 py-1 text-xs text-easydo-textMuted"
            >
              收件箱仅暂存 Todo。请将 Todo 拖到左侧普通 Group 永久保留；未整理的 Todo 会在次日 03:00 后自动删除。
            </div>
          ) : null}
          {groupsForView.length === 0 ? (
            <div className="grid h-full place-items-center rounded-xl border border-dashed border-easydo-border bg-easydo-surface/60 px-4 text-center text-sm text-easydo-textMuted">
              当前 View 暂无 Group，可从左侧栏添加
            </div>
          ) : (
            <div className="no-scrollbar flex min-h-0 flex-1 min-w-full gap-4 overflow-x-auto">
              {groupsForView.map((group) => (
                <GroupSection
                  key={group.id}
                  group={group}
                  todos={todosByGroup.get(group.id) ?? []}
                  scrollToTodoId={lastCreatedTodoId}
                  selectedTodoId={highlightedTodoId}
                  editingTodoId={editingTodoId}
                  editingDetail={editingDetail}
                  editingError={editingError}
                  onSelectGroup={() => {
                    const index = regularGroups.findIndex((item) => item.id === group.id);
                    if (index >= 0) {
                      setCurrentGroupIndex(index);
                    }
                  }}
                  onSelectTodo={selectTodo}
                  onStartEditingTodo={startEditingTodo}
                  onChangeEditingDetail={setEditingDetail}
                  onSaveEditingTodo={() => void saveEditingTodo()}
                  onBlurEditingTodo={() => void saveEditingTodo()}
                  onCancelEditingTodo={cancelEditingTodo}
                  onToggleTodoChecklistLine={(id, lineIndex) => void toggleTodoChecklistLine(id, lineIndex)}
                  onCompleteTodo={(id) => void handleCompleteTodo(id)}
                  onReopenTodo={(id) => void handleReopenTodo(id)}
                  onArchiveTodo={(id) => void handleArchiveTodo(id)}
                  onSetTodoPriority={(id, priority) => void handleSetTodoPriority(id, priority)}
                  onSetTodoSuspended={(id, suspended) => void handleSetTodoSuspended(id, suspended)}
                  suspendedExpanded={expandedSuspendedGroupIds.has(group.id)}
                  onToggleSuspendedExpanded={() => toggleSuspendedExpanded(group.id)}
                  dragState={dragState}
                  onDragStartTodo={(groupId, draggedTodoId) => {
                    setDragState({ groupId, draggedTodoId, targetTodoId: null, position: "before" });
                    selectTodo(null);
                  }}
                  onDragOverTodo={updateDragTarget}
                  onReorderTodo={(groupId, draggedTodoId, targetTodoId, position) => {
                    void handleReorderTodo(groupId, draggedTodoId, targetTodoId, position);
                  }}
                  onDragEndTodo={clearDragState}
                  externalDndContext={isInboxView}
                  fullWidth={groupsForView.length === 1}
                />
              ))}
            </div>
          )}
        </main>
        )}

        <TodoInput
          value={input}
          groups={regularGroups}
          currentGroupId={currentGroup?.id ?? null}
          onChange={setInput}
          onSubmit={() => void submitTodo()}
          onSelectGroup={setCurrentGroupIndex}
          onNextGroup={nextInputGroup}
          onNextBoardView={() => void nextBoardView()}
          onToggleLayout={toggleLayoutMode}
        />
      </div>
    </div>
    </DndContext>
  );
}

const EMPTY_POSITIONS = new Map<string, CanvasPosition>();

function resolveInitialBoardViewIndex(
  boardViews: BoardView[],
  savedBoardViewId: string | null,
  inboxCount: number,
) {
  if (savedBoardViewId) {
    const savedIndex = boardViews.findIndex((view) => view.id === savedBoardViewId);
    const savedView = boardViews[savedIndex];
    if (savedIndex !== -1 && (savedView.systemKey !== "inbox" || inboxCount > 0)) {
      return savedIndex;
    }
  }
  const allIndex = boardViews.findIndex((view) => view.systemKey === "all");
  return allIndex === -1 ? 0 : allIndex;
}

function getTodoGroupSortOrder(todo: Todo, groupId: string) {
  return todo.groupSortOrders.find((item) => item.groupId === groupId)?.sortOrder ?? 0;
}

function applyGroupTodoOrder(items: Todo[], groupId: string, orderedIds: string[]) {
  const orderByTodoId = new Map(orderedIds.map((id, index) => [id, index]));
  return items.map((todo) => {
    const sortOrder = orderByTodoId.get(todo.id);
    if (sortOrder === undefined) {
      return todo;
    }
    const currentOrders = todo.groupSortOrders.filter((item) => item.groupId !== groupId);
    return {
      ...todo,
      groupSortOrders: [
        ...currentOrders,
        {
          groupId,
          sortOrder,
        },
      ],
    };
  });
}
