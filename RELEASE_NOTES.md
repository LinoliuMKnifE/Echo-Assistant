# Echo 0.1.0

Echo 0.1.0 is the first local release candidate.

## Included

- Tauri desktop app with local conversations, memories, projects, skills, schedules, audit history, encrypted backup/restore, and Firefox pairing controls.
- Node sidecar backed by SQLite and authenticated local RPC, with a native Rust fallback when the sidecar cannot start.
- Firefox extension package for explicitly sharing selected text, page content, or a visible screenshot as untrusted context.
- Windows sidecar binary and regenerated Echo desktop icons.

## Verification status

The repository's formatting, lint, typecheck, unit/integration test, browser E2E, and workspace build gates pass. The Firefox XPI is packaged locally. Windows installer installation, live Firefox-to-installed-desktop interoperability, macOS packaging, signing, and notarization remain release blockers.

## Compatibility

Compatibility-sensitive Luma identifiers, data paths, protocol headers, and the sidecar binary name remain unchanged in 0.1.0. See [Brand compatibility](docs/BRAND_COMPATIBILITY.md).

## Licensing

Echo is MIT-licensed; see [LICENSE](LICENSE). Third-party dependency licenses are listed in [Third-party notices](THIRD_PARTY_NOTICES.md).
