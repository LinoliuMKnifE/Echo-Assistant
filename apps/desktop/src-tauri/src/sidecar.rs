// Sidecar lifecycle: spawn the @luma/core Node sidecar, perform the stdin/stdout
// handshake, and expose its session to the renderer via the `sidecar_session`
// command. Additive: every failure path falls back to `None`, leaving the
// legacy Rust store/listener fully functional (see `run()` in lib.rs).
use rand::rngs::OsRng;
use rand::RngCore;
use serde_json::Value;
use std::{
    io::{BufRead, BufReader, Write},
    path::PathBuf,
    process::{Child, Command, Stdio},
    sync::{Arc, Mutex},
    time::Duration,
};

/// Handshake and health-check timeout. The contract asks for ~10s.
const READY_TIMEOUT: Duration = Duration::from_secs(10);

#[derive(Clone)]
pub struct SidecarSession {
    pub base_url: String,
    pub token: String,
}

/// Shared app state for the sidecar: `None` when the sidecar was never
/// started or failed to become ready (fallback mode).
#[derive(Clone, Default)]
pub struct SidecarState(pub Arc<Mutex<Option<SidecarSession>>>);

/// Holds the live child process so it can be killed on exit/drop. Kept
/// separate from `SidecarState` because the session (token/baseUrl) is
/// `Clone`-cheap and read from the invoke handler, while the child process
/// is not `Clone` and only needs to be touched at shutdown.
pub struct SidecarProcess(pub Mutex<Option<Child>>);

impl Drop for SidecarProcess {
    fn drop(&mut self) {
        kill(&self.0);
    }
}

fn kill(guard: &Mutex<Option<Child>>) {
    if let Ok(mut slot) = guard.lock() {
        if let Some(mut child) = slot.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}

/// Explicit shutdown hook for use from a `RunEvent::Exit` handler, in
/// addition to the `Drop` impl (Tauri does not guarantee `AppHandle`-managed
/// state is dropped before process exit on every platform).
pub fn shutdown(process: &SidecarProcess) {
    kill(&process.0);
}

fn random_token() -> String {
    let mut bytes = [0u8; 32];
    OsRng.fill_bytes(&mut bytes);
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

/// Locates the sidecar entry point for `cfg(debug_assertions)` dev builds:
/// `packages/sidecar/dist/index.js` relative to the workspace root. The
/// Cargo manifest lives at `apps/desktop/src-tauri`, so the workspace root
/// is three directories up.
fn dev_entry_point() -> Option<PathBuf> {
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let workspace_root = manifest_dir.parent()?.parent()?.parent()?;
    let entry = workspace_root
        .join("packages")
        .join("sidecar")
        .join("dist")
        .join("index.js");
    entry.exists().then_some(entry)
}

/// Locates the packaged sidecar binary next to the running executable.
/// Tauri v2 places `externalBin` resources alongside the app binary;
/// `resource_dir()` resolves that directory without `tauri-plugin-shell`.
fn packaged_binary(app: &tauri::AppHandle) -> Option<PathBuf> {
    use tauri::Manager;
    let resource_dir = app.path().resource_dir().ok()?;
    let name = if cfg!(windows) {
        "luma-sidecar.exe"
    } else {
        "luma-sidecar"
    };
    let candidate = resource_dir.join(name);
    candidate.exists().then_some(candidate)
}

/// Builds the command to launch the sidecar: dev mode prefers a local
/// `node packages/sidecar/dist/index.js` if present (fast iteration without
/// a packaging step); otherwise the bundled `binaries/luma-sidecar[.exe]`
/// resource is used. Returns `None` if neither is available, so `spawn()`
/// can fall back cleanly.
fn build_command(app: &tauri::AppHandle) -> Option<Command> {
    if cfg!(debug_assertions) {
        if let Some(entry) = dev_entry_point() {
            let mut command = Command::new("node");
            command.arg(entry);
            return Some(command);
        }
    }
    let binary = packaged_binary(app)?;
    Some(Command::new(binary))
}

/// Spawns the sidecar, writes the handshake line to its stdin, and waits
/// (bounded by `READY_TIMEOUT`) for the `{"ready":...}` response line on
/// stdout. On any failure this logs to stderr and returns `None`; the
/// caller must then start the legacy Rust listener instead.
///
/// `token`/`database_path`/`data_directory` are generated/resolved by the
/// caller so this module stays agnostic of app-specific paths and keyring
/// access (kept in `lib.rs`, matching existing style).
pub fn spawn(
    app: &tauri::AppHandle,
    database_path: &str,
    data_directory: &str,
    openai_api_key: Option<String>,
    pairing_token: Option<String>,
) -> Option<(SidecarSession, Child)> {
    let mut command = build_command(app).or_else(|| {
        eprintln!("[luma-sidecar] no sidecar entry point found (dev script or packaged binary); running in fallback mode");
        None
    })?;

    let token = random_token();
    let mut handshake = serde_json::json!({
        "token": token,
        "databasePath": database_path,
        "dataDirectory": data_directory,
    });
    // ponytail: the contract marks these fields optional (`?:`); omit the key
    // entirely rather than emit `null` so the sidecar can use a plain `in`/
    // property-presence check if it wants to distinguish "not configured" from
    // "explicitly empty".
    let object = handshake
        .as_object_mut()
        .expect("handshake is always a JSON object");
    if let Some(value) = openai_api_key {
        object.insert("openaiApiKey".into(), Value::String(value));
    }
    if let Some(value) = pairing_token {
        object.insert("pairingToken".into(), Value::String(value));
    }
    let mut line = handshake.to_string();
    line.push('\n');

    command
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        command.creation_flags(CREATE_NO_WINDOW);
    }

    let mut child = match command.spawn() {
        Ok(child) => child,
        Err(error) => {
            eprintln!("[luma-sidecar] failed to spawn sidecar process: {error}");
            return None;
        }
    };

    // Pipe stderr to the host's log on a background thread for the lifetime
    // of the process; this is fire-and-forget, matching the extension
    // listener's own `thread::spawn` style in lib.rs.
    if let Some(stderr) = child.stderr.take() {
        std::thread::spawn(move || {
            let reader = BufReader::new(stderr);
            for line in reader.lines().map_while(Result::ok) {
                eprintln!("[luma-sidecar] {line}");
            }
        });
    }

    let Some(mut stdin) = child.stdin.take() else {
        eprintln!("[luma-sidecar] sidecar stdin unavailable");
        let _ = child.kill();
        return None;
    };
    if let Err(error) = stdin.write_all(line.as_bytes()) {
        eprintln!("[luma-sidecar] failed to write handshake: {error}");
        let _ = child.kill();
        return None;
    }
    drop(stdin);

    let Some(stdout) = child.stdout.take() else {
        eprintln!("[luma-sidecar] sidecar stdout unavailable");
        let _ = child.kill();
        return None;
    };

    // Read the ready line on a worker thread so we can enforce the overall
    // timeout even if the sidecar never writes anything (`recv_timeout`
    // cannot be applied directly to a blocking `BufRead::read_line`).
    let (sender, receiver) = std::sync::mpsc::channel();
    std::thread::spawn(move || {
        let mut reader = BufReader::new(stdout);
        let mut first_line = String::new();
        let result = reader.read_line(&mut first_line).map(|_| first_line);
        let _ = sender.send(result);
    });

    let ready_line = match receiver.recv_timeout(READY_TIMEOUT) {
        Ok(Ok(line)) if !line.trim().is_empty() => line,
        Ok(Ok(_)) => {
            eprintln!("[luma-sidecar] sidecar closed stdout before signaling readiness");
            let _ = child.kill();
            return None;
        }
        Ok(Err(error)) => {
            eprintln!("[luma-sidecar] failed to read readiness line: {error}");
            let _ = child.kill();
            return None;
        }
        Err(_) => {
            eprintln!(
                "[luma-sidecar] timed out waiting for sidecar readiness after {READY_TIMEOUT:?}"
            );
            let _ = child.kill();
            return None;
        }
    };

    let parsed: Value = match serde_json::from_str(ready_line.trim()) {
        Ok(value) => value,
        Err(error) => {
            eprintln!("[luma-sidecar] readiness line was not valid JSON: {error}");
            let _ = child.kill();
            return None;
        }
    };

    let ready = parsed
        .get("ready")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    if !ready {
        let error = parsed
            .get("error")
            .and_then(Value::as_str)
            .unwrap_or("unknown error");
        eprintln!("[luma-sidecar] sidecar reported not ready: {error}");
        let _ = child.kill();
        return None;
    }
    let Some(port) = parsed.get("port").and_then(Value::as_u64) else {
        eprintln!("[luma-sidecar] readiness line missing numeric \"port\"");
        let _ = child.kill();
        return None;
    };

    let session = SidecarSession {
        base_url: format!("http://127.0.0.1:{port}"),
        token,
    };
    Some((session, child))
}

#[tauri::command]
pub fn sidecar_session(state: tauri::State<SidecarState>) -> Result<Value, String> {
    let guard = state.0.lock().map_err(|_| "Sidecar state is unavailable")?;
    match &*guard {
        Some(session) => Ok(serde_json::json!({
            "baseUrl": session.base_url,
            "token": session.token,
        })),
        None => Err("Sidecar is not running".into()),
    }
}
