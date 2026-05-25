import { describe, it, expect } from "vitest";
import {
  getWsUrl,
  decodeWsData,
  formatSize,
  generateFileId,
  generateTextId,
  encodeBinaryToString,
  encodeFileToChunks,
} from "./room-utils";

describe("getWsUrl", () => {
  it("appends roomId and clientId as query params", () => {
    const url = getWsUrl("abc123", "client-uuid");
    expect(url).toContain("roomId=abc123");
    expect(url).toContain("clientId=client-uuid");
  });

  it("returns a valid ws URL", () => {
    const url = getWsUrl("x", "y");
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

describe("encodeBinaryToString", () => {
  it("encodes a Uint8Array to base64", () => {
    const input = new Uint8Array([72, 101, 108, 108, 111]);
    expect(encodeBinaryToString(input)).toBe("SGVsbG8=");
  });

  it("handles empty input", () => {
    expect(encodeBinaryToString(new Uint8Array([]))).toBe("");
  });
});

describe("encodeFileToChunks", () => {
  it("calls onChunk for each chunk and onProgress", async () => {
    const content = "a".repeat(128 * 1024);
    const file = new File([content], "test.txt", { type: "text/plain" });

    const chunks: { chunk: string; offset: number; final: boolean }[] = [];
    const progressValues: number[] = [];

    await encodeFileToChunks(
      file,
      (chunk, offset, final) => {
        chunks.push({ chunk, offset, final });
      },
      (p) => {
        progressValues.push(p);
      },
    );

    expect(chunks.length).toBe(2);
    expect(chunks[0].offset).toBe(0);
    expect(chunks[0].final).toBe(false);
    expect(chunks[1].offset).toBe(64 * 1024);
    expect(chunks[1].final).toBe(true);
    expect(progressValues.length).toBeGreaterThan(0);
    expect(progressValues[progressValues.length - 1]).toBe(100);
  });

  it("marks a small file as final on first chunk", async () => {
    const file = new File(["hello"], "hello.txt", { type: "text/plain" });

    const chunks: { chunk: string; offset: number; final: boolean }[] = [];

    await encodeFileToChunks(
      file,
      (chunk, offset, final) => {
        chunks.push({ chunk, offset, final });
      },
      () => {},
    );

    expect(chunks.length).toBe(1);
    expect(chunks[0].final).toBe(true);
  });
});
