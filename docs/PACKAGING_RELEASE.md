# Packaging and release

> **Current status:** `.github/workflows/ci.yml` defines Windows/macOS verification and Tauri packaging plus Firefox artifact upload. It has not yet run on GitHub. Local artifacts are development artifacts and are unsigned.

Release builds have three artifacts: the desktop installer, Firefox `.xpi`, and checksums. A release is not considered verified until lint, type checking, unit/integration tests, desktop build, and extension packaging succeed in CI on the target OS.

## Release sequence

1. Update versions and `RELEASE_NOTES.md`; confirm database migrations have forward and restore tests. The project is MIT-licensed (see [LICENSE](../LICENSE)).
2. Run `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build`.
3. Package the desktop app with the root packaging command and the extension with `pnpm --filter @echo/firefox-extension package`.
4. On Windows, sign the installer with an externally supplied Authenticode certificate.
5. On macOS, sign with Developer ID, apply the minimum entitlements, notarize, and staple the ticket.
6. Upload installers, `.xpi`, SHA-256 checksums, `THIRD_PARTY_NOTICES.md`, the project `LICENSE`, and a migration/rollback note. Test a clean install and an upgrade from the prior release.

Secrets belong in the CI secret store, never repository files. The current workflow intentionally builds unsigned packages. A release maintainer must add a reviewed signing step and these repository secrets before claiming signed output: `WINDOWS_CERTIFICATE_BASE64` and `WINDOWS_CERTIFICATE_PASSWORD`; or `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_PASSWORD`, and `APPLE_TEAM_ID`. Firefox Add-ons signing credentials are also external. Merely defining secrets does not sign an artifact; the workflow must import the certificate and verify the resulting signature/notarization ticket.

The Firefox package is produced as `apps/firefox-extension/artifacts/echo-local-assistant-0.1.0.xpi`. Temporary development loading uses `about:debugging` → **This Firefox** → **Load Temporary Add-on**, selecting `apps/firefox-extension/build/manifest.json` after `pnpm --filter @echo/firefox-extension build`.
