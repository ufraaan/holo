"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import ChatBox from "./ChatBox";
import { useUnreadChat } from "./useUnreadChat";
import {
  formatSize,
  type ChatMessage,
  type TextShare,
  type Transfer,
  type TransferStatus,
} from "./room-utils";
import type { RoomStatus } from "./useRoomWebSocket";

type Tab = "transfers" | "chat";

interface TransferListProps {
  transfers: Record<string, Transfer>;
  textShares: Record<string, TextShare>;
  chatMessages: ChatMessage[];
  onSendChatMessage: (text: string) => void;
  status: RoomStatus;
  currentSenderId: string;
  currentSenderName: string;
  p2pEnabled?: boolean;
  onAcceptTransfer?: (id: string) => void;
  onPauseTransfer?: (id: string) => void;
  onResumeTransfer?: (id: string) => void;
  onCancelTransfer?: (id: string) => void;
}

export default function TransferList({
  transfers,
  textShares,
  chatMessages,
  onSendChatMessage,
  status,
  currentSenderId,
  currentSenderName,
  p2pEnabled = false,
  onAcceptTransfer,
  onPauseTransfer,
  onResumeTransfer,
  onCancelTransfer,
}: TransferListProps) {
  const t = useTranslations("TransferList");
  const tc = useTranslations("ChatBox");
  const [activeTab, setActiveTab] = useState<Tab>("transfers");
  const { unreadCount, unreadLabel } = useUnreadChat(
    chatMessages, currentSenderId, activeTab === "chat",
  );
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hasTransfers =
    Object.keys(transfers).length > 0 || Object.keys(textShares).length > 0;

  const handleCopyText = async (text: string, id: string) => {
    await navigator.clipboard.writeText(text);
    if (copiedTimerRef.current) {
      clearTimeout(copiedTimerRef.current);
    }
    setCopiedId(id);
    copiedTimerRef.current = setTimeout(() => {
      setCopiedId(null);
      copiedTimerRef.current = null;
    }, 2000);
  };

  const handleDownloadText = (
    text: string,
    id: string,
    timestamp: number,
    customName?: string,
  ) => {
    const shortId = id.slice(0, 6);
    const ts = new Date(timestamp).toISOString().slice(0, 10).replace(/-/g, "");
    const filename = customName || `text-${ts}-${shortId}.txt`;
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const sortedTransfers = Object.values(transfers).sort((a, b) =>
    a.name.localeCompare(b.name),
  );

  const sortedTextShares = Object.values(textShares).sort(
    (a, b) => b.timestamp - a.timestamp,
  );

  const statusLabel = (value: TransferStatus): string => {
    switch (value) {
      case "offered":
        return t("statusOffered");
      case "connecting":
        return t("statusConnecting");
      case "transferring":
        return t("statusTransferring");
      case "paused":
        return t("statusPaused");
      case "reconnecting":
        return t("statusReconnecting");
      case "completed":
        return t("statusCompleted");
      case "cancelled":
        return t("statusCancelled");
      case "error":
        return t("statusError");
    }
  };

  const routeLabel = (tr: Transfer): string | null => {
    if (!p2pEnabled || !tr.connectionType) return null;
    if (tr.connectionType === "direct") return t("routeDirect");
    if (tr.connectionType === "relay") return t("routeRelay");
    return t("routeUnknown");
  };

  const transferActions = (tr: Transfer) => {
    if (!p2pEnabled || !tr.peerId) return null;
    const buttons: { key: string; label: string; onClick?: () => void }[] = [];
    if (tr.status === "completed" || tr.status === "cancelled" || tr.status === "error") {
      buttons.push({ key: "remove", label: t("remove"), onClick: onCancelTransfer && (() => onCancelTransfer(tr.id)) });
    }
    if (tr.direction === "incoming" && tr.status === "offered") {
      buttons.push({ key: "accept", label: t("accept"), onClick: onAcceptTransfer && (() => onAcceptTransfer(tr.id)) });
    }
    if (tr.status === "transferring" || tr.status === "connecting") {
      buttons.push({ key: "pause", label: t("pause"), onClick: onPauseTransfer && (() => onPauseTransfer(tr.id)) });
    }
    if (tr.status === "paused" || tr.status === "reconnecting") {
      buttons.push({ key: "resume", label: t("resume"), onClick: onResumeTransfer && (() => onResumeTransfer(tr.id)) });
    }
    if (tr.status === "offered" || tr.status === "connecting" || tr.status === "transferring" || tr.status === "paused" || tr.status === "reconnecting") {
      buttons.push({ key: "cancel", label: t("cancel"), onClick: onCancelTransfer && (() => onCancelTransfer(tr.id)) });
    }
    return buttons.filter((button) => button.onClick);
  };

  const renderP2pTransfer = (tr: Transfer) => {
    const actions = transferActions(tr) ?? [];
    const route = routeLabel(tr);
    return (
      <div
        key={tr.id}
        role="group"
        aria-label={`${tr.name} · ${tr.peerName ?? tr.peerId}`}
        className="overflow-hidden rounded-lg border border-white/20 bg-white/[0.06] p-3 sm:p-4"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1 overflow-hidden">
            <p className="truncate font-medium text-white text-sm">{tr.name}</p>
            <p className="mt-0.5 text-xs text-white/50">
              {tr.direction === "incoming" ? t("directionIncoming") : t("directionOutgoing")}
              {` · ${formatSize(tr.size)}`}
              {tr.peerName ? ` · ${t("withPeer", { name: tr.peerName })}` : ""}
              {route ? ` · ${route}` : ""}
              {tr.status ? ` · ${statusLabel(tr.status)}` : ""}
              {` · ${tr.progress}%`}
            </p>
            {tr.error && <p className="mt-1 text-xs text-red-200">{tr.error}</p>}
            {tr.status === "completed" && tr.savedToDisk && (
              <p className="mt-1 text-xs text-emerald-200">{t("savedToDisk")}</p>
            )}
          </div>
          <div className="flex shrink-0 flex-wrap justify-end gap-2">
            {actions.map((action) => (
              <button
                key={action.key}
                type="button"
                onClick={action.onClick}
                aria-label={`${action.label} ${tr.name}`}
                className="h-8 flex cursor-pointer items-center justify-center rounded-md border border-white/25 bg-white/10 px-2.5 text-xs font-medium text-white/80 transition hover:bg-white/20"
              >
                {action.label}
              </button>
            ))}
            {tr.status === "completed" && !tr.savedToDisk && tr.url && (
              <a
                href={tr.url}
                download={tr.name}
                className="shrink-0 h-8 flex cursor-pointer items-center justify-center rounded-md border border-white/25 bg-white/10 px-2.5 text-xs font-medium text-white/80 transition hover:bg-white/20"
              >
                {t("save")}
              </a>
            )}
          </div>
        </div>
        <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-white/15">
          <div
            className="h-full bg-white/60 transition-[width] duration-150"
            style={{ width: `${tr.progress}%` }}
          />
        </div>
      </div>
    );
  };

  const renderTransferSummary = (tr: Transfer) => (
    <div
      key={tr.id}
      className="overflow-hidden rounded-lg border border-white/20 bg-white/[0.06] p-3 sm:p-4"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1 overflow-hidden">
          <p className="truncate font-medium text-white text-sm">
            {tr.name}
          </p>
          <p className="mt-0.5 text-xs text-white/50">
            {formatSize(tr.size)} · {tr.direction === "outgoing" ? (tr.progress >= 100 ? t("sent") : t("sending")) : (tr.progress >= 100 ? t("received") : t("receiving"))} · {tr.progress}%
          </p>
        </div>
        {tr.url && (
          <a
            href={tr.url}
            download={tr.name}
            className="shrink-0 h-8 flex cursor-pointer items-center justify-center rounded-md border border-white/25 bg-white/10 px-2.5 text-xs font-medium text-white/80 transition hover:bg-white/20"
          >
            {t("save")}
          </a>
        )}
      </div>
      <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-white/15">
        <div
          className="h-full bg-white/60 transition-[width] duration-150"
          style={{ width: `${tr.progress}%` }}
        />
      </div>
    </div>
  );

  return (
    <div className="flex h-full flex-col">
      {/* tab bar */}
      <div className="mb-3 flex gap-1 rounded-lg border border-white/10 bg-white/[0.03] p-0.5">
        <button
          type="button"
          onClick={() => setActiveTab("transfers")}
          className={`flex-1 cursor-pointer rounded-md px-3 py-1.5 text-xs font-medium transition ${
            activeTab === "transfers"
              ? "bg-white/12 text-white"
              : "text-white/50 hover:text-white/80"
          }`}
        >
          {tc("transfers")}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("chat")}
          aria-label={unreadCount > 0 ? `${tc("chat")}, ${unreadLabel}` : undefined}
          className={`flex-1 cursor-pointer rounded-md px-3 py-1.5 text-xs font-medium transition ${
            activeTab === "chat"
              ? "bg-white/12 text-white"
              : "text-white/50 hover:text-white/80"
          }`}
        >
          <span className="relative inline-block">
            {tc("chat")}
            {unreadCount > 0 && (
              <span
                aria-hidden="true"
                className="absolute -inset-e-2 -inset-bs-0.5 size-1.5 rounded-full bg-red-500"
              />
            )}
          </span>
        </button>
      </div>

      {/* tab content */}
      {activeTab === "transfers" ? (
        <>
          {!hasTransfers ? (
            <p className="text-sm text-white/75">{t("empty")}</p>
          ) : (
            <>
              {sortedTextShares.length > 0 && (
                <>
                  <p className="mb-2 sm:mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-white/60">
                    {t("textSnippets")}
                  </p>
                  <div className="grid gap-2 sm:gap-3">
                    {sortedTextShares.map((ts) => (
                      <div
                        key={ts.id}
                        className="overflow-hidden rounded-lg border border-white/20 bg-white/[0.06] p-3 sm:p-4"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1 overflow-hidden">
                            <p className="font-mono text-xs text-white/90 truncate">
                              {ts.customName || ts.text.slice(0, 60)}
                              {ts.customName ? "" : ts.text.length > 60 ? "…" : ""}
                            </p>
                            <p className="mt-1 text-xs text-white/50">
                              {ts.customName ? "" : `${t("chars", { count: ts.text.length })} · `}
                              {ts.direction === "outgoing" ? t("sent") : t("received")}
                            </p>
                          </div>
                          <div className="flex shrink-0 gap-2">
                            <button
                              type="button"
                              onClick={() => handleCopyText(ts.text, ts.id)}
                              className="h-8 flex cursor-pointer items-center justify-center rounded-md border border-white/25 bg-white/10 px-2.5 text-xs font-medium text-white/80 transition hover:bg-white/20"
                            >
                              {copiedId === ts.id ? t("copied") : t("copy")}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDownloadText(ts.text, ts.id, ts.timestamp, ts.customName)}
                              className="h-8 flex cursor-pointer items-center justify-center rounded-md border border-white/25 bg-white/10 px-2.5 text-xs font-medium text-white/80 transition hover:bg-white/20"
                            >
                              {t("save")}
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {sortedTransfers.length > 0 && (
                <>
                  <p className="mb-2 sm:mb-3 mt-4 sm:mt-5 text-xs font-semibold uppercase tracking-[0.14em] text-white/60">
                    {t("files")}
                  </p>
                  <div className="grid gap-2 sm:gap-3">
                    {sortedTransfers.map((tr) =>
                      p2pEnabled && tr.peerId
                        ? renderP2pTransfer(tr)
                        : renderTransferSummary(tr),
                    )}
                  </div>
                </>
              )}
            </>
          )}
        </>
      ) : (
        <ChatBox
          messages={chatMessages}
          onSend={onSendChatMessage}
          status={status}
          currentSenderId={currentSenderId}
          currentSenderName={currentSenderName}
        />
      )}
    </div>
  );
}
