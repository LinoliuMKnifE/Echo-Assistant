# Third-party notices

This inventory covers direct runtime dependencies resolved in the current 0.1.0 lockfiles. Echo itself is MIT-licensed (see [LICENSE](LICENSE)); this inventory is not a substitute for the full license files distributed by each dependency.

## JavaScript dependencies

| Dependency        | Resolved version | Declared license  |
| ----------------- | ---------------- | ----------------- |
| `@tauri-apps/api` | 2.11.1           | Apache-2.0 OR MIT |
| `lucide-react`    | 0.468.0          | ISC               |
| `react`           | 19.2.7           | MIT               |
| `react-dom`       | 19.2.7           | MIT               |
| `zod`             | 3.25.76          | MIT               |

`@luma/sidecar` also depends directly on the workspace package `@luma/core`; both are part of this repository and are covered by the repository's MIT license.

## Rust dependencies

| Dependency   | Resolved version | Declared license  |
| ------------ | ---------------- | ----------------- |
| `aes-gcm`    | 0.10.3           | Apache-2.0 OR MIT |
| `argon2`     | 0.5.3            | MIT OR Apache-2.0 |
| `base64`     | 0.22.1           | MIT OR Apache-2.0 |
| `hmac`       | 0.12.1           | MIT OR Apache-2.0 |
| `keyring`    | 3.6.3            | MIT OR Apache-2.0 |
| `rand`       | 0.8.6            | MIT OR Apache-2.0 |
| `rusqlite`   | 0.32.1           | MIT               |
| `serde`      | 1.0.228          | MIT OR Apache-2.0 |
| `serde_json` | 1.0.150          | MIT OR Apache-2.0 |
| `sha2`       | 0.10.9           | MIT OR Apache-2.0 |
| `tauri`      | 2.11.5           | Apache-2.0 OR MIT |
| `url`        | 2.5.8            | MIT OR Apache-2.0 |

Versions and license expressions above come from installed pnpm package metadata and Cargo metadata resolved from `Cargo.lock` on 2026-07-10.
