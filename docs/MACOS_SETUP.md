# macOS setup

> **Current status:** Pull-request CI builds an unsigned host-native macOS app/DMG. The dedicated release workflow builds universal Apple Silicon/Intel output and enforces signing, notarization, stapling, signature/Gatekeeper checks, DMG content checks, an isolated first-run window/title check, and packaged-sidecar listener readiness. It remains externally unverified until that workflow succeeds on GitHub with the project's Apple credentials. CI uses CoreGraphics for the window/title check because reading individual controls would require Apple Accessibility permission.

## Intended user flow after a signed release

Open the signed Echo `.dmg`, drag Echo to Applications, and launch it. The Tauri host stores the OpenAI key in Keychain; local memory, recovery, and Firefox pairing are wired through the packaged sidecar/native host but remain unverified in a macOS package.

Unsigned local builds may require an explicit **Open** from Finder’s context menu. Production distribution requires Developer ID signing and notarization; no certificate is included in this repository.

## For developers

Install Xcode Command Line Tools, Node.js 22 LTS, pnpm 10, and Rust stable. From the repository root run `pnpm install`, then `pnpm dev:desktop`. Apple Silicon uses `aarch64-apple-darwin`; Intel uses `x86_64-apple-darwin`.

The production path is `.github/workflows/macos-release.yml`. For an equivalent unsigned local universal build on macOS:

```sh
rustup target add aarch64-apple-darwin x86_64-apple-darwin
pnpm --filter @luma/sidecar package:macos:arm64
pnpm --filter @luma/sidecar package:macos:x64
lipo -create apps/desktop/src-tauri/binaries/luma-sidecar-{aarch64,x86_64}-apple-darwin \
  -output apps/desktop/src-tauri/binaries/luma-sidecar-universal-apple-darwin
pnpm --filter @echo/desktop tauri build --target universal-apple-darwin --bundles app,dmg
```

Signed builds use the six `APPLE_*` GitHub secrets documented in [PACKAGING_RELEASE.md](./PACKAGING_RELEASE.md); release mode deliberately has no unsigned fallback.

The compatibility data root remains `~/Luma`; the sidecar and fallback native databases are stored there. Credentials remain in Keychain. See [PACKAGING_RELEASE.md](./PACKAGING_RELEASE.md) for signing inputs.
