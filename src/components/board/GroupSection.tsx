import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
} from "@dnd-kit/core";
import { useEffect, useRef } from "react";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Group, Todo, TodoPriority } from "../../types";
import { TodoCard } from "./TodoCard";

type DropPosition = "before" | "after";

interface GroupSectionProps {
  group: Group;
  todos: Todo[];
  scrollToTodoId: string | null;
  selectedTodoId: string | null;
  editingTodoId: string | null;
  editingDetail: string;
  editingError: string | null;
  onSelectGroup: () => void;
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
  externalDndContext?: boolean;
}

export function GroupSection({
  group,
  todos,
  scrollToTodoId,
  selectedTodoId,
  editingTodoId,
  editingDetail,
  editingError,
  onSelectGroup,
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
  dragState,
  onDragStartTodo,
  onDragOverTodo,
  onReorderTodo,
  onDragEndTodo,
  externalDndContext = false,
}: GroupSectionProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const lastScrolledTodoIdRef = useRef<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 4,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const todoIds = todos.map((todo) => todo.id);

  useEffect(() => {
    if (
      !scrollToTodoId ||
      lastScrolledTodoIdRef.current === scrollToTodoId ||
      !todoIds.includes(scrollToTodoId)
    ) {
      return;
    }

    lastScrolledTodoIdRef.current = scrollToTodoId;
    window.requestAnimationFrame(() => {
      const list = listRef.current;
      if (!list) {
        return;
      }
      if (typeof list.scrollTo === "function") {
        list.scrollTo({ top: list.scrollHeight, behavior: "smooth" });
      } else {
        list.scrollTop = list.scrollHeight;
      }
    });
  }, [scrollToTodoId, todoIds]);

  function handleDragStart(event: DragEndEvent) {
    onDragStartTodo(group.id, String(event.active.id));
  }

  function handleDragOver(event: DragOverEvent) {
    const draggedTodoId = String(event.active.id);
    const targetTodoId = event.over?.id ? String(event.over.id) : null;
    if (!targetTodoId || draggedTodoId === targetTodoId) {
      return;
    }
    onDragOverTodo(group.id, draggedTodoId, targetTodoId, getSortPosition(draggedTodoId, targetTodoId, todoIds));
  }

  function handleDragEnd(event: DragEndEvent) {
    const draggedTodoId = String(event.active.id);
    const targetTodoId = event.over?.id ? String(event.over.id) : null;
    if (!targetTodoId || draggedTodoId === targetTodoId) {
      onDragEndTodo();
      return;
    }
    onReorderTodo(group.id, draggedTodoId, targetTodoId, getSortPosition(draggedTodoId, targetTodoId, todoIds));
  }

  const todoList = (
    <SortableContext items={todoIds} strategy={verticalListSortingStrategy}>
      <div
        ref={listRef}
        data-todo-list
        className="no-scrollbar flex min-h-0 flex-col divide-y divide-border overflow-y-auto"
      >
        {todos.map((todo) => (
          <SortableTodoCard
            key={todo.id}
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
            onToggleChecklistLine={(lineIndex) => onToggleTodoChecklistLine(todo.id, lineIndex)}
            onComplete={() => onCompleteTodo(todo.id)}
            onReopen={() => onReopenTodo(todo.id)}
            onArchive={() => onArchiveTodo(todo.id)}
            onSetPriority={(priority) => onSetTodoPriority(todo.id, priority)}
          />
        ))}
      </div>
    </SortableContext>
  );

  return (
    <section
      data-group-section={group.id}
      className="flex h-fit max-h-full min-w-[240px] flex-1 self-start flex-col overflow-hidden rounded-md border border-border bg-card"
      onClick={onSelectGroup}
    >
      <div className="flex shrink-0 items-center justify-between border-b border-border px-2 py-1.5">
        <h2 className="text-sm font-semibold text-easydo-cream">{group.name}</h2>
        <span className="border border-border bg-muted px-1.5 py-px text-xs text-muted-foreground">
          {todos.length}
        </span>
      </div>
      {externalDndContext ? (
        todoList
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
          onDragCancel={onDragEndTodo}
        >
          {todoList}
        </DndContext>
      )}
    </section>
  );
}

function getSortPosition(draggedTodoId: string, targetTodoId: string, todoIds: string[]): DropPosition {
  const draggedIndex = todoIds.indexOf(draggedTodoId);
  const targetIndex = todoIds.indexOf(targetTodoId);
  return draggedIndex < targetIndex ? "after" : "before";
}

type SortableTodoCardProps = Omit<
  React.ComponentProps<typeof TodoCard>,
  "sortableStyle" | "onSortableNode" | "onDragHandleNode" | "dragHandleAttributes" | "dragHandleListeners"
>;

function SortableTodoCard(props: SortableTodoCardProps) {
  const {
    attributes,
    listeners,
    setActivatorNodeRef,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: props.todo.id });

  return (
    <TodoCard
      {...props}
      dragging={props.dragging || isDragging}
      sortableStyle={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      onSortableNode={setNodeRef}
      onDragHandleNode={setActivatorNodeRef}
      dragHandleAttributes={attributes}
      dragHandleListeners={listeners}
    />
  );
}
