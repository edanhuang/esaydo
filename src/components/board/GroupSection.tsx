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
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
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

  return (
    <section className="flex min-h-0 min-w-[280px] flex-1 flex-col rounded-easydo-lg border border-easydo-borderSoft bg-easydo-bgSoft/55 p-2.5 shadow-easydo-card">
      <div className="mb-2.5 flex items-center justify-between px-1">
        <h2 className="text-base font-semibold text-easydo-cream">{group.name}</h2>
        <span className="rounded-full border border-easydo-border bg-easydo-surface px-2.5 py-1 text-xs text-easydo-textMuted">
          {todos.length}
        </span>
      </div>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={onDragEndTodo}
      >
        <SortableContext items={todoIds} strategy={verticalListSortingStrategy}>
          <div className="no-scrollbar flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
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
                onComplete={() => onCompleteTodo(todo.id)}
                onReopen={() => onReopenTodo(todo.id)}
                onArchive={() => onArchiveTodo(todo.id)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
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
