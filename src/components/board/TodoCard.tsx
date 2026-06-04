import { Archive, Check, RotateCcw } from "lucide-react";
import clsx from "clsx";
import type { Todo } from "../../types";

interface TodoCardProps {
  todo: Todo;
  selected: boolean;
  onSelect: () => void;
  onComplete: () => void;
  onReopen: () => void;
  onArchive: () => void;
}

export function TodoCard({
  todo,
  selected,
  onSelect,
  onComplete,
  onReopen,
  onArchive,
}: TodoCardProps) {
  const done = todo.status === "done";

  return (
    <button
      type="button"
      onClick={onSelect}
      className={clsx(
        "group flex w-full items-center gap-3 rounded-md border bg-card px-3 py-3 text-left shadow-sm transition",
        selected ? "border-primary ring-2 ring-primary/20" : "border-border hover:border-primary/40",
        done && "text-muted-foreground",
      )}
    >
      <span
        className={clsx(
          "grid h-5 w-5 shrink-0 place-items-center rounded-full border",
          done ? "border-primary bg-primary text-primary-foreground" : "border-border",
        )}
        aria-hidden="true"
      >
        {done ? <Check className="h-3.5 w-3.5" /> : null}
      </span>
      <span className={clsx("min-w-0 flex-1 text-sm leading-5", done && "line-through")}>
        {todo.detail}
      </span>
      <span className="flex shrink-0 items-center gap-1 opacity-0 transition group-hover:opacity-100">
        {done ? (
          <span
            role="button"
            tabIndex={-1}
            title="取消完成"
            className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={(event) => {
              event.stopPropagation();
              onReopen();
            }}
          >
            <RotateCcw className="h-4 w-4" />
          </span>
        ) : (
          <span
            role="button"
            tabIndex={-1}
            title="完成"
            className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={(event) => {
              event.stopPropagation();
              onComplete();
            }}
          >
            <Check className="h-4 w-4" />
          </span>
        )}
        <span
          role="button"
          tabIndex={-1}
          title="归档"
          className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          onClick={(event) => {
            event.stopPropagation();
            onArchive();
          }}
        >
          <Archive className="h-4 w-4" />
        </span>
      </span>
    </button>
  );
}
