# Windows setup

> **Current status:** The repository is configured to build an unsigned Windows MSI, but no installer has been release-tested or signed. The packaged sidecar provides the primary core SQLite service; the native Rust SQLite service remains the startup fallback. Provider-backed replies remain disconnected.

## Intended user flow after a signed release

1. Install the signed Echo `.msi` on Windows 10 or 11.
2. Open Echo from the Start menu and follow First-run Setup.
3. Add the OpenAI API key when prompted. The current Tauri command stores it in Windows Credential Manager after a syntax check; live provider validation is not implemented in onboarding.
4. Choose the memory policy and save the displayed backup recovery key somewhere separate from the computer.
5. Finish the system check. Firefox pairing is optional and can be done later in **Settings → Browser extension**.

Unsigned development installers display a Windows warning. Production releases must be Authenticode-signed; the repository does not contain a signing certificate.

## For developers

Install Git, Node.js 22 LTS, pnpm 10, Rust stable with the MSVC target, Visual Studio 2022 Build Tools with “Desktop development with C++”, and Microsoft Edge WebView2. From the repository root run `pnpm install`, then `pnpm dev:desktop`. Use `pnpm build` for checks and the packaging command documented in [PACKAGING_RELEASE.md](./PACKAGING_RELEASE.md).

The sidecar stores `luma-core.db` under `%APPDATA%\Luma` for compatibility with existing installs; the fallback native database lives beside it. Credentials remain in Credential Manager. Do not run the app as Administrator.
