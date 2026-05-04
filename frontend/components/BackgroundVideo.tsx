"use client";

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

    const handleLoadedData = () => {
      setIsLoaded(true);
      onLoad?.();
    };

    video.addEventListener("loadeddata", handleLoadedData);
    return () => video.removeEventListener("loadeddata", handleLoadedData);
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
        <img
          src={poster}
          alt=""
          className="fixed inset-0 z-0 h-full w-full object-cover"
        />
      )}
    </>
  );
}
