# Echo implementation plan

> **Current status:** The desktop is integrated with the durable SQLite sidecar, provider-backed chat, first-run credential setup, and browser pairing controls. Automated tests cover the sidecar protocol and browser flow. The release checkpoint is not met until signed clean-machine Windows/macOS packages and the AMO-signed Firefox interoperability workflow succeed with external credentials.

## Acceptance checkpoint

Echo is accepted when a clean checkout can install with pnpm, pass lint/typecheck/tests/build, package the Windows desktop and Firefox extension on Windows, and retain cross-platform CI/package configuration for macOS. The app must demonstrate persistent preference, forgetting, conversation recall, contradiction review, skill revision/rollback, authenticated browser context, secret exclusion, encrypted backup restore, and useful offline data management.

## Delivery slices

1. **Core foundation:** strict TypeScript workspace; SQLite/FTS5 schema; memory, profile, retrieval, conversation, projects, skills, provider, tool permissions, scheduler, audit, context, backup, pairing, prompts; deterministic tests.
2. **Desktop:** Tauri/React shell, first-run setup, consumer navigation, local persistence bridge, all required management screens, accessible states and destructive confirmations.
3. **Firefox:** minimum-permission WebExtension, popup/sidebar, explicit selection/page capture, authenticated localhost pairing, package script.
4. **Hardening:** system credential storage, migrations, signed-request replay defense, untrusted-content boundaries, diagnostics, recovery, retention and factory reset.
5. **Release:** Windows/macOS CI, installers, extension artifact, end-to-end flows, build report.

## Target decision record

- pnpm workspaces keep one lockfile and coordinate app/package scripts.
- The sidecar's SQLite database is authoritative when the sidecar starts; the native Rust database is the startup fallback. The schema uses FTS5 and optional embedding blobs so packaging does not require a platform-native vector extension.
- The core is a platform-independent TypeScript package. Tauri owns OS credentials, notifications, launch-at-login and filesystem access; the UI never receives a stored API key.
- Skills are validated data and instructions. They cannot execute code or change protected policy.
- AES-256-GCM plus scrypt protects portable backups. Restore must authenticate the full payload before replacing live data.
- The Responses adapter uses web-standard fetch, schema validation, bounded retry, cancellation, configurable identifiers and explicit accounting. Automated tests use a mock provider.

## Verification order

Run `pnpm install`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, then current-platform packaging. Fix failures at the layer that owns them and rerun the failed gate plus the complete gate set. Normal automated tests must never make a paid API call.

## External requirements

Live model validation needs a user-supplied OpenAI API key held by the OS credential store. Windows signing, Apple signing/notarization, and Firefox store publishing require external identities and secrets; unsigned development artifacts remain testable without them.
