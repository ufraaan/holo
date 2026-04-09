"use client";

import Image from "next/image";

interface BackgroundImageProps {
  src: string;
  onLoad?: () => void;
  priority?: boolean;
}

export default function BackgroundImage({
  src,
  onLoad,
  priority = true,
}: BackgroundImageProps) {
  return (
    <Image
      src={src}
      alt=""
      fill
      priority={priority}
      sizes="100vw"
      className="object-cover"
      onLoad={onLoad}
    />
  );
}
