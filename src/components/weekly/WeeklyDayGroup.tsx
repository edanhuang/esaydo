import type { Todo } from "../../types";

interface WeeklyDayGroupProps {
  date: string;
  todos: Todo[];
}

export function WeeklyDayGroup({ date, todos }: WeeklyDayGroupProps) {
  return (
    <section className="rounded-easydo-lg border border-easydo-borderSoft bg-easydo-bgSoft/70 p-4 shadow-easydo-card">
      <h2 className="mb-3 text-sm font-semibold text-easydo-lavenderSoft">{date}</h2>
      <ul className="flex flex-col gap-2">
        {todos.map((todo) => (
          <li
            key={todo.id}
            className="rounded-easydo border border-easydo-border bg-easydo-surface px-3.5 py-3 text-sm font-medium text-easydo-cream shadow-easydo-card"
          >
            {todo.detail}
          </li>
        ))}
      </ul>
    </section>
  );
}
