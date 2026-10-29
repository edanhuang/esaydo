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
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { FIELD_TEXTAREA_CLASS, FieldBox, FieldSendButton } from "@/components/ui/field-box";
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
      <FieldBox className="mx-auto flex w-full max-w-[960px] items-end gap-2 p-1.5">
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
            className="h-8 max-w-36 shrink-0 rounded border-0 bg-transparent px-2 text-[13px] text-easydo-textSecondary shadow-none hover:bg-easydo-surfaceHover focus-visible:ring-2 focus-visible:ring-ring/50 dark:bg-transparent"
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
          className={cn(FIELD_TEXTAREA_CLASS, "max-h-40 min-w-0 flex-1")}
          placeholder="要做点什么"
          autoFocus
        />
        <FieldSendButton
          title="保存 Todo"
          visible={Boolean(value.trim())}
          disabled={groups.length === 0}
          onClick={onSubmit}
        />
      </FieldBox>
    </div>
  );
}
