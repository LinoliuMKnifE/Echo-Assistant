# Skills format

> **Current status:** `SkillRegistry` implements create, revise, deterministic evaluation, and rollback, while `LumaApplicationService` persists creation, proposed revisions, version history, and rollback across reopen. Import/export, permission-diff approval, UI wiring, performance updates, and model-assisted proposals are not implemented.

Skills are versioned data and instructions, never unrestricted executable code. A skill records identity, name, description, scope, triggers, instructions, input/output schemas, required tools/permissions, confirmations, examples, tests, version/status, creator and timestamps, performance counts, last use, trust level, and parent version.

Edits create immutable child versions. The UI supports manual creation, proposals from repeated successful behavior, duplication, global/project scope, enable/disable, diff, rollback, tests, statistics, import/export, deletion, and trusted/experimental labels.

Evaluation runs representative saved cases against current and proposed versions. Deterministic assertions cover schema, prohibited content, required phrases/fields, tool limits, and permission invariants. Model grading can add a secondary quality signal. Any added tool, permission, confirmation reduction, or materially broader trigger requires explicit approval. Rollback activates an earlier version without destroying history.

Imports are untrusted: validate size and schema, preview triggers/instructions/permissions, reject executable content, and resolve ID/version conflicts before saving.
