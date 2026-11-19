# Security policy

## Supported versions

Security fixes target the current `master` branch and the official deployment at
[https://holo.ufraan.dev](https://holo.ufraan.dev). Older commits, preview deployments,
and self-hosted copies do not have a separate maintenance schedule. Self-hosters
should keep their deployment and dependencies up to date.

## Reporting a vulnerability

Please use [GitHub private vulnerability reporting](https://github.com/ufraaan/holo/security/advisories/new).
Do not publish exploit details, room codes, connection tokens, TURN credentials,
or private files in an issue, discussion, or pull request.

Include:

- The affected page or component and commit or deployment, if known
- Reproduction steps using a room and files you control
- The expected behavior, actual behavior, and likely impact
- Relevant browser and operating system versions
- A minimal proof of concept with secrets and personal data removed

Reports are reviewed on a best-effort basis; there is no guaranteed response or
fix deadline. Please allow time for investigation before publishing details. Any
public advisory and reporter credit will be coordinated with the reporter.

## Architecture and trust boundaries

### Files

Browsers exchange files over encrypted WebRTC data channels. A direct connection
is preferred; Cloudflare TURN relays encrypted traffic when needed. The application
signaling service does not carry file bytes and rejects the legacy `file-meta`
and `file-chunk` WebSocket messages. TURN relaying still involves a server, even
though it cannot read the encrypted file payload.

Recipients must accept incoming files. Supported browsers can write directly to
disk; other browsers use a bounded in-memory buffer. Pause and connection recovery
require both tabs to remain open. Holo does not provide a file archive, malware
scanner, or persistent transfer recovery. Recipients can retain downloaded copies.

### Room coordination, chat, and shared text

A Cloudflare Worker and a Durable Object per room handle membership, WebRTC
signaling, chat, and shared text. Production connections use HTTPS and secure
WebSockets. Chat and shared text are readable by the room service and are **not
end-to-end encrypted**.

Shared content is not intentionally persisted by the signaling application.
WebSocket attachments retain membership and rate-limit state across hibernation;
bounded TURN issuance counters are stored in SQLite. This is operational state,
not a message or file archive. Infrastructure and telemetry providers may process
network metadata and operational records; closing a room does not erase those
records or recipients' copies.

### Identity and access

Holo has no accounts or verified participant identities. Anyone who knows a room
code can join, subject to room limits. Room codes and QR invitations are not a
substitute for strong authentication. Direct WebRTC connections can disclose IP
addresses to other participants.

The signaling service validates origins and message shapes, limits room size and
message rates, and assigns chat sender identities. A per-tab token protects
reconnection with the same client ID; it is not a room password. Origin validation
is a browser boundary, not authentication against non-browser clients.

Long-lived TURN API secrets stay in the Worker. Browsers receive only short-lived
TURN credentials, currently valid for 600 seconds. Do not embed deployment secrets
in client bundles or disclose live temporary credentials in reports.

### Optional telemetry

When configured, analytics use sanitized page categories and respect supported
opt-out signals. Error reporting is sanitized; session replay, performance traces,
and Sentry logs are disabled. See the [privacy policy](https://holo.ufraan.dev/privacy)
for provider and data-handling details.

## Useful areas to investigate

Reports about these boundaries are especially useful:

- Cross-room message leakage, unauthorized signaling, or sender impersonation
- Reconnection token handling and unauthorized replacement of another client's socket
- Script injection through chat, shared text, filenames, or room links
- Transfer acceptance, resource limits, disk writes, or resume integrity
- TURN credential exposure, credential issuance abuse, or rate-limit bypasses
- Private content or credentials leaking through telemetry, logs, or error responses

Test only rooms, devices, and files you control. Do not flood the public service,
exhaust provider quotas, probe other users' rooms, or upload harmful content. Use a
local deployment for resource-exhaustion testing. Upstream provider vulnerabilities
should also be reported to that provider; Holo integration mistakes remain relevant
here.
