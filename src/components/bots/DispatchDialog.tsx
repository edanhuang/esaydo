import { useEffect, useRef, useState } from "react";
import { Folder } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FIELD_TEXTAREA_CLASS, FieldBox } from "@/components/ui/field-box";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { dispatchTodoToBot, getBotDispatchPreview } from "@/lib/api";
import { providerLabel } from "@/lib/bots";
import { useLastPresent } from "@/lib/useLastPresent";
import type { Bot, DispatchPreview, Todo } from "@/types";
import { BotAvatar } from "./BotAvatar";

export function DispatchDialog({
  target,
  onClose,
  onDispatched,
}: {
  target: { todo: Todo; bot: Bot } | null;
  onClose: () => void;
  onDispatched: () => void;
}) {
  const [instruction, setInstruction] = useState("");
  const [preview, setPreview] = useState<DispatchPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const isComposingRef = useRef(false);
  const shown = useLastPresent(target);

  useEffect(() => {
    // 关闭时不清空，关闭动画里的内容保持不变；下次打开再重置
    if (!target) {
      return;
    }
    setInstruction("");
    setError(null);
    setPreview(null);
    getBotDispatchPreview(target.todo.id, target.bot.id)
      .then(setPreview)
      .catch(() => setPreview(null));
  }, [target]);

  async function submit() {
    if (!target || submitting) {
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await dispatchTodoToBot(target.todo.id, target.bot.id, instruction);
      onDispatched();
    } catch (nextError) {
      setError(String(nextError));
    } finally {
      setSubmitting(false);
    }
  }

  const headline = shown?.todo.detail.split("\n").find((line) => line.trim()) ?? "";

  return (
    <Dialog open={target !== null} onOpenChange={(open) => (open ? undefined : onClose())}>
      {/* 弹窗是单列 grid：列宽不锁死时，很长的工作目录会把整列撑宽，右侧被裁掉 */}
      <DialogContent className="grid-cols-[minmax(0,1fr)] gap-0 overflow-hidden border-easydo-border bg-easydo-bg p-0 text-easydo-cream shadow-easydo-card sm:max-w-[460px]">
        <DialogHeader className="border-b border-easydo-borderSoft px-4 py-3">
          <DialogTitle className="text-sm font-semibold text-easydo-cream">派发给 Bot</DialogTitle>
          <DialogDescription className="sr-only">把这条 Todo 交给 Bot 处理</DialogDescription>
        </DialogHeader>
        {shown ? (
          <div className="flex flex-col gap-3 px-4 py-4 text-sm">
            <div className="flex items-center gap-2">
              <BotAvatar color={shown.bot.color} />
              <span className="font-medium">{shown.bot.name}</span>
              <span className="text-xs text-easydo-textMuted">
                {providerLabel(shown.bot.provider)}
                {shown.bot.model ? ` · ${shown.bot.model}` : ""}
              </span>
            </div>
            <p className="flex min-w-0 items-center gap-1.5 text-xs text-easydo-textMuted" title={shown.bot.directory}>
              <Folder className="size-3.5 shrink-0" aria-hidden />
              <span className="truncate">{directoryName(shown.bot.directory)}</span>
            </p>
            <p className="line-clamp-2 rounded-md bg-easydo-surface px-2.5 py-2 text-easydo-textSecondary">{headline}</p>
            {preview?.sessionTitle ? (
              <p className="text-xs text-easydo-textSecondary">将继续上次的会话：{preview.sessionTitle}</p>
            ) : null}
            {preview?.sessionWillReset ? (
              <p className="text-xs text-easydo-textSecondary">Bot 换过 AI 或目录，这次会新开会话，之前的上下文不会带过去。</p>
            ) : null}
            <FieldBox className="p-1.5">
            <Textarea
              aria-label="补充说明"
              value={instruction}
              placeholder="补充说明（可选）"
              className={cn(FIELD_TEXTAREA_CLASS, "min-h-20 w-full px-1.5")}
              onChange={(event) => setInstruction(event.target.value)}
              onCompositionStart={() => {
                isComposingRef.current = true;
              }}
              onCompositionEnd={() => {
                isComposingRef.current = false;
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && !isComposingRef.current) {
                  event.preventDefault();
                  void submit();
                }
              }}
            />
            </FieldBox>
            {error ? (
              <p role="alert" className="text-xs text-destructive">
                {error}
              </p>
            ) : null}
          </div>
        ) : null}
        <DialogFooter className="mx-0 mb-0 flex-row items-center justify-end rounded-none border-t border-easydo-borderSoft bg-easydo-bg px-4 py-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 rounded border-easydo-border bg-easydo-surface text-xs text-easydo-textSecondary hover:bg-easydo-surfaceHover hover:text-easydo-cream"
            onClick={onClose}
          >
            取消
          </Button>
          <Button type="button" size="sm" className="h-7 rounded text-xs" disabled={submitting} onClick={() => void submit()}>
            派发
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** 只取末级目录名，完整路径留在悬停提示里 */
function directoryName(path: string) {
  return path.replace(/\/+$/, "").split("/").pop() || path;
}
