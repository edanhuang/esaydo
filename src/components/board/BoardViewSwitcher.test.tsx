import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { BoardView } from "@/types";
import { BoardViewSwitcher } from "./BoardViewSwitcher";

const boardViews: BoardView[] = [
  makeBoardView("all", "所有", 0),
  makeBoardView("work", "工作", 1),
  makeBoardView("personal", "个人", 2),
];

describe("BoardViewSwitcher", () => {
  it("shows only the current view until hovered", () => {
    renderSwitcher();

    expect(screen.getByText("所有")).toBeInTheDocument();
    expect(screen.queryByText("工作")).not.toBeInTheDocument();

    fireEvent.pointerEnter(getSwitcher());

    expect(screen.getAllByRole("tab")).toHaveLength(3);
    expect(screen.getByRole("tab", { name: "所有" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "工作" })).toHaveClass("opacity-45");
  });

  it("selects a clicked view with a horizontal direction", () => {
    const onSelectView = vi.fn();
    renderSwitcher({ onSelectView });
    fireEvent.pointerEnter(getSwitcher());

    fireEvent.click(screen.getByRole("tab", { name: "工作" }));

    expect(onSelectView).toHaveBeenCalledWith(1, "right");
  });

  it("does not switch by pointer drag while hovered", () => {
    const onSelectView = vi.fn();
    renderSwitcher({ onSelectView });
    const switcher = getSwitcher();
    fireEvent.pointerEnter(switcher);

    fireEvent.pointerDown(switcher, { clientX: 200, pointerId: 1 });
    fireEvent.pointerMove(switcher, { clientX: 80, pointerId: 1 });
    fireEvent.pointerUp(switcher, { clientX: 80, pointerId: 1 });

    expect(onSelectView).not.toHaveBeenCalled();
    expect(screen.getAllByRole("tab")).toHaveLength(3);
  });

  it("renders a sliding active indicator while expanded", async () => {
    renderSwitcher();

    fireEvent.pointerEnter(getSwitcher());

    await waitFor(() =>
      expect(document.querySelector("[data-view-active-indicator]")).toBeInTheDocument(),
    );
  });

  it("exposes the transition direction after a view change", () => {
    const { rerender } = renderSwitcher();
    rerender(
      <BoardViewSwitcher
        boardViews={boardViews}
        currentIndex={1}
        transitionDirection="left"
        transitionKey={1}
        onSelectView={vi.fn()}
      />,
    );

    expect(document.querySelector("[data-view-direction]")).toHaveAttribute(
      "data-view-direction",
      "left",
    );
  });

  it("stays expanded for an empty view and shows a hidden current view label", () => {
    renderSwitcher({
      currentIndex: -1,
      currentView: {
        ...makeBoardView("inbox", "收件箱", 9),
        systemKey: "inbox",
      },
      forceExpanded: true,
    });

    expect(getSwitcher()).toHaveAttribute("data-force-expanded", "true");
    expect(screen.getByText("收件箱")).toHaveAttribute("data-hidden-current-view");
    expect(screen.getAllByRole("tab")).toHaveLength(3);
  });
});

function renderSwitcher(
  overrides: Partial<React.ComponentProps<typeof BoardViewSwitcher>> = {},
) {
  return render(
    <BoardViewSwitcher
      boardViews={boardViews}
      currentIndex={0}
      transitionDirection="right"
      transitionKey={0}
      onSelectView={vi.fn()}
      {...overrides}
    />,
  );
}

function getSwitcher() {
  return document.querySelector("[data-board-view-switcher]") as HTMLElement;
}

function makeBoardView(id: string, name: string, sortOrder: number): BoardView {
  return {
    id,
    name,
    sortOrder,
    systemKey: name === "所有" ? "all" : null,
    groups: [],
    createdAt: "2026-06-10T00:00:00.000Z",
    updatedAt: "2026-06-10T00:00:00.000Z",
  };
}
