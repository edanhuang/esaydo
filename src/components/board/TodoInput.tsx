import type { KeyboardEvent } from "react";

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
    <div className="flex items-center gap-3 border-t border-border bg-background/95 px-5 py-4">
      <div className="min-w-0 rounded-md border border-border bg-card px-3 py-2 text-sm text-muted-foreground">
        {currentGroupName}
      </div>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={handleKeyDown}
        className="h-11 min-w-0 flex-1 rounded-md border border-border bg-card px-4 text-base text-foreground shadow-sm outline-none placeholder:text-muted-foreground"
        placeholder="输入一条 Todo，按 Enter 保存"
        autoFocus
      />
    </div>
  );
}
