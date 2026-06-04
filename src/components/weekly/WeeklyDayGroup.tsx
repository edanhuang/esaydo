import type { Todo } from "../../types";

interface WeeklyDayGroupProps {
  date: string;
  todos: Todo[];
}

export function WeeklyDayGroup({ date, todos }: WeeklyDayGroupProps) {
  return (
    <section className="border-t border-border py-4">
      <h2 className="mb-3 text-sm font-medium text-foreground">{date}</h2>
      <ul className="space-y-2">
        {todos.map((todo) => (
          <li key={todo.id} className="rounded-md bg-card px-3 py-2 text-sm shadow-sm">
            {todo.detail}
          </li>
        ))}
      </ul>
    </section>
  );
}
