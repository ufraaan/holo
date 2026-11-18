/**
 * Frame validation for the room relay. Everything here is pure: no I/O, no
 * identity decisions. The room decides identity from the socket, then uses
 * these helpers to bound and reshape what a client sent.
 */

export const LIMITS = {
  /** Largest raw frame we will parse (a 64 KiB text share can double when JSON-escaped). */
  frameBytes: 512 * 1024,
  textBytes: 64 * 1024,
  chatChars: 1000,
  sdpBytes: 16 * 1024,
  candidateBytes: 4 * 1024,
  idChars: 64,
  nameChars: 64,
};

const utf8 = new TextEncoder();

export interface TextShare {
  id: string;
  text: string;
  customName?: string;
  timestamp: number;
}

export interface ChatMessage {
  id: string;
  text: string;
  timestamp: number;
}

export interface Candidate {
  candidate: string | null;
  sdpMid?: string | null;
  sdpMLineIndex?: number | null;
  usernameFragment?: string | null;
}

export type Signal =
  | { description: { type: "offer" | "answer"; sdp: string } }
  | { candidate: Candidate | null };

export type ClientFrame =
  | { type: "signal"; to: string; signal: Signal }
  | { type: "text-share"; payload: TextShare }
  | { type: "chat-message"; payload: ChatMessage }
  | { type: "ice-request" }
  | { type: "join" };

export type Parsed = { ok: true; frame: ClientFrame } | { ok: false; code: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isBoundedString(value: unknown, max: number, min = 1): value is string {
  return typeof value === "string" && value.length >= min && value.length <= max;
}

function byteLength(value: string): number {
  return utf8.encode(value).byteLength;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function optionalString(
  value: unknown,
  max: number,
): { ok: boolean; value?: string | null } {
  if (value === undefined || value === null) return { ok: true, value: value ?? null };
  if (typeof value !== "string" || value.length > max) return { ok: false };
  return { ok: true, value };
}

function parseCandidate(value: unknown): Candidate | null {
  // Some senders pass the ICE candidate as a string.
  if (typeof value === "string") {
    return value.length <= LIMITS.candidateBytes ? { candidate: value } : null;
  }
  if (!isRecord(value)) return null;

  const candidate = value.candidate;
  if (candidate !== null && candidate !== undefined) {
    if (typeof candidate !== "string" || candidate.length > LIMITS.candidateBytes) {
      return null;
    }
  }

  const sdpMid = optionalString(value.sdpMid, LIMITS.nameChars);
  const usernameFragment = optionalString(value.usernameFragment, LIMITS.nameChars);
  if (!sdpMid.ok || !usernameFragment.ok) return null;

  const sdpMLineIndex = value.sdpMLineIndex;
  if (
    sdpMLineIndex !== undefined &&
    sdpMLineIndex !== null &&
    (!Number.isInteger(sdpMLineIndex) || (sdpMLineIndex as number) < 0)
  ) {
    return null;
  }

  const parsed: Candidate = { candidate: (candidate as string | null | undefined) ?? null };
  if (sdpMid.value !== undefined) parsed.sdpMid = sdpMid.value;
  if (sdpMLineIndex !== undefined) parsed.sdpMLineIndex = sdpMLineIndex as number | null;
  if (usernameFragment.value !== undefined) parsed.usernameFragment = usernameFragment.value;
  return parsed;
}

export function parseSignal(value: unknown): Signal | null {
  if (!isRecord(value)) return null;

  if (isRecord(value.description)) {
    const { type, sdp } = value.description;
    if (type !== "offer" && type !== "answer") return null;
    if (!isBoundedString(sdp, LIMITS.sdpBytes) || byteLength(sdp) > LIMITS.sdpBytes) return null;
    return { description: { type, sdp } };
  }
  if (Object.hasOwn(value, "candidate")) {
    if (value.candidate === null) return { candidate: null };
    const candidate = parseCandidate(value.candidate);
    return candidate ? { candidate } : null;
  }

  return null;
}

function parseTextShare(payload: unknown, now: number): TextShare | null {
  if (!isRecord(payload)) return null;
  if (!isBoundedString(payload.id, LIMITS.idChars)) return null;
  if (typeof payload.text !== "string" || payload.text.length === 0) return null;
  if (byteLength(payload.text) > LIMITS.textBytes) return null;

  const customName = optionalString(payload.customName, LIMITS.nameChars);
  if (!customName.ok) return null;

  const share: TextShare = {
    id: payload.id,
    text: payload.text,
    timestamp: isFiniteNumber(payload.timestamp) ? payload.timestamp : now,
  };
  if (customName.value) share.customName = customName.value;
  return share;
}

function parseChatMessage(payload: unknown, now: number): ChatMessage | null {
  if (!isRecord(payload)) return null;
  const id = isBoundedString(payload.id, LIMITS.idChars) ? payload.id : crypto.randomUUID();
  if (typeof payload.text !== "string" || payload.text.length === 0) return null;
  if (payload.text.length > LIMITS.chatChars) return null;

  return {
    id,
    text: payload.text,
    timestamp: isFiniteNumber(payload.timestamp) ? payload.timestamp : now,
  };
}

/**
 * `roomId` and `clientId` are validated by the Worker before the upgrade;
 * a client-supplied `from`, `senderId`, or `senderName` is never trusted.
 */
export function parseClientFrame(raw: string, now = Date.now()): Parsed {
  if (byteLength(raw) > LIMITS.frameBytes) return { ok: false, code: "frame-too-large" };

  let msg: unknown;
  try {
    msg = JSON.parse(raw);
  } catch {
    return { ok: false, code: "bad-json" };
  }
  if (!isRecord(msg)) return { ok: false, code: "bad-frame" };

  switch (msg.type) {
    case "signal": {
      const payload = msg.payload;
      if (!isRecord(payload)) return { ok: false, code: "invalid-signal" };
      if (!isBoundedString(payload.to, LIMITS.idChars)) {
        return { ok: false, code: "invalid-signal" };
      }
      const signal = parseSignal(payload.signal);
      if (!signal) return { ok: false, code: "invalid-signal" };
      return { ok: true, frame: { type: "signal", to: payload.to, signal } };
    }
    case "text-share": {
      const payload = parseTextShare(msg.payload, now);
      return payload
        ? { ok: true, frame: { type: "text-share", payload } }
        : { ok: false, code: "invalid-text-share" };
    }
    case "chat-message": {
      const payload = parseChatMessage(msg.payload, now);
      return payload
        ? { ok: true, frame: { type: "chat-message", payload } }
        : { ok: false, code: "invalid-chat-message" };
    }
    case "ice-request":
      return { ok: true, frame: { type: "ice-request" } };
    case "join":
      // Room membership comes from the URL; the legacy join frame is a no-op.
      return { ok: true, frame: { type: "join" } };
    default:
      return { ok: false, code: "unsupported-type" };
  }
}

export function decodeFrame(message: string | ArrayBuffer): string | null {
  if (typeof message === "string") return message;
  if (message.byteLength > LIMITS.frameBytes) return null;
  return new TextDecoder().decode(message);
}
