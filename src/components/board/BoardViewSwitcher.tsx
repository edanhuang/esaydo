import { useLayoutEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { BoardView } from "@/types";

export type BoardViewTransitionDirection = "left" | "right";

interface BoardViewSwitcherProps {
  boardViews: BoardView[];
  currentIndex: number;
  currentView?: BoardView | null;
  forceExpanded?: boolean;
  transitionDirection: BoardViewTransitionDirection;
  transitionKey: number;
  onSelectView: (index: number, direction: BoardViewTransitionDirection) => void;
}

export function BoardViewSwitcher({
  boardViews,
  currentIndex,
  currentView: currentViewProp,
  forceExpanded = false,
  transitionDirection,
  transitionKey,
  onSelectView,
}: BoardViewSwitcherProps) {
  const [expanded, setExpanded] = useState(false);
  const [activeRect, setActiveRect] = useState<{ left: number; width: number } | null>(null);
  const tablistRef = useRef<HTMLDivElement>(null);
  const currentView = currentViewProp ?? boardViews[currentIndex] ?? boardViews[0];
  const isExpanded = forceExpanded || expanded;

  useLayoutEffect(() => {
    if (!isExpanded || !currentView || currentIndex < 0) {
      setActiveRect(null);
      return;
    }

    const activeTab = tablistRef.current?.querySelectorAll<HTMLButtonElement>(
      'button[role="tab"]',
    )[currentIndex];
    if (!activeTab) {
      return;
    }

    setActiveRect({
      left: activeTab.offsetLeft,
      width: activeTab.offsetWidth,
    });
  }, [boardViews, currentIndex, currentView, isExpanded, transitionKey]);

  if (!currentView) {
    return null;
  }

  return (
    <div
      data-board-view-switcher
      data-expanded={isExpanded}
      data-force-expanded={forceExpanded}
      tabIndex={0}
      aria-label="切换 Board View"
      className={cn(
        "no-scrollbar flex min-h-8 w-fit max-w-full items-center overflow-x-auto px-0.5 transition-[width,background-color] duration-200",
        isExpanded && "bg-easydo-bgSoft/70",
      )}
      onPointerEnter={() => setExpanded(true)}
      onPointerLeave={() => {
        if (!forceExpanded) {
          setExpanded(false);
        }
      }}
      onFocusCapture={() => setExpanded(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          if (!forceExpanded) {
            setExpanded(false);
          }
        }
      }}
    >
      {isExpanded ? (
        <div
          ref={tablistRef}
          role="tablist"
          aria-label="Board Views"
          className="relative flex w-max items-center gap-1"
        >
          {currentIndex < 0 ? (
            <span
              data-hidden-current-view
              className="h-7 shrink-0 border-r border-easydo-borderSoft px-2.5 text-sm font-semibold leading-7 text-easydo-cream"
            >
              {currentView.name}
            </span>
          ) : null}
          {activeRect ? (
            <span
              data-view-active-indicator
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0.5 bg-easydo-surfaceActive shadow-easydo-card transition-[transform,width] duration-150 ease-out"
              style={{
                width: activeRect.width,
                transform: `translateX(${activeRect.left}px)`,
              }}
            />
          ) : null}
          {boardViews.map((boardView, index) => {
            const selected = index === currentIndex;
            return (
              <Button
                key={boardView.id}
                type="button"
                role="tab"
                aria-selected={selected}
                variant="ghost"
                size="sm"
                className={cn(
                  "relative z-10 h-7 shrink-0 rounded-none px-2.5 text-sm transition-[opacity,color,background-color] duration-150",
                  selected
                    ? "text-easydo-cream opacity-100"
                    : "text-easydo-textSecondary opacity-45 hover:bg-easydo-surfaceHover hover:text-easydo-cream hover:opacity-80",
                )}
                onClick={() => {
                  if (selected) {
                    return;
                  }
                  onSelectView(index, index > currentIndex ? "right" : "left");
                }}
              >
                {boardView.name}
              </Button>
            );
          })}
        </div>
      ) : (
        <span
          key={`${currentView.id}-${transitionKey}`}
          data-view-direction={transitionDirection}
          className={cn(
            "px-2.5 text-lg font-semibold text-easydo-cream",
            transitionDirection === "right"
              ? "animate-in fade-in slide-in-from-right-2 duration-200"
              : "animate-in fade-in slide-in-from-left-2 duration-200",
          )}
        >
          {currentView.name}
        </span>
      )}
    </div>
  );
}
