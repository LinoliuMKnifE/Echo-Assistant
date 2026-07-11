# User profile design

> **Current status:** The core projects active profile memories, can render a basic `USER.md` string, and persists profile provenance through `LumaApplicationService`. The desktop profile screen is demonstration data; editing, confirmation/rejection controls, temporary conversion, export UI, and periodic review are not wired.

The profile is a view derived from confirmed profile memories, not a second source of truth. Categories cover communication and personal preferences, relationships, routines, goals, responsibilities, accessibility, work/projects, frequently used services, constraints, and topics excluded from memory.

Every item exposes statement, confidence, stated/inferred origin, source conversation and excerpt, first-learned and last-confirmed dates, sensitivity, and actions to edit, confirm, reject, delete, or make temporary. Inferred traits remain proposed until supported repeatedly or confirmed. Echo must not infer diagnoses, protected-class membership, or invasive psychological traits.

Conflicts create a reviewable contradiction link. A clear user correction may supersede an earlier fact but retains provenance. Periodic review is optional and only surfaces stale or uncertain items. `USER.md` is a readable export generated from structured records; importing it requires preview and conflict resolution and never silently replaces the database.
