import { mkdir, open, readFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";

async function openRoom(browser: Browser, count: number, slowReceiver = false, diskReceiver = false) {
  const contexts: BrowserContext[] = [];
  const pages: Page[] = [];
  const room = `e2e-${randomUUID()}`;
  const socketTypes: string[] = [];
  for (let index = 0; index < count; index++) {
    const context = await browser.newContext({ locale: "en-US" });
    contexts.push(context);
    if (diskReceiver && index === 1) {
      await context.addInitScript(() => {
        // Use the real browser disk writer, replacing only the native OS picker.
        Object.defineProperty(window, "showSaveFilePicker", { configurable: true, value: async () => {
          if (!navigator.userActivation.isActive) throw new Error("save picker lost its user gesture");
          const root = await navigator.storage.getDirectory();
          return root.getFileHandle("received.bin", { create: true });
        } });
      });
    }
    // A real browser/RTC transport; only slow hashing to make pause observable.
    if (slowReceiver && index === 1) {
      await context.addInitScript(() => {
        const digest = crypto.subtle.digest.bind(crypto.subtle);
        crypto.subtle.digest = async (...args) => {
          await new Promise((resolve) => setTimeout(resolve, 15));
          return digest(...args);
        };
      });
    }
    await context.addInitScript(({ forceRelay }) => {
      const sockets: WebSocket[] = [];
      const connections: RTCPeerConnection[] = [];
      const controls: unknown[] = [];
      const signals: unknown[] = [];
      const originalSend = RTCDataChannel.prototype.send;
      RTCDataChannel.prototype.send = function(data: string | Blob | ArrayBuffer | ArrayBufferView) {
        if (typeof data === "string") controls.push(JSON.parse(data));
        return Reflect.apply(originalSend, this, [data]);
      };
      const OriginalSocket = window.WebSocket;
      const OriginalPeer = window.RTCPeerConnection;
      window.WebSocket = class extends OriginalSocket {
        constructor(url: string | URL, protocols?: string | string[]) {
          super(url, protocols);
          sockets.push(this);
          this.addEventListener("message", (event) => {
            // Next.js also opens a development socket with non-JSON frames.
            if (typeof event.data !== "string") return;
            try {
              const frame = JSON.parse(event.data);
              if (frame.type !== "ice-config") signals.push(frame);
            } catch { /* development protocol */ }
          });
        }
      };
      window.RTCPeerConnection = class extends OriginalPeer {
        constructor(config?: RTCConfiguration) {
          super(forceRelay ? { ...config, iceTransportPolicy: "relay" } : config);
          connections.push(this);
        }
      };
      Object.assign(window, { testSockets: sockets, testConnections: connections, testControls: controls, testSignals: signals });
    }, { forceRelay: process.env.HOLO_FORCE_RELAY === "1" });
    const page = await context.newPage();
    // Rendering can use the poster without waiting for a background video.
    await page.route("**/landing-backdrop.mp4", (route) => route.abort());
    page.on("websocket", (socket) => socket.on("framesent", ({ payload }) => {
      const raw = typeof payload === "string" ? payload : payload.toString();
      socketTypes.push(JSON.parse(raw).type);
    }));
    pages.push(page);
    await page.goto(`/room/${room}`);
    await expect(page.getByText("Connected", { exact: true })).toBeVisible();
  }
  for (const page of pages) await expect(page.getByText(`${count} connected`, { exact: true })).toBeVisible();
  return { pages, contexts, socketTypes };
}

async function saveAndCheck(page: Page, fileName: string, expected: Buffer, path: string) {
  const card = page.getByRole("group").filter({ has: page.getByText(fileName, { exact: true }) });
  await expect(card).toContainText("Completed", { timeout: 30_000 });
  const downloading = page.waitForEvent("download");
  await card.getByRole("link", { name: "Save", exact: true }).click();
  const download = await downloading;
  await download.saveAs(path);
  expect((await readFile(path)).equals(expected)).toBe(true);
}

test("three peers chat and receive byte-identical files without WebSocket file traffic", async ({ browser }, info) => {
  const { pages: [sender, alice, bob], contexts, socketTypes } = await openRoom(browser, 3);
  try {
    await sender.getByRole("button", { name: "Chat", exact: true }).click();
    await alice.getByRole("button", { name: "Chat", exact: true }).click();
    await bob.getByRole("button", { name: "Chat", exact: true }).click();
    const chat = sender.getByPlaceholder("Type a message…", { exact: true });
    await chat.fill("hello from the P2P room");
    await chat.press("Enter");
    for (const page of [alice, bob]) await expect(page.getByText("hello from the P2P room", { exact: true })).toBeVisible();
    for (const page of [sender, alice, bob]) await page.getByRole("button", { name: "Transfers", exact: true }).click();
    const content = Buffer.from("PDF-like bytes\0\xff\n".repeat(5000));
    await sender.locator('input[type="file"]').setInputFiles({ name: "friends.pdf", mimeType: "application/pdf", buffer: content });
    for (const page of [alice, bob]) await page.getByRole("button", { name: "Accept friends.pdf", exact: true }).click();
    await saveAndCheck(alice, "friends.pdf", content, info.outputPath("alice.pdf"));
    await saveAndCheck(bob, "friends.pdf", content, info.outputPath("bob.pdf"));
    await expect(sender.getByRole("group").filter({ has: sender.getByText("friends.pdf", { exact: true }) })).toHaveCount(2);
    expect(socketTypes).toContain("signal");
    expect(socketTypes).not.toContain("file-meta");
    expect(socketTypes).not.toContain("file-chunk");
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
});

test("streams files above the memory cap to browser disk without a Blob download", async ({ browser }, info) => {
  test.setTimeout(120_000);
  const { pages: [sender, receiver], contexts } = await openRoom(browser, 2, false, true);
  try {
    const size = 100 * 1024 * 1024 + 17;
    await mkdir(info.outputDir, { recursive: true });
    const source = info.outputPath("disk-source.bin");
    const file = await open(source, "w");
    await file.truncate(size);
    await file.close();
    await sender.locator('input[type="file"]').setInputFiles(source);
    await receiver.getByRole("button", { name: "Accept disk-source.bin", exact: true }).click();
    const card = receiver.getByRole("group").filter({ has: receiver.getByText("disk-source.bin", { exact: true }) });
    await expect(card).toContainText("Saved to disk", { timeout: 90_000 });
    await expect(card.getByRole("link", { name: "Save", exact: true })).toHaveCount(0);
    const received = await receiver.evaluate(async () => {
      const root = await navigator.storage.getDirectory();
      const file = await (await root.getFileHandle("received.bin")).getFile();
      const hashes: string[] = [];
      for (let offset = 0; offset < file.size; offset += 1024 * 1024) {
        const bytes = await file.slice(offset, offset + 1024 * 1024).arrayBuffer();
        hashes.push(Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), (byte) => byte.toString(16).padStart(2, "0")).join(""));
      }
      return { size: file.size, hashes };
    });
    expect(received.size).toBe(size);
    const fullChunkHash = createHash("sha256").update(Buffer.alloc(1024 * 1024)).digest("hex");
    const tailHash = createHash("sha256").update(Buffer.alloc(17)).digest("hex");
    expect(received.hashes).toEqual([...Array<string>(100).fill(fullChunkHash), tailHash]);
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
});

test("pause survives signaling and peer reconnection, then resumes with exact bytes", async ({ browser }, info) => {
  const { pages: [sender, receiver], contexts } = await openRoom(browser, 2, true);
  try {
    const content = Buffer.alloc(4 * 1024 * 1024 + 19, 0x5a);
    await sender.locator('input[type="file"]').setInputFiles({ name: "resume.bin", mimeType: "application/octet-stream", buffer: content });
    await receiver.getByRole("button", { name: "Accept resume.bin", exact: true }).click();
    await sender.getByRole("button", { name: "Pause resume.bin", exact: true }).click();
    const card = receiver.getByRole("group").filter({ has: receiver.getByText("resume.bin", { exact: true }) });
    await expect(card).toContainText("Paused");
    await sender.evaluate(() => {
      const scope = window as typeof window & { testSockets: WebSocket[]; testConnections: RTCPeerConnection[] };
      scope.testSockets.forEach((socket) => socket.close());
      scope.testConnections.forEach((connection) => connection.close());
    });
    await expect(sender.getByText("Connected", { exact: true })).toBeVisible();
    await expect(card).toContainText("Paused");
    await sender.getByRole("button", { name: "Resume resume.bin", exact: true }).click();
    try {
      await saveAndCheck(receiver, "resume.bin", content, info.outputPath("resume.bin"));
    } catch (error) {
      for (const page of [sender, receiver]) {
        console.log(await page.evaluate(() => {
          const scope = window as typeof window & { testControls: unknown[]; testSignals: unknown[]; testConnections: RTCPeerConnection[] };
          return { text: document.body.innerText, controls: scope.testControls.filter((value) => (value as { t: string }).t !== "ack"), signals: JSON.stringify(scope.testSignals), connections: scope.testConnections.map((pc) => ({ state: pc.connectionState, signaling: pc.signalingState })) };
        }));
      }
      throw error;
    }
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
});
