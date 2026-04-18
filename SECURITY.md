# Security policy

## Reporting a vulnerability

**Please do not open a public issue.** Use GitHub's private vulnerability reporting:

→ [https://github.com/huylq98/clauditor/security/advisories/new](https://github.com/huylq98/clauditor/security/advisories/new)

Include:

- A description of the issue and its impact.
- Reproduction steps (and a proof-of-concept if possible).
- The Clauditor version and OS where you saw it.

## What to expect

- **Within 48 hours** — acknowledgement that the report was received.
- **Within 7 days** — initial triage, severity assessment, and fix timeline estimate.
- **Before public disclosure** — coordinated release of a patched version and a matching security advisory.

## Supported versions

| Version | Supported |
|---------|-----------|
| Latest release | ✅ |
| Older releases | No — please upgrade. |

Clauditor is a desktop app, not a hosted service. Security patches are delivered as a new release; auto-updater will pick them up once signing is enabled.

## Threat model

Clauditor spawns the `claude` CLI in a PTY and runs an HTTP server on `127.0.0.1:27182` to receive Claude Code hook callbacks. Notable boundaries:

- **Hook server** is localhost-only and gated by a per-launch bearer token in the `X-Clauditor-Token` header. The token is 24 random bytes, hex-encoded.
- **Session identity** on hook callbacks is established via the parent PID of the hook process (not env vars), because env vars leak to descendant processes.
- **Clauditor writes `~/.claude/settings.json` hook entries** on launch and removes them on clean quit. If the app is killed ungracefully the entries remain but become no-ops (they require the launch token).
- **Installers** for Windows/macOS/Linux are produced by our GitHub Actions release pipeline and carry a build-provenance attestation signed by sigstore.

Things that are **out of scope**:
- Code execution via `claude` itself — that is Claude Code's security model, not Clauditor's.
- Users running arbitrary commands inside the terminal — same.
