import { useEffect, useLayoutEffect, useRef, type CSSProperties } from "react";
import type { DraggableAttributes, DraggableSyntheticListeners } from "@dnd-kit/core";
import { Archive, Check, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { parseChecklistLine, toggleChecklistLineAtIndex } from "@/lib/checklist";
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
  onToggleChecklistLine: (lineIndex: number) => void;
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
  onToggleChecklistLine,
  onComplete,
  onReopen,
  onArchive,
}: TodoCardProps) {
  const done = todo.status === "done";
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isComposingRef = useRef(false);
  const selectionAfterToggleRef = useRef<{ start: number; end: number } | null>(null);

  useLayoutEffect(() => {
    if (!editing) {
      return;
    }
    resizeEditingTextarea();
    if (!isComposingRef.current) {
      keepEditingCardVisible();
    }
  }, [editing, editingValue]);

  useEffect(() => {
    if (editing) {
      window.requestAnimationFrame(() => {
        const textarea = textareaRef.current;
        if (!textarea) {
          return;
        }
        resizeEditingTextarea();
        const end = textarea.value.length;
        textarea.focus();
        textarea.setSelectionRange(end, end);
        keepEditingCardVisible();
      });
    }
  }, [editing]);

  useLayoutEffect(() => {
    const selection = selectionAfterToggleRef.current;
    const textarea = textareaRef.current;
    if (!selection || !textarea) {
      return;
    }

    textarea.setSelectionRange(selection.start, selection.end);
    selectionAfterToggleRef.current = null;
  }, [editingValue]);

  function resizeEditingTextarea() {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }
    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight}px`;
  }

  function keepEditingCardVisible() {
    const textarea = textareaRef.current;
    const card = textarea?.closest<HTMLElement>("[data-todo-card]");
    const list = textarea?.closest<HTMLElement>("[data-todo-list]");
    if (!textarea || !card || !list) {
      return;
    }

    const cardRect = card.getBoundingClientRect();
    const listRect = list.getBoundingClientRect();
    const bottomPadding = 20;

    if (cardRect.bottom > listRect.bottom - bottomPadding) {
      list.scrollTop += cardRect.bottom - (listRect.bottom - bottomPadding);
      return;
    }

    if (cardRect.top < listRect.top) {
      list.scrollTop -= listRect.top - cardRect.top;
    }
  }

  function handleToggleChecklistShortcut() {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }

    const lineIndex = editingValue.slice(0, textarea.selectionStart).split("\n").length - 1;
    const nextValue = toggleChecklistLineAtIndex(editingValue, lineIndex);
    const delta = nextValue.length - editingValue.length;
    selectionAfterToggleRef.current = {
      start: textarea.selectionStart + delta,
      end: textarea.selectionEnd + delta,
    };
    onChangeEditingValue(nextValue);
  }

  function isComposing(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    const nativeEvent = event.nativeEvent as globalThis.KeyboardEvent & {
      isComposing?: boolean;
      keyCode?: number;
    };
    return Boolean(isComposingRef.current || nativeEvent.isComposing || nativeEvent.keyCode === 229);
  }

  function handleEditKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.metaKey && event.shiftKey && event.key.toLowerCase() === "s") {
      event.preventDefault();
      handleToggleChecklistShortcut();
      return;
    }

    if (event.key === "Enter" && !event.shiftKey) {
      if (isComposing(event)) {
        return;
      }

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
        "group relative flex w-full items-center gap-2.5 py-1.5 pl-px pr-2 text-left transition-colors duration-150 ease-out",
        selected
          ? "bg-easydo-surfaceActive"
          : "bg-transparent hover:bg-easydo-surfaceHover",
        done && "text-easydo-textMuted opacity-60",
        dragging && "opacity-35",
      )}
    >
      <button
        ref={onDragHandleNode}
        type="button"
        title="拖拽排序"
        className="grid size-4 shrink-0 cursor-grab place-items-center text-easydo-textMuted opacity-0 transition hover:bg-easydo-surfaceActive hover:text-easydo-cream active:cursor-grabbing group-hover:opacity-100 group-focus-within:opacity-100"
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
            onCompositionStart={() => {
              isComposingRef.current = true;
            }}
            onCompositionEnd={() => {
              isComposingRef.current = false;
              window.requestAnimationFrame(() => {
                resizeEditingTextarea();
                keepEditingCardVisible();
              });
            }}
            onBlur={onBlurEditing}
            aria-invalid={Boolean(editingError)}
            rows={1}
            className="min-h-11 resize-none overflow-hidden rounded-none border-easydo-gold/50 bg-easydo-bgSoft text-easydo-cream shadow-easydo-glow"
          />
          {editingError ? (
            <p role="alert" className="mt-1 text-xs text-destructive">
              {editingError}
            </p>
          ) : null}
        </div>
      ) : (
        <TodoDetailLines
          detail={todo.detail}
          done={done}
          onToggleChecklistLine={onToggleChecklistLine}
        />
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

interface TodoDetailLinesProps {
  detail: string;
  done: boolean;
  onToggleChecklistLine: (lineIndex: number) => void;
}

function TodoDetailLines({ detail, done, onToggleChecklistLine }: TodoDetailLinesProps) {
  const detailClassName = cn(
    "min-w-0 flex-1 cursor-text select-text whitespace-pre-wrap break-words text-sm font-normal leading-5 text-easydo-cream",
    done && "line-through text-easydo-textMuted",
  );
  const lines = detail.split("\n");
  const hasChecklist = lines.some((line) => parseChecklistLine(line));

  if (!hasChecklist) {
    return (
      <span className={detailClassName} onDoubleClick={(event) => event.stopPropagation()}>
        {detail}
      </span>
    );
  }

  return (
    <span className={detailClassName} onDoubleClick={(event) => event.stopPropagation()}>
      {lines.map((line, index) => {
        const checklist = parseChecklistLine(line);
        if (!checklist) {
          return (
            <span key={index} className="block min-h-5">
              {line}
            </span>
          );
        }

        return (
          <span key={index} className="flex min-h-5 min-w-0 items-start gap-2">
            <button
              type="button"
              title={checklist.checked ? "标记子任务未完成" : "标记子任务完成"}
              aria-pressed={checklist.checked}
              data-checklist-line={index}
              className={cn(
                "mt-0.5 grid size-4 shrink-0 place-items-center rounded border transition hover:border-easydo-gold hover:bg-easydo-gold/15",
                checklist.checked
                  ? "border-easydo-gold bg-easydo-gold text-primary-foreground"
                  : "border-easydo-border bg-easydo-bgSoft",
              )}
              onClick={(event) => {
                event.stopPropagation();
                onToggleChecklistLine(index);
              }}
              onDoubleClick={(event) => event.stopPropagation()}
            >
              {checklist.checked ? <Check className="size-3" /> : null}
              <span className="sr-only">
                {checklist.checked ? "标记子任务未完成" : "标记子任务完成"}
              </span>
            </button>
            <span className={cn("min-w-0 flex-1", checklist.checked && "text-easydo-textMuted")}>
              {checklist.text}
            </span>
          </span>
        );
      })}
    </span>
  );
}
