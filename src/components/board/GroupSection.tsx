import type { Group, Todo } from "../../types";
import { TodoCard } from "./TodoCard";

interface GroupSectionProps {
  group: Group;
  todos: Todo[];
  selectedTodoId: string | null;
  onSelectTodo: (id: string) => void;
  onCompleteTodo: (id: string) => void;
  onReopenTodo: (id: string) => void;
  onArchiveTodo: (id: string) => void;
}

export function GroupSection({
  group,
  todos,
  selectedTodoId,
  onSelectTodo,
  onCompleteTodo,
  onReopenTodo,
  onArchiveTodo,
}: GroupSectionProps) {
  return (
    <section className="min-w-[260px] flex-1">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-medium text-foreground">{group.name}</h2>
        <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
          {todos.length}
        </span>
      </div>
      <div className="space-y-2">
        {todos.map((todo) => (
          <TodoCard
            key={todo.id}
            todo={todo}
            selected={todo.id === selectedTodoId}
            onSelect={() => onSelectTodo(todo.id)}
            onComplete={() => onCompleteTodo(todo.id)}
            onReopen={() => onReopenTodo(todo.id)}
            onArchive={() => onArchiveTodo(todo.id)}
          />
        ))}
      </div>
    </section>
  );
}
