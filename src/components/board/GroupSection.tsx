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
  onChangeEditingDetail: (value: string) => void;
  onSaveEditingTodo: () => void;
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
  onChangeEditingDetail,
  onSaveEditingTodo,
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
  function getDropPosition(event: React.DragEvent<Element>): DropPosition {
    const rect = event.currentTarget.getBoundingClientRect();
    return event.clientY < rect.top + rect.height / 2 ? "before" : "after";
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
              <TodoDropPlaceholder />
            ) : null}
            <TodoCard
              todo={todo}
              selected={todo.id === selectedTodoId}
              editing={todo.id === editingTodoId}
              editingValue={editingDetail}
              editingError={todo.id === editingTodoId ? editingError : null}
              dragging={dragState?.draggedTodoId === todo.id}
              onSelect={() => onSelectTodo(todo.id)}
              onChangeEditingValue={onChangeEditingDetail}
              onSaveEditing={onSaveEditingTodo}
              onCancelEditing={onCancelEditingTodo}
              onComplete={() => onCompleteTodo(todo.id)}
              onReopen={() => onReopenTodo(todo.id)}
              onArchive={() => onArchiveTodo(todo.id)}
              onDragStart={(event) => {
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
                const payload = event.dataTransfer.getData("text/plain");
                let draggedTodoId = dragState?.groupId === group.id ? dragState.draggedTodoId : null;
                try {
                  if (payload) {
                    const parsed = JSON.parse(payload) as { groupId?: string; todoId?: string };
                    if (parsed.groupId === group.id && parsed.todoId) {
                      draggedTodoId = parsed.todoId;
                    }
                  }
                } catch {
                  return;
                }
                const position = getDropPosition(event);
                if (!draggedTodoId || draggedTodoId === todo.id) {
                  return;
                }
                onDragOverTodo(group.id, draggedTodoId, todo.id, position);
              }}
              onDrop={(event) => {
                event.preventDefault();
                event.stopPropagation();
                const payload = event.dataTransfer.getData("text/plain");
                if (!payload) {
                  onDragEndTodo();
                  return;
                }
                try {
                  const parsed = JSON.parse(payload) as { groupId?: string; todoId?: string };
                  const position = getDropPosition(event);
                  if (!parsed.todoId || parsed.groupId !== group.id || parsed.todoId === todo.id) {
                    onDragEndTodo();
                    return;
                  }
                  onReorderTodo(group.id, parsed.todoId, todo.id, position);
                } catch {
                  onDragEndTodo();
                  return;
                }
              }}
              onDragEnd={onDragEndTodo}
            />
            {shouldShowPlaceholder(dragState, group.id, todo.id, "after") ? (
              <TodoDropPlaceholder />
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

function TodoDropPlaceholder() {
  return (
    <div className="h-10 rounded-easydo border border-dashed border-easydo-gold/70 bg-easydo-gold/10" />
  );
}
