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

type DragLimits = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
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
  running: { title: "处理中", body: "我正在认真看。" },
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
const DRAG_SETTLE_MS = 1000;
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
  const dragOffsetRef = useRef<DragOffset>({ x: 0, y: 0 });
  const dragLimits = useRef<DragLimits | null>(null);
  const dragStart = useRef<DragStart | null>(null);
  const lastPointerX = useRef<number | null>(null);
  const movedDuringPointer = useRef(false);
  const activeState = useRef<PetState>("idle");
  const waitingTimer = useRef<number | null>(null);
  const transientTimer = useRef<number | null>(null);
  const dragSettleTimer = useRef<number | null>(null);
  const reducedMotion = usePrefersReducedMotion();

  const animation = ANIMATIONS[petState];

  const getDragLimits = useCallback((button: HTMLButtonElement, offset: DragOffset): DragLimits => {
    const rect = button.getBoundingClientRect();
    const baseLeft = rect.left - offset.x;
    const baseTop = rect.top - offset.y;
    const viewportWidth = document.documentElement.clientWidth;
    const viewportHeight = document.documentElement.clientHeight;

    return {
      minX: DRAG_SCREEN_MARGIN - baseLeft,
      maxX: viewportWidth - baseLeft - rect.width - DRAG_SCREEN_MARGIN,
      minY: DRAG_SCREEN_MARGIN - baseTop,
      maxY: viewportHeight - baseTop - rect.height - DRAG_SCREEN_MARGIN
    };
  }, []);

  const constrainDragOffset = useCallback((offset: DragOffset) => {
    const limits = dragLimits.current;

    if (!limits) {
      return offset;
    }

    return {
      x: Math.min(limits.maxX, Math.max(limits.minX, offset.x)),
      y: Math.min(limits.maxY, Math.max(limits.minY, offset.y))
    };
  }, []);

  const updateDragOffset = useCallback((offset: DragOffset) => {
    const nextOffset = constrainDragOffset(offset);
    dragOffsetRef.current = nextOffset;
    setDragOffset(nextOffset);
  }, [constrainDragOffset]);

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

  const handlePointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    clearDragSettleTimer();
    dragLimits.current = getDragLimits(event.currentTarget, dragOffsetRef.current);
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

    if (Math.abs(totalDeltaX) > 8 || Math.abs(totalDeltaY) > 8) {
      movedDuringPointer.current = true;
      setIsDragging(true);
      clearDragSettleTimer();
      updateDragOffset({
        x: dragStart.current.offsetX + totalDeltaX,
        y: dragStart.current.offsetY + totalDeltaY
      });
      showState("running", false);
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
    dragLimits.current = null;
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
    <div className={["mascot-widget", isDragging ? "is-dragging" : "", className].filter(Boolean).join(" ")} style={widgetStyle}>
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
  );
}
