"use client";

import { useEffect, useRef, useState } from "react";

export function useRoomCodeCopy(roomId: string) {
  const [copyStatus, setCopyStatus] = useState<"copied" | "copyFailed" | null>(null);
  const [hintVisible, setHintVisible] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const copy = async () => {
    if (timer.current) clearTimeout(timer.current);
    try {
      await navigator.clipboard.writeText(roomId);
      setCopyStatus("copied");
    } catch {
      setCopyStatus("copyFailed");
    }
    timer.current = setTimeout(() => setCopyStatus(null), 2000);
  };

  return { copy, copyStatus, hintVisible, setHintVisible };
}
