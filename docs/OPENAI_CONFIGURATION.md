# OpenAI configuration

> **Current status:** `@luma/core` contains a Responses/embeddings adapter with mocked tests. First-run setup stores a syntax-checked key in the OS credential store, and the packaged sidecar uses that key for desktop chat. Live authenticated validation is not performed during onboarding.

The runtime uses the OpenAI Responses API through a provider adapter. The API key is entered in First-run Setup and, in a Tauri build, stored in Windows Credential Manager or macOS Keychain. The host passes it directly to the sidecar at startup; the UI and SQLite store never receive it. Live authenticated validation and Settings-based key replacement remain to be implemented.

The core types and Settings screen expose logical model roles rather than assuming permanent model names: powerful reasoning, standard conversation, fast background processing, and embeddings. Those role settings persist; provider capability detection remains planned.

The current routing helper chooses the powerful role for a high-impact or high-complexity request, the fast role for background work, and the standard role otherwise. Budget enforcement, warning thresholds, background pausing, and embedding-backed retrieval are not connected yet.

Automated tests mock provider responses and incur no API cost. A real-key integration test must be opt-in and must redact request headers and provider error bodies.
