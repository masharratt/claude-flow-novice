//! `serve`: resident process that keeps the embedding model loaded (CPU only)
//! and answers semantic searches over a Unix socket, so a query skips the
//! 1.3-1.5 s model load and the per-query SQLite vector read.
//!
//! Protocol: one JSON object per line, one JSON reply per line.
//!   {"op":"ping"}
//!   {"op":"search","db":..,"project_root":..,"query":..,"max_results":N,"threshold":T}
//!   {"op":"shutdown"}
//! Replies carry "ok": true|false; errors carry "error".
//!
//! Clients (`query`, `lexical --semantic-weight`) try the socket first and fall
//! back to the in-process path when it is absent, refused, slow or erroring,
//! so behaviour without a daemon is unchanged.

use anyhow::{anyhow, Context, Result};
use serde::Deserialize;
use std::fs::{File, OpenOptions};
use std::io::{BufRead, BufReader, Write};
use std::os::unix::fs::{OpenOptionsExt, PermissionsExt};
use std::os::unix::net::{UnixListener, UnixStream};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use crate::vector_cache::{VectorCache, VectorHit};

/// Socket path override (tests, multiple users of one runtime dir).
pub const SOCKET_ENV: &str = "CODESEARCH_SOCKET";
/// Seconds without a request before `serve` exits.
pub const IDLE_ENV: &str = "CODESEARCH_SERVE_IDLE_SECS";
pub const DEFAULT_IDLE_SECS: u64 = 1800;
/// Projects whose vectors stay in RAM (LRU).
pub const CACHE_ENV: &str = "CODESEARCH_SERVE_CACHE_PROJECTS";
pub const DEFAULT_CACHE_PROJECTS: usize = 2;
/// Set to 1 to never contact the daemon (always in-process).
pub const NO_DAEMON_ENV: &str = "CODESEARCH_NO_DAEMON";
/// Client wait for a reply, ms. A cold first load of a project can take
/// several seconds on an evicted page cache; the in-process path would take
/// as long, so waiting is no worse than falling back.
pub const CLIENT_TIMEOUT_ENV: &str = "CODESEARCH_SERVE_TIMEOUT_MS";
pub const DEFAULT_CLIENT_TIMEOUT_MS: u64 = 20_000;

/// Socket path: $CODESEARCH_SOCKET, else $XDG_RUNTIME_DIR/codesearch/serve.sock,
/// else ~/.local/share/codesearch/serve.sock. search.sh mirrors this order.
pub fn socket_path_from(override_: Option<&str>, xdg_runtime: Option<&str>, home: &str) -> PathBuf {
    if let Some(p) = override_.filter(|p| !p.trim().is_empty()) {
        return PathBuf::from(p);
    }
    match xdg_runtime.filter(|x| !x.trim().is_empty()) {
        Some(x) => PathBuf::from(x).join("codesearch").join("serve.sock"),
        None => PathBuf::from(home).join(".local/share/codesearch/serve.sock"),
    }
}

pub fn socket_path() -> PathBuf {
    socket_path_from(
        std::env::var(SOCKET_ENV).ok().as_deref(),
        std::env::var("XDG_RUNTIME_DIR").ok().as_deref(),
        &std::env::var("HOME").unwrap_or_default(),
    )
}

/// Lock file guarding single instance: `<socket>.lock`.
pub fn lock_path(socket: &Path) -> PathBuf {
    let mut s = socket.as_os_str().to_owned();
    s.push(".lock");
    PathBuf::from(s)
}

fn env_num<T: std::str::FromStr + PartialOrd + Default>(name: &str, default: T) -> T {
    std::env::var(name).ok().and_then(|v| v.trim().parse().ok()).filter(|v| *v > T::default()).unwrap_or(default)
}

pub fn idle_from_env() -> Duration {
    Duration::from_secs(env_num(IDLE_ENV, DEFAULT_IDLE_SECS))
}

pub fn cache_projects_from_env() -> usize {
    env_num(CACHE_ENV, DEFAULT_CACHE_PROJECTS)
}

/// Held for the life of the server; the OS drops the flock if the process dies.
pub struct InstanceLock {
    _file: File,
    path: PathBuf,
}

/// Take the single-instance lock, creating the socket dir (0700) first.
/// Ok(None) when another `serve` already holds it.
pub fn acquire_lock(socket: &Path) -> Result<Option<InstanceLock>> {
    if let Some(dir) = socket.parent() {
        if !dir.exists() {
            std::fs::create_dir_all(dir)?;
            std::fs::set_permissions(dir, std::fs::Permissions::from_mode(0o700))?;
        }
    }
    let path = lock_path(socket);
    let file = OpenOptions::new().create(true).truncate(false).write(true).mode(0o600).open(&path)
        .with_context(|| format!("open lock {}", path.display()))?;
    match file.try_lock() {
        Ok(()) => Ok(Some(InstanceLock { _file: file, path })),
        Err(std::fs::TryLockError::WouldBlock) => Ok(None),
        Err(std::fs::TryLockError::Error(e)) => Err(e.into()),
    }
}

#[derive(Deserialize)]
#[serde(tag = "op", rename_all = "lowercase")]
enum Request {
    Ping,
    Search { db: String, project_root: String, query: String, max_results: usize, threshold: f32 },
    Shutdown,
}

/// Turns a query into a vector. The real server wraps the CPU model.
pub type Embedder = Box<dyn Fn(&str) -> Result<Vec<f32>>>;

struct State {
    embed: Embedder,
    cache: VectorCache,
    started: Instant,
    requests: u64,
}

/// Resident set size in KiB from /proc (None off Linux).
pub fn rss_kb() -> Option<u64> {
    let s = std::fs::read_to_string("/proc/self/status").ok()?;
    s.lines().find(|l| l.starts_with("VmRSS:"))?.split_whitespace().nth(1)?.parse().ok()
}

/// Handle one request line. Second value: the caller asked the server to stop.
fn handle_line(state: &mut State, line: &str) -> (serde_json::Value, bool) {
    use serde_json::json;
    state.requests += 1;
    let req: Request = match serde_json::from_str(line) {
        Ok(r) => r,
        Err(e) => return (json!({"ok": false, "error": format!("bad request: {e}")}), false),
    };
    match req {
        Request::Ping => (
            json!({
                "ok": true,
                "pid": std::process::id(),
                "rss_kb": rss_kb(),
                "uptime_secs": state.started.elapsed().as_secs(),
                "requests": state.requests,
                "loads": state.cache.loads(),
                "cached": state.cache.summary().iter()
                    .map(|(db, root, rows, bytes)| json!({"db": db, "project_root": root, "rows": rows, "bytes": bytes}))
                    .collect::<Vec<_>>(),
            }),
            false,
        ),
        Request::Shutdown => (json!({"ok": true}), true),
        Request::Search { db, project_root, query, max_results, threshold } => {
            let res = (state.embed)(&query).and_then(|q| {
                state.cache.search(Path::new(&db), &project_root, &q, max_results, threshold)
            });
            match res {
                Ok(hits) => (json!({"ok": true, "results": hits}), false),
                Err(e) => (json!({"ok": false, "error": format!("{e:#}")}), false),
            }
        }
    }
}

fn now_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

/// Bind the socket (0600) and serve until idle for `idle` or a shutdown
/// request. Removes the socket on exit. The lock is held by the caller.
pub fn serve(socket: &Path, _lock: &InstanceLock, idle: Duration, cache_projects: usize, embed: Embedder) -> Result<()> {
    // Lock held, so any socket file left behind is stale (crash, kill -9).
    let _ = std::fs::remove_file(socket);
    let listener = UnixListener::bind(socket).with_context(|| format!("bind {}", socket.display()))?;
    std::fs::set_permissions(socket, std::fs::Permissions::from_mode(0o600))?;

    let last = Arc::new(AtomicU64::new(now_ms()));
    let busy = Arc::new(AtomicBool::new(false));
    let stop = Arc::new(AtomicBool::new(false));
    {
        let (last, busy, stop, sock) = (last.clone(), busy.clone(), stop.clone(), socket.to_path_buf());
        let idle_ms = idle.as_millis() as u64;
        std::thread::spawn(move || loop {
            let elapsed = now_ms().saturating_sub(last.load(Ordering::Acquire));
            if elapsed >= idle_ms && !busy.load(Ordering::Acquire) {
                stop.store(true, Ordering::Release);
                // Wake the blocking accept().
                let _ = UnixStream::connect(&sock);
                return;
            }
            std::thread::sleep(Duration::from_millis((idle_ms - elapsed.min(idle_ms)).clamp(50, 1000)));
        });
    }

    let mut state = State { embed, cache: VectorCache::new(cache_projects), started: Instant::now(), requests: 0 };
    // cfn: one connection at a time, thread per connection if concurrent agents queue behind a cold load
    for conn in listener.incoming() {
        if stop.load(Ordering::Acquire) {
            break;
        }
        let Ok(stream) = conn else { continue };
        busy.store(true, Ordering::Release);
        let quit = serve_conn(&mut state, stream);
        last.store(now_ms(), Ordering::Release);
        busy.store(false, Ordering::Release);
        if quit {
            break;
        }
    }
    let _ = std::fs::remove_file(socket);
    tracing::info!("serve: exiting after {} requests", state.requests);
    Ok(())
}

fn serve_conn(state: &mut State, stream: UnixStream) -> bool {
    let _ = stream.set_read_timeout(Some(Duration::from_secs(5)));
    let Ok(mut writer) = stream.try_clone() else { return false };
    let reader = BufReader::new(stream);
    for line in reader.lines() {
        let Ok(line) = line else { break };
        if line.trim().is_empty() {
            continue;
        }
        let (reply, quit) = handle_line(state, &line);
        if writeln!(writer, "{reply}").is_err() || quit {
            return quit;
        }
    }
    false
}

/// Send one request line, read one reply line.
pub fn request(socket: &Path, req: &serde_json::Value, timeout: Duration) -> Result<serde_json::Value> {
    let mut s = UnixStream::connect(socket).with_context(|| format!("connect {}", socket.display()))?;
    s.set_read_timeout(Some(timeout))?;
    s.set_write_timeout(Some(timeout))?;
    writeln!(s, "{req}")?;
    let mut line = String::new();
    BufReader::new(&s).read_line(&mut line)?;
    let v: serde_json::Value = serde_json::from_str(line.trim()).context("daemon reply")?;
    if v["ok"] != serde_json::Value::Bool(true) {
        return Err(anyhow!("daemon error: {}", v["error"]));
    }
    Ok(v)
}

/// Semantic search through the daemon at `socket`.
pub fn daemon_search_at(
    socket: &Path,
    timeout: Duration,
    db: &Path,
    project_root: &str,
    query: &str,
    max_results: usize,
    threshold: f32,
) -> Result<Vec<VectorHit>> {
    let req = serde_json::json!({
        "op": "search", "db": db.to_string_lossy(), "project_root": project_root,
        "query": query, "max_results": max_results, "threshold": threshold,
    });
    let v = request(socket, &req, timeout)?;
    Ok(serde_json::from_value(v["results"].clone())?)
}

/// Daemon first; any daemon failure runs `local` instead.
pub fn with_fallback<T>(daemon: impl FnOnce() -> Result<T>, local: impl FnOnce() -> Result<T>) -> Result<T> {
    match daemon() {
        Ok(v) => Ok(v),
        Err(e) => {
            tracing::debug!("daemon unavailable, in-process search: {e:#}");
            local()
        }
    }
}

/// The search `query` and `lexical` use: daemon when it answers, else the
/// in-process QueryV2 path (loads the model in this process).
pub fn semantic_search(
    db: &Path,
    query: &str,
    max_results: usize,
    threshold: f32,
    project_root: &Path,
) -> Result<Vec<crate::query_v2::SearchResult>> {
    let root = project_root.to_string_lossy().to_string();
    let db_abs = db.canonicalize().unwrap_or_else(|_| db.to_path_buf());
    let disabled = std::env::var(NO_DAEMON_ENV).map(|v| v == "1").unwrap_or(false);
    let timeout = Duration::from_millis(env_num(CLIENT_TIMEOUT_ENV, DEFAULT_CLIENT_TIMEOUT_MS));
    with_fallback(
        || {
            if disabled {
                return Err(anyhow!("{NO_DAEMON_ENV}=1"));
            }
            let hits = daemon_search_at(&socket_path(), timeout, &db_abs, &root, query, max_results, threshold)?;
            Ok(hits.into_iter().map(to_search_result).collect())
        },
        || crate::query_v2::QueryV2::new(&db.to_path_buf())?.search(query, max_results, threshold, project_root),
    )
}

fn to_search_result(h: VectorHit) -> crate::query_v2::SearchResult {
    crate::query_v2::SearchResult {
        entity_name: h.name,
        entity_kind: h.kind,
        file_path: h.file_path,
        similarity: h.similarity,
        line_start: Some(h.line),
        line_end: None,
    }
}

/// `serve` entry point: lock, load the CPU model, serve. Exits 0 at once
/// (before loading anything) when another instance holds the lock.
pub fn run_serve() -> Result<()> {
    let socket = socket_path();
    let Some(lock) = acquire_lock(&socket)? else {
        eprintln!("codesearch serve: already running ({})", socket.display());
        return Ok(());
    };
    // CPU only, even in the gpu build: the GPU is shared with an art team.
    let mgr = crate::embeddings::EmbeddingsManager::new_cpu_only()?;
    if mgr.on_gpu() {
        return Err(anyhow!("serve must run on CPU"));
    }
    let embed: Embedder = Box::new(move |q: &str| {
        mgr.generate_embeddings(&[q.to_string()])?.into_iter().next().ok_or_else(|| anyhow!("empty embedding"))
    });
    tracing::info!("serve: listening on {} (pid {})", socket.display(), std::process::id());
    let res = serve(&socket, &lock, idle_from_env(), cache_projects_from_env(), embed);
    drop(lock);
    res
}

/// `serve --ping`: print the daemon's status JSON; Err when not running.
pub fn run_ping() -> Result<()> {
    let v = request(&socket_path(), &serde_json::json!({"op": "ping"}), Duration::from_secs(2))?;
    println!("{v}");
    Ok(())
}

/// `serve --stop`: ask a running daemon to exit.
pub fn run_stop() -> Result<()> {
    request(&socket_path(), &serde_json::json!({"op": "shutdown"}), Duration::from_secs(5))?;
    Ok(())
}

impl Drop for InstanceLock {
    fn drop(&mut self) {
        tracing::debug!("serve: releasing {}", self.path.display());
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::{params, Connection};

    #[test]
    fn test_socket_path_order() {
        assert_eq!(socket_path_from(Some("/t/s.sock"), Some("/run/u"), "/h"), PathBuf::from("/t/s.sock"));
        assert_eq!(socket_path_from(None, Some("/run/u/"), "/h"), PathBuf::from("/run/u/codesearch/serve.sock"));
        assert_eq!(socket_path_from(Some(" "), Some(""), "/h"), PathBuf::from("/h/.local/share/codesearch/serve.sock"));
        assert_eq!(lock_path(Path::new("/a/serve.sock")), PathBuf::from("/a/serve.sock.lock"));
    }

    #[test]
    fn test_single_instance_lock() {
        let d = tempfile::tempdir().unwrap();
        let sock = d.path().join("sub/serve.sock");
        let first = acquire_lock(&sock).unwrap();
        assert!(first.is_some());
        let mode = std::fs::metadata(d.path().join("sub")).unwrap().permissions().mode() & 0o777;
        assert_eq!(mode, 0o700, "socket dir private");
        assert!(acquire_lock(&sock).unwrap().is_none(), "second instance refused");
        drop(first);
        assert!(acquire_lock(&sock).unwrap().is_some(), "lock released with the holder");
    }

    #[test]
    fn test_fallback_runs_local_only_when_daemon_fails() {
        let r: Result<i32> = with_fallback(|| Ok(1), || panic!("local must not run"));
        assert_eq!(r.unwrap(), 1);
        let r: Result<i32> = with_fallback(|| Err(anyhow!("refused")), || Ok(2));
        assert_eq!(r.unwrap(), 2);
        // No socket at all: the client errors fast instead of hanging.
        let d = tempfile::tempdir().unwrap();
        let t = Instant::now();
        let e = daemon_search_at(&d.path().join("none.sock"), Duration::from_secs(5), Path::new("/x.db"), "/p", "q", 5, 0.0);
        assert!(e.is_err() && t.elapsed() < Duration::from_millis(500));
    }

    fn fixture_db(dir: &Path) -> PathBuf {
        let p = dir.join("idx.db");
        let c = Connection::open(&p).unwrap();
        c.execute_batch(
            "CREATE TABLE entities (id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT, name TEXT,
               file_path TEXT, line_number INTEGER, project_root TEXT, updated_at INTEGER NOT NULL DEFAULT 0);
             CREATE TABLE entity_embeddings (entity_id INTEGER PRIMARY KEY, embedding BLOB);",
        )
        .unwrap();
        for (i, (name, v)) in [("reaper", [1.0f32, 0.0]), ("other", [0.0, 1.0])].iter().enumerate() {
            c.execute(
                "INSERT INTO entities (kind, name, file_path, line_number, project_root) VALUES ('function', ?1, ?2, ?3, '/p')",
                params![name, format!("/p/{name}.sh"), i as i64 + 1],
            )
            .unwrap();
            let b: Vec<u8> = v.iter().flat_map(|x| x.to_le_bytes()).collect();
            c.execute("INSERT INTO entity_embeddings VALUES (?1, ?2)", params![c.last_insert_rowid(), b]).unwrap();
        }
        p
    }

    /// Fake model: "orphan" questions point along x, anything else along y.
    fn fake_embedder() -> Embedder {
        Box::new(|q: &str| Ok(if q.contains("orphan") { vec![1.0, 0.0] } else { vec![0.0, 1.0] }))
    }

    fn start(sock: &Path, idle: Duration) -> std::thread::JoinHandle<()> {
        let owned = sock.to_path_buf();
        let (tx, rx) = std::sync::mpsc::channel();
        let h = std::thread::spawn(move || {
            let lock = acquire_lock(&owned).unwrap().unwrap();
            tx.send(()).unwrap();
            serve(&owned, &lock, idle, 2, fake_embedder()).unwrap();
        });
        rx.recv().unwrap();
        for _ in 0..200 {
            if UnixStream::connect(&sock).is_ok() {
                break;
            }
            std::thread::sleep(Duration::from_millis(5));
        }
        h
    }

    #[test]
    fn test_server_search_ping_bad_request_and_shutdown() {
        let d = tempfile::tempdir().unwrap();
        let db = fixture_db(d.path());
        let sock = d.path().join("s/serve.sock");
        let h = start(&sock, Duration::from_secs(60));
        let mode = std::fs::metadata(&sock).unwrap().permissions().mode() & 0o777;
        assert_eq!(mode, 0o600, "socket owner-only");

        let to = Duration::from_secs(5);
        let hits = daemon_search_at(&sock, to, &db, "/p", "who reaps orphan workers", 5, 0.5).unwrap();
        assert_eq!(hits.len(), 1);
        assert_eq!((hits[0].name.as_str(), hits[0].file_path.as_str(), hits[0].line), ("reaper", "/p/reaper.sh", 1));
        let hits = daemon_search_at(&sock, to, &db, "/p", "something else", 5, 0.0).unwrap();
        assert_eq!(hits[0].name, "other");

        let bad = request(&sock, &serde_json::json!({"op": "nope"}), to);
        assert!(bad.unwrap_err().to_string().contains("bad request"));
        let missing = daemon_search_at(&sock, to, &d.path().join("missing.db"), "/p", "q", 5, 0.0);
        assert!(missing.is_err(), "missing db is an error reply, not a crash");

        let ping = request(&sock, &serde_json::json!({"op": "ping"}), to).unwrap();
        assert_eq!(ping["pid"], std::process::id());
        assert_eq!(ping["loads"], 1, "vectors loaded once for both searches");
        assert!(ping["rss_kb"].as_u64().unwrap_or(0) > 0);

        request(&sock, &serde_json::json!({"op": "shutdown"}), to).unwrap();
        h.join().unwrap();
        assert!(!sock.exists(), "socket removed on exit");
        assert!(acquire_lock(&sock).unwrap().is_some(), "lock free after exit");
    }

    /// The entry point `query` and `lexical` call goes through the daemon when
    /// the socket answers (the fake model's 2-d vectors give similarity 1.0,
    /// which the real in-process model could not produce on this fixture).
    #[test]
    fn test_semantic_search_uses_daemon_when_socket_answers() {
        let d = tempfile::tempdir().unwrap();
        let db = fixture_db(d.path());
        let sock = d.path().join("serve.sock");
        let h = start(&sock, Duration::from_secs(60));
        // Only this test reads SOCKET_ENV.
        std::env::set_var(SOCKET_ENV, &sock);
        let r = semantic_search(&db, "orphan", 5, 0.5, Path::new("/p"));
        std::env::remove_var(SOCKET_ENV);
        let r = r.unwrap();
        assert_eq!(r.len(), 1);
        assert_eq!((r[0].entity_name.as_str(), r[0].line_start), ("reaper", Some(1)));
        assert!((r[0].similarity - 1.0).abs() < 1e-6);
        request(&sock, &serde_json::json!({"op": "shutdown"}), Duration::from_secs(2)).unwrap();
        h.join().unwrap();
    }

    #[test]
    fn test_idle_exit() {
        let d = tempfile::tempdir().unwrap();
        let sock = d.path().join("serve.sock");
        let h = start(&sock, Duration::from_millis(300));
        let t = Instant::now();
        h.join().unwrap();
        assert!(t.elapsed() < Duration::from_secs(3), "exited after idle");
        assert!(!sock.exists());
    }

    #[test]
    fn test_stale_socket_replaced() {
        let d = tempfile::tempdir().unwrap();
        let sock = d.path().join("serve.sock");
        std::fs::write(&sock, b"stale").unwrap();
        let h = start(&sock, Duration::from_secs(60));
        request(&sock, &serde_json::json!({"op": "ping"}), Duration::from_secs(2)).unwrap();
        request(&sock, &serde_json::json!({"op": "shutdown"}), Duration::from_secs(2)).unwrap();
        h.join().unwrap();
    }
}
