"use client";

import Image from "next/image";
import { useEffect, useRef } from "react";

interface BackgroundProps {
  onLoad?: () => void;
}

export default function Background({ onLoad }: BackgroundProps) {
  const imageRef = useRef<HTMLImageElement>(null);

  // A cached image can finish before hydration, in which case onLoad never fires.
  useEffect(() => {
    if (imageRef.current?.complete) onLoad?.();
  }, [onLoad]);

  return (
    <Image
      ref={imageRef}
      src="/landing-backdrop.avif"
      alt=""
      fill
      priority
      sizes="100vw"
      onLoad={onLoad}
      className="fixed inset-0 z-0 object-cover"
    />
  );
}
