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
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
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
  onSetTodoSuspended: (id: string, suspended: boolean) => void;
  suspendedExpanded: boolean;
  onToggleSuspendedExpanded: () => void;
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
  fullWidth?: boolean;
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
  onSetTodoSuspended,
  suspendedExpanded,
  onToggleSuspendedExpanded,
  dragState,
  onDragStartTodo,
  onDragOverTodo,
  onReorderTodo,
  onDragEndTodo,
  externalDndContext = false,
  fullWidth = false,
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

  const activeTodos = todos.filter((todo) => todo.suspendedAt === null);
  const suspendedTodos = todos.filter((todo) => todo.suspendedAt !== null);
  const todoIds = activeTodos.map((todo) => todo.id);

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

  function todoCardProps(todo: Todo) {
    return {
      todo,
      selected: todo.id === selectedTodoId,
      editing: todo.id === editingTodoId,
      editingValue: editingDetail,
      editingError: todo.id === editingTodoId ? editingError : null,
      dragging: dragState?.draggedTodoId === todo.id,
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

  const todoList = (
    <div
      ref={listRef}
      data-todo-list
      className="no-scrollbar flex min-h-0 flex-col gap-0.5 overflow-y-auto px-2 pb-2"
    >
      {suspendedTodos.length > 0 ? (
        <div data-suspended-todos>
          <button
            type="button"
            aria-expanded={suspendedExpanded}
            className="flex h-7 w-full items-center gap-1 rounded-md px-2 text-left text-xs text-easydo-textMuted transition-colors hover:bg-easydo-surfaceHover hover:text-easydo-textSecondary"
            onClick={(event) => {
              event.stopPropagation();
              onToggleSuspendedExpanded();
            }}
          >
            <ChevronRight
              className={cn("size-3.5 transition-transform", suspendedExpanded && "rotate-90")}
            />
            已挂起 {suspendedTodos.length}
          </button>
          {suspendedExpanded ? (
            <div className="mb-1 flex flex-col border-b border-easydo-borderSoft pb-1 opacity-70 [&>article:last-child]:after:hidden">
              {suspendedTodos.map((todo) => (
                <TodoCard
                  key={todo.id}
                  {...todoCardProps(todo)}
                  onSortableNode={() => undefined}
                />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
      <SortableContext items={todoIds} strategy={verticalListSortingStrategy}>
        {activeTodos.length > 0 ? (
          <div className="flex flex-col [&>article:last-child]:after:hidden">
            {activeTodos.map((todo) => (
              <SortableTodoCard key={todo.id} {...todoCardProps(todo)} />
            ))}
          </div>
        ) : null}
      </SortableContext>
    </div>
  );

  return (
    <section
      data-group-section={group.id}
      className={cn(
        "flex h-fit max-h-full self-start flex-col overflow-hidden rounded-xl border border-easydo-borderSoft bg-easydo-surface shadow-easydo-card",
        // 视图里只有一个分组时铺满；多个分组时每列至少 360，放不下就横向滚动
        fullWidth ? "w-full" : "min-w-[360px] flex-1",
      )}
      onClick={onSelectGroup}
    >
      <div className="flex h-10 shrink-0 items-center gap-2 px-4">
        <h2 className="text-sm font-semibold text-easydo-cream">{group.name}</h2>
        <span className="text-sm tabular-nums text-easydo-textMuted">
          {activeTodos.length}
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
