# Security

## Supported Versions

| Version | Status |
|---------|--------|
| 0.1.x   | Active |

Holo is pre-1.0. The surface area is intentionally small — but that doesn't make security reports less welcome.

---

## Reporting a Vulnerability

**Do not open a public issue.** If you find something, report it privately.

Use GitHub's built-in private advisory flow:
[Open a private advisory](https://github.com/ufraaan/holo/security/advisories/new)

Your report should include:
- What the vulnerability is and where it lives
- Steps to reproduce it
- What an attacker could realistically do with it
- A suggested fix if you have one (optional, appreciated)

You'll get an acknowledgement within **48–72 hours**. From there, expect a timeline estimate and a heads-up when a fix ships. Reports that lead to a fix are credited in the release notes.

---

## Holo's Attack Surface

Holo is a WebSocket relay. It moves data in memory and drops it. Understanding this matters before you assess what's actually exploitable:

**No persistence.** Holo has no database, no file system writes, no session store. Once a connection closes and inactivity clears the buffer, that data is gone. There's no "data at rest" to extract.

**Ephemeral by design.** Files are streamed in chunks over WebSockets. Nothing lingers server-side after the transfer completes. If you're looking for exfiltration vectors, the window is narrow and tied entirely to active sessions.

**What's actually in scope:**
- WebSocket connection handling and authentication
- Relay logic that could allow cross-session data leakage
- Denial-of-service via connection flooding or large payloads
- Any mechanism that breaks session isolation

**What's out of scope:**
- Vulnerabilities in infrastructure you control (your reverse proxy, your deployment)
- Issues requiring physical or privileged OS-level access to the server

---

## Coordinated Disclosure

Reports are handled privately until a fix is deployed. Public disclosure is coordinated with the reporter. If a critical issue is found, a patch and advisory will be published together.