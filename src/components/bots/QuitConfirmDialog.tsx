import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useLastPresent } from "@/lib/useLastPresent";

/** 按 ⌘Q 时确认是否退出；有 Bot 在运行时说明它们会在后台继续跑完，下次打开 EasyDo 时同步结果 */
export function QuitConfirmDialog({
  runningCount,
  onCancel,
  onConfirm,
}: {
  runningCount: number | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const shownCount = useLastPresent(runningCount);
  return (
    <Dialog open={runningCount !== null} onOpenChange={(open) => (open ? undefined : onCancel())}>
      <DialogContent
        showCloseButton={false}
        className="grid-cols-[minmax(0,1fr)] gap-3 border-easydo-border bg-easydo-bg text-easydo-cream shadow-easydo-card sm:max-w-[380px]"
      >
        <DialogHeader>
          <DialogTitle className="text-sm font-semibold text-easydo-cream">
            {shownCount ? `有 ${shownCount} 个 Bot 正在运行，确定退出吗？` : "确定退出 EasyDo 吗？"}
          </DialogTitle>
          <DialogDescription className="text-xs leading-5 text-easydo-textSecondary">
            {shownCount
              ? "退出后它们会在后台继续跑完，下次打开 EasyDo 时同步结果。要中断它们，先在右键菜单里停止。再按一次 ⌘Q 也可以直接退出。"
              : "再按一次 ⌘Q 也可以直接退出。"}
          </DialogDescription>
        </DialogHeader>
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 rounded border-easydo-border bg-easydo-surface text-xs text-easydo-textSecondary hover:bg-easydo-surfaceHover hover:text-easydo-cream"
            onClick={onCancel}
          >
            取消
          </Button>
          {/* 默认聚焦「退出」：回车即可确认 */}
          <Button type="button" size="sm" autoFocus className="h-7 rounded text-xs" onClick={onConfirm}>
            退出
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
