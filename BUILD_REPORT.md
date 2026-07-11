# Echo Build Report

Date: 2026-07-10  
Status: **Automated acceptance evidence is green; Echo is not yet release-ready.**

Echo is the current public product name. The compatibility identity (`app.luma.desktop`), existing data paths, Firefox extension ID/protocol headers, and `luma-sidecar` binary deliberately remain stable; see [Brand compatibility](docs/BRAND_COMPATIBILITY.md).

## Verified evidence

| Check                                    | Result                                                                                                                                                                                                                                                                           |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm lint`                              | PASS                                                                                                                                                                                                                                                                             |
| `pnpm typecheck`                         | PASS                                                                                                                                                                                                                                                                             |
| `pnpm test`                              | PASS — 66 tests: core 22, sidecar 13, desktop 23, Firefox extension 8                                                                                                                                                                                                            |
| `cargo test` in `apps/desktop/src-tauri` | PASS — 9/9, including the new-database Echo assistant-name default                                                                                                                                                                                                               |
| `pnpm test:e2e`                          | PASS — 10/10 Playwright browser flows                                                                                                                                                                                                                                            |
| `pnpm build`                             | PASS — workspace TypeScript/Vite/extension builds; this is not an installer build                                                                                                                                                                                                |
| Sidecar package and process integration  | PASS — target-suffixed Windows executable exists and the test performs the real stdin/stdout readiness handshake, authenticated RPC, persistence/restart, Firefox HTTP protocol, CORS preflight, untrusted-context handling, bind-conflict reporting, and legacy-store migration |
| Firefox `web-ext lint`                   | PASS — 0 errors, warnings, or notices                                                                                                                                                                                                                                            |
| `pnpm format:check`                      | PASS — all matched source and configuration files use Prettier style; generated `graphify-out/` and Tauri schema output are excluded.                                                                                                                                            |

## Current artifacts

- Firefox XPI: `apps/firefox-extension/artifacts/echo-local-assistant-0.1.0.xpi`
  - SHA-256: `251AF9B5EB2F1D86CE567C7D04EFD5F99634575A42C24BFCC977AA56B706A43D`
- Canonical desktop icon: `assets/echo-desktop-icon.png`
  - SHA-256: `3F14D8B0112B13A5A597DD793ECD2A04D0D7DD540C1B81C5CF02B3EF2E4257DC`
- Generated Windows icon: `apps/desktop/src-tauri/icons/icon.ico`
  - SHA-256: `6836755BF66355954B0CBB8D6D218F04848F2C343D8FB2CDC335D94D8C3F706D`
- Bundled Windows sidecar input: `apps/desktop/src-tauri/binaries/luma-sidecar-x86_64-pc-windows-msvc.exe`
- Unsigned Windows MSI: `apps/desktop/src-tauri/target/release/bundle/msi/Echo_0.1.0_x64_en-US.msi`
  - Size: `25,788,416` bytes
  - SHA-256: `F0793D4D17DD90776885FA3F9BC09B9FB9A961998CB0FD91A77B0452BE45A3D9`
  - Built locally, but not clean-installed, signed, or release smoke-tested.
- Windows/macOS CI is configured in [CI](.github/workflows/ci.yml), but it has not been validated remotely in this workspace.

## Acceptance scenarios

The table records automated service/browser evidence only. It does **not** claim that an installed Tauri desktop package was exercised.

| Scenario               | Automated status | Evidence and remaining qualification                                                                                                                                            |
| ---------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Persistent preference  | Pass             | Durable close/reopen service test and browser flow prove provenance and later preference use.                                                                                   |
| Forgetting information | Pass             | Service and browser flows prove confirmed and natural-language forgetting with audit evidence.                                                                                  |
| Conversation recall    | Pass             | Service returns inspectable source IDs; browser flow opens the exact source panel.                                                                                              |
| Contradiction          | Pass             | Durable service test retains both records until explicit resolution.                                                                                                            |
| Skill learning         | Pass             | Core/sidecar tests prove proposal and approval; browser flow proves reviewable repeated-edit evidence.                                                                          |
| Skill rollback         | Pass             | Durable version/rollback test and browser comparison/restore flow pass.                                                                                                         |
| Browser context        | Pass             | Sidecar process test proves strict CORS preflight, signed extension requests, and untrusted context passed into chat. A live Firefox-to-installed-desktop run remains unproven. |
| Protected credentials  | Pass             | Core and native tests prove provider-key exclusion plus redaction before chat, memory, audit, database, diagnostics, and backup persistence.                                    |
| Backup migration       | Pass             | Portable encrypted restore and legacy Rust-store migration tests pass. Cross-platform packaged restore remains unproven.                                                        |
| Offline behavior       | Pass             | Local persistence/recall tests and the production-browser flow run without provider connectivity.                                                                               |

## Release blockers

1. **Windows delivery:** the MSI is built but unsigned and has not been clean-installed or release smoke-tested.
2. **macOS delivery:** no local macOS package, runtime test, or CI artifact has been verified.
3. **Project license:** Echo has no selected project license. Choose and add one before public distribution; `THIRD_PARTY_NOTICES.md` records direct dependency licenses without making that decision.

The root package/build wiring itself is present and consistent (`pnpm package:sidecar` before Tauri packaging; the desktop `npm run build` target exists). No separate source-level build-wrapper defect is currently evidenced; the missing proof is packaged-platform execution.

## Security and portability controls evidenced

- SQLite persistence, FTS retrieval, profile provenance, scoped skills, audit records, and encrypted portable backup/restore.
- OS-keyring integration source, transient provider credentials, persistence-boundary secret redaction, exact-body HMAC, timestamp/replay checks, fixed loopback binding, strict extension origin/CORS handling, payload limits, and explicit untrusted browser context.
- Sidecar first-start with bounded handshake, bearer authentication, lifecycle shutdown, legacy-store migration, and Rust-host fallback if startup fails.

## Required release verification

Choose and add the project license, sign and clean-install the Windows MSI, run the actual Firefox extension against that installed desktop agent, and build/test the macOS app/DMG in CI or on macOS. Sign/notarize only after those checks are green.
