import { env } from "cloudflare:workers";
import { runInDurableObject } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { TURN_HOURLY_LIMIT } from "../src/room";
import { mintTurnCredentials, STUN_ONLY, TURN_TTL_SECONDS, type IceServer } from "../src/turn";

async function stub() {
  const target = env.ROOMS.getByName(`ice-${crypto.randomUUID()}`);
  const response = await target.fetch("https://holo.test/ws?roomId=ice&clientId=a", { headers: { Upgrade: "websocket" } });
  response.webSocket!.accept();
  return target;
}

function turnEnv(overrides: Record<string, string | undefined> = {}): Env {
  return {
    ORIGINS: "http://localhost:3000",
    TURN_ENABLED: "true",
    TURN_KEY_ID: "test-key-id",
    TURN_API_TOKEN: "test-api-token",
    ROOMS: env.ROOMS,
    ...overrides,
  } as unknown as Env;
}

const minted: IceServer[] = [
  {
    urls: ["turn:turn.cloudflare.com:3478?transport=udp"],
    username: "user",
    credential: "cred",
  },
];

describe("ice config", () => {
  it("falls back to STUN when TURN is disabled", async () => {
    const result = await runInDurableObject(await stub(), (instance) =>
      instance.buildIceConfig(turnEnv({ TURN_ENABLED: "false" }), "a", async () => {
        throw new Error("must not mint");
      }),
    );
    expect(result).toEqual({
      ok: true,
      config: { iceServers: STUN_ONLY, turnEnabled: false, expiresAt: 0 },
    });
  });

  it("falls back to STUN when TURN secrets are absent", async () => {
    const result = await runInDurableObject(await stub(), (instance) =>
      instance.buildIceConfig(turnEnv({ TURN_API_TOKEN: undefined }), "a", async () => {
        throw new Error("must not mint");
      }),
    );
    expect(result).toEqual({
      ok: true,
      config: { iceServers: STUN_ONLY, turnEnabled: false, expiresAt: 0 },
    });
  });

  it("mints short-lived credentials and bounds renewals to once per minute", async () => {
    const target = await stub();
    let calls = 0;
    const mint = async () => {
      calls += 1;
      return minted;
    };
    const before = Date.now();

    const first = await runInDurableObject(target, (instance) =>
      instance.buildIceConfig(turnEnv(), "a", mint),
    );
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.config).toMatchObject({ turnEnabled: true, iceServers: minted });
    expect(first.config.expiresAt).toBeGreaterThanOrEqual(before + TURN_TTL_SECONDS * 1000);
    expect(first.config.expiresAt).toBeLessThanOrEqual(Date.now() + TURN_TTL_SECONDS * 1000);

    const second = await runInDurableObject(target, (instance) =>
      instance.buildIceConfig(turnEnv(), "a", mint),
    );
    expect(second).toEqual({ ok: false, code: "ice-rate-limited" });
    expect(calls).toBe(1);
  });

  it("falls back to STUN when minting fails", async () => {
    const result = await runInDurableObject(await stub(), (instance) =>
      instance.buildIceConfig(turnEnv(), "a", async () => null),
    );
    expect(result).toEqual({
      ok: true,
      config: { iceServers: STUN_ONLY, turnEnabled: false, expiresAt: 0 },
    });
  });

  it("bounds issuance per hour per room", async () => {
    const target = await stub();
    await runInDurableObject(target, (_instance, state) => {
      const hourStart = Math.floor(Date.now() / 3_600_000) * 3_600_000;
      state.storage.sql.exec(
        "INSERT INTO turn_usage (hour_start, issued) VALUES (?, ?)",
        hourStart,
        TURN_HOURLY_LIMIT,
      );
    });

    let calls = 0;
    const result = await runInDurableObject(target, (instance) =>
      instance.buildIceConfig(turnEnv(), "a", async () => {
        calls += 1;
        return minted;
      }),
    );
    expect(result).toEqual({
      ok: true,
      config: { iceServers: STUN_ONLY, turnEnabled: false, expiresAt: 0 },
    });
    expect(calls).toBe(0);
  });
});

describe("mintTurnCredentials", () => {
  it("calls the documented endpoint, keeps secrets server-side, and strips extras", async () => {
    let captured: { url: string; init?: RequestInit } | undefined;
    const response = Response.json(
      {
        iceServers: [
          { urls: "stun:stun.cloudflare.com:3478" },
          {
            urls: ["turn:turn.cloudflare.com:3478?transport=udp"],
            username: "user",
            credential: "cred",
            secret: "leak-me",
          },
        ],
      },
      { status: 201 },
    );
    const fake = async (input: RequestInfo | URL, init?: RequestInit) => {
      captured = { url: String(input), init };
      return response;
    };

    const servers = await mintTurnCredentials(turnEnv(), fake);
    expect(servers).toEqual([
      { urls: "stun:stun.cloudflare.com:3478" },
      {
        urls: ["turn:turn.cloudflare.com:3478?transport=udp"],
        username: "user",
        credential: "cred",
      },
    ]);
    expect(captured?.url).toBe(
      "https://rtc.live.cloudflare.com/v1/turn/keys/test-key-id/credentials/generate-ice-servers",
    );
    expect(captured?.init?.method).toBe("POST");
    expect((captured?.init?.headers as Record<string, string>).Authorization).toBe(
      "Bearer test-api-token",
    );
    expect(JSON.parse(String(captured?.init?.body))).toEqual({ ttl: TURN_TTL_SECONDS });
    expect(TURN_TTL_SECONDS).toBe(600);
  });

  it("returns null on upstream failure, bad urls, or a missing key", async () => {
    const failing = async () => new Response("nope", { status: 500 });
    expect(await mintTurnCredentials(turnEnv(), failing)).toBeNull();

    const throwing = async () => {
      throw new Error("network");
    };
    expect(await mintTurnCredentials(turnEnv(), throwing)).toBeNull();

    const unsafe = async () =>
      Response.json(
        { iceServers: [{ urls: "https://evil.example/hook", username: "u", credential: "c" }] },
        { status: 201 },
      );
    expect(await mintTurnCredentials(turnEnv(), unsafe)).toBeNull();

    let called = 0;
    const unused = async () => {
      called += 1;
      return failing();
    };
    expect(
      await mintTurnCredentials(turnEnv({ TURN_KEY_ID: undefined }), unused),
    ).toBeNull();
    expect(called).toBe(0);
  });
});
