import { describe, expect, it } from "vitest";
import {
  formatEta,
  remainingSeconds,
  sampleSpeed,
  SPEED_SAMPLE_MS,
} from "./transfer-metrics";

describe("sampleSpeed", () => {
  it("establishes a baseline without reporting a rate", () => {
    expect(sampleSpeed(null, 1000, 10_000)).toEqual({
      at: 10_000,
      bytes: 1000,
      bytesPerSecond: 0,
    });
  });

  it("derives a rate once a full sample window has passed", () => {
    const baseline = sampleSpeed(undefined, 0, 0);
    const sample = sampleSpeed(baseline, 2048, SPEED_SAMPLE_MS);
    expect(sample.bytesPerSecond).toBe(4096);
  });

  it("keeps the previous rate inside the sample window", () => {
    const baseline = { at: 1000, bytes: 1000, bytesPerSecond: 4096 };
    expect(sampleSpeed(baseline, 1400, 1200)).toBe(baseline);
  });

  it("smooths a jump instead of following every burst", () => {
    const previous = { at: 0, bytes: 1024, bytesPerSecond: 1024 };
    const sample = sampleSpeed(previous, 3072, SPEED_SAMPLE_MS);
    expect(sample.bytesPerSecond).toBeCloseTo(2252.8, 4);
  });

  it("decays toward zero when no more bytes arrive", () => {
    const previous = { at: 0, bytes: 1024, bytesPerSecond: 1024 };
    const first = sampleSpeed(previous, 1024, SPEED_SAMPLE_MS);
    expect(first.bytesPerSecond).toBeCloseTo(614.4, 5);
    const second = sampleSpeed(first, 1024, SPEED_SAMPLE_MS * 2);
    expect(second.bytesPerSecond).toBeCloseTo(368.64, 5);
  });

  it("resets when resumed from a lower offset", () => {
    const previous = { at: 0, bytes: 10_000, bytesPerSecond: 5000 };
    expect(sampleSpeed(previous, 2000, SPEED_SAMPLE_MS)).toEqual({
      at: SPEED_SAMPLE_MS,
      bytes: 2000,
      bytesPerSecond: 0,
    });
  });
});

describe("remainingSeconds", () => {
  it("rounds up the remaining whole seconds", () => {
    expect(remainingSeconds(1000, 3000, 800)).toBe(3);
  });

  it("reports nothing without a rate or remaining bytes", () => {
    expect(remainingSeconds(1000, 3000, 0)).toBeUndefined();
    expect(remainingSeconds(3000, 3000, 800)).toBeUndefined();
  });
});

describe("formatEta", () => {
  it("formats minutes and seconds", () => {
    expect(formatEta(75)).toBe("1:15");
    expect(formatEta(9)).toBe("0:09");
  });

  it("adds an hours part when needed", () => {
    expect(formatEta(3723)).toBe("1:02:03");
  });
});
