import { useRef } from "react";
import type { Group, Todo } from "../../types";
import { TodoCard } from "./TodoCard";

type DropPosition = "before" | "after";

interface GroupSectionProps {
  group: Group;
  todos: Todo[];
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
  onCompleteTodo: (id: string) => void;
  onReopenTodo: (id: string) => void;
  onArchiveTodo: (id: string) => void;
  dragState: {
    groupId: string;
    draggedTodoId: string;
    targetTodoId: string | null;
    position: DropPosition;
  } | null;
  onDragStartTodo: (groupId: string, draggedTodoId: string) => void;
  onDragOverTodo: (
    groupId: string,
    draggedTodoId: string,
    targetTodoId: string,
    position: DropPosition,
  ) => void;
  onReorderTodo: (
    groupId: string,
    draggedTodoId: string,
    targetTodoId: string,
    position: DropPosition,
  ) => void;
  onDragEndTodo: () => void;
}

export function GroupSection({
  group,
  todos,
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
  onCompleteTodo,
  onReopenTodo,
  onArchiveTodo,
  dragState,
  onDragStartTodo,
  onDragOverTodo,
  onReorderTodo,
  onDragEndTodo,
}: GroupSectionProps) {
  const localDraggedTodoIdRef = useRef<string | null>(null);

  function getDropPosition(event: React.DragEvent<Element>): DropPosition {
    const rect = event.currentTarget.getBoundingClientRect();
    return event.clientY < rect.top + rect.height / 2 ? "before" : "after";
  }

  function getDraggedTodoId(event: React.DragEvent<Element>) {
    const payload = event.dataTransfer.getData("text/plain");
    if (payload) {
      try {
        const parsed = JSON.parse(payload) as { groupId?: string; todoId?: string };
        if (parsed.groupId === group.id && parsed.todoId) {
          return parsed.todoId;
        }
      } catch {
        return null;
      }
    }
    return dragState?.groupId === group.id ? dragState.draggedTodoId : localDraggedTodoIdRef.current;
  }

  function handleDrop(
    event: React.DragEvent<Element>,
    targetTodoId: string,
    position: DropPosition,
  ) {
    event.preventDefault();
    event.stopPropagation();
    const draggedTodoId = getDraggedTodoId(event);
    if (!draggedTodoId || draggedTodoId === targetTodoId) {
      onDragEndTodo();
      return;
    }
    onReorderTodo(group.id, draggedTodoId, targetTodoId, position);
  }

  return (
    <section className="flex min-h-0 min-w-[280px] flex-1 flex-col rounded-easydo-lg border border-easydo-borderSoft bg-easydo-bgSoft/55 p-2.5 shadow-easydo-card">
      <div className="mb-2.5 flex items-center justify-between px-1">
        <h2 className="text-base font-semibold text-easydo-cream">{group.name}</h2>
        <span className="rounded-full border border-easydo-border bg-easydo-surface px-2.5 py-1 text-xs text-easydo-textMuted">
          {todos.length}
        </span>
      </div>
      <div className="no-scrollbar flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
        {todos.map((todo) => (
          <div key={todo.id} className="contents">
            {shouldShowPlaceholder(dragState, group.id, todo.id, "before") ? (
              <TodoDropPlaceholder
                position="before"
                onDragOver={(event) => {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                }}
                onDrop={(event) => handleDrop(event, todo.id, "before")}
              />
            ) : null}
            <TodoCard
              todo={todo}
              selected={todo.id === selectedTodoId}
              editing={todo.id === editingTodoId}
              editingValue={editingDetail}
              editingError={todo.id === editingTodoId ? editingError : null}
              dragging={dragState?.draggedTodoId === todo.id}
              onSelect={() => onSelectTodo(todo.id)}
              onStartEditing={() => onStartEditingTodo(todo.id)}
              onChangeEditingValue={onChangeEditingDetail}
              onSaveEditing={onSaveEditingTodo}
              onBlurEditing={onBlurEditingTodo}
              onCancelEditing={onCancelEditingTodo}
              onComplete={() => onCompleteTodo(todo.id)}
              onReopen={() => onReopenTodo(todo.id)}
              onArchive={() => onArchiveTodo(todo.id)}
              onDragStart={(event) => {
                localDraggedTodoIdRef.current = todo.id;
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/plain", JSON.stringify({
                  groupId: group.id,
                  todoId: todo.id,
                }));
                onDragStartTodo(group.id, todo.id);
              }}
              onDragOver={(event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                const draggedTodoId = getDraggedTodoId(event);
                const position = getDropPosition(event);
                if (!draggedTodoId || draggedTodoId === todo.id) {
                  return;
                }
                onDragOverTodo(group.id, draggedTodoId, todo.id, position);
              }}
              onDrop={(event) => {
                handleDrop(event, todo.id, getDropPosition(event));
              }}
              onDragEnd={() => {
                localDraggedTodoIdRef.current = null;
                onDragEndTodo();
              }}
            />
            {shouldShowPlaceholder(dragState, group.id, todo.id, "after") ? (
              <TodoDropPlaceholder
                position="after"
                onDragOver={(event) => {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                }}
                onDrop={(event) => handleDrop(event, todo.id, "after")}
              />
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}

function shouldShowPlaceholder(
  dragState: GroupSectionProps["dragState"],
  groupId: string,
  todoId: string,
  position: DropPosition,
) {
  return (
    dragState?.groupId === groupId &&
    dragState.targetTodoId === todoId &&
    dragState.position === position
  );
}

function TodoDropPlaceholder({
  position,
  onDragOver,
  onDrop,
}: {
  position: DropPosition;
  onDragOver: (event: React.DragEvent<HTMLDivElement>) => void;
  onDrop: (event: React.DragEvent<HTMLDivElement>) => void;
}) {
  return (
    <div
      title={position === "before" ? "放到此任务之前" : "放到此任务之后"}
      className="h-10 rounded-easydo border border-dashed border-easydo-gold/70 bg-easydo-gold/10"
      onDragOver={onDragOver}
      onDrop={onDrop}
    />
  );
}
