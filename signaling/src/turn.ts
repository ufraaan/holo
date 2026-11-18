/**
 * Short-lived Cloudflare TURN credentials.
 *
 * Docs: https://developers.cloudflare.com/realtime/turn/generate-credentials/
 * The TURN key id and API token stay server-side; only the minted iceServers
 * reach the browser.
 */

export const TURN_TTL_SECONDS = 600;
export const TURN_ENDPOINT = "https://rtc.live.cloudflare.com/v1/turn/keys";

export const STUN_ONLY = [{ urls: "stun:stun.cloudflare.com:3478" }];

export interface IceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function isUrl(value: unknown): value is string {
  return typeof value === "string" && value.length <= 512 && /^(stun|stuns|turn|turns):/.test(value);
}

/** Stops a compromised/hostile upstream body from becoming a browser config. */
function sanitizeIceServers(value: unknown): IceServer[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > 8) return null;

  const servers: IceServer[] = [];
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) return null;
    const raw = entry as Record<string, unknown>;

    let urls: string | string[];
    if (isUrl(raw.urls)) urls = raw.urls;
    else if (Array.isArray(raw.urls) && raw.urls.length > 0 && raw.urls.length <= 8) {
      if (!raw.urls.every(isUrl)) return null;
      urls = raw.urls as string[];
    } else {
      return null;
    }

    const server: IceServer = { urls };
    if (typeof raw.username === "string" && raw.username.length <= 512) {
      server.username = raw.username;
    }
    if (typeof raw.credential === "string" && raw.credential.length <= 512) {
      server.credential = raw.credential;
    }
    servers.push(server);
  }
  return servers;
}

/**
 * Returns minted iceServers, or null when TURN is not configured or the
 * upstream call/validation fails. Callers fall back to STUN.
 */
export async function mintTurnCredentials(
  env: Env,
  fetchImpl: FetchLike = fetch,
): Promise<IceServer[] | null> {
  const keyId = env.TURN_KEY_ID;
  const token = env.TURN_API_TOKEN;
  if (!keyId || !token) return null;

  try {
    const response = await fetchImpl(
      `${TURN_ENDPOINT}/${encodeURIComponent(keyId)}/credentials/generate-ice-servers`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ttl: TURN_TTL_SECONDS }),
        signal: AbortSignal.timeout(5000),
      },
    );
    if (!response.ok) return null;

    const body = (await response.json()) as { iceServers?: unknown };
    return sanitizeIceServers(body?.iceServers);
  } catch {
    return null;
  }
}
