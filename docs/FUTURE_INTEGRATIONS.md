# Future integration guide

> **Current status:** This is a design contract for future work. No Gmail, calendar, OAuth, browser automation, or executable plugin integration is included in the repository.

New providers and services must enter through adapters, not memory or UI rewrites. Provider adapters implement streaming, structured output, tools, image capability, continuation, cancellation, retry/rate-limit behavior, and usage accounting. Capability detection prevents model-name assumptions.

External-service integrations (mail, calendar, search, browser automation) begin with a narrow capability manifest: schemas, scopes, risk, confirmation, external-state flag, timeout, payload limit, redaction, revocation, and audit behavior. Prefer read-only previews; sending, deleting, purchasing, publishing, or changing accounts always requires an explicit confirmation at the point of action.

OAuth tokens belong in the OS credential store. Use PKCE, minimal scopes, loopback callback validation, state/nonce checks, refresh-token rotation where supported, and a visible disconnect/delete action. Imported content remains untrusted and cannot change protected policy or tool permissions.

An integration ships only with mocked tests, permission-denial tests, injection fixtures, offline/timeouts, account revocation, audit/redaction checks, and platform packaging validation. Database changes require forward migration and backup-restore coverage. Future executable “plugins” are out of scope for the skills format; skills remain validated data.
