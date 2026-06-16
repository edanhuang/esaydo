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
      if (event.shiftKey) {
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
    <div className="flex shrink-0 items-end gap-1.5 border-t border-easydo-borderSoft bg-easydo-bg px-3 py-2">
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
          size="sm"
          data-input-group-label
          aria-label="选择录入 Group"
          className="h-8 max-w-36 shrink-0 rounded-none border-0 bg-transparent px-2 text-easydo-textSecondary shadow-none focus-visible:border-0 focus-visible:ring-0"
        >
          <SelectValue placeholder="未配置">
            {currentGroup?.name ?? "未配置"}
          </SelectValue>
        </SelectTrigger>
        <SelectContent position="popper" side="top" align="start" className="rounded-md">
          <SelectGroup>
            {groups.map((group) => (
              <SelectItem
                key={group.id}
                value={group.id}
                className="rounded-sm"
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
        className="max-h-40 min-h-8 min-w-0 flex-1 resize-none rounded-none border-0 bg-transparent px-2 py-1.5 text-base leading-5 text-easydo-cream shadow-none placeholder:text-easydo-textMuted focus-visible:border-0 focus-visible:ring-0"
        placeholder="输入一条 Todo，按 Enter 保存"
        autoFocus
      />
    </div>
  );
}
