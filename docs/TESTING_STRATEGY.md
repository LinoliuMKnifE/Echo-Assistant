# Testing strategy

> **Current status:** Tests cover core primitives, durable SQLite close/reopen scenarios 1–6 and 8–10, extension protocol checks, and a small set of React interactions. They do not prove live localhost pairing (scenario 7), desktop-to-core wiring, provider streaming/tool calls, or installed desktop packages.

Normal tests use mocked provider responses and do not require an API key or paid call. Current core tests exercise in-memory memory save/deduplication/contradiction/expiration/forget, profile projection, conversation search, context budgets, routing, skill revision/evaluation/rollback, backup crypto, pairing replay/revocation, path rejection, untrusted wrapping, extension-envelope validation, calculator permission, provider response accounting, scheduling, and migration SQL dispatch.

Core integration tests open temporary SQLite files, close/reopen them, exercise FTS/project isolation, and restore encrypted portable fixtures with schedules and secret exclusion. They do not start a localhost listener, pair Firefox with Tauri, or run installed applications. React tests cover rendering/navigation and selected onboarding interactions; the Playwright specification covers a prototype browser flow, not a packaged Tauri application or the full acceptance set.

CI is configured to run lint, formatting, strict type checking, unit/integration tests, Playwright browser E2E, web builds, Firefox packaging, and Tauri packaging on Windows and macOS. The workflow installs Playwright Chromium before the E2E command. It has not yet run remotely, and it uploads packages without installing them. A manual real-API suite remains future work.

Firefox’s isolated suite runs with `pnpm --filter @echo/firefox-extension test`, followed by its `typecheck`, `build`, and `package` scripts. Release notes must report exact commands and results; skipped platform checks are limitations, not successes.
