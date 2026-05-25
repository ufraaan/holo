"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

interface BackgroundVideoProps {
  poster?: string;
  onLoad?: () => void;
}

export default function BackgroundVideo({
  poster = "/landing-backdrop.webp",
  onLoad,
}: BackgroundVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const finish = () => {
      setIsLoaded(true);
      onLoad?.();
    };

    if (video.readyState >= 2) {
      finish();
      return;
    }

    const handleLoadedData = () => finish();
    const handleError = () => {
      console.warn("background video failed to load, falling back to poster");
      finish();
    };

    video.addEventListener("loadeddata", handleLoadedData);
    video.addEventListener("error", handleError);

    return () => {
      video.removeEventListener("loadeddata", handleLoadedData);
      video.removeEventListener("error", handleError);
    };
  }, [onLoad]);

  return (
    <>
      <video
        ref={videoRef}
        className="fixed inset-0 z-0 h-full w-full object-cover"
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        poster={poster}
      >
        <source src="/landing-backdrop.mp4" type="video/mp4" />
      </video>

      {!isLoaded && poster && (
        <Image
          src={poster}
          alt=""
          fill
          className="fixed inset-0 z-0 object-cover"
          priority
        />
      )}
    </>
  );
}
