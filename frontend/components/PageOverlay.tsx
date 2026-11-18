"use client";

import { usePathname } from "next/navigation";

export default function PageOverlay() {
  const pathname = usePathname();
  // The hero art is bright, so the homepage needs less darkening than the
  // text-heavy legal pages.
  return <div className={`fixed inset-0 ${pathname === "/" ? "bg-black/50" : "bg-black/60"}`} />;
}
