"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

type PetState =
  | "idle"
  | "running-right"
  | "running-left"
  | "waving"
  | "jumping"
  | "failed"
  | "waiting"
  | "running"
  | "review";

type MascotMessage = {
  title: string;
  body: string;
};

type InteractiveMascotProps = {
  assetPath?: string;
  className?: string;
  initialMessage?: MascotMessage;
};

type DragOffset = {
  x: number;
  y: number;
};

type DragStart = {
  pointerX: number;
  pointerY: number;
  offsetX: number;
  offsetY: number;
};

const DEFAULT_MESSAGE: MascotMessage = {
  title: "需要帮忙吗？",
  body: "今天也要加油哦！✨"
};

const STATE_MESSAGES: Record<PetState, MascotMessage> = {
  idle: DEFAULT_MESSAGE,
  "running-right": { title: "慢一点啦～", body: "我跟得上！" },
  "running-left": { title: "往这边？", body: "一起过去看看。" },
  waving: { title: "你好呀！", body: "今天也欢迎回来。" },
  jumping: { title: "好耶！", body: "灵感来了就抓住它。" },
  failed: { title: "有点卡住…", body: "别急，我们慢慢来。" },
  waiting: { title: "在等你哦", body: "要不要摸摸头继续？" },
  running: { title: "拖动中", body: "我跟着你走。" },
  review: { title: "让我看看", body: "这里值得细读一下。" }
};

const ATLAS = {
  columns: 8,
  rows: 9
} as const;

const ANIMATIONS: Record<PetState, { row: number; durations: number[] }> = {
  idle: { row: 0, durations: [280, 110, 110, 140, 140, 320] },
  "running-right": { row: 1, durations: [120, 120, 120, 120, 120, 120, 120, 220] },
  "running-left": { row: 2, durations: [120, 120, 120, 120, 120, 120, 120, 220] },
  waving: { row: 3, durations: [140, 140, 140, 280] },
  jumping: { row: 4, durations: [140, 140, 140, 140, 280] },
  failed: { row: 5, durations: [140, 140, 140, 140, 140, 140, 140, 240] },
  waiting: { row: 6, durations: [150, 150, 150, 150, 150, 260] },
  running: { row: 7, durations: [120, 120, 120, 120, 120, 220] },
  review: { row: 8, durations: [150, 150, 150, 150, 150, 280] }
};

const TRANSIENT_STATES = new Set<PetState>(["waving", "jumping"]);
const WAITING_AFTER_MS = 12000;
const DRAG_SETTLE_MS = 300;
const DRAG_SCREEN_MARGIN = 8;

function usePrefersReducedMotion() {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return reducedMotion;
}

export function InteractiveMascot({
  assetPath = "/pets/reimu-mini/spritesheet.webp",
  className,
  initialMessage = DEFAULT_MESSAGE
}: InteractiveMascotProps) {
  const [petState, setPetState] = useState<PetState>("idle");
  const [frame, setFrame] = useState(0);
  const [message, setMessage] = useState<MascotMessage>(initialMessage);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState<DragOffset>({ x: 0, y: 0 });
  const [isFloatingReady, setIsFloatingReady] = useState(false);
  const widgetRef = useRef<HTMLDivElement | null>(null);
  const floatingRef = useRef<HTMLDivElement | null>(null);
  const dragOffsetRef = useRef<DragOffset>({ x: 0, y: 0 });
  const dragStart = useRef<DragStart | null>(null);
  const lastPointerX = useRef<number | null>(null);
  const movedDuringPointer = useRef(false);
  const activeState = useRef<PetState>("idle");
  const waitingTimer = useRef<number | null>(null);
  const transientTimer = useRef<number | null>(null);
  const dragSettleTimer = useRef<number | null>(null);
  const viewportClampFrame = useRef<number | null>(null);
  const reducedMotion = usePrefersReducedMotion();

  const animation = ANIMATIONS[petState];

  const constrainDragOffset = useCallback((offset: DragOffset) => {
    const floating = floatingRef.current;

    if (!floating) {
      return offset;
    }

    const floatingRect = floating.getBoundingClientRect();
    const bubbleRect = floating.querySelector(".mascot-bubble")?.getBoundingClientRect();
    const visualLeft = Math.min(floatingRect.left, bubbleRect?.left ?? floatingRect.left);
    const visualRight = Math.max(floatingRect.right, bubbleRect?.right ?? floatingRect.right);
    const visualTop = Math.min(floatingRect.top, bubbleRect?.top ?? floatingRect.top);
    const visualBottom = Math.max(floatingRect.bottom, bubbleRect?.bottom ?? floatingRect.bottom);
    const leftInset = visualLeft - dragOffsetRef.current.x;
    const rightInset = visualRight - dragOffsetRef.current.x;
    const topInset = visualTop - dragOffsetRef.current.y;
    const bottomInset = visualBottom - dragOffsetRef.current.y;
    const minX = DRAG_SCREEN_MARGIN - leftInset;
    const maxX = document.documentElement.clientWidth - DRAG_SCREEN_MARGIN - rightInset;
    const minY = DRAG_SCREEN_MARGIN - topInset;
    const maxY = document.documentElement.clientHeight - DRAG_SCREEN_MARGIN - bottomInset;

    return {
      x: Math.min(Math.max(minX, maxX), Math.max(minX, Math.min(maxX, offset.x))),
      y: Math.min(Math.max(minY, maxY), Math.max(minY, Math.min(maxY, offset.y)))
    };
  }, []);

  const updateDragOffset = useCallback((offset: DragOffset) => {
    const nextOffset = constrainDragOffset(offset);

    if (dragOffsetRef.current.x === nextOffset.x && dragOffsetRef.current.y === nextOffset.y) {
      return;
    }

    dragOffsetRef.current = nextOffset;
    setDragOffset(nextOffset);
  }, [constrainDragOffset]);

  const keepMascotInViewport = useCallback(() => {
    if (!floatingRef.current) {
      return;
    }

    updateDragOffset(dragOffsetRef.current);
  }, [updateDragOffset]);

  const initializeMascotPosition = useCallback(() => {
    if (!widgetRef.current || !floatingRef.current) {
      return;
    }

    const anchorRect = widgetRef.current.getBoundingClientRect();
    const nextOffset = constrainDragOffset({
      x: anchorRect.left,
      y: anchorRect.top
    });

    dragOffsetRef.current = nextOffset;
    setDragOffset(nextOffset);
    setIsFloatingReady(true);
  }, [constrainDragOffset]);

  const scheduleKeepMascotInViewport = useCallback(() => {
    if (viewportClampFrame.current) {
      return;
    }

    viewportClampFrame.current = window.requestAnimationFrame(() => {
      viewportClampFrame.current = null;
      keepMascotInViewport();
    });
  }, [keepMascotInViewport]);

  const setVisualState = useCallback((nextState: PetState, nextMessage = STATE_MESSAGES[nextState]) => {
    if (activeState.current !== nextState) {
      activeState.current = nextState;
      setFrame(0);
      setPetState(nextState);
    }

    setMessage(nextMessage);
  }, []);

  const resetWaitingTimer = useCallback(() => {
    if (waitingTimer.current) {
      window.clearTimeout(waitingTimer.current);
    }

    waitingTimer.current = window.setTimeout(() => {
      setVisualState("waiting");
    }, WAITING_AFTER_MS);
  }, [setVisualState]);

  const showState = useCallback((nextState: PetState, transient = false) => {
    if (transientTimer.current) {
      window.clearTimeout(transientTimer.current);
    }

    setVisualState(nextState);
    resetWaitingTimer();

    if (transient) {
      const duration = ANIMATIONS[nextState].durations.reduce((sum, current) => sum + current, 0);
      transientTimer.current = window.setTimeout(() => {
        setVisualState("idle", initialMessage);
      }, duration);
    }
  }, [initialMessage, resetWaitingTimer, setVisualState]);

  const clearDragSettleTimer = useCallback(() => {
    if (dragSettleTimer.current) {
      window.clearTimeout(dragSettleTimer.current);
      dragSettleTimer.current = null;
    }
  }, []);

  const scheduleDragSettle = useCallback(() => {
    clearDragSettleTimer();

    dragSettleTimer.current = window.setTimeout(() => {
      setIsDragging(false);
      setVisualState("idle", initialMessage);
      movedDuringPointer.current = false;
      dragSettleTimer.current = null;
    }, DRAG_SETTLE_MS);
  }, [clearDragSettleTimer, initialMessage, setVisualState]);

  useEffect(() => {
    resetWaitingTimer();

    return () => {
      if (waitingTimer.current) {
        window.clearTimeout(waitingTimer.current);
      }

      if (transientTimer.current) {
        window.clearTimeout(transientTimer.current);
      }

      clearDragSettleTimer();
    };
  }, [clearDragSettleTimer, resetWaitingTimer]);

  useEffect(() => {
    initializeMascotPosition();
    scheduleKeepMascotInViewport();

    window.addEventListener("resize", scheduleKeepMascotInViewport);
    window.addEventListener("focus", scheduleKeepMascotInViewport);
    window.addEventListener("scroll", scheduleKeepMascotInViewport, { passive: true });

    return () => {
      window.removeEventListener("resize", scheduleKeepMascotInViewport);
      window.removeEventListener("focus", scheduleKeepMascotInViewport);
      window.removeEventListener("scroll", scheduleKeepMascotInViewport);

      if (viewportClampFrame.current) {
        window.cancelAnimationFrame(viewportClampFrame.current);
        viewportClampFrame.current = null;
      }
    };
  }, [initializeMascotPosition, scheduleKeepMascotInViewport]);

  useEffect(() => {
    if (reducedMotion) {
      return;
    }

    const duration = animation.durations[frame] ?? animation.durations[0];
    const timer = window.setTimeout(() => {
      setFrame((current) => (current + 1) % animation.durations.length);
    }, duration);

    return () => window.clearTimeout(timer);
  }, [animation, frame, reducedMotion]);

  const displayedFrame = reducedMotion ? 0 : frame;

  const spriteStyle = useMemo(
    () =>
      ({
        "--pet-asset": `url(${assetPath})`,
        "--pet-frame-x": `${(displayedFrame / (ATLAS.columns - 1)) * 100}%`,
        "--pet-row-y": `${(animation.row / (ATLAS.rows - 1)) * 100}%`
      }) as React.CSSProperties,
    [animation.row, assetPath, displayedFrame]
  );

  const widgetStyle = useMemo(
    () =>
      ({
        "--mascot-drag-x": `${dragOffset.x}px`,
        "--mascot-drag-y": `${dragOffset.y}px`
      }) as React.CSSProperties,
    [dragOffset.x, dragOffset.y]
  );

  const getDragRunningState = useCallback((stepDeltaX: number): PetState => {
    if (stepDeltaX > 0) {
      return "running-right";
    }

    if (stepDeltaX < 0) {
      return "running-left";
    }

    if (activeState.current === "running-left" || activeState.current === "running-right") {
      return activeState.current;
    }

    return "running-right";
  }, []);

  const handlePointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    clearDragSettleTimer();

    dragStart.current = {
      pointerX: event.clientX,
      pointerY: event.clientY,
      offsetX: dragOffsetRef.current.x,
      offsetY: dragOffsetRef.current.y
    };
    lastPointerX.current = event.clientX;
    movedDuringPointer.current = false;
    setIsDragging(false);
    resetWaitingTimer();
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!dragStart.current || lastPointerX.current === null) {
      return;
    }

    const totalDeltaX = event.clientX - dragStart.current.pointerX;
    const totalDeltaY = event.clientY - dragStart.current.pointerY;
    const stepDeltaX = event.clientX - lastPointerX.current;

    if (totalDeltaX !== 0 || totalDeltaY !== 0) {
      movedDuringPointer.current = true;
      setIsDragging(true);
      clearDragSettleTimer();
      updateDragOffset({
        x: dragStart.current.offsetX + totalDeltaX,
        y: dragStart.current.offsetY + totalDeltaY
      });
      showState(getDragRunningState(stepDeltaX), false);
      scheduleDragSettle();

      lastPointerX.current = event.clientX;
    }
  };

  const handlePointerEnd = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    const didMove = movedDuringPointer.current;
    dragStart.current = null;
    lastPointerX.current = null;

    if (didMove) {
      scheduleDragSettle();
    } else {
      setIsDragging(false);
    }
  };

  const handleClick = () => {
    if (!movedDuringPointer.current) {
      showState("jumping", true);
    }

    movedDuringPointer.current = false;
  };

  const handleHover = () => {
    if (!isDragging && !TRANSIENT_STATES.has(petState)) {
      showState("waving", true);
    }
  };

  return (
    <div
      ref={widgetRef}
      className={["mascot-widget", className].filter(Boolean).join(" ")}
    >
      <div
        ref={floatingRef}
        className={["mascot-floating", isDragging ? "is-dragging" : "", isFloatingReady ? "is-ready" : ""].filter(Boolean).join(" ")}
      style={widgetStyle}
    >
      <button
        type="button"
        className="mascot-sprite-button"
        aria-label="灵梦小宠物"
        onClick={handleClick}
        onFocus={handleHover}
        onMouseEnter={handleHover}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
      >
        <span className="mascot-sprite" style={spriteStyle} aria-hidden="true" />
      </button>
      <div className="mascot-bubble" aria-live="polite">
        <p>{message.title}</p>
        <p>{message.body}</p>
      </div>
      </div>
    </div>
  );
}
