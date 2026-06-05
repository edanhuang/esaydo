import type { KeyboardEvent } from "react";
import { Input } from "@/components/ui/input";

interface TodoInputProps {
  value: string;
  currentGroupName: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onNextGroup: () => void;
  onNextBoardView: () => void;
}

export function TodoInput({
  value,
  currentGroupName,
  onChange,
  onSubmit,
  onNextGroup,
  onNextBoardView,
}: TodoInputProps) {
  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" && !event.metaKey) {
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

  return (
    <div className="border-t border-easydo-borderSoft bg-easydo-bg/90 px-5 py-4 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center gap-3 rounded-easydo-lg border border-easydo-border bg-easydo-bgSoft/95 p-2 shadow-easydo-card">
        <div className="min-w-0 rounded-xl border border-easydo-border bg-easydo-surface px-3 py-2 text-sm text-easydo-textSecondary">
        {currentGroupName}
      </div>
        <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={handleKeyDown}
          className="h-12 min-w-0 flex-1 rounded-easydo border-easydo-border bg-easydo-bg text-base text-easydo-cream placeholder:text-easydo-textMuted focus-visible:border-easydo-gold focus-visible:ring-easydo-gold/25"
        placeholder="输入一条 Todo，按 Enter 保存"
        autoFocus
      />
      </div>
    </div>
  );
}
