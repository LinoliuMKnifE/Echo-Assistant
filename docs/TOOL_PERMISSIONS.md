# Tool permission system

> **Current status:** The core has a tested in-memory capability runtime and calculator with schema validation, confirmation, timeout, output validation, basic redaction, and audit records. The desktop permission screen is demonstration state; project overrides, durable permissions, file/clipboard/URL tools, and model-tool orchestration are not wired.

Every tool declares name, description, strict input/output schemas, risk, required capability, confirmation rule, external-state effect, timeout, maximum payload, and audit requirements. The model proposes a call; the runtime independently validates and authorizes it.

Permission choices are **Ask every time**, **Allow this session**, **Always allow**, and **Always deny**, with optional project overrides. The more restrictive applicable rule wins. Permission changes are security-sensitive audit events. File reads require a user-selected scope; writes require confirmation and safe-path checks. Clipboard reads require an explicit user action; writes require confirmation. Opening a URL requires confirmation.

Tool execution is cancellable, time-bounded, output-size bounded, sanitized, and isolated from the next prompt as untrusted output. Echo never executes model-generated shell commands. A failed or malformed call returns a plain-language error without weakening the permission rule or exposing secrets.
