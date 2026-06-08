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
  const lastPointerX = useRef<number | null>(null);
  const movedDuringPointer = useRef(false);
  const waitingTimer = useRef<number | null>(null);
  const transientTimer = useRef<number | null>(null);
  const reducedMotion = usePrefersReducedMotion();

  const animation = ANIMATIONS[petState];

  const resetWaitingTimer = useCallback(() => {
    if (waitingTimer.current) {
      window.clearTimeout(waitingTimer.current);
    }

    waitingTimer.current = window.setTimeout(() => {
      setFrame(0);
      setPetState("waiting");
      setMessage(STATE_MESSAGES.waiting);
    }, WAITING_AFTER_MS);
  }, []);

  const showState = useCallback((nextState: PetState, transient = false) => {
    if (transientTimer.current) {
      window.clearTimeout(transientTimer.current);
    }

    setFrame(0);
    setPetState(nextState);
    setMessage(STATE_MESSAGES[nextState]);
    resetWaitingTimer();

    if (transient) {
      const duration = ANIMATIONS[nextState].durations.reduce((sum, current) => sum + current, 0);
      transientTimer.current = window.setTimeout(() => {
        setFrame(0);
        setPetState("idle");
        setMessage(initialMessage);
      }, duration);
    }
  }, [initialMessage, resetWaitingTimer]);

  useEffect(() => {
    resetWaitingTimer();

    return () => {
      if (waitingTimer.current) {
        window.clearTimeout(waitingTimer.current);
      }

      if (transientTimer.current) {
        window.clearTimeout(transientTimer.current);
      }
    };
  }, [resetWaitingTimer]);

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

  const handlePointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    lastPointerX.current = event.clientX;
    movedDuringPointer.current = false;
    setIsDragging(false);
    resetWaitingTimer();
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (lastPointerX.current === null) {
      return;
    }

    const deltaX = event.clientX - lastPointerX.current;

    if (Math.abs(deltaX) > 8) {
      movedDuringPointer.current = true;
      setIsDragging(true);
      showState(deltaX > 0 ? "running-right" : "running-left", false);
      lastPointerX.current = event.clientX;
    }
  };

  const handlePointerEnd = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    const didMove = movedDuringPointer.current;
    lastPointerX.current = null;
    setIsDragging(false);

    if (didMove) {
      showState("idle", false);
      setMessage(initialMessage);
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
    <div className={["mascot-widget", className].filter(Boolean).join(" ")}>
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
