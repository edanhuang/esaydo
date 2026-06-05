import { useEffect, useRef, type CSSProperties } from "react";
import type { DraggableAttributes, DraggableSyntheticListeners } from "@dnd-kit/core";
import { Archive, Check, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { Todo } from "../../types";

interface TodoCardProps {
  todo: Todo;
  selected: boolean;
  editing: boolean;
  editingValue: string;
  editingError: string | null;
  dragging: boolean;
  sortableStyle?: CSSProperties;
  onSortableNode: (node: HTMLElement | null) => void;
  onDragHandleNode: (node: HTMLElement | null) => void;
  dragHandleAttributes: DraggableAttributes;
  dragHandleListeners?: DraggableSyntheticListeners;
  onSelect: () => void;
  onStartEditing: () => void;
  onChangeEditingValue: (value: string) => void;
  onSaveEditing: () => void;
  onBlurEditing: () => void;
  onCancelEditing: () => void;
  onComplete: () => void;
  onReopen: () => void;
  onArchive: () => void;
}

export function TodoCard({
  todo,
  selected,
  editing,
  editingValue,
  editingError,
  dragging,
  sortableStyle,
  onSortableNode,
  onDragHandleNode,
  dragHandleAttributes,
  dragHandleListeners,
  onSelect,
  onStartEditing,
  onChangeEditingValue,
  onSaveEditing,
  onBlurEditing,
  onCancelEditing,
  onComplete,
  onReopen,
  onArchive,
}: TodoCardProps) {
  const done = todo.status === "done";
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editing) {
      window.requestAnimationFrame(() => {
        const textarea = textareaRef.current;
        if (!textarea) {
          return;
        }
        const end = textarea.value.length;
        textarea.focus();
        textarea.setSelectionRange(end, end);
        textarea.scrollTop = textarea.scrollHeight;
      });
    }
  }, [editing]);

  function handleEditKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      onSaveEditing();
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      onCancelEditing();
    }
  }

  return (
    <article
      ref={onSortableNode}
      style={sortableStyle}
      data-todo-card
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onDoubleClick={(event) => {
        event.stopPropagation();
        onStartEditing();
      }}
      className={cn(
        "group relative flex w-full items-center gap-1 rounded-easydo border py-2 pl-0.5 pr-2 text-left shadow-easydo-card transition duration-150 ease-out hover:-translate-y-px",
        selected
          ? "border-easydo-gold bg-easydo-surfaceHover shadow-easydo-glow"
          : "border-easydo-border bg-easydo-surface hover:border-easydo-gold/40 hover:bg-easydo-surfaceHover",
        done && "text-easydo-textMuted opacity-60",
        dragging && "opacity-35",
      )}
    >
      <button
        ref={onDragHandleNode}
        type="button"
        title="拖拽排序"
        className="grid size-5 shrink-0 cursor-grab place-items-center rounded-md text-easydo-textMuted opacity-0 transition hover:bg-easydo-surfaceActive hover:text-easydo-cream active:cursor-grabbing group-hover:opacity-100 group-focus-within:opacity-100"
        onClick={(event) => event.stopPropagation()}
        {...dragHandleAttributes}
        {...dragHandleListeners}
      >
        <GripVertical className="size-4" />
        <span className="sr-only">拖拽排序</span>
      </button>

      <button
        type="button"
        title={done ? "取消完成" : "完成"}
        className={cn(
          "grid size-5 shrink-0 place-items-center rounded-full border transition hover:border-easydo-gold hover:bg-easydo-gold/15",
          done
            ? "border-easydo-gold bg-easydo-gold text-primary-foreground shadow-easydo-glow"
            : selected
              ? "border-easydo-gold bg-easydo-gold/15"
              : "border-easydo-border bg-easydo-bgSoft",
        )}
        onClick={(event) => {
          event.stopPropagation();
          if (done) {
            onReopen();
          } else {
            onComplete();
          }
        }}
      >
        {done ? <Check className="size-3.5" /> : null}
        <span className="sr-only">{done ? "取消完成" : "完成"}</span>
      </button>

      {editing ? (
        <div
          className="min-w-0 flex-1"
          onClick={(event) => {
            event.stopPropagation();
          }}
        >
          <Textarea
            ref={textareaRef}
            value={editingValue}
            onChange={(event) => onChangeEditingValue(event.target.value)}
            onKeyDown={handleEditKeyDown}
            onBlur={onBlurEditing}
            aria-invalid={Boolean(editingError)}
            className="max-h-40 min-h-20 resize-none rounded-xl border-easydo-gold/50 bg-easydo-bgSoft text-easydo-cream shadow-easydo-glow"
          />
          {editingError ? (
            <p role="alert" className="mt-1 text-xs text-destructive">
              {editingError}
            </p>
          ) : null}
        </div>
      ) : (
        <span className={cn("min-w-0 flex-1 whitespace-pre-wrap break-words text-sm font-medium leading-5 text-easydo-cream", done && "line-through text-easydo-textMuted")}>
          {todo.detail}
        </span>
      )}

      <span className="flex shrink-0 items-center gap-1 opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          title="归档"
          className="text-easydo-textMuted hover:bg-easydo-surfaceActive hover:text-easydo-danger"
          onClick={(event) => {
            event.stopPropagation();
            onArchive();
          }}
        >
          <Archive data-icon="inline-start" />
          <span className="sr-only">归档</span>
        </Button>
      </span>
    </article>
  );
}
