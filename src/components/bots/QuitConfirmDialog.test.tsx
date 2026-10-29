import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { QuitConfirmDialog } from "./QuitConfirmDialog";

describe("QuitConfirmDialog", () => {
  it("没有 Bot 在运行时也问一下是否退出，默认聚焦「退出」", () => {
    const onConfirm = vi.fn();
    render(<QuitConfirmDialog runningCount={0} onCancel={vi.fn()} onConfirm={onConfirm} />);

    const dialog = screen.getByRole("dialog", { name: "确定退出 EasyDo 吗？" });
    expect(dialog).not.toHaveAttribute("aria-describedby");
    const quit = screen.getByRole("button", { name: "退出" });
    expect(quit).toHaveFocus();
    fireEvent.click(quit);
    expect(onConfirm).toHaveBeenCalled();
  });

  it("有 Bot 在运行时说明它们会在后台跑完", () => {
    render(<QuitConfirmDialog runningCount={2} onCancel={vi.fn()} onConfirm={vi.fn()} />);

    expect(screen.getByRole("dialog", { name: "有 2 个 Bot 正在运行，确定退出吗？" })).toHaveTextContent(
      "它们会在后台跑完，下次打开时同步结果。",
    );
  });

  it("关着时不显示", () => {
    render(<QuitConfirmDialog runningCount={null} onCancel={vi.fn()} onConfirm={vi.fn()} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
