# Echo Firefox extension

This optional WebExtension sends only user-requested browser context to Echo’s loopback desktop service. It has no OpenAI credential and cannot call OpenAI directly.

## Develop and verify

From the monorepo root:

```text
pnpm --filter @echo/firefox-extension typecheck
pnpm --filter @echo/firefox-extension test
pnpm --filter @echo/firefox-extension build
pnpm --filter @echo/firefox-extension package
```

Load `build/manifest.json` from Firefox `about:debugging` for temporary development. The packaged `.xpi` is written to `artifacts/`.

The extension expects `http://127.0.0.1:43117/v1/extension/request`. Requests contain a strict operation envelope plus HMAC signature, timestamp, and nonce headers. The token's unpadded base64url text is used directly as the UTF-8 HMAC key. Chat and sharing calls require an answer response, and sharing also requires confirmation that page content was handled as untrusted. The desktop implementation must enforce the complementary checks in [Firefox extension design](../../docs/FIREFOX_EXTENSION.md).

The extension has no persistent content script. `activeTab` and `scripting` are used only after a popup/sidebar action; `storage` holds the pairing token; the single loopback host permission reaches the desktop service. Firefox’s install prompt declares the page URL, website content, and sidebar-message data types that the extension can send to the local desktop app.
