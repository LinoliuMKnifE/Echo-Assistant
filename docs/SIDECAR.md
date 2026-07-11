# Node sidecar architecture

> **Status:** the Rust host, packaged Windows sidecar input, renderer selection, authenticated RPC, persistence/restart, extension protocol, CORS preflight, untrusted-context handling, bind-conflict reporting, and legacy migration are covered by automated tests. Installed Windows and macOS package behavior remains unverified.

## Why a sidecar

`@luma/core` already owns a durable Node SQLite application service (`LumaApplicationService`), the deterministic agent primitives, and (as of this change) the extension loopback contract. Rather than reimplement that surface a second time in Rust, the desktop host spawns `@luma/core` as a child process ("the sidecar") and shrinks Rust to what only Rust can do well on the desktop: the window/webview shell, OS keyring access, and sidecar process lifecycle.

This round is **additive**. The legacy Rust `AppDatabase` (SQLite via `rusqlite`), its native commands, and the legacy Rust loopback listener are untouched and keep working. If the sidecar cannot be started or fails to become ready, the app silently falls back to the legacy Rust path exactly as it worked before this change.

## Handshake contract

1. **Spawn.** On startup (inside Tauri's `setup` hook, before the window is meaningfully interactive), the Rust host spawns the sidecar process and immediately writes one line of JSON to its stdin, terminated with `\n`:

   ```json
   {
     "token": "<64 hex chars>",
     "databasePath": "<absolute path>",
     "dataDirectory": "<absolute path>",
     "openaiApiKey": "<string|omitted>",
     "pairingToken": "<string|omitted>"
   }
   ```

   - `token` is freshly random (32 bytes, hex-encoded) every app launch. It is generated in Rust (`rand::rngs::OsRng`) and never persisted; it is the bearer credential the renderer and the sidecar use to authenticate each other for this run only.
   - `databasePath` / `dataDirectory` are derived from the same app-data root the legacy Rust store already uses (`%APPDATA%/Luma` on Windows, `$HOME/Luma` fallback elsewhere): `echo.sqlite3` and a `portable/` subdirectory for attachments/index metadata, so the sidecar's SQLite file lives next to (not inside) the legacy `luma.sqlite3`.
   - `openaiApiKey` / `pairingToken` are read from the existing OS keyring entries (`app.luma.desktop` / `openai-api-key` and `.../firefox-pairing-token`) using the same `keyring::Entry` calls the legacy commands already use. Either may be absent (keys not yet configured, no pairing issued) — the sidecar must tolerate both being missing.

2. **Ready signal.** The sidecar prints exactly one line of JSON to stdout once it has finished its own setup (opening SQLite, binding its HTTP listener):

   ```json
   { "ready": true, "port": 43117 }
   ```

   or, on failure:

   ```json
   { "ready": false, "error": "..." }
   ```

   The Rust host reads this line with a **10 second timeout**. If the line never arrives, isn't valid JSON, reports `ready: false`, or is missing a numeric `port`, the host kills the child process and treats the sidecar as unavailable — see Fallback below. All of the sidecar's stderr output is piped line-by-line to the host's own stderr (prefixed `[luma-sidecar]`) for the lifetime of the process, so sidecar crashes/logs are visible in the desktop app's own log stream.

3. **Session command.** The renderer calls the Tauri command `sidecar_session` to find out whether a sidecar is available:

   - Ready: `{"baseUrl":"http://127.0.0.1:43117","token":"<token>"}`
   - Not ready / never started: an `Err` (surfaced to JS as a rejected promise).

   The renderer is expected to fall back to the legacy native Tauri commands (`invoke('chat', ...)`, etc.) when this call fails — that selection logic lives in `apps/desktop/src/application.ts` and is out of scope for this document.

## Port conflict rule (critical)

The legacy Rust extension listener and the sidecar's own HTTP server both want to bind `127.0.0.1:43117` — the address the Firefox extension is hard-coded to talk to. **Only one of them may ever be listening.**

Sequence enforced in `apps/desktop/src-tauri/src/lib.rs`:

1. At startup, the host attempts to spawn and hand-shake the sidecar **first**, inside `start_sidecar_or_fallback`.
2. If the sidecar becomes ready, its session is stored in shared state (for `sidecar_session`) and **the legacy Rust listener (`start(state)`) is never invoked.** The sidecar is now the sole process serving `POST /v1/extension/request`-equivalent traffic on that port (the sidecar's own route surface, defined by `packages/sidecar/**`, is out of scope here).
3. If the sidecar fails to spawn, fails the handshake, or times out, the host falls back to calling the existing `start(state)` function exactly as before this change — binding `127.0.0.1:43117` with the legacy Rust listener.

There is no scenario in the current code where both are started. If this invariant is ever weakened (e.g. sidecar retry logic added later), whoever changes it must re-verify this port is never double-bound, since `TcpListener::bind` failing is silently logged (via `audit_runtime_failure`) rather than crashing the app.

## Process lifecycle

- The spawned `std::process::Child` is stored in `SidecarProcess` (a `Mutex<Option<Child>>` behind an `Arc`, held by the Tauri app for its whole lifetime).
- On graceful app exit, `tauri::RunEvent::Exit` triggers an explicit `sidecar::shutdown(...)` call that kills and reaps the child.
- `SidecarProcess` also implements `Drop`, killing the child if the value is ever dropped outside the explicit exit path (defense in depth — Tauri does not guarantee every managed value is dropped before process exit on every OS).
- The sidecar is **not** currently restarted if it crashes mid-session; a crash simply leaves the renderer's sidecar `fetch` calls failing, and there is no automatic re-fallback to the legacy listener after startup. (ponytail: out of scope for this round — add a supervisor/retry loop if sidecar uptime becomes a real problem; today's contract only promises correct behavior at startup.)

## Dev vs. packaged binary resolution

- **Packaged builds:** Tauri v2's `externalBin` bundling mechanism is used. `pnpm package:sidecar` bundles `@luma/core` + `packages/sidecar` with `@yao-pkg/pkg` into the target-triple-suffixed binary expected by `apps/desktop/src-tauri/tauri.conf.json`, and CI runs that step before `tauri build`. Tauri installs the binary beside the desktop executable; the Rust host resolves it from the application resource directory. If it is absent or cannot start, the app fails closed to the legacy Rust path.
- **Dev builds** (`cfg!(debug_assertions)`): the Rust host looks for `packages/sidecar/dist/index.js` relative to the workspace root (three directories up from `apps/desktop/src-tauri`, i.e. the monorepo root) and, if present, spawns `node packages/sidecar/dist/index.js` directly. This lets sidecar development iterate with `pnpm --filter @luma/sidecar build` without any native packaging step. If that file doesn't exist (sidecar not built yet), dev builds also fall back to the legacy Rust path.

## Fallback behavior (must always hold)

If the sidecar is absent, unbuilt, or fails its startup handshake, the desktop falls back to the legacy Rust store, commands, and loopback listener. That fallback preserves local operation but does not provide every sidecar-owned core/provider feature. A sidecar crash after startup is not automatically recovered; see Lifecycle above.

## Where the code lives

- `apps/desktop/src-tauri/src/sidecar.rs` — spawn, handshake, timeout, `sidecar_session` command, kill-on-exit.
- `apps/desktop/src-tauri/src/lib.rs` — `data_dir()`/`data_path()` (data dir resolution, now shared with the sidecar's `dataDirectory`), `start_sidecar_or_fallback` (the port-conflict sequencing), the `setup()`/`run()` wiring, and registration of `sidecar_session` in the `invoke_handler!` list.
- `apps/desktop/src-tauri/tauri.conf.json` — `bundle.externalBin`.
- `packages/sidecar/**` — the sidecar's own entry point, HTTP surface, and use of `@luma/core` (owned/implemented separately from this document).
- `apps/desktop/src/**` — renderer-side adapter selection between the sidecar and legacy Tauri commands (owned/implemented separately from this document).
