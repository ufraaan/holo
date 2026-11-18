"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { getTabTitle, setTabTitle } from "../../lib/privacy-tab";
import type { ChatMessage } from "./room-utils";

function subscribeToVisibility(onChange: () => void) {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
}

function isPageVisible() {
  return document.visibilityState === "visible";
}

/** Messages are read only while both the page and its Chat tab are visible. */
export function useUnreadChat(
  messages: ChatMessage[],
  currentSenderId: string,
  chatOpen: boolean,
) {
  const t = useTranslations("ChatBox");
  const pageVisible = useSyncExternalStore(
    subscribeToVisibility,
    isPageVisible,
    () => false,
  );
  const incomingCount = messages.filter(
    (message) => message.senderId !== currentSenderId,
  ).length;
  const [readCount, setReadCount] = useState(0);
  const reading = chatOpen && pageVisible;

  // Adjust this component's read position during render, before showing a badge.
  if ((reading || incomingCount < readCount) && readCount !== incomingCount) {
    setReadCount(incomingCount);
  }
  const unreadCount = reading ? 0 : Math.max(0, incomingCount - readCount);
  const unreadLabel = unreadCount > 0 ? t("unreadMessages", { count: unreadCount }) : "";

  useEffect(() => {
    if (!unreadLabel) return;
    const originalTitle = getTabTitle();
    setTabTitle(`${unreadLabel} · Holo`);
    return () => {
      setTabTitle(originalTitle);
    };
  }, [unreadLabel]);

  return { unreadCount, unreadLabel };
}
