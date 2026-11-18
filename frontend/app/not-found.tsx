import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-black px-6 text-center text-white">
      <h1 className="text-6xl font-medium tracking-tight">404</h1>
      <p className="text-sm text-white/60">This page does not exist.</p>
      <Link
        href="/"
        className="text-sm text-white/85 underline underline-offset-4 transition hover:text-white"
      >
        Go home
      </Link>
    </main>
  );
}
