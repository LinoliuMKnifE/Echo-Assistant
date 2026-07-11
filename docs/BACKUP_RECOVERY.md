# Backup and recovery

> **Current status:** `LumaApplicationService` creates and tests a versioned portable SQLite envelope using scrypt/AES-256-GCM with staged integrity-checked restore and secret-like filename exclusion. Separately, Tauri exposes Argon2/AES-256-GCM backup/restore for its JSON store. The UI now collects a user-supplied backup password with confirmation (minimum 12 characters) and a separate restore password, rather than a hard-coded development password. Automatic schedules, conflict preview, and cross-format migration are not implemented.

The target backup format is a portable, versioned archive containing the database and selected attachments/index metadata while excluding secrets and API keys. The current primitive uses the memory-hard scrypt KDF (`N=32768, r=8, p=1`) and AES-256-GCM with random salt/nonce. A future versioned manifest must record algorithm parameters and support migration without weakening authentication.

Creation checkpoints SQLite, copies into a staging directory, validates integrity, encrypts, then atomically renames the completed archive. Restore decrypts into a new staging location, authenticates every entry, validates manifest/schema/migration path and SQLite integrity, previews conflicts, then swaps data only after validation. A failure leaves current data untouched.

The planned automatic backup service is local, opt-in, retention-limited, and reports its last success. Cross-platform archives should use logical paths that are remapped on restore; Windows absolute paths must not be recreated on macOS. Pairing tokens and OS-vault credentials must be re-established on the destination machine.

Recovery drills should cover wrong password, truncated/tampered archive, insufficient disk, old schema, cross-platform restore, duplicate IDs, and interruption during swap. Factory reset requires explicit confirmation and should offer a final encrypted backup first.
