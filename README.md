# Echo

Echo is an early, local-first personal-assistant release candidate for Windows and macOS. This repository provides a tested TypeScript core library, a Tauri/React desktop backed primarily by a packaged Node/SQLite sidecar with a native Rust fallback, and a packaged Firefox extension. It is not yet a production release: signed clean-machine packages, live provider validation, and live Firefox-to-installed-desktop interoperability remain unverified.

## What works today

- `@luma/core` contains validated memory, context, skill, scheduling, tool-permission, provider, backup, pairing-authentication, extension-request, and migration primitives. `LumaApplicationService` durably covers conversations, memories/profile provenance, projects, skill versions, schedules, audit, FTS search, portable encrypted backup/restore, and offline reopen scenarios through Node’s built-in SQLite API.
- The desktop app builds as a React interface and Tauri host. First-run setup collects the OpenAI key, and the packaged Node sidecar uses it for provider-backed chat while owning the primary SQLite application service and authenticated loopback listener. The native Rust SQLite service remains a startup fallback. The host stores OpenAI and pairing credentials in the OS vault, and the UI exposes Firefox token issue and revoke controls.
- The Firefox extension builds and packages as an `.xpi`. It captures selected/current/full-page content or a visible screenshot only after a user action, signs requests to the fixed loopback contract, rejects receipt-only responses, and requires explicit confirmation that shared page context was handled as untrusted. Live Firefox pairing against an installed desktop package remains unverified.

See [the implementation plan](docs/IMPLEMENTATION_PLAN.md) for intended scope and [the architecture overview](docs/ARCHITECTURE.md) for the implemented-versus-planned boundary.

See [release notes](RELEASE_NOTES.md) and [third-party notices](THIRD_PARTY_NOTICES.md) for the 0.1.0 release candidate. Echo is MIT-licensed; see [LICENSE](LICENSE).

## Prerequisites

- Node.js 22 or newer
- pnpm 10.12.1 through Corepack
- Rust stable and the platform prerequisites for [Tauri 2](https://v2.tauri.app/start/prerequisites/)
- Firefox 140 or newer for extension development

No Docker service is required.

## Install and verify

```text
corepack enable
pnpm install --frozen-lockfile
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test
pnpm build
```

Automated tests use mocked provider responses and do not require an OpenAI key. `pnpm test:e2e` additionally requires Playwright Chromium (`pnpm --filter @echo/desktop exec playwright install chromium`).

## Develop

```text
pnpm dev:desktop
pnpm dev:extension
```

The Vite desktop preview does not retain an API key. A packaged Tauri build uses Windows Credential Manager or macOS Keychain through the Rust `keyring` dependency. The current key check validates syntax only; it does not make a live OpenAI validation request.

## Package

```text
pnpm --filter @echo/desktop tauri build
pnpm --filter @echo/firefox-extension package
```

Desktop packaging is platform-specific. Signing, notarization, Firefox store signing, and live model validation require external credentials that are deliberately absent from the repository. See [Packaging and release](docs/PACKAGING_RELEASE.md).

The public product name is Echo. Compatibility-sensitive internal names remain Luma in this release so existing local data and Firefox pairings continue to work; see [Brand compatibility](docs/BRAND_COMPATIBILITY.md).

## Repository map

- `apps/desktop` — Tauri 2 and React desktop client
- `apps/firefox-extension` — explicit-action Firefox WebExtension
- `packages/core` — portable schemas and deterministic service primitives
- `docs` — design, setup, security, and status documentation
- `scripts` — redacted diagnostics and guarded development-database cleanup

## Security

Do not put API keys in `.env`, SQLite, logs, browser storage, or issues. Report security problems privately to the project owner. The current security controls and their unimplemented integration boundaries are documented in [Security threat model](docs/SECURITY_THREAT_MODEL.md).
