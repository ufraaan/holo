"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useState } from "react";

function generateRoomId() {
  return Math.random().toString(36).slice(2, 8);
}

export default function HomePage() {
  const router = useRouter();
  const [roomId, setRoomId] = useState("");

  const handleCreate = useCallback(() => {
    const id = generateRoomId();
    router.push(`/room/${id}`);
  }, [router]);

  const handleJoin = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      const trimmed = roomId.trim();
      if (!trimmed) return;
      router.push(`/room/${trimmed}`);
    },
    [roomId, router],
  );

  return (
    <section>
      <div className="flex justify-center mb-8">
        <Image
          src="/favicon.png"
          alt="holo"
          width={200}
          height={200}
          priority
        />
      </div>
      <h1 className="text-base font-medium text-ink">
        Hand off a file, then leave.
      </h1>
      <p className="mt-3 text-sm text-subtle leading-relaxed">
        Create a room, share the link, drop a file. The relay forwards bytes
        between browsers — nothing is stored.
      </p>
      <p className="mt-2 text-xs text-muted">
        Both people open the same room link, wait for it to connect, then one
        person uploads a file for the other.
      </p>

      <div className="mt-8 space-y-3">
        <button
          type="button"
          onClick={handleCreate}
          className="w-full rounded-lg bg-ink px-4 py-3 text-sm font-medium text-sand transition hover:bg-ink-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/50 focus-visible:ring-offset-2 focus-visible:ring-offset-sand"
        >
          Create room
        </button>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-divider-soft"></div>
          </div>
          <div className="relative flex justify-center">
            <span className="bg-sand px-3 text-xs text-muted">or</span>
          </div>
        </div>

        <form onSubmit={handleJoin} className="flex gap-2">
          <input
            type="text"
            placeholder="Enter room ID"
            value={roomId}
            onChange={(e) => setRoomId(e.target.value)}
            className="flex-1 rounded-lg border border-divider bg-surface px-4 py-3 text-sm text-ink placeholder-muted outline-none transition focus:border-ink"
          />
          <button
            type="submit"
            className="rounded-lg border border-divider bg-surface px-5 py-3 text-sm font-medium text-ink transition hover:border-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/50 focus-visible:ring-offset-2 focus-visible:ring-offset-sand"
          >
            Join
          </button>
        </form>
      </div>
    </section>
  );
}

