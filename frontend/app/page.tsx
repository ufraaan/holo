"use client";
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
    <section className="pt-14 text-center md:pt-20">
      <h1 className="text-4xl font-semibold tracking-tight text-neutral-900 md:text-5xl">
        Share a file in seconds.
      </h1>
      <p className="mx-auto mt-4 max-w-xl text-lg text-neutral-600">
        Create a room. Share the link. Send the file.
      </p>

      <div className="mx-auto mt-10 grid max-w-xl gap-3">
        <button
          type="button"
          onClick={handleCreate}
          className="h-12 border border-neutral-900 bg-neutral-900 px-4 text-sm font-medium text-white transition hover:bg-neutral-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-600"
        >
          Create room
        </button>

        <div className="flex items-center gap-3 text-sm text-neutral-500 before:h-px before:flex-1 before:bg-neutral-300 after:h-px after:flex-1 after:bg-neutral-300">
          or
        </div>

        <form onSubmit={handleJoin} className="grid grid-cols-[1fr_auto] gap-3">
          <label className="sr-only" htmlFor="join-room-id">
            Enter room ID
          </label>
          <input
            id="join-room-id"
            type="text"
            placeholder="Enter room ID"
            value={roomId}
            onChange={(e) => setRoomId(e.target.value)}
            className="h-12 border border-neutral-300 bg-white px-4 text-sm text-neutral-900 placeholder:text-neutral-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-600"
          />
          <button
            type="submit"
            className="h-12 border border-neutral-300 bg-white px-5 text-sm font-medium text-neutral-900 transition hover:border-neutral-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-600"
          >
            Join
          </button>
        </form>
      </div>
    </section>
  );
}

