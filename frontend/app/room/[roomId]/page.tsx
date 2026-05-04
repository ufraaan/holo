"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useParams } from "next/navigation";
import BackgroundVideo from "../../../components/BackgroundVideo";
import { useRoomWebSocket } from "../../../components/room/useRoomWebSocket";
import RoomHeader from "../../../components/room/RoomHeader";
import FileDropZone from "../../../components/room/FileDropZone";
import TextInputArea from "../../../components/room/TextInputArea";
import TransferList from "../../../components/room/TransferList";

function useClientId() {
  return crypto.randomUUID?.() ?? "c_fallback";
}

export default function RoomPage() {
  const params = useParams<{ roomId: string }>();
  const roomId = params.roomId;
  const clientId = useClientId();

  const [bgLoaded, setBgLoaded] = useState(false);
  const textInputRef = useRef<HTMLTextAreaElement>(null);
  const textNameInputRef = useRef<HTMLInputElement>(null);

  const { status, errorMessage, transfers, textShares, handleFiles, handleSendText, handleRetry } =
    useRoomWebSocket({ roomId, clientId });

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
    <section className="fixed inset-0 z-40 overflow-y-auto">
      <BackgroundVideo onLoad={() => setBgLoaded(true)} />
      <div className="fixed inset-0 bg-black/45" />
      <div className="fixed inset-0 bg-gradient-to-b from-black/30 via-black/35 to-black/55" />
      <div className="fixed inset-x-0 bottom-0 h-[50%] bg-gradient-to-t from-black/78 via-black/56 to-transparent backdrop-blur-[3px]" />

      <div
        className={`relative z-10 min-h-screen px-4 py-6 text-white sm:px-6 md:px-10 md:py-8 transition-opacity duration-700 ${
          bgLoaded ? "opacity-100" : "opacity-0"
        }`}
      >
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-widest text-white/80">
            HOLO
          </span>
          <a
            href="https://github.com/ufraaan/holo"
            target="_blank"
            rel="noreferrer"
            className="cursor-pointer text-xs text-white/60 transition hover:text-white"
          >
            GitHub
          </a>
        </div>

        <div className="mx-auto mt-6 sm:mt-8 max-w-6xl">
          <Link
            href="/"
            className="inline-flex cursor-pointer items-center text-xs text-white/60 transition hover:text-white"
          >
            ← Go back
          </Link>
        </div>

        <div className="mx-auto mt-4 w-full max-w-6xl rounded-2xl border border-white/20 bg-black/25 p-4 sm:p-6 backdrop-blur-md md:p-8">
          <RoomHeader roomId={roomId} status={status} onRetry={handleRetry} />

          <div className="mt-6 grid gap-6 md:grid-cols-2 md:gap-8 md:items-start">
            <div className="grid gap-4 md:pr-2">
              <FileDropZone
                status={status}
                errorMessage={errorMessage}
                onInputChange={onInputChange}
                onDrop={onDrop}
                onDragOver={onDragOver}
              />
              <TextInputArea
                status={status}
                onSend={handleSend}
                onKeyDown={onTextInputKeyDown}
                textNameInputRef={textNameInputRef}
                textInputRef={textInputRef}
              />
            </div>

            <div className="md:pl-2">
              <TransferList transfers={transfers} textShares={textShares} />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
