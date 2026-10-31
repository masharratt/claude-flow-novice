//! `lexical` subcommand: BM25 file search, optionally fused with semantic.
//!
//! Lexical alone opens the index read-only and never loads the embedding
//! model, so it answers in milliseconds.

use anyhow::{anyhow, Result};
use rusqlite::{Connection, OpenFlags};
use std::path::{Path, PathBuf};

use crate::cli::query::display_path;
use crate::lexical::{self, LexHit};

/// Lexical candidates fetched before fusion/truncation.
const CANDIDATES: usize = 100;

#[derive(clap::Args, Debug)]
pub struct LexicalCommand {
    /// Question or identifiers to search for
    pub query: String,

    /// Maximum files to return
    #[arg(short = 'n', long, default_value = "10")]
    pub max_results: usize,

    /// Score multiplier for markdown files (1.0 = no penalty)
    #[arg(long, default_value_t = lexical::DEFAULT_MD_WEIGHT)]
    pub md_weight: f64,

    /// Fuse semantic results at this RRF weight (0 = lexical only, no model load)
    #[arg(long, default_value = "0")]
    pub semantic_weight: f64,

    /// Print JSON instead of one line per file
    #[arg(long)]
    pub json: bool,

    /// Index database (default ~/.local/share/codesearch/index_v2.db)
    #[arg(long, env = "CODESEARCH_DB")]
    pub db: Option<PathBuf>,
}

/// Ranked files for `query`. `semantic` is called only when
/// `semantic_weight > 0`; it returns absolute file paths, best first.
pub fn lexical_results(
    conn: &Connection,
    project_root: &str,
    query: &str,
    top: usize,
    md_weight: f64,
    semantic_weight: f64,
    semantic: impl FnOnce() -> Result<Vec<String>>,
) -> Result<Vec<LexHit>> {
    if !lexical::is_available(conn)? {
        return Err(anyhow!("Lexical index missing in this database. Reindex with: index --force"));
    }
    let lex = lexical::search(conn, project_root, query, CANDIDATES.max(top), md_weight)?;
    if semantic_weight > 0.0 {
        let sem = semantic()?;
        Ok(lexical::fuse(&lex, &sem, semantic_weight, top))
    } else {
        Ok(lex.into_iter().take(top).collect())
    }
}

/// One line per file: relative path and score.
pub fn format_simple(hits: &[LexHit], project_dir: &Path) -> String {
    hits.iter()
        .map(|h| format!("{} (score: {:.3})\n", display_path(&h.file_path, project_dir), h.score))
        .collect()
}

impl LexicalCommand {
    pub fn execute(&self, project_dir: &Path) -> Result<()> {
        let db_path = match &self.db {
            Some(p) => p.clone(),
            None => codesearch::paths::get_database_path()?,
        };
        if !db_path.exists() {
            return Err(anyhow!("CodeSearch database not found at {}. Run 'index' first.", db_path.display()));
        }
        let conn = Connection::open_with_flags(&db_path, OpenFlags::SQLITE_OPEN_READ_ONLY)?;
        let root = project_dir.to_string_lossy().to_string();
        let hits = lexical_results(
            &conn, &root, &self.query, self.max_results, self.md_weight, self.semantic_weight,
            || {
                Ok(crate::daemon::semantic_search(&db_path, &self.query, CANDIDATES, 0.0, project_dir)?
                    .into_iter()
                    .map(|r| r.file_path)
                    .collect())
            },
        )?;
        if self.json {
            let rows: Vec<serde_json::Value> = hits.iter()
                .map(|h| serde_json::json!({
                    "file_path": display_path(&h.file_path, project_dir),
                    "score": h.score,
                }))
                .collect();
            println!("{}", serde_json::to_string_pretty(&rows)?);
        } else {
            print!("{}", format_simple(&hits, project_dir));
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn db() -> Connection {
        let c = Connection::open_in_memory().unwrap();
        lexical::migrate(&c).unwrap();
        lexical::upsert_file(&c, "/p", "/p/hooks/reap-orphan.sh", "hooks/reap-orphan.sh", &[], "kill orphan workers").unwrap();
        lexical::upsert_file(&c, "/p", "/p/docs/x.md", "docs/x.md", &[], "orphan").unwrap();
        c
    }

    /// Lexical-only mode must never touch the embedding model (1.3-1.5 s load).
    #[test]
    fn test_lexical_only_never_calls_semantic() {
        let c = db();
        let hits = lexical_results(&c, "/p", "orphan workers", 5, 0.3, 0.0, || panic!("model loaded")).unwrap();
        assert_eq!(hits[0].rel_path, "hooks/reap-orphan.sh");
        assert_eq!(hits.len(), 2);
        assert_eq!(lexical_results(&c, "/p", "orphan", 1, 0.3, 0.0, || panic!()).unwrap().len(), 1);
    }

    #[test]
    fn test_fusion_calls_semantic_and_missing_index_errors() {
        let c = db();
        let hits = lexical_results(&c, "/p", "orphan", 5, 0.3, 0.15, || Ok(vec!["/p/lib/sem.sh".into()])).unwrap();
        assert!(hits.iter().any(|h| h.file_path == "/p/lib/sem.sh"));
        let empty = Connection::open_in_memory().unwrap();
        let err = lexical_results(&empty, "/p", "x", 5, 0.3, 0.0, || Ok(vec![])).unwrap_err();
        assert!(err.to_string().contains("Reindex"), "{err}");
    }

    #[test]
    fn test_format_simple_relative_paths() {
        let h = vec![LexHit { rel_path: "a/b.sh".into(), file_path: "/p/a/b.sh".into(), score: 1.5 }];
        assert_eq!(format_simple(&h, Path::new("/p")), "a/b.sh (score: 1.500)\n");
    }
}
