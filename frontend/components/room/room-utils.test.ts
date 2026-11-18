import { describe, it, expect } from "vitest";
import {
  getWsUrl,
  decodeWsData,
  formatSize,
  generateFileId,
  generateTextId,
} from "./room-utils";

describe("getWsUrl", () => {
  it("appends roomId, clientId, and token as query params", () => {
    const url = getWsUrl("abc123", "client-uuid", "tok_abcdefghijkl");
    expect(url).toContain("roomId=abc123");
    expect(url).toContain("clientId=client-uuid");
    expect(url).toContain("token=tok_abcdefghijkl");
  });

  it("returns a valid ws URL", () => {
    const url = getWsUrl("x", "y", "tok_abcdefghijkl");
    expect(() => new URL(url)).not.toThrow();
    expect(url.startsWith("ws://") || url.startsWith("wss://")).toBe(true);
  });
});

describe("decodeWsData", () => {
  it("decodes an ArrayBuffer", async () => {
    const buf = new Uint8Array([104, 101, 108, 108, 111]).buffer;
    expect(await decodeWsData(buf)).toBe("hello");
  });

  it("passes through a string", async () => {
    expect(await decodeWsData("hello")).toBe("hello");
  });

  it("decodes a Blob", async () => {
    const blob = new Blob(["hello"]);
    expect(await decodeWsData(blob)).toBe("hello");
  });

  it("returns null for unknown types", async () => {
    expect(await decodeWsData(42 as unknown as string)).toBeNull();
  });
});

describe("formatSize", () => {
  it('returns "0 B" for zero', () => {
    expect(formatSize(0)).toBe("0 B");
  });

  it('returns "500 B" for 500', () => {
    expect(formatSize(500)).toBe("500 B");
  });

  it('returns "1.0 KB" for 1024', () => {
    expect(formatSize(1024)).toBe("1.0 KB");
  });

  it('returns "1.5 KB" for 1536', () => {
    expect(formatSize(1536)).toBe("1.5 KB");
  });

  it('returns "1.0 MB" for 1048576', () => {
    expect(formatSize(1048576)).toBe("1.0 MB");
  });

  it("handles large sizes", () => {
    expect(formatSize(1073741824)).toBe("1.0 GB");
  });
});

describe("generateFileId", () => {
  it("returns a string", () => {
    expect(typeof generateFileId()).toBe("string");
  });

  it("returns unique values", () => {
    const ids = new Set(Array.from({ length: 10 }, () => generateFileId()));
    expect(ids.size).toBe(10);
  });
});

describe("generateTextId", () => {
  it("returns a string", () => {
    expect(typeof generateTextId()).toBe("string");
  });

  it("returns unique values", () => {
    const ids = new Set(Array.from({ length: 10 }, () => generateTextId()));
    expect(ids.size).toBe(10);
  });
});
