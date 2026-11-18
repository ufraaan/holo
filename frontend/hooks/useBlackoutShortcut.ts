"use client";

import { useEffect, useRef } from "react";
import { hideTabIdentity } from "../lib/privacy-tab";

const SHORTCUT = "qwe";
const MAX_KEY_GAP_MS = 1000;

export function useBlackoutShortcut() {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    let progress = 0;
    let lastKeyAt = 0;
    let restoreTabIdentity: (() => void) | undefined;

    const reset = () => { progress = 0; };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.isComposing || event.ctrlKey || event.metaKey || event.altKey) {
        reset();
        return;
      }
      // Keep typing, Tab, and Escape from interacting with the obscured page.
      if (dialog.open) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
      if (event.repeat) return;

      const now = Date.now();
      if (now - lastKeyAt > MAX_KEY_GAP_MS) reset();
      lastKeyAt = now;
      const key = event.key.toLowerCase();
      progress = key === SHORTCUT[progress] ? progress + 1 : key === SHORTCUT[0] ? 1 : 0;
      if (progress !== SHORTCUT.length) return;

      event.preventDefault();
      event.stopImmediatePropagation();
      reset();
      if (dialog.open) {
        dialog.close();
        restoreTabIdentity?.();
        restoreTabIdentity = undefined;
      } else {
        dialog.showModal();
        restoreTabIdentity = hideTabIdentity();
      }
    };

    // Capture before text fields or other controls can stop keyboard events.
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("blur", reset);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("blur", reset);
      dialog.close();
      restoreTabIdentity?.();
    };
  }, []);

  return dialogRef;
}
