# Firefox extension design

> **Current status:** The extension client and a tested core request validator/authenticator exist and package successfully. Tauri starts a native loopback listener and has issue/revoke pairing commands, now exposed on the desktop app's Backup page with one-time token display and copy; no live Firefox interoperability test has run. Scenario 7 is therefore not end-to-end validated.

The extension is an optional client for the desktop localhost service; Echo remains fully usable without it. It provides popup quick actions and sidebar chat. Page data is read only after the user chooses **Send selected text**, **Ask about this page**, **Send full page text**, or **Send visible screenshot**.

Permissions are `activeTab`, `scripting`, `storage`, and host access limited to `http://127.0.0.1:43117/*`. There is no browsing-history permission, always-on content script, broad site access, OpenAI key, or direct OpenAI request. Firefox 140 or newer is required so its built-in data consent can disclose `browsingActivity` (the shared page URL), `websiteContent` (selected/full text and screenshots), and `personalCommunications` (sidebar messages). Collection still occurs only after a user action.

## Pairing and request contract

The desktop pairing flow generates a high-entropy, unpadded base64url token for the user to copy into the extension. Firefox local storage holds that supplied token. Each extension request sends a timestamp, random nonce, and unpadded base64url HMAC-SHA-256 signature over `timestamp.nonce.exactBody`. The HMAC key is the UTF-8 bytes of the token text, not its decoded random bytes. A shared deterministic test vector keeps the Rust and Web Crypto implementations interoperable. The desktop HTTP host must:

1. Bind only to `127.0.0.1`, never all interfaces.
2. Reject browser/CORS origins except the known extension identity and deny credentials-based cross-site requests.
3. Compare HMACs in constant time, allow only a short clock skew, and atomically reject reused nonces.
4. Allow only documented operations and validate payload schema and size before processing.
5. Mark all page text/screenshots as untrusted external context and never interpret them as system instructions.
6. Rotate/revoke tokens on unpair and rate-limit authentication failures.

Successful chat and page-sharing responses must include a non-empty `answer` and an explicit `untrustedContextHandled` boolean. Page-sharing responses are rejected unless that flag is `true`; receipt-only acknowledgements are not shown as assistant answers. Client-side checks are defense in depth, not a substitute for server validation. Current client limits are 512 KB for page text, 8 MB for screenshots, and 2 MB for responses. Build with `pnpm --filter @echo/firefox-extension build`; package with `pnpm --filter @echo/firefox-extension package`. A deterministic protocol test proves signature compatibility, while a live Firefox-to-packaged-desktop check remains a separate release test.
