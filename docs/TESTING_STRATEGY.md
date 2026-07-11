# Testing strategy

> **Current status:** Tests cover core primitives, durable SQLite close/reopen scenarios, authenticated sidecar RPC, provider routing, the localhost extension protocol, React interactions, and the browser acceptance flow. They do not make paid provider calls or prove signed clean-machine Windows/macOS packages or AMO-signed Firefox interoperability.

Normal tests use mocked provider responses and do not require an API key or paid call. Current core tests exercise in-memory memory save/deduplication/contradiction/expiration/forget, profile projection, conversation search, context budgets, routing, skill revision/evaluation/rollback, backup crypto, pairing replay/revocation, path rejection, untrusted wrapping, extension-envelope validation, calculator permission, provider response accounting, scheduling, and migration SQL dispatch.

Core integration tests open temporary SQLite files, close/reopen them, exercise FTS/project isolation, and restore encrypted portable fixtures with schedules and secret exclusion. Sidecar process tests start the authenticated RPC and localhost listener, verify persistence/restart, CORS, signed extension requests, untrusted browser context, bind conflicts, and legacy migration. React tests cover rendering/navigation and onboarding interactions; Playwright covers the browser acceptance flow, not a packaged Tauri application.

CI is configured to run lint, formatting, strict type checking, unit/integration tests, Playwright browser E2E, web builds, Firefox packaging, and Tauri packaging on Windows and macOS. Dedicated credential-gated workflows define signed Windows install/uninstall, signed/notarized macOS package, and AMO-signed stable-Firefox gates. Successful remote runs of those workflows and a manual real-API suite remain future evidence.

Firefox’s isolated suite runs with `pnpm --filter @echo/firefox-extension test`, followed by its `typecheck`, `build`, and `package` scripts. Release notes must report exact commands and results; skipped platform checks are limitations, not successes.
