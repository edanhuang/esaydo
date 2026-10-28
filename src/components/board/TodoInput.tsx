import type { KeyboardEvent } from "react";
import { useLayoutEffect, useRef } from "react";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowUp } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Squircle } from "@/components/ui/squircle";
import type { Group } from "@/types";

interface TodoInputProps {
  value: string;
  groups: Group[];
  currentGroupId: string | null;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onSelectGroup: (index: number) => void;
  onNextGroup: () => void;
  onNextBoardView: () => void;
  /** Option+Tab：切换当前视图的画布 / 列表 */
  onToggleLayout?: () => void;
}

export function TodoInput({
  value,
  groups,
  currentGroupId,
  onChange,
  onSubmit,
  onSelectGroup,
  onNextGroup,
  onNextBoardView,
  onToggleLayout,
}: TodoInputProps) {
  const isComposingRef = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const currentGroup = groups.find((group) => group.id === currentGroupId) ?? null;

  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }

    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px`;
    textarea.style.overflowY = textarea.scrollHeight > 160 ? "auto" : "hidden";
  }, [value]);

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.metaKey) {
      if (isComposing(event)) {
        return;
      }

      event.preventDefault();
      onSubmit();
      return;
    }

    if (event.key === "Tab") {
      event.preventDefault();
      if (event.altKey) {
        onToggleLayout?.();
      } else if (event.shiftKey) {
        onNextBoardView();
      } else {
        onNextGroup();
      }
    }
  }

  function isComposing(event: KeyboardEvent<HTMLTextAreaElement>) {
    const nativeEvent = event.nativeEvent as globalThis.KeyboardEvent & {
      isComposing?: boolean;
      keyCode?: number;
    };
    return Boolean(isComposingRef.current || nativeEvent.isComposing || nativeEvent.keyCode === 229);
  }

  return (
    <div className="bg-dot-grid shrink-0 bg-easydo-bg px-4 pb-2.5 pt-1">
      <Squircle
        radius={14}
        fill="hsl(var(--easydo-surface))"
        stroke="hsl(var(--easydo-border))"
        // 平时只留很轻的投影，悬停或聚焦时略微浮起
        shadow="var(--easydo-shadow-composer)"
        raisedShadow="var(--easydo-shadow-composer-focus)"
        className="mx-auto flex w-full max-w-[960px] items-end gap-2 p-1.5"
      >
        <Select
          value={currentGroupId ?? undefined}
          onValueChange={(groupId) => {
            const index = groups.findIndex((group) => group.id === groupId);
            if (index >= 0) {
              onSelectGroup(index);
            }
          }}
          disabled={groups.length === 0}
        >
          <SelectTrigger
            size="default"
            data-input-group-label
            aria-label="选择录入 Group"
            className="h-8 max-w-36 shrink-0 rounded border-0 bg-transparent px-2 text-[14px] text-easydo-textSecondary shadow-none hover:bg-easydo-surfaceHover focus-visible:ring-2 focus-visible:ring-ring/50 dark:bg-transparent"
          >
            <SelectValue placeholder="未配置">
              {currentGroup?.name ?? "未配置"}
            </SelectValue>
          </SelectTrigger>
          <SelectContent position="popper" side="top" align="start" className="rounded-xl">
            <SelectGroup>
              {groups.map((group) => (
                <SelectItem
                  key={group.id}
                  value={group.id}
                  className="rounded-md"
                >
                  {group.name}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        <Textarea
          ref={textareaRef}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={handleKeyDown}
          onCompositionStart={() => {
            isComposingRef.current = true;
          }}
          onCompositionEnd={() => {
            isComposingRef.current = false;
          }}
          rows={1}
          className="max-h-40 min-h-8 min-w-0 flex-1 resize-none rounded-none border-0 bg-transparent px-1 py-1.5 text-[15px] leading-5 text-easydo-cream md:text-[15px] md:leading-5 shadow-none caret-[hsl(var(--easydo-text-muted)/0.7)] placeholder:text-[14px] placeholder:font-light placeholder:text-[hsl(var(--easydo-text-muted)/0.55)] focus-visible:border-0 focus-visible:ring-0 dark:bg-transparent"
          placeholder="要做点什么"
          autoFocus
        />
        <button
          type="button"
          title="保存 Todo"
          disabled={!value.trim() || groups.length === 0}
          onClick={onSubmit}
          className="mb-1 mr-1.5 grid size-6 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground transition-opacity duration-150 hover:opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:cursor-not-allowed disabled:opacity-35"
        >
          <ArrowUp className="size-3" />
          <span className="sr-only">保存 Todo</span>
        </button>
      </Squircle>
    </div>
  );
}
