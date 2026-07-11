# Echo Build Report

Date: 2026-07-10  
Status: **Automated acceptance evidence is green; Echo is not yet release-ready.**

Echo is the current public product name. The compatibility identity (`app.luma.desktop`), existing data paths, Firefox extension ID/protocol headers, and `luma-sidecar` binary deliberately remain stable; see [Brand compatibility](docs/BRAND_COMPATIBILITY.md).

## Verified evidence

| Check                                    | Result                                                                                                                                                                                                                                                                           |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm lint`                              | PASS                                                                                                                                                                                                                                                                             |
| `pnpm typecheck`                         | PASS                                                                                                                                                                                                                                                                             |
| `pnpm test`                              | PASS — 70 Vitest tests: core 22, sidecar 14, desktop 26, Firefox extension 8; plus 2 Node package checks                                                                                                                                                                         |
| `cargo test` in `apps/desktop/src-tauri` | PASS — 10/10, including the new-database Echo assistant-name default and strict onboarding marker value                                                                                                                                                                          |
| `pnpm test:e2e`                          | PASS — 10/10 Playwright browser flows                                                                                                                                                                                                                                            |
| `pnpm build`                             | PASS — workspace TypeScript/Vite/extension builds; this is not an installer build                                                                                                                                                                                                |
| Sidecar package and process integration  | PASS — target-suffixed Windows executable exists and the test performs the real stdin/stdout readiness handshake, authenticated RPC, persistence/restart, Firefox HTTP protocol, CORS preflight, untrusted-context handling, bind-conflict reporting, and legacy-store migration |
| Firefox `web-ext lint`                   | PASS — 0 errors, warnings, or notices                                                                                                                                                                                                                                            |
| `pnpm format:check`                      | PASS — all matched source and configuration files use Prettier style; generated `graphify-out/` and Tauri schema output are excluded.                                                                                                                                            |

## Current artifacts

- Unsigned Firefox diagnostic XPI: `apps/firefox-extension/artifacts/echo-local-assistant-0.1.0.xpi`
  - This development package is rebuilt in place and ZIP metadata may change its hash between runs. It is not an authoritative release artifact.
  - The fail-closed release verifier rejects this package before launching Firefox because it has no AMO signature metadata.
- Canonical desktop icon: `assets/echo-desktop-icon.png`
  - Size: `1,250,563` bytes
  - SHA-256: `3F14D8B0112B13A5A597DD793ECD2A04D0D7DD540C1B81C5CF02B3EF2E4257DC`
- Generated Windows icon: `apps/desktop/src-tauri/icons/icon.ico`
  - Size: `47,914` bytes
  - SHA-256: `6836755BF66355954B0CBB8D6D218F04848F2C343D8FB2CDC335D94D8C3F706D`
- Bundled Windows sidecar input: `apps/desktop/src-tauri/binaries/luma-sidecar-x86_64-pc-windows-msvc.exe`
  - Size: `57,731,723` bytes
  - SHA-256: `FDB33EB3A95CF993AF9D5AE1FC2C516DABD2202ED9802D4D70173F2CABB7EEFB`
- Windows application executable: `apps/desktop/src-tauri/target/release/echo-desktop.exe`
  - Size: `11,364,864` bytes
  - SHA-256: `750939E0366E0AC6884FDDCD1926EF37F0D671244E8478667F15FC24B4CBAB32`
- Unsigned Windows MSI: `apps/desktop/src-tauri/target/release/bundle/msi/Echo_0.1.0_x64_en-US.msi`
  - Size: `26,066,944` bytes
  - SHA-256: `2038506CE3903933FFDCC58DA66AF6780CA3D38BA4F08E21D1D885EAE4B65B12`
  - Built locally, but not clean-installed, signed, or release smoke-tested.
- Windows/macOS CI is configured in [CI](.github/workflows/ci.yml), but it has not been validated remotely in this workspace.

## Acceptance scenarios

The table records automated service/browser evidence only. It does **not** claim that an installed Tauri desktop package was exercised.

| Scenario               | Automated status | Evidence and remaining qualification                                                                                                                                                                               |
| ---------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Persistent preference  | Pass             | Durable close/reopen service test and browser flow prove provenance and later preference use.                                                                                                                      |
| Forgetting information | Pass             | Service and browser flows prove confirmed and natural-language forgetting with audit evidence.                                                                                                                     |
| Conversation recall    | Pass             | Service returns inspectable source IDs; browser flow opens the exact source panel.                                                                                                                                 |
| Contradiction          | Pass             | Durable service test retains both records until explicit resolution.                                                                                                                                               |
| Skill learning         | Pass             | Core/sidecar tests prove proposal and approval; browser flow proves reviewable repeated-edit evidence.                                                                                                             |
| Skill rollback         | Pass             | Durable version/rollback test and browser comparison/restore flow pass.                                                                                                                                            |
| Browser context        | Pass             | Sidecar process tests prove UUID-scoped extension CORS, signed requests, hostile web-origin rejection, and untrusted context passed into chat. The credential-gated stable-Firefox release workflow remains unrun. |
| Protected credentials  | Pass             | Core and native tests prove provider-key exclusion plus redaction before chat, memory, audit, database, diagnostics, and backup persistence.                                                                       |
| Backup migration       | Pass             | Portable encrypted restore and legacy Rust-store migration tests pass. Cross-platform packaged restore remains unproven.                                                                                           |
| Offline behavior       | Pass             | Local persistence/recall tests and the production-browser flow run without provider connectivity.                                                                                                                  |

## First-run setup correction

The packaged desktop no longer trusts `luma.setupComplete` or API-key existence as proof of setup. It requires the versioned native secure-store marker `echo-onboarding-v1`; upgraded users without that marker see the full wizard and API step even when the compatibility credential exists. Reusing that credential requires an explicit checkbox. The marker is written only by the final setup action, after credential storage succeeds, so interruption and partial setup remain incomplete.

Packaged-path regression tests cover legacy flag plus credential without a marker, marker-based relaunch bypass, interruption, explicit credential reuse, and final marker creation. The Windows release verifier now refuses to run unless the operator confirms a disposable clean Windows account because redirecting APPDATA does not isolate Windows Credential Manager.

## Release blockers

1. **Windows delivery:** the MSI is built but unsigned and has not been clean-installed or release smoke-tested.
2. **macOS delivery:** no local macOS package, runtime test, or CI artifact has been verified.
3. **Firefox delivery:** the local XPI is unsigned. The fail-closed workflow still requires AMO credentials and a successful stable-Firefox run before its signed XPI can be released.

The root package/build wiring itself is present and consistent (`pnpm package:sidecar` before Tauri packaging; the desktop `npm run build` target exists). No separate source-level build-wrapper defect is currently evidenced; the missing proof is packaged-platform execution.

## Security and portability controls evidenced

- SQLite persistence, FTS retrieval, profile provenance, scoped skills, audit records, and encrypted portable backup/restore.
- OS-keyring integration source, transient provider credentials, persistence-boundary secret redaction, exact-body HMAC, timestamp/replay checks, fixed loopback binding, strict extension origin/CORS handling, payload limits, and explicit untrusted browser context.
- Sidecar first-start with bounded handshake, bearer authentication, lifecycle shutdown, legacy-store migration, and Rust-host fallback if startup fails.

## Required release verification

Sign and clean-install the Windows MSI, run the AMO-signed Firefox workflow and then test it against that installed desktop agent, and build/test the macOS app/DMG in CI or on macOS. Sign/notarize only after those checks are green.
