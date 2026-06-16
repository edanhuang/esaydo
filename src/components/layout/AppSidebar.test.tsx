import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { BoardView, Group } from "@/types";
import { AppSidebar } from "./AppSidebar";

const groups: Group[] = [
  makeGroup("work", "工作", 0),
  makeGroup("study", "学习", 1),
];

describe("AppSidebar board groups", () => {
  it("keeps the header compact and renders shortcut keycaps without brand copy", () => {
    renderSidebar(makeBoardView("work-view", "工作", [groups[0]]));

    expect(screen.queryByText("EasyDo")).not.toBeInTheDocument();
    expect(screen.queryByText("One snap, tasks are handled.")).not.toBeInTheDocument();
    expect(screen.queryByText("Keyboard flow")).not.toBeInTheDocument();
    expect(screen.getByText("上一条")).toBeInTheDocument();
    expect(screen.getByText("完成 / 恢复")).toBeInTheDocument();
    expect(document.querySelectorAll('[data-slot="kbd"]')).toHaveLength(7);
    expect(document.querySelector("[data-sidebar-scroll]")).toHaveClass(
      "flex-1",
      "overflow-y-auto",
    );
    expect(document.querySelector("[data-sidebar-shortcuts]")).toHaveClass(
      "shrink-0",
      "rounded-lg",
      "bg-muted/60",
    );
  });

  it("highlights groups included in the current view and exposes plus or minus actions", () => {
    const onSetMembership = vi.fn();
    const onSelectGroup = vi.fn();
    renderSidebar(makeBoardView("work-view", "工作", [groups[0]]), {
      onSetMembership,
      onSelectGroup,
    });

    expect(getGroupRow("work")).toHaveAttribute("data-included", "true");
    expect(getGroupRow("study")).toHaveAttribute("data-included", "false");

    fireEvent.click(screen.getByTitle("从当前 View 移除 工作"));
    expect(onSetMembership).toHaveBeenCalledWith("work", false);
    expect(onSelectGroup).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTitle("添加 学习 到当前 View"));
    expect(onSetMembership).toHaveBeenCalledWith("study", true);
  });

  it("does not expose membership actions for the All view", () => {
    renderSidebar(makeBoardView("all", "所有", []));

    expect(getGroupRow("work")).toHaveAttribute("data-included", "true");
    expect(getGroupRow("study")).toHaveAttribute("data-included", "true");
    expect(screen.queryByTitle("从当前 View 移除 工作")).not.toBeInTheDocument();
    expect(screen.queryByTitle("添加 学习 到当前 View")).not.toBeInTheDocument();
  });

  it("selects an input group without applying a separate current-group style", () => {
    const onSelectGroup = vi.fn();
    renderSidebar(makeBoardView("work-view", "工作", [groups[0]]), { onSelectGroup });

    fireEvent.click(screen.getByRole("button", { name: "学习" }));

    expect(onSelectGroup).toHaveBeenCalledWith(1);
    expect(getGroupRow("study")).not.toHaveClass("ring-1", "text-easydo-gold");
  });

  it("shows the inbox only when non-empty or currently active", () => {
    const onOpenInbox = vi.fn();
    const { rerender } = render(
      <AppSidebar
        view="board"
        collapsed={false}
        currentBoardView={makeBoardView("all", "所有", [])}
        groups={groups}
        showBoardControls
        inboxCount={2}
        onOpenInbox={onOpenInbox}
        onNavigate={vi.fn()}
        onToggleCollapsed={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /收件箱/ }));
    expect(onOpenInbox).toHaveBeenCalled();
    expect(screen.getByText("2")).toBeInTheDocument();

    rerender(
      <AppSidebar
        view="board"
        collapsed={false}
        currentBoardView={makeBoardView("all", "所有", [])}
        groups={groups}
        showBoardControls
        inboxCount={0}
        onNavigate={vi.fn()}
        onToggleCollapsed={vi.fn()}
      />,
    );
    expect(screen.queryByRole("button", { name: /收件箱/ })).not.toBeInTheDocument();
  });

  it("turns regular groups into inbox drop targets without membership actions", () => {
    render(
      <AppSidebar
        view="board"
        collapsed={false}
        currentBoardView={{
          ...makeBoardView("inbox-view", "收件箱", []),
          systemKey: "inbox",
        }}
        groups={groups}
        showBoardControls
        inboxActive
        inboxDropEnabled
        onNavigate={vi.fn()}
        onToggleCollapsed={vi.fn()}
      />,
    );

    expect(getGroupRow("work")).toHaveAttribute("data-drop-enabled", "true");
    expect(screen.queryByTitle("添加 工作 到当前 View")).not.toBeInTheDocument();
  });
});

function renderSidebar(
  currentBoardView: BoardView,
  callbacks: {
    onSetMembership?: (groupId: string, included: boolean) => void;
    onSelectGroup?: (index: number) => void;
  } = {},
) {
  return render(
    <AppSidebar
      view="board"
      collapsed={false}
      currentBoardView={currentBoardView}
      groups={groups}
      showBoardControls
      onNavigate={vi.fn()}
      onToggleCollapsed={vi.fn()}
      onSelectGroup={callbacks.onSelectGroup}
      onSetBoardViewGroupMembership={callbacks.onSetMembership}
    />,
  );
}

function getGroupRow(id: string) {
  return document.querySelector(`[data-sidebar-group="${id}"]`) as HTMLElement;
}

function makeGroup(id: string, name: string, sortOrder: number): Group {
  return {
    id,
    name,
    sortOrder,
    systemKey: null,
    createdAt: "2026-06-10T00:00:00.000Z",
    updatedAt: "2026-06-10T00:00:00.000Z",
  };
}

function makeBoardView(id: string, name: string, viewGroups: Group[]): BoardView {
  return {
    id,
    name,
    sortOrder: 0,
    systemKey: name === "所有" ? "all" : null,
    groups: viewGroups,
    createdAt: "2026-06-10T00:00:00.000Z",
    updatedAt: "2026-06-10T00:00:00.000Z",
  };
}
