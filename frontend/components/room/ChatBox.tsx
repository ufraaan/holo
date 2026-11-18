"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { ChatMessage } from "./room-utils";
import type { RoomStatus } from "./useRoomWebSocket";

const MAX_CHAT_LENGTH = 1000;

interface ChatBoxProps {
  messages: ChatMessage[];
  onSend: (text: string) => void;
  status: RoomStatus;
  currentSenderId: string;
  currentSenderName: string;
}

function formatTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60000) return "just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  return `${Math.floor(diff / 3600000)}h ago`;
}

export default function ChatBox({
  messages,
  onSend,
  status,
  currentSenderId,
  currentSenderName,
}: ChatBoxProps) {
  const t = useTranslations("ChatBox");
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // auto scroll to bottom when new messages arrive
  useEffect(() => {
    bottomRef.current?.scrollIntoView?.({ behavior: "smooth" as ScrollBehavior });
  }, [messages]);

  const handleSend = () => {
    const text = input.trim();
    if (!text) return;
    onSend(text);
    setInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const isConnected = status === "connected";
  const overLimit = input.length > MAX_CHAT_LENGTH;

  return (
    <div className="room-chat flex min-h-0 flex-1 flex-col">
      {messages.length === 0 ? (
        <div className="room-chat-messages flex flex-1 items-center justify-center">
          <p className="room-empty">{t("empty")}</p>
        </div>
      ) : (
        <div className="room-chat-messages min-h-0 flex-1 space-y-3 overflow-y-auto">
          {messages.map((msg) => {
            const isOwn = msg.senderId === currentSenderId;
            return (
              <div
                key={msg.id}
                className={`flex ${isOwn ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`room-chat-bubble max-w-[85%] rounded-xl px-3.5 py-2.5 ${
                    isOwn
                      ? "border border-white/15 bg-white/[0.08] text-white/90"
                      : "border border-white/10 bg-white/[0.025] text-white/90"
                  }`}
                >
                  {!isOwn && (
                    <p className="text-xs font-normal text-white/60">
                      {msg.senderName}
                    </p>
                  )}
                  <p className="mt-1 whitespace-pre-wrap [overflow-wrap:anywhere] text-sm leading-relaxed">
                    {msg.text}
                  </p>
                  <p
                    className={`mt-1 text-xs ${
                      isOwn ? "text-white/50" : "text-white/50"
                    }`}
                  >
                    {isOwn ? currentSenderName : ""}
                    {isOwn ? " · " : ""}
                    {formatTime(msg.timestamp)}
                  </p>
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>
      )}

      <div className="room-chat-compose mbs-auto flex shrink-0 flex-wrap items-start gap-2 border-t border-white/10">
        <div className="min-w-0 flex-1">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t("messageInput")}
            disabled={!isConnected}
            rows={1}
            maxLength={MAX_CHAT_LENGTH + 100}
            aria-label={t("messageInput")}
            className="glass-field room-chat-input"
          />
          <div className="mt-1 flex justify-end">
            <span
              className={`text-xs ${
                overLimit
                  ? "text-red-400"
                  : input.length > MAX_CHAT_LENGTH * 0.9
                    ? "text-white/50"
                    : "text-white/30"
              }`}
            >
              {input.length}/{MAX_CHAT_LENGTH}
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={handleSend}
          disabled={!isConnected || !input.trim() || overLimit}
          className="glass-button shrink-0"
        >
          {t("send")}
        </button>
      </div>
    </div>
  );
}
