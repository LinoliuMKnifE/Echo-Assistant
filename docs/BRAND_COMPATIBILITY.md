# Echo brand compatibility

Echo is the product name beginning with version 0.1.0. The product was previously presented as Luma.

To avoid breaking existing development data, pairing, and credential access, this release deliberately retains these internal compatibility identifiers:

- Tauri application identifier: `app.luma.desktop`
- Existing application-data directories and database filenames containing `Luma` or `luma`
- Firefox extension ID `luma-local-assistant@luma.local`, loopback endpoint, and `X-Luma-*` protocol headers
- `luma-sidecar` binary name and the internal `@luma/core` / `@luma/sidecar` workspace packages

The root, desktop, and Firefox-extension workspace package names use the `@echo` product namespace. Do not change the retained identifiers without a versioned migration that preserves credentials, data, and active Firefox pairings.
