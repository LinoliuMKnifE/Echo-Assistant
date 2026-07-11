# Troubleshooting

> **Current status:** Provider-backed chat, durable sidecar persistence, encrypted backup/restore, redacted diagnostics, and desktop pairing controls are implemented. Signed installed-package behavior remains a release gate; automatic migration recovery and sidecar restart after a mid-session crash are not implemented.

## Echo cannot answer

Confirm internet access. If setup did not collect a key, restart with onboarding incomplete and enter it there; Settings-based key replacement is not implemented yet. Local conversations, profile, memories, and skills should remain available offline. Rate-limit and provider-outage messages should preserve unsent text; retry after the displayed delay.

## Firefox says disconnected

Open Echo's Firefox pairing controls in **Backup & restore**, revoke the old token, issue a new one, and paste it into the extension. The service must use `127.0.0.1:43117`; VPN/proxy rewriting of localhost can interfere. Never paste the token into a website or support message.

## Database or migration error

Stop retrying writes, create a copy of the application-data directory, and use the in-app diagnostic/restore flow. Do not manually edit SQLite. A failed migration should leave the previous database intact.

## Backup will not restore

Check password/recovery key, free disk space, and app version. Authentication or integrity failures must not be bypassed. Restore should stage data and leave current data unchanged on failure.

## Blank or unresponsive window

Restart Echo; unsent drafts should recover where supported. Generate a redacted diagnostic report from Settings. Diagnostics must exclude keys, tokens, full message bodies, and hidden credentials.

Developer checks are `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build`. Record the operating system, app version, exact error, and whether the issue reproduces without demo data.
