export const SPEED_SAMPLE_MS = 500;

// Acks and writes arrive in bursts; a raw per-emit rate would swing wildly, so
// each new sample moves the previous rate only part of the way.
const SPEED_SMOOTHING = 0.4;

export interface SpeedSample {
  at: number;
  bytes: number;
  bytesPerSecond: number;
}

export function sampleSpeed(
  previous: SpeedSample | null | undefined,
  bytes: number,
  now: number,
): SpeedSample {
  if (!previous || bytes < previous.bytes) {
    return { at: now, bytes, bytesPerSecond: 0 };
  }
  const elapsed = now - previous.at;
  if (elapsed < SPEED_SAMPLE_MS) return previous;
  const instant = ((bytes - previous.bytes) * 1000) / elapsed;
  const bytesPerSecond =
    previous.bytesPerSecond > 0
      ? previous.bytesPerSecond + (instant - previous.bytesPerSecond) * SPEED_SMOOTHING
      : instant;
  return { at: now, bytes, bytesPerSecond };
}

export function remainingSeconds(
  bytes: number,
  size: number,
  bytesPerSecond: number,
): number | undefined {
  if (!(bytesPerSecond > 0) || bytes >= size) return undefined;
  return Math.max(1, Math.round((size - bytes) / bytesPerSecond));
}

export function formatEta(seconds: number): string {
  const total = Math.max(0, Math.ceil(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const padded = String(secs).padStart(2, "0");
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${padded}`;
  }
  return `${minutes}:${padded}`;
}
