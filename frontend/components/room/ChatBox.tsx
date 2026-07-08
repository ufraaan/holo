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
    <div className="flex h-full min-h-[320px] flex-col">
      {messages.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-sm text-white/50">{t("empty")}</p>
        </div>
      ) : (
        <div className="flex-1 space-y-2 overflow-y-auto pr-1 max-h-[400px]">
          {messages.map((msg) => {
            const isOwn = msg.senderId === currentSenderId;
            return (
              <div
                key={msg.id}
                className={`flex ${isOwn ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded-lg px-3 py-2 ${
                    isOwn
                      ? "bg-white/15 text-white"
                      : "bg-white/[0.04] border border-white/10 text-white/90"
                  }`}
                >
                  {!isOwn && (
                    <p className="text-xs font-medium text-white/60">
                      {msg.senderName}
                    </p>
                  )}
                  <p className="mt-0.5 whitespace-pre-wrap break-words text-sm leading-relaxed">
                    {msg.text}
                  </p>
                  <p
                    className={`mt-0.5 text-[10px] ${
                      isOwn ? "text-white/40" : "text-white/35"
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

      <div className="mt-3 flex items-end gap-2 border-t border-white/10 pt-3">
        <div className="flex-1">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t("messageInput")}
            disabled={!isConnected}
            rows={1}
            maxLength={MAX_CHAT_LENGTH + 100}
            className="min-h-[36px] w-full resize-none rounded-lg border border-white/20 bg-white/[0.06] px-3 py-2 text-sm text-white placeholder-white/40 outline-none transition focus:border-white/40 disabled:opacity-40"
          />
          <div className="mt-1 flex justify-end">
            <span
              className={`text-[10px] ${
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
          className="h-9 shrink-0 cursor-pointer rounded-lg border border-white/25 bg-white/10 px-4 text-sm font-medium text-white/80 transition hover:bg-white/20 disabled:cursor-default disabled:opacity-40"
        >
          {t("send")}
        </button>
      </div>
    </div>
  );
}
