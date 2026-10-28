import { useEffect, useLayoutEffect, useRef, type CSSProperties } from "react";
import type { DraggableAttributes, DraggableSyntheticListeners } from "@dnd-kit/core";
import { Archive, Bot as BotIcon, Check, CircleCheck, CirclePause, CirclePlay, CircleStop, Flag, GripVertical, Plus, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { BotAvatar, UnreadBadge } from "@/components/bots/BotAvatar";
import { useBotActivity } from "@/components/bots/BotActivity";
import { Textarea } from "@/components/ui/textarea";
import { parseChecklistLine, toggleChecklistLineAtIndex } from "@/lib/checklist";
import { cn } from "@/lib/utils";
import type { Todo, TodoPriority } from "../../types";

interface TodoCardProps {
  todo: Todo;
  /** list：分组列里的行；canvas：画布上的紧凑卡片 */
  variant?: "list" | "canvas";
  /** 画布卡片拉高后默认显示的子项条数，其余悬停时展开 */
  visibleChecklistRows?: number;
  /** 画布卡片：悬停中（含离开后的短暂缓冲）或正在拖动、缩放，展开全部子项 */
  expanded?: boolean;
  selected: boolean;
  editing: boolean;
  editingValue: string;
  editingError: string | null;
  dragging: boolean;
  sortableStyle?: CSSProperties;
  onSortableNode: (node: HTMLElement | null) => void;
  onDragHandleNode?: (node: HTMLElement | null) => void;
  /** 不传时卡片不可拖拽排序（如挂起区中的 Todo） */
  dragHandleAttributes?: DraggableAttributes;
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
  onSetPriority: (priority: TodoPriority) => void;
  onSetSuspended: (suspended: boolean) => void;
}

// 高优 Todo 叠一层很浅的重点色；用渐变叠在原底色上，不替换底色本身，列表的悬停/选中底色也照常生效
const HIGH_PRIORITY_TINT =
  "[background-image:linear-gradient(hsl(var(--easydo-gold)/0.07),hsl(var(--easydo-gold)/0.07))]";

export function TodoCard({
  todo,
  variant = "list",
  visibleChecklistRows = 0,
  expanded = false,
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
  onSetPriority,
  onSetSuspended,
}: TodoCardProps) {
  const done = todo.status === "done";
  const highPriority = todo.priority === "high";
  const suspended = todo.suspendedAt !== null;
  const canvas = variant === "canvas";
  const { bots, runningBotFor, unreadFor, requestDispatch, stop, openMessages, openBotsPage } = useBotActivity();
  const runningBot = runningBotFor(todo.id);
  const unread = unreadFor(todo.id);
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
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <article
          ref={onSortableNode}
          data-todo-card
          data-priority={todo.priority}
          data-suspended={suspended || undefined}
          role="button"
          tabIndex={0}
          onClick={onSelect}
          onContextMenu={onSelect}
          onDoubleClick={(event) => {
            event.stopPropagation();
            onStartEditing();
          }}
          data-bot-running={runningBot ? runningBot.id : undefined}
          // 画布上 Bot 运行中时，卡片投影换成 Bot 的颜色
          style={
            canvas && runningBot
              ? ({
                  ...sortableStyle,
                  "--bot-color": `var(--bot-${runningBot.color})`,
                  boxShadow: "0 0 0 1px hsl(var(--bot-color) / 0.35), 0 4px 14px hsl(var(--bot-color) / 0.32)",
                } as CSSProperties)
              : sortableStyle
          }
          className={cn(
            canvas
              ? cn(
                  "group relative min-h-0 w-full flex-1 cursor-grab select-none overflow-hidden rounded-[4px] border bg-[hsl(var(--easydo-surface)/0.82)] px-2 py-1.5 text-left transition-[border-color,box-shadow,opacity] duration-200 ease-out active:cursor-grabbing",
                  // 编辑中不显示选中描边，卡片外观保持不变，只多一个光标
                  selected && !editing
                    ? "border-easydo-gold"
                    : "border-easydo-border hover:border-[hsl(var(--easydo-text-muted)/0.45)]",
                  // 悬停时投影渐入渐出；高优已有重点色底，投影收小一档
                  !dragging && (highPriority ? "hover:shadow-easydo-card-hover-soft" : "hover:shadow-easydo-card-hover"),
                  done && "opacity-60",
                  dragging && "shadow-easydo-card",
                  highPriority && HIGH_PRIORITY_TINT,
                )
              : cn(
                  "group relative grid w-full grid-cols-[16px_18px_minmax(0,1fr)_auto] items-start gap-x-2 rounded-lg py-2 pl-0.5 pr-1.5 text-left transition-colors duration-200 ease-out",
                  // 行间分隔线：从正文开始、右侧留空，不是整条底线；列表最后一行由容器隐藏
                  "after:pointer-events-none after:absolute after:-bottom-px after:left-[46px] after:right-3 after:h-px after:bg-easydo-borderSoft",
                  selected
                    ? "bg-easydo-surfaceActive"
                    : highPriority
                      ? "bg-transparent hover:bg-[hsl(var(--easydo-surface-hover)/0.3)]"
                      : "bg-transparent hover:bg-[hsl(var(--easydo-surface-hover)/0.55)]",
                  done && "text-easydo-textMuted",
                  dragging && "opacity-35",
                  highPriority && HIGH_PRIORITY_TINT,
                ),
          )}
        >
          {canvas ? null : dragHandleAttributes ? (
            <button
              ref={onDragHandleNode}
              type="button"
              title="拖拽排序"
              className="mt-0.5 grid size-4 shrink-0 cursor-grab place-items-center rounded text-easydo-textMuted opacity-0 transition-opacity hover:text-easydo-cream active:cursor-grabbing group-hover:opacity-100 group-focus-within:opacity-100"
              onClick={(event) => event.stopPropagation()}
              {...dragHandleAttributes}
              {...dragHandleListeners}
            >
              <GripVertical className="size-4" />
              <span className="sr-only">拖拽排序</span>
            </button>
          ) : (
            <span aria-hidden className="size-4 shrink-0" />
          )}

          {canvas ? null : runningBot ? (
            <span className="mt-px grid size-[18px] place-items-center">
              <BotAvatar color={runningBot.color} running title={`${runningBot.name} 运行中`} />
            </span>
          ) : (
          <button
            type="button"
            title={done ? "取消完成" : "完成"}
            className={cn(
              "mt-px grid size-[18px] shrink-0 place-items-center rounded-full border-[1.5px] transition-colors duration-150 hover:border-easydo-gold hover:bg-easydo-goldSoft",
              done
                ? "border-easydo-gold bg-easydo-gold text-easydo-onAccent"
                : "border-easydo-textMuted bg-transparent",
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
            {done ? <Check className="size-3" strokeWidth={3} /> : null}
            <span className="sr-only">{done ? "取消完成" : "完成"}</span>
          </button>
          )}

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
                // 编辑时不加输入框外观，看起来只是卡片上多了一个光标
                className="block min-h-0 resize-none overflow-hidden rounded-none border-0 bg-transparent p-0 text-sm text-easydo-cream shadow-none focus-visible:border-0 focus-visible:ring-0 dark:bg-transparent md:text-sm"
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
              highPriority={highPriority}
              collapsed={canvas && !selected && !expanded}
              pinnedChecklistRows={visibleChecklistRows}
              compact={canvas}
              onToggleChecklistLine={onToggleChecklistLine}
            />
          )}

          {canvas ? null : (
          <span className="-my-1 flex shrink-0 items-center gap-1">
            {/* 操作按钮区：悬停才显示，固定占一个按钮宽，正文不会因悬停重排；按钮多了向左展开 */}
            <span data-row-actions className="relative size-7 shrink-0">
              <span className="absolute inset-y-0 right-0 flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                {/* Bot 运行中不能归档，按钮区留空但仍占位 */}
                {runningBot ? null : (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    title="归档"
                    className="rounded-md text-easydo-textMuted hover:bg-easydo-surfaceActive hover:text-easydo-danger"
                    onClick={(event) => {
                      event.stopPropagation();
                      onArchive();
                    }}
                  >
                    <Archive data-icon="inline-start" />
                    <span className="sr-only">归档</span>
                  </Button>
                )}
              </span>
            </span>
            {/* 有未读时信封常驻最右 */}
            {unread ? (
              <UnreadBadge count={unread.count} onClick={() => openMessages({ todoId: todo.id, botId: unread.botId })} />
            ) : null}
          </span>
          )}
        </article>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuGroup>
          {runningBot ? (
            <ContextMenuItem onSelect={() => stop(todo.id)}>
              <CircleStop />
              停止 {runningBot.name}
            </ContextMenuItem>
          ) : (
            <ContextMenuSub>
              <ContextMenuSubTrigger disabled={todo.status !== "active"}>
                <BotIcon />
                派发给 Bot
              </ContextMenuSubTrigger>
              <ContextMenuSubContent>
                {bots.map((bot) => (
                  <ContextMenuItem key={bot.id} onSelect={() => requestDispatch(todo, bot)}>
                    <BotAvatar color={bot.color} className="size-4 rounded-[4px] [&_svg]:size-3" />
                    {bot.name}
                  </ContextMenuItem>
                ))}
                {bots.length > 0 ? <ContextMenuSeparator /> : null}
                <ContextMenuItem onSelect={openBotsPage}>
                  <Plus />
                  新建 Bot…
                </ContextMenuItem>
              </ContextMenuSubContent>
            </ContextMenuSub>
          )}
        </ContextMenuGroup>
        <ContextMenuSeparator />
        <ContextMenuGroup>
          <ContextMenuItem
            onSelect={() => {
              onSetPriority(highPriority ? "normal" : "high");
            }}
          >
            <Flag className="text-easydo-gold" />
            {highPriority ? "取消高优" : "标记高优"}
          </ContextMenuItem>
          <ContextMenuItem
            onSelect={() => {
              onSetSuspended(!suspended);
            }}
          >
            {suspended ? <CirclePlay /> : <CirclePause />}
            {suspended ? "取消挂起" : "挂起"}
          </ContextMenuItem>
        </ContextMenuGroup>
        {canvas ? (
          <>
            <ContextMenuSeparator />
            <ContextMenuGroup>
              {/* Bot 执行中不允许完成或归档 */}
              <ContextMenuItem disabled={Boolean(runningBot)} onSelect={() => (done ? onReopen() : onComplete())}>
                {done ? <RotateCcw /> : <CircleCheck />}
                {done ? "取消完成" : "完成"}
              </ContextMenuItem>
              <ContextMenuItem variant="destructive" disabled={Boolean(runningBot)} onSelect={onArchive}>
                <Archive />
                归档
              </ContextMenuItem>
            </ContextMenuGroup>
          </>
        ) : null}
      </ContextMenuContent>
    </ContextMenu>
  );
}

interface TodoDetailLinesProps {
  detail: string;
  done: boolean;
  highPriority: boolean;
  /** 画布上收起的卡片：只显示正文，子项要悬停或选中才展开 */
  collapsed?: boolean;
  /** 收起时仍然显示的前几条子项 */
  pinnedChecklistRows?: number;
  /** 画布卡片：字号更小，文字不可选，整张卡都能拖动 */
  compact?: boolean;
  onToggleChecklistLine: (lineIndex: number) => void;
}

function PriorityFlag() {
  return (
    <span title="高优" className="mr-1 inline-flex align-[-2px] text-easydo-gold">
      <Flag className="size-3.5" strokeWidth={2.4} />
      <span className="sr-only">高优</span>
    </span>
  );
}

function TodoDetailLines({
  detail,
  done,
  highPriority,
  collapsed = false,
  pinnedChecklistRows = 0,
  compact = false,
  onToggleChecklistLine,
}: TodoDetailLinesProps) {
  const detailClassName = cn(
    "min-w-0 whitespace-pre-wrap break-words font-normal text-easydo-cream",
    compact ? "block text-sm" : "cursor-text select-text text-sm",
    done && "line-through text-easydo-textMuted",
  );
  // 子项按原文行号定位，所以保留全部行；画布卡片只在渲染时跳过空行，悬停时只会多出子项
  const lines = detail.split("\n");
  const hasChecklist = lines.some((line) => parseChecklistLine(line));
  const flag = highPriority ? <PriorityFlag /> : null;
  const checklistOrderByLine = new Map<number, number>();
  lines.forEach((line, index) => {
    if (parseChecklistLine(line)) {
      checklistOrderByLine.set(index, checklistOrderByLine.size);
    }
  });

  // 列表里双击正文是选中文字；画布卡片几乎整张都是正文，双击正文也要进入编辑
  const stopDoubleClick = compact ? undefined : (event: React.MouseEvent) => event.stopPropagation();

  if (!hasChecklist) {
    return (
      <span className={detailClassName} onDoubleClick={stopDoubleClick}>
        {flag}
        {compact ? lines.filter((line) => line.trim()).join("\n") : detail}
      </span>
    );
  }

  return (
    <span className={cn(detailClassName, "flex flex-col gap-0.5")} onDoubleClick={stopDoubleClick}>
      {lines.map((line, index) => {
        const checklist = parseChecklistLine(line);
        const checklistOrder = checklist ? checklistOrderByLine.get(index) ?? 0 : 0;
        if (!checklist) {
          if (compact && !line.trim()) {
            return null;
          }
          return (
            <span key={index} className="block min-h-[18px]">
              {index === 0 ? flag : null}
              {line}
            </span>
          );
        }

        return (
          <span
            key={index}
            data-checklist-row
            className={cn(
              "min-h-[18px] min-w-0 items-start gap-2 text-sm text-easydo-textSecondary",
              collapsed && checklistOrder >= pinnedChecklistRows ? "hidden" : "flex",
            )}
          >
            {index === 0 ? flag : null}
            <button
              type="button"
              title={checklist.checked ? "标记子任务未完成" : "标记子任务完成"}
              aria-pressed={checklist.checked}
              data-checklist-line={index}
              className={cn(
                "mt-[2px] grid size-3.5 shrink-0 place-items-center rounded-[4px] border-[1.5px] transition-colors duration-150 hover:border-easydo-gold",
                checklist.checked
                  ? "border-easydo-gold bg-easydo-gold text-easydo-onAccent"
                  : "border-easydo-textMuted bg-transparent",
              )}
              onClick={(event) => {
                event.stopPropagation();
                onToggleChecklistLine(index);
              }}
              onDoubleClick={(event) => event.stopPropagation()}
            >
              {checklist.checked ? <Check className="size-2.5" strokeWidth={3.2} /> : null}
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
