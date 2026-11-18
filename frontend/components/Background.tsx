"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

interface BackgroundProps {
  onLoad?: () => void;
  fade?: boolean;
}

export default function Background({ onLoad, fade = true }: BackgroundProps) {
  const imageRef = useRef<HTMLImageElement>(null);
  const [visible, setVisible] = useState(false);

  const reveal = () => {
    setVisible(true);
    onLoad?.();
  };

  // A cached image can finish before hydration, in which case onLoad never fires.
  useEffect(() => {
    if (imageRef.current?.complete) reveal();
    // reveal only depends on the stable onLoad prop
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onLoad]);

  return (
    <Image
      ref={imageRef}
      src="/landing-backdrop-clouds.avif"
      alt=""
      fill
      priority
      sizes="100vw"
      onLoad={reveal}
      className={`fixed inset-0 z-0 object-cover ${
        fade
          ? `transition-[opacity,transform] duration-[1400ms] ease-out ${
              visible ? "opacity-100 scale-100" : "opacity-0 scale-[1.06]"
            }`
          : ""
      }`}
    />
  );
}
