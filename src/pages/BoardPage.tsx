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
  getSelectedBoardViewId,
  listBoardViews,
  listGroups,
  listTodos,
  moveTodoFromInbox,
  reopenTodo,
  reorderTodosInGroup,
  saveSelectedBoardViewId,
  setBoardViewGroupMembership,
  updateTodoDetail,
} from "../lib/api";
import {
  defaultShortcutSettings,
  isTextEditingTarget,
  shortcutMatches,
} from "../lib/shortcuts";
import { toggleChecklistLineAtIndex } from "../lib/checklist";
import type { AppView, BoardView, Group, ShortcutSettings, Todo } from "../types";
import { GroupSection } from "../components/board/GroupSection";
import {
  BoardViewSwitcher,
  type BoardViewTransitionDirection,
} from "../components/board/BoardViewSwitcher";
import { TodoInput } from "../components/board/TodoInput";
import { AppSidebar } from "@/components/layout/AppSidebar";

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

  const visibleTodoIds = useMemo(() => visibleTodos.map((todo) => todo.id), [visibleTodos]);
  function selectTodo(id: string | null) {
    selectedTodoIdRef.current = id;
    setSelectedTodoId(id);
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
    const draggedIndex = currentGroupTodos.findIndex((todo) => todo.id === draggedTodoId);
    const targetIndex = currentGroupTodos.findIndex((todo) => todo.id === targetTodoId);
    if (draggedIndex === -1 || targetIndex === -1) {
      return;
    }

    const orderedIds = currentGroupTodos.map((todo) => todo.id);
    orderedIds.splice(draggedIndex, 1);
    const targetIndexAfterRemoval = orderedIds.indexOf(targetTodoId);
    const insertIndex = position === "before" ? targetIndexAfterRemoval : targetIndexAfterRemoval + 1;
    orderedIds.splice(insertIndex, 0, draggedTodoId);

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
    selectTodo(visibleTodoIds[nextIndex]);
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
        onNavigate={onNavigate}
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
        <header className="shrink-0 border-b border-easydo-borderSoft bg-easydo-bg/80 px-3 py-1.5 backdrop-blur">
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
          {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}
        </header>

        <main className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden px-3 py-3">
          {isInboxView ? (
            <div
              data-inbox-banner
              className="shrink-0 border border-easydo-borderSoft bg-muted/60 px-3 py-2 text-sm text-easydo-textSecondary"
            >
              收件箱仅暂存 Todo。请将 Todo 拖到左侧普通 Group 永久保留；未整理的 Todo 会在次日 03:00 后自动删除。
            </div>
          ) : null}
          {groupsForView.length === 0 ? (
            <div className="grid h-full place-items-center border border-dashed border-border bg-card/40 px-4 text-center text-sm text-muted-foreground">
              当前 View 暂无 Group，可从左侧栏添加
            </div>
          ) : (
            <div className="no-scrollbar flex min-h-0 flex-1 min-w-full gap-3 overflow-x-auto">
              {groupsForView.map((group) => (
                <GroupSection
                  key={group.id}
                  group={group}
                  todos={todosByGroup.get(group.id) ?? []}
                  scrollToTodoId={lastCreatedTodoId}
                  selectedTodoId={selectedTodoId}
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
                />
              ))}
            </div>
          )}
        </main>

        <TodoInput
          value={input}
          groups={regularGroups}
          currentGroupId={currentGroup?.id ?? null}
          onChange={setInput}
          onSubmit={() => void submitTodo()}
          onSelectGroup={setCurrentGroupIndex}
          onNextGroup={nextInputGroup}
          onNextBoardView={() => void nextBoardView()}
        />
      </div>
    </div>
    </DndContext>
  );
}

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
