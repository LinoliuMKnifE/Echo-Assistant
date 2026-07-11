# macOS setup

> **Current status:** The repository is configured to build an unsigned macOS app/DMG in CI, but macOS packaging, Intel output, signing, notarization, and the current fallback data path have not been validated in this Windows development round.

## Intended user flow after a signed release

Open the signed Echo `.dmg`, drag Echo to Applications, and launch it. The Tauri host stores the OpenAI key in Keychain; local memory, recovery, and Firefox pairing are wired through the packaged sidecar/native host but remain unverified in a macOS package.

Unsigned local builds may require an explicit **Open** from Finder’s context menu. Production distribution requires Developer ID signing and notarization; no certificate is included in this repository.

## For developers

Install Xcode Command Line Tools, Node.js 22 LTS, pnpm 10, and Rust stable. From the repository root run `pnpm install`, then `pnpm dev:desktop`. Apple Silicon uses `aarch64-apple-darwin`; Intel uses `x86_64-apple-darwin`. Building a universal binary requires both targets and should be performed on macOS.

The compatibility data root remains `~/Luma`; the sidecar and fallback native databases are stored there. Credentials remain in Keychain. See [PACKAGING_RELEASE.md](./PACKAGING_RELEASE.md) for signing inputs.
