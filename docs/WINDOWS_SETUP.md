# Windows setup

> **Current status:** The repository builds an unsigned Windows MSI and smoke-tests the extracted host/sidecar. The packaged sidecar provides the primary core SQLite service and provider-backed chat; the native Rust SQLite service remains the startup fallback. Authenticode signing and a strict clean-account install/uninstall run remain external release gates.

## Intended user flow after a signed release

1. Install the signed Echo `.msi` on Windows 10 or 11.
2. Open Echo from the Start menu and follow First-run Setup.
3. Add the OpenAI API key when prompted. The current Tauri command stores it in Windows Credential Manager after a syntax check; live provider validation is not implemented in onboarding.
4. Choose the memory policy and finish the system check. Encrypted backups use the separate password chosen in **Backup & restore**.
5. Firefox pairing is optional and can be done later from the Firefox pairing controls in **Backup & restore**.

Unsigned development installers display a Windows warning. Production releases must be Authenticode-signed; the repository does not contain a signing certificate.

## For developers

Install Git, Node.js 22 LTS, pnpm 10, Rust stable with the MSVC target, Visual Studio 2022 Build Tools with “Desktop development with C++”, and Microsoft Edge WebView2. From the repository root run `pnpm install`, then `pnpm dev:desktop`. Use `pnpm build` for checks and the packaging command documented in [PACKAGING_RELEASE.md](./PACKAGING_RELEASE.md).

The sidecar stores `echo.sqlite3` under `%APPDATA%\Luma`; the compatibility root keeps existing installs discoverable, and the fallback native `luma.sqlite3` database lives beside it. Credentials remain in Credential Manager. Do not run the app as Administrator.
