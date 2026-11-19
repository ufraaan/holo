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
      case "queued":
        return t("statusQueued");
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
    if (tr.status === "queued" || tr.status === "offered" || tr.status === "connecting" || tr.status === "transferring" || tr.status === "paused" || tr.status === "reconnecting") {
      buttons.push({ key: "cancel", label: t("cancel"), onClick: onCancelTransfer && (() => onCancelTransfer(tr.id)) });
    }
    return buttons.filter((button) => button.onClick);
  };

  const renderP2pTransfer = (tr: Transfer) => {
    const actions = transferActions(tr) ?? [];
    const isFinished = tr.status === "completed" || tr.status === "cancelled" || tr.status === "error";
    return (
      <div key={tr.id} role="group" aria-label={tr.name} className="room-transfer-card">
        <p className="room-transfer-name">{tr.name}</p>
        <div className="room-transfer-details">
          <p className="room-transfer-state">
            {tr.direction === "incoming" ? t("directionIncoming") : t("directionOutgoing")}
            {tr.status ? ` · ${statusLabel(tr.status)}` : ""}
          </p>
          <p className="room-transfer-numbers">
            <span>{formatSize(tr.size)}</span>
            <span>{tr.progress}%</span>
          </p>
        </div>
        {!isFinished && (
          <div className="room-progress" role="progressbar" aria-label={tr.name} aria-valuemin={0} aria-valuemax={100} aria-valuenow={tr.progress}>
            <div className="room-progress-fill" style={{ width: `${tr.progress}%` }} />
          </div>
        )}
        {tr.error && <p className="mt-2 text-xs text-red-200">{tr.error}</p>}
        {tr.status === "completed" && tr.savedToDisk && (
          <p className="mt-2 text-xs text-emerald-200">{t("savedToDisk")}</p>
        )}
        {(actions.length > 0 || (tr.status === "completed" && !tr.savedToDisk && tr.url)) && (
          <div className="room-transfer-actions">
            {actions.map((action) => (
              <button key={action.key} type="button" onClick={action.onClick} aria-label={`${action.label} ${tr.name}`} className="glass-button glass-button-small">
                {action.label}
              </button>
            ))}
            {tr.status === "completed" && !tr.savedToDisk && tr.url && (
              <a href={tr.url} download={tr.name} className="glass-button glass-button-small">{t("save")}</a>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderTransferSummary = (tr: Transfer) => (
    <div key={tr.id} className="room-transfer-card">
      <p className="room-transfer-name">{tr.name}</p>
      <div className="room-transfer-details">
        <p className="room-transfer-state">
          {tr.direction === "outgoing" ? (tr.progress >= 100 ? t("sent") : t("sending")) : (tr.progress >= 100 ? t("received") : t("receiving"))}
        </p>
        <p className="room-transfer-numbers"><span>{formatSize(tr.size)}</span><span>{tr.progress}%</span></p>
      </div>
      {tr.progress < 100 && (
        <div className="room-progress" role="progressbar" aria-label={tr.name} aria-valuemin={0} aria-valuemax={100} aria-valuenow={tr.progress}>
          <div className="room-progress-fill" style={{ width: `${tr.progress}%` }} />
        </div>
      )}
      {tr.url && (
        <div className="room-transfer-actions">
          <a href={tr.url} download={tr.name} className="glass-button glass-button-small">{t("save")}</a>
        </div>
      )}
    </div>
  );

  return (
    <div className="room-activity room-panel">
      {/* tab bar */}
      <div className="room-tabs">
        <button
          type="button"
          onClick={() => setActiveTab("transfers")}
          aria-pressed={activeTab === "transfers"}
          className={`room-tab ${
            activeTab === "transfers"
              ? "room-tab-active"
              : ""
          }`}
        >
          {tc("transfers")}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("chat")}
          aria-pressed={activeTab === "chat"}
          aria-label={unreadCount > 0 ? `${tc("chat")}, ${unreadLabel}` : undefined}
          className={`room-tab ${
            activeTab === "chat"
              ? "room-tab-active"
              : ""
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
        <div className="room-activity-content">
          {!hasTransfers ? (
            <div className="room-empty-state"><p className="room-empty">{t("empty")}</p></div>
          ) : (
            <>
              {sortedTextShares.length > 0 && (
                <>
                  <p className="room-list-heading">
                    {t("textSnippets")}
                  </p>
                  <div className="room-transfer-list">
                    {sortedTextShares.map((ts) => (
                      <div
                        key={ts.id}
                        className="room-transfer-card"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="room-snippet-preview">
                              {ts.customName || ts.text.slice(0, 60)}
                              {ts.customName ? "" : ts.text.length > 60 ? "…" : ""}
                            </p>
                            <p className="mt-1 text-xs text-white/50">
                              {ts.customName ? "" : `${t("chars", { count: ts.text.length })} · `}
                              {ts.direction === "outgoing" ? t("sent") : t("received")}
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => handleCopyText(ts.text, ts.id)}
                              className="glass-button glass-button-small"
                            >
                              {copiedId === ts.id ? t("copied") : t("copy")}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDownloadText(ts.text, ts.id, ts.timestamp, ts.customName)}
                              className="glass-button glass-button-small"
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
                  <p className="room-list-heading">
                    {t("files")}
                  </p>
                  <div className="room-transfer-list">
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
        </div>
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
