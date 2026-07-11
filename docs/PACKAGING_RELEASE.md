# Packaging and release

> **Current status:** `.github/workflows/ci.yml` builds unsigned diagnostic packages. `.github/workflows/windows-release.yml`, `.github/workflows/macos-release.yml`, and `.github/workflows/firefox-release.yml` are fail-closed public-release paths. No release workflow has yet been verified on GitHub with project signing credentials.

Release builds have three artifacts: the desktop installer, Firefox `.xpi`, and checksums. A release is not considered verified until lint, type checking, unit/integration tests, desktop build, and extension packaging succeed in CI on the target OS.

## Release sequence

1. Update versions and `RELEASE_NOTES.md`; confirm database migrations have forward and restore tests. The project is MIT-licensed (see [LICENSE](../LICENSE)).
2. Run `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build`.
3. Package the desktop app with the root packaging command and the extension with `pnpm --filter @echo/firefox-extension package`.
4. On Windows, build without bundling (`pnpm --filter @echo/desktop tauri build --no-bundle`), Authenticode-sign both `echo-desktop.exe` and the packaged `luma-sidecar-*.exe`, bundle the already-signed binaries (`pnpm --filter @echo/desktop tauri bundle --bundles msi`), then sign the MSI. Run `pnpm release:verify:windows -- -CleanAccountConfirmed -ExpectedVersion 0.1.0` only from a disposable clean Windows account. For releases after 0.1.0, also pass `-PriorMsiPath` with the prior signed installer; the gate fails closed without it. The verifier checks install/upgrade version, legacy data preservation, signatures, every onboarding step and API input, the native completion marker, relaunch, uninstall, and preservation of user data needed for rollback.
5. On macOS, sign with Developer ID, apply the minimum entitlements, notarize, and staple the ticket.
6. For Firefox, run **Echo Firefox release**. It requires AMO credentials, signs the built source, rejects an XPI without AMO signature metadata, installs that exact non-temporary XPI into stable Firefox, pairs it with the packaged Echo sidecar, and drives a selected-page-context request through CORS preflight, signed POST, untrusted-context handling, and response validation.
7. Upload installers, the AMO-signed `.xpi`, SHA-256 checksums, `THIRD_PARTY_NOTICES.md`, the project `LICENSE`, and a migration/rollback note. Test a clean install and an upgrade from the prior release.

Secrets belong in the CI secret store, never repository files. Branch/PR CI intentionally builds unsigned packages. The macOS release workflow requires every secret below and fails before building if one is absent:

- `APPLE_CERTIFICATE`: the base64 text of the binary Developer ID Application `.p12` certificate (on macOS: `/usr/bin/base64 -i DeveloperID.p12 | pbcopy`; store the copied text directly, without PEM headers)
- `APPLE_CERTIFICATE_PASSWORD`: password used when exporting that `.p12`
- `APPLE_SIGNING_IDENTITY`: full Developer ID Application identity
- `APPLE_ID`: Apple account used for notarization
- `APPLE_PASSWORD`: app-specific password for that account
- `APPLE_TEAM_ID`: Apple Developer team ID

Create a signed macOS release by pushing a version tag such as `v0.1.0`, or run **Echo macOS release** manually in GitHub Actions. The job decodes the `.p12` into a temporary runner keychain, builds a universal Apple Silicon/Intel sidecar and app, signs and notarizes through Tauri, and verifies Gatekeeper, signatures, tickets, and packaged binaries. Native Accessibility automation then completes every onboarding screen and API input, verifies the Keychain completion marker, and proves relaunch opens the workspace. The workflow fails if the runner cannot grant that control; a window-only smoke test is not accepted.

The Windows release workflow requires both secrets and fails before building if either is absent:

- `WINDOWS_CERTIFICATE_BASE64`: base64-encoded Authenticode code-signing `.pfx`
- `WINDOWS_CERTIFICATE_PASSWORD`: password used when exporting that `.pfx`

Create a signed Windows release by pushing a version tag such as `v0.1.0`, or run **Echo Windows release** manually. The workflow temporarily imports the certificate, signs and timestamps the desktop executable and sidecar before MSI bundling, signs the MSI, runs the strict install/onboarding/restart/uninstall verifier on GitHub's clean Windows runner, uploads checksums and release documents, and removes the certificate and PFX even after failure. This describes the configured gate; it is not evidence of a successful remote run.

Every public workflow validates that its requested tag/version exactly matches the root package, Tauri, Cargo, Firefox package, and Firefox manifest versions. Each successful run creates `RELEASE_EVIDENCE.json` and `RELEASE_EVIDENCE.md` with the immutable commit/tag, run URL, UTC timestamp, gates, migration result, artifact hashes, and signature-verification status. Those per-run files are authoritative; `BUILD_REPORT.md` is only a development snapshot and cannot prove a release occurred.

Firefox release signing requires repository secrets `AMO_JWT_ISSUER` and `AMO_JWT_SECRET`; its workflow has no unsigned opt-out. Before signing, it runs the root JavaScript and Rust gates, packages the extension and sidecar, and uploads the signed XPI with checksums, license, notices, release notes, and build report.

The branch/PR diagnostic package is produced as `apps/firefox-extension/artifacts/echo-local-assistant-0.1.0.xpi`; it is unsigned and is not a public release artifact. The public workflow produces `echo-local-assistant-0.1.0-signed.xpi` only after AMO signing and stable-Firefox verification. Temporary development loading uses `about:debugging` → **This Firefox** → **Load Temporary Add-on**, selecting `apps/firefox-extension/build/manifest.json` after `pnpm --filter @echo/firefox-extension build`.
