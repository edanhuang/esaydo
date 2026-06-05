import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  archiveTodo,
  completeTodo,
  createTodo,
  listBoardViews,
  listGroups,
  listTodos,
  reopenTodo,
  reorderTodosInGroup,
  updateTodoDetail,
} from "../lib/api";
import {
  defaultShortcutSettings,
  isTextEditingTarget,
  shortcutMatches,
} from "../lib/shortcuts";
import type { AppView, BoardView, Group, ShortcutSettings, Todo } from "../types";
import { GroupSection } from "../components/board/GroupSection";
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
  const [input, setInput] = useState("");
  const [currentGroupIndex, setCurrentGroupIndex] = useState(0);
  const [currentBoardViewIndex, setCurrentBoardViewIndex] = useState(0);
  const [selectedTodoId, setSelectedTodoId] = useState<string | null>(null);
  const selectedTodoIdRef = useRef<string | null>(null);
  const [editingTodoId, setEditingTodoId] = useState<string | null>(null);
  const [editingDetail, setEditingDetail] = useState("");
  const [editingError, setEditingError] = useState<string | null>(null);
  const [dragState, setDragState] = useState<{
    groupId: string;
    draggedTodoId: string;
    targetTodoId: string | null;
    position: "before" | "after";
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const currentGroup = groups[currentGroupIndex] ?? null;
  const currentBoardView = boardViews[currentBoardViewIndex] ?? null;

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
    if (!currentBoardView || currentBoardView.groups.length === 0) {
      return groups;
    }
    const allowed = new Set(currentBoardView.groups.map((group) => group.id));
    return groups.filter((group) => allowed.has(group.id));
  }, [currentBoardView, groups]);

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

  const boardViewTodoCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const boardView of boardViews) {
      if (boardView.groups.length === 0) {
        counts.set(boardView.id, visibleTodos.length);
        continue;
      }
      const allowed = new Set(boardView.groups.map((group) => group.id));
      counts.set(
        boardView.id,
        visibleTodos.filter((todo) => todo.groups.some((group) => allowed.has(group.id))).length,
      );
    }
    return counts;
  }, [boardViews, visibleTodos]);

  const loadBoard = useCallback(async () => {
    setError(null);
    const [nextGroups, nextBoardViews] = await Promise.all([listGroups(), listBoardViews()]);
    setGroups(nextGroups);
    setBoardViews(nextBoardViews);

    const selectedView = nextBoardViews[currentBoardViewIndex] ?? nextBoardViews[0];
    const nextTodos = await listTodos(selectedView?.id);
    setTodos(nextTodos);
    setLoading(false);

    if (nextGroups.length > 0 && currentGroupIndex >= nextGroups.length) {
      setCurrentGroupIndex(0);
    }
    if (nextBoardViews.length > 0 && currentBoardViewIndex >= nextBoardViews.length) {
      setCurrentBoardViewIndex(0);
    }
  }, [currentBoardViewIndex, currentGroupIndex]);

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

  async function refreshTodosForCurrentView() {
    const nextTodos = await listTodos(currentBoardView?.id);
    setTodos(nextTodos);
  }

  function nextInputGroup() {
    if (groups.length === 0) {
      return;
    }
    setCurrentGroupIndex((index) => (index + 1) % groups.length);
  }

  async function nextBoardView() {
    if (boardViews.length === 0) {
      return;
    }
    const nextIndex = (currentBoardViewIndex + 1) % boardViews.length;
    setCurrentBoardViewIndex(nextIndex);
    const nextTodos = await listTodos(boardViews[nextIndex]?.id);
    setTodos(nextTodos);
  }

  async function selectBoardView(index: number) {
    if (!boardViews[index]) {
      return;
    }
    setCurrentBoardViewIndex(index);
    const nextTodos = await listTodos(boardViews[index]?.id);
    setTodos(nextTodos);
  }

  async function submitTodo() {
    const detail = input.trim();
    if (!detail || !currentGroup) {
      return;
    }
    const created = await createTodo(detail, [currentGroup.id]);
    setInput("");
    if (
      !currentBoardView ||
      currentBoardView.groups.length === 0 ||
      currentBoardView.groups.some((group) => group.id === currentGroup.id)
    ) {
      setTodos((items) => [...items, created]);
    } else {
      await refreshTodosForCurrentView();
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

  function startEditingSelectedTodo() {
    const id = selectedTodoIdRef.current;
    const todo = todos.find((item) => item.id === id);
    if (!todo) {
      return;
    }
    setEditingTodoId(todo.id);
    setEditingDetail(todo.detail);
    setEditingError(null);
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

    const detail = editingDetail.trim();
    if (!detail) {
      setEditingError("Todo detail cannot be empty.");
      return;
    }

    const updated = await updateTodoDetail(editingTodoId, detail);
    setTodos((items) => items.map((item) => (item.id === editingTodoId ? updated : item)));
    selectTodo(updated.id);
    cancelEditingTodo();
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
      if (!target || target.closest("[data-todo-card]")) {
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
    <div className="flex h-screen overflow-hidden bg-easydo-bg text-easydo-text">
      <AppSidebar
        view="board"
        collapsed={sidebarCollapsed}
        boardViews={boardViews}
        boardViewTodoCounts={boardViewTodoCounts}
        currentBoardViewIndex={currentBoardViewIndex}
        groups={groups}
        currentGroupIndex={currentGroupIndex}
        showBoardControls
        onNavigate={onNavigate}
        onToggleCollapsed={onToggleSidebar}
        onSelectBoardView={(index) => void selectBoardView(index)}
        onSelectGroup={setCurrentGroupIndex}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="shrink-0 border-b border-easydo-borderSoft bg-easydo-bg/80 px-5 py-4 backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold tracking-normal text-easydo-cream">
                {currentBoardView?.name ?? "所有"} / 输入到 {currentGroup?.name ?? "未配置"}
              </h1>
            </div>
          </div>
          {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}
        </header>

        <main className="min-h-0 flex-1 overflow-hidden px-5 py-5">
          <div className="no-scrollbar flex h-full min-w-full gap-5 overflow-x-auto">
            {groupsForView.map((group) => (
              <GroupSection
                key={group.id}
                group={group}
                todos={todosByGroup.get(group.id) ?? []}
                selectedTodoId={selectedTodoId}
                editingTodoId={editingTodoId}
                editingDetail={editingDetail}
                editingError={editingError}
                onSelectTodo={selectTodo}
                onChangeEditingDetail={setEditingDetail}
                onSaveEditingTodo={() => void saveEditingTodo()}
                onCancelEditingTodo={cancelEditingTodo}
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
              />
            ))}
          </div>
        </main>

        <TodoInput
          value={input}
          currentGroupName={currentGroup?.name ?? "未配置"}
          onChange={setInput}
          onSubmit={() => void submitTodo()}
          onNextGroup={nextInputGroup}
          onNextBoardView={() => void nextBoardView()}
        />
      </div>
    </div>
  );
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
