//! In-memory per-project vector matrix for the resident `serve` process.
//!
//! The in-process query path reads ~80k embedding rows (124 MB) out of SQLite
//! on every query (~250 ms warm, ~11 s cold). The daemon loads a project's
//! vectors once into one contiguous, pre-normalised f32 matrix and scans that
//! (a few ms). Bounded LRU over (db, project) pairs; a cached project is
//! reloaded when its index rows change.

use anyhow::{Context, Result};
use rusqlite::{params, Connection, OpenFlags};
use std::path::{Path, PathBuf};
use std::time::SystemTime;

/// One ranked entity, same fields the query command prints.
#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct VectorHit {
    pub kind: String,
    pub name: String,
    pub file_path: String,
    pub line: i64,
    pub similarity: f32,
}

#[derive(Debug, Clone)]
struct Meta {
    kind: String,
    name: String,
    file_path: String,
    line: i64,
}

/// Cheap change detector: size + mtime of the db file and its WAL. Any write
/// to any project changes it; then the per-project stamp decides.
#[derive(Debug, Clone, PartialEq)]
struct FilesKey(Vec<(u64, Option<SystemTime>)>);

/// Per-project change detector: row count, max id, max updated_at.
/// Inserts raise max id, deletes lower the count, updates bump updated_at.
#[derive(Debug, Clone, PartialEq)]
struct Stamp(i64, i64, i64);

struct ProjectVectors {
    db: PathBuf,
    root: String,
    dim: usize,
    /// Row-major, each row unit length (or all zeros for a zero vector).
    vecs: Vec<f32>,
    meta: Vec<Meta>,
    files_key: FilesKey,
    stamp: Stamp,
}

pub struct VectorCache {
    capacity: usize,
    /// Least recently used first.
    entries: Vec<ProjectVectors>,
    loads: usize,
}

fn files_key(db: &Path) -> FilesKey {
    let mut wal = db.as_os_str().to_owned();
    wal.push("-wal");
    let parts = [db.to_path_buf(), PathBuf::from(wal)]
        .iter()
        .map(|p| match std::fs::metadata(p) {
            Ok(m) => (m.len(), m.modified().ok()),
            Err(_) => (0, None),
        })
        .collect();
    FilesKey(parts)
}

fn open_ro(db: &Path) -> Result<Connection> {
    Connection::open_with_flags(db, OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX)
        .with_context(|| format!("open {} read-only", db.display()))
}

fn stamp(conn: &Connection, root: &str) -> Result<Stamp> {
    Ok(conn.query_row(
        "SELECT COUNT(*), COALESCE(MAX(id), 0), COALESCE(MAX(updated_at), 0)
         FROM entities WHERE project_root = ?1",
        params![root],
        |r| Ok(Stamp(r.get(0)?, r.get(1)?, r.get(2)?)),
    )?)
}

fn normalise(v: &mut [f32]) {
    let n = v.iter().map(|x| x * x).sum::<f32>().sqrt();
    if n > 0.0 {
        v.iter_mut().for_each(|x| *x /= n);
    }
}

fn load(db: &Path, root: &str) -> Result<ProjectVectors> {
    let files = files_key(db);
    let conn = open_ro(db)?;
    let st = stamp(&conn, root)?;
    let mut stmt = conn.prepare(
        "SELECT e.kind, e.name, e.file_path, e.line_number, ee.embedding
         FROM entities e JOIN entity_embeddings ee ON e.id = ee.entity_id
         WHERE e.project_root = ?1",
    )?;
    let mut rows = stmt.query(params![root])?;
    let mut dim = 0usize;
    let mut vecs: Vec<f32> = Vec::new();
    let mut meta = Vec::new();
    while let Some(r) = rows.next()? {
        let bytes: Vec<u8> = r.get(4)?;
        let d = bytes.len() / 4;
        if dim == 0 {
            dim = d;
        }
        // cfn: rows whose dimension differs from the first row are skipped (the
        // in-process path scores them 0), revisit if mixed-model indexes appear
        if d != dim || d == 0 {
            continue;
        }
        let start = vecs.len();
        vecs.extend(bytes.chunks_exact(4).map(|c| f32::from_le_bytes([c[0], c[1], c[2], c[3]])));
        normalise(&mut vecs[start..]);
        meta.push(Meta { kind: r.get(0)?, name: r.get(1)?, file_path: r.get(2)?, line: r.get(3)? });
    }
    vecs.shrink_to_fit();
    Ok(ProjectVectors { db: db.to_path_buf(), root: root.to_string(), dim, vecs, meta, files_key: files, stamp: st })
}

impl ProjectVectors {
    /// Cosine top-k, ordered by similarity desc then row order (the same order
    /// a stable sort over the in-process scan gives).
    fn search(&self, query: &[f32], max_results: usize, threshold: f32) -> Vec<VectorHit> {
        if self.dim == 0 || query.len() != self.dim || max_results == 0 {
            return Vec::new();
        }
        let mut q = query.to_vec();
        normalise(&mut q);
        let mut scored: Vec<(usize, f32)> = self
            .vecs
            .chunks_exact(self.dim)
            .enumerate()
            .map(|(i, v)| (i, v.iter().zip(&q).map(|(a, b)| a * b).sum::<f32>()))
            .filter(|(_, s)| *s >= threshold)
            .collect();
        let cmp = |a: &(usize, f32), b: &(usize, f32)| {
            b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal).then(a.0.cmp(&b.0))
        };
        if scored.len() > max_results {
            scored.select_nth_unstable_by(max_results - 1, cmp);
            scored.truncate(max_results);
        }
        scored.sort_by(cmp);
        scored
            .into_iter()
            .map(|(i, s)| {
                let m = &self.meta[i];
                VectorHit { kind: m.kind.clone(), name: m.name.clone(), file_path: m.file_path.clone(), line: m.line, similarity: s }
            })
            .collect()
    }

    fn approx_bytes(&self) -> usize {
        self.vecs.len() * 4
            + self.meta.iter().map(|m| m.kind.len() + m.name.len() + m.file_path.len() + 64).sum::<usize>()
    }
}

impl VectorCache {
    /// `capacity` = projects kept in memory (at least 1).
    pub fn new(capacity: usize) -> Self {
        Self { capacity: capacity.max(1), entries: Vec::new(), loads: 0 }
    }

    /// How many times project vectors were read from SQLite (tests, status).
    pub fn loads(&self) -> usize {
        self.loads
    }

    /// (db, project, rows, approx bytes) per cached project, LRU first.
    pub fn summary(&self) -> Vec<(String, String, usize, usize)> {
        self.entries
            .iter()
            .map(|e| (e.db.display().to_string(), e.root.clone(), e.meta.len(), e.approx_bytes()))
            .collect()
    }

    pub fn search(&mut self, db: &Path, root: &str, query: &[f32], max_results: usize, threshold: f32) -> Result<Vec<VectorHit>> {
        let pos = self.entries.iter().position(|e| e.db == db && e.root == root);
        let fresh = match pos {
            Some(i) => {
                let e = &mut self.entries[i];
                let now = files_key(db);
                if now == e.files_key {
                    true
                } else if stamp(&open_ro(db)?, root)? == e.stamp {
                    // Another project (or nothing relevant) was written.
                    e.files_key = now;
                    true
                } else {
                    false
                }
            }
            None => false,
        };
        let entry = if fresh {
            let i = pos.unwrap_or_default();
            self.entries.remove(i)
        } else {
            if let Some(i) = pos {
                self.entries.remove(i);
            }
            let loaded = load(db, root)?;
            self.loads += 1;
            loaded
        };
        let hits = entry.search(query, max_results, threshold);
        self.entries.push(entry);
        while self.entries.len() > self.capacity {
            self.entries.remove(0);
        }
        Ok(hits)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn le(v: &[f32]) -> Vec<u8> {
        v.iter().flat_map(|x| x.to_le_bytes()).collect()
    }

    /// Minimal slice of the v2 schema the scan reads.
    fn mkdb(dir: &Path) -> PathBuf {
        let p = dir.join("idx.db");
        let c = Connection::open(&p).unwrap();
        c.execute_batch(
            "CREATE TABLE entities (id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT, name TEXT,
               file_path TEXT, line_number INTEGER, project_root TEXT,
               updated_at INTEGER NOT NULL DEFAULT 0);
             CREATE TABLE entity_embeddings (entity_id INTEGER PRIMARY KEY, embedding BLOB);",
        )
        .unwrap();
        p
    }

    fn add(db: &Path, root: &str, name: &str, v: &[f32]) {
        let c = Connection::open(db).unwrap();
        c.execute(
            "INSERT INTO entities (kind, name, file_path, line_number, project_root) VALUES ('function', ?1, ?2, 1, ?3)",
            params![name, format!("{root}/{name}.sh"), root],
        )
        .unwrap();
        let id = c.last_insert_rowid();
        c.execute("INSERT INTO entity_embeddings VALUES (?1, ?2)", params![id, le(v)]).unwrap();
    }

    fn names(h: &[VectorHit]) -> Vec<&str> {
        h.iter().map(|x| x.name.as_str()).collect()
    }

    #[test]
    fn test_cosine_ranking_threshold_and_project_isolation() {
        let d = tempfile::tempdir().unwrap();
        let db = mkdb(d.path());
        add(&db, "/p", "x_axis", &[2.0, 0.0, 0.0]); // cos 1 after normalising
        add(&db, "/p", "diag", &[1.0, 1.0, 0.0]); // cos 0.707
        add(&db, "/p", "y_axis", &[0.0, 3.0, 0.0]); // cos 0
        add(&db, "/p", "zero", &[0.0, 0.0, 0.0]); // cos 0, no NaN
        add(&db, "/q", "other_project", &[1.0, 0.0, 0.0]);
        let mut c = VectorCache::new(2);
        let h = c.search(&db, "/p", &[1.0, 0.0, 0.0], 10, 0.5).unwrap();
        assert_eq!(names(&h), vec!["x_axis", "diag"]);
        assert!((h[0].similarity - 1.0).abs() < 1e-6 && (h[1].similarity - 0.70710677).abs() < 1e-6, "{h:?}");
        assert_eq!(h[0].file_path, "/p/x_axis.sh");
        // threshold 0 keeps the zero-similarity rows in row order (stable ties)
        let all = c.search(&db, "/p", &[1.0, 0.0, 0.0], 10, 0.0).unwrap();
        assert_eq!(names(&all), vec!["x_axis", "diag", "y_axis", "zero"]);
        assert_eq!(c.search(&db, "/p", &[1.0, 0.0, 0.0], 1, 0.0).unwrap().len(), 1);
        assert!(c.search(&db, "/p", &[1.0, 0.0], 10, 0.0).unwrap().is_empty(), "dimension mismatch");
        assert_eq!(c.loads(), 1, "one load serves every query on an unchanged index");
    }

    #[test]
    fn test_reloads_when_project_rows_change_not_when_other_project_does() {
        let d = tempfile::tempdir().unwrap();
        let db = mkdb(d.path());
        add(&db, "/p", "a", &[1.0, 0.0]);
        let mut c = VectorCache::new(2);
        assert_eq!(names(&c.search(&db, "/p", &[1.0, 0.0], 10, 0.0).unwrap()), vec!["a"]);
        add(&db, "/q", "elsewhere", &[1.0, 0.0]);
        c.search(&db, "/p", &[1.0, 0.0], 10, 0.0).unwrap();
        assert_eq!(c.loads(), 1, "write to another project must not reload");
        add(&db, "/p", "b", &[0.9, 0.1]);
        let h = c.search(&db, "/p", &[1.0, 0.0], 10, 0.0).unwrap();
        assert_eq!(names(&h), vec!["a", "b"], "new row visible after index change");
        assert_eq!(c.loads(), 2);
    }

    #[test]
    fn test_lru_bound() {
        let d = tempfile::tempdir().unwrap();
        let db = mkdb(d.path());
        for r in ["/p1", "/p2", "/p3"] {
            add(&db, r, "f", &[1.0, 0.0]);
        }
        let mut c = VectorCache::new(2);
        for r in ["/p1", "/p2", "/p1", "/p3"] {
            c.search(&db, r, &[1.0, 0.0], 5, 0.0).unwrap();
        }
        assert_eq!(c.loads(), 3, "p1 reused while cached");
        let cached: Vec<String> = c.summary().into_iter().map(|s| s.1).collect();
        assert_eq!(cached, vec!["/p1", "/p3"], "p2 evicted as least recently used");
        c.search(&db, "/p2", &[1.0, 0.0], 5, 0.0).unwrap();
        assert_eq!(c.loads(), 4);
        assert_eq!(c.summary().len(), 2);
    }
}
