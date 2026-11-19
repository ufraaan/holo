"use client";

import Link from "next/link";
import "../../../components/room/room.css";
import { useCallback, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import Background from "../../../components/Background";
import LocaleSwitcher from "../../../components/LocaleSwitcher";
import { useRoomWebSocket } from "../../../components/room/useRoomWebSocket";
import ConnectionToast from "../../../components/room/ConnectionToast";
import RoomHeader from "../../../components/room/RoomHeader";
import FileDropZone from "../../../components/room/FileDropZone";
import TextInputArea from "../../../components/room/TextInputArea";
import TransferList from "../../../components/room/TransferList";

function newId(): string {
  // randomUUID needs a secure context; getRandomValues does not and is a CSPRNG.
  return (
    crypto.randomUUID?.() ??
    Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("")
  );
}

function useClientIdentity() {
  return useMemo(() => ({ clientId: newId(), token: newId() }), []);
}

export default function RoomPage() {
  const params = useParams<{ roomId: string }>();
  return <RoomContent key={params.roomId} roomId={params.roomId} />;
}

function RoomContent({ roomId }: { roomId: string }) {
  const t = useTranslations("RoomPage");
  const { clientId, token } = useClientIdentity();
  const [bgLoaded, setBgLoaded] = useState(false);
  const handleBgLoaded = useCallback(() => setBgLoaded(true), []);
  const textInputRef = useRef<HTMLTextAreaElement>(null);
  const textNameInputRef = useRef<HTMLInputElement>(null);

  const { status, errorMessage, clientCount, toasts, transfers, textShares, chatMessages, currentSenderId, currentSenderName, handleFiles, handleSendText, sendChatMessage, handleRetry, p2pEnabled, peers, p2pError, acceptTransfer, pauseTransfer, resumeTransfer, cancelTransfer } =
    useRoomWebSocket({ roomId, clientId, token });

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    void handleFiles(e.target.files);
    e.target.value = "";
  };

  const onTextInputKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      const text = textInputRef.current?.value ?? "";
      const customName = textNameInputRef.current?.value.trim() ?? "";
      if (text.trim()) {
        handleSendText(text, customName);
        if (textInputRef.current) textInputRef.current.value = "";
        if (textNameInputRef.current) textNameInputRef.current.value = "";
      }
    }
  };

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    void handleFiles(e.dataTransfer.files);
  };

  const onDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleSend = () => {
    const text = textInputRef.current?.value ?? "";
    const customName = textNameInputRef.current?.value.trim() ?? "";
    if (text.trim()) {
      handleSendText(text, customName);
      if (textInputRef.current) textInputRef.current.value = "";
      if (textNameInputRef.current) textNameInputRef.current.value = "";
    }
  };

  return (
    <section className="room-view fixed inset-0 z-40 overflow-y-auto">
      <Background onLoad={handleBgLoaded} fade={false} />
      <ConnectionToast toasts={toasts} />
      <div className="fixed inset-0 bg-black/50" />

      <div
        className={`relative z-10 h-full px-4 py-6 text-white sm:px-6 md:px-10 md:py-8 transition-opacity duration-700 ${
          bgLoaded ? "opacity-100" : "opacity-0"
        }`}
      >
        <div className="relative z-20 mx-auto flex w-full max-w-6xl items-center justify-between">
          <Link href="/" className="text-sm font-normal text-white/80 transition hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4">
            {t("headerLabel")}
          </Link>
          <div className="flex items-center gap-4">
            <LocaleSwitcher />
            <a
              href="https://github.com/ufraaan/holo"
              target="_blank"
              rel="noreferrer"
              aria-label={t("navGitHub")}
              className="inline-flex cursor-pointer items-center text-white/60 transition hover:text-white"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-4 w-4"
                aria-hidden="true"
              >
                <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />
              </svg>
            </a>
          </div>
        </div>

        <div className="mx-auto mt-6 sm:mt-8 max-w-6xl">
          <Link
            href="/"
            className="inline-flex cursor-pointer items-center text-xs text-white/60 transition hover:text-white"
          >
            {t("backToHome")}
          </Link>
        </div>

        <div className="mx-auto mt-4 w-full max-w-6xl rounded-2xl border border-white/15 bg-black/35 p-4 sm:p-6 md:p-8">
          <RoomHeader roomId={roomId} status={status} clientCount={clientCount} onRetry={handleRetry} />

          <div className="room-columns mt-6 grid gap-4 md:grid-cols-2 md:gap-6 md:items-stretch">
            <div className="room-compose flex min-w-0 flex-col gap-4">
              <FileDropZone
                status={status}
                errorMessage={errorMessage}
                onInputChange={onInputChange}
                onDrop={onDrop}
                onDragOver={onDragOver}
                p2pEnabled={p2pEnabled}
                peers={peers}
                p2pError={p2pError}
              />
              <TextInputArea
                status={status}
                onSend={handleSend}
                onKeyDown={onTextInputKeyDown}
                textNameInputRef={textNameInputRef}
                textInputRef={textInputRef}
              />
            </div>

            <div className="min-w-0">
              <TransferList
                transfers={transfers}
                textShares={textShares}
                chatMessages={chatMessages}
                onSendChatMessage={sendChatMessage}
                status={status}
                currentSenderId={currentSenderId}
                currentSenderName={currentSenderName}
                p2pEnabled={p2pEnabled}
                onAcceptTransfer={acceptTransfer}
                onPauseTransfer={pauseTransfer}
                onResumeTransfer={resumeTransfer}
                onCancelTransfer={cancelTransfer}
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
