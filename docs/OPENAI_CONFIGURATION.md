# OpenAI configuration

> **Current status:** `@luma/core` contains a Responses/embeddings adapter with mocked tests. The Tauri host can store/check a key through the OS credential store, but onboarding currently checks key syntax only and the desktop UI does not invoke the provider adapter.

The intended runtime uses the OpenAI Responses API through a provider adapter. The API key is entered in First-run Setup and, in a Tauri build, stored in Windows Credential Manager or macOS Keychain. Live authenticated validation and Settings-based key replacement remain to be implemented. The key must never be written to SQLite, `.env`, browser storage, logs, exports, diagnostics, or prompts.

The core types and prototype Settings screen expose logical model roles rather than assuming permanent model names: powerful reasoning, standard conversation, fast background processing, and embeddings. Persistent settings and capability detection remain planned.

The current routing helper chooses the powerful role for a high-impact or high-complexity request, the fast role for background work, and the standard role otherwise. Persistent user settings, budget enforcement, warning thresholds, background pausing, and embedding-backed retrieval are not connected yet.

Automated tests mock provider responses and incur no API cost. A real-key integration test must be opt-in and must redact request headers and provider error bodies.
