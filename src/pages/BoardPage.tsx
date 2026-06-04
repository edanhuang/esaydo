import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, RefreshCw } from "lucide-react";
import {
  archiveTodo,
  completeTodo,
  createTodo,
  listBoardViews,
  listGroups,
  listTodos,
  reopenTodo,
} from "../lib/api";
import type { AppView, BoardView, Group, Todo } from "../types";
import { GroupSection } from "../components/board/GroupSection";
import { TodoInput } from "../components/board/TodoInput";

interface BoardPageProps {
  onNavigate: (view: AppView) => void;
}

export function BoardPage({ onNavigate }: BoardPageProps) {
  const [groups, setGroups] = useState<Group[]>([]);
  const [boardViews, setBoardViews] = useState<BoardView[]>([]);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [input, setInput] = useState("");
  const [currentGroupIndex, setCurrentGroupIndex] = useState(0);
  const [currentBoardViewIndex, setCurrentBoardViewIndex] = useState(0);
  const [selectedTodoId, setSelectedTodoId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const currentGroup = groups[currentGroupIndex] ?? null;
  const currentBoardView = boardViews[currentBoardViewIndex] ?? null;

  const visibleTodos = useMemo(
    () => todos.filter((todo) => todo.status !== "archived"),
    [todos],
  );

  const visibleTodoIds = useMemo(() => visibleTodos.map((todo) => todo.id), [visibleTodos]);

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
    return map;
  }, [groupsForView, visibleTodos]);

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
    if (visibleTodoIds.length === 0) {
      setSelectedTodoId(null);
      return;
    }
    if (!selectedTodoId || !visibleTodoIds.includes(selectedTodoId)) {
      setSelectedTodoId(visibleTodoIds[0]);
    }
  }, [selectedTodoId, visibleTodoIds]);

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
      setSelectedTodoId(created.id);
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

  function moveSelection(direction: 1 | -1) {
    if (visibleTodoIds.length === 0) {
      return;
    }
    const currentIndex = selectedTodoId ? visibleTodoIds.indexOf(selectedTodoId) : -1;
    const fallbackIndex = direction === 1 ? 0 : visibleTodoIds.length - 1;
    const nextIndex =
      currentIndex === -1
        ? fallbackIndex
        : Math.max(0, Math.min(visibleTodoIds.length - 1, currentIndex + direction));
    setSelectedTodoId(visibleTodoIds[nextIndex]);
  }

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const isTextInput =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable;

      if (event.key === "ArrowDown") {
        event.preventDefault();
        moveSelection(1);
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        moveSelection(-1);
        return;
      }

      if (event.key === "Enter" && event.metaKey && selectedTodoId) {
        event.preventDefault();
        const selectedTodo = todos.find((todo) => todo.id === selectedTodoId);
        if (selectedTodo?.status === "done") {
          void handleReopenTodo(selectedTodoId);
        } else {
          void handleCompleteTodo(selectedTodoId);
        }
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

  if (loading) {
    return <div className="grid min-h-screen place-items-center text-muted-foreground">Loading EasyDo</div>;
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-border px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">EasyDo</h1>
            <p className="text-sm text-muted-foreground">
              {currentBoardView?.name ?? "所有"} / 输入到 {currentGroup?.name ?? "未配置"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              title="刷新"
              onClick={() => void loadBoard()}
              className="grid h-9 w-9 place-items-center rounded-md border border-border bg-card text-muted-foreground"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => onNavigate("weekly")}
              className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground"
            >
              <CalendarDays className="h-4 w-4" />
              Weekly
            </button>
          </div>
        </div>
        {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
      </header>

      <main className="flex-1 overflow-auto px-5 py-5">
        <div className="flex min-w-full gap-4">
          {groupsForView.map((group) => (
            <GroupSection
              key={group.id}
              group={group}
              todos={todosByGroup.get(group.id) ?? []}
              selectedTodoId={selectedTodoId}
              onSelectTodo={setSelectedTodoId}
              onCompleteTodo={(id) => void handleCompleteTodo(id)}
              onReopenTodo={(id) => void handleReopenTodo(id)}
              onArchiveTodo={(id) => void handleArchiveTodo(id)}
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
  );
}
