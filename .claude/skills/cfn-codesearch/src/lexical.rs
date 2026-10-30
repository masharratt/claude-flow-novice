//! Lexical (BM25) file search over an SQLite FTS5 table.
//!
//! One row per indexed file: relative path (weighted up), entity names, and
//! file content. Answers in milliseconds without loading the embedding model.
//! Deep dive 2026-10-30: BM25 over path + content found 16-17 of 20 benchmark
//! questions where semantic search found 7.

use anyhow::Result;
use rusqlite::{params, Connection};

/// BM25 column weights: rel_path, names, content.
const W_PATH: f64 = 3.0;
const W_NAMES: f64 = 2.0;
const W_CONTENT: f64 = 1.0;
/// Markdown hits are scaled by this (prose mentions every script name).
pub const DEFAULT_MD_WEIGHT: f64 = 0.3;
/// Content beyond this many bytes is not indexed.
// cfn: fixed 300 KB cap per file, chunk long files if recall on big files matters
pub const MAX_CONTENT_BYTES: usize = 300_000;
/// RRF constant for fusion.
const RRF_K: f64 = 60.0;

/// Words dropped from questions before matching (question scaffolding).
const STOPWORDS: &[&str] = &[
    "where", "is", "the", "a", "an", "of", "to", "what", "who", "which", "defined",
    "script", "from", "another", "does", "do", "uses", "use", "calls", "call",
    "sources", "source", "before", "runs", "run", "every", "that", "get", "gets",
    "inside", "up", "for", "and", "or", "in", "by", "test", "exercises", "how",
    "are", "it", "with", "this", "file", "files", "find",
];

#[derive(Debug, Clone, PartialEq)]
pub struct LexHit {
    pub rel_path: String,
    pub file_path: String,
    pub score: f64,
}

/// Create the lexical tables (additive, idempotent).
pub fn migrate(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS lexical_files (
            id INTEGER PRIMARY KEY,
            project_root TEXT NOT NULL,
            file_path TEXT NOT NULL UNIQUE
        );
        CREATE INDEX IF NOT EXISTS idx_lexical_files_root ON lexical_files(project_root);
        CREATE VIRTUAL TABLE IF NOT EXISTS file_fts USING fts5(
            rel_path, names, content, tokenize = 'porter unicode61'
        );
        "#,
    )?;
    Ok(())
}

/// Whether the lexical tables exist (read-only check for the query path).
pub fn is_available(conn: &Connection) -> Result<bool> {
    let n: i64 = conn.query_row(
        "SELECT COUNT(*) FROM sqlite_master WHERE name IN ('lexical_files', 'file_fts')",
        [],
        |r| r.get(0),
    )?;
    Ok(n == 2)
}

/// Replace the lexical row for one file.
pub fn upsert_file(
    conn: &Connection,
    project_root: &str,
    file_path: &str,
    rel_path: &str,
    names: &[String],
    content: &str,
) -> Result<()> {
    delete_file(conn, file_path)?;
    conn.execute(
        "INSERT INTO lexical_files (project_root, file_path) VALUES (?1, ?2)",
        params![project_root, file_path],
    )?;
    let id = conn.last_insert_rowid();
    let mut end = content.len().min(MAX_CONTENT_BYTES);
    while !content.is_char_boundary(end) {
        end -= 1;
    }
    conn.execute(
        "INSERT INTO file_fts (rowid, rel_path, names, content) VALUES (?1, ?2, ?3, ?4)",
        params![id, rel_path, names.join(" "), &content[..end]],
    )?;
    Ok(())
}

/// Remove the lexical row for one file (no-op when absent).
pub fn delete_file(conn: &Connection, file_path: &str) -> Result<()> {
    let id: Option<i64> = conn
        .query_row("SELECT id FROM lexical_files WHERE file_path = ?1", params![file_path], |r| r.get(0))
        .ok();
    if let Some(id) = id {
        conn.execute("DELETE FROM file_fts WHERE rowid = ?1", params![id])?;
        conn.execute("DELETE FROM lexical_files WHERE id = ?1", params![id])?;
    }
    Ok(())
}

/// FTS5 MATCH expression for a free-text question: every non-stopword term
/// (3+ chars) OR'd, plus each hyphen/underscore/dot compound as a phrase.
/// Every term is double-quoted, so FTS syntax in the question is inert.
pub fn match_expression(question: &str) -> Option<String> {
    let lower = question.to_lowercase();
    let mut terms: Vec<String> = Vec::new();
    let mut push = |t: String| {
        if !terms.contains(&t) {
            terms.push(t);
        }
    };
    for word in lower.split_whitespace() {
        let parts: Vec<&str> = word
            .split(|c: char| !c.is_alphanumeric())
            .filter(|p| !p.is_empty())
            .collect();
        if parts.len() > 1 {
            push(format!("\"{}\"", parts.join(" ")));
        }
        for p in parts {
            if p.chars().count() >= 3 && !STOPWORDS.contains(&p) {
                push(format!("\"{}\"", p));
            }
        }
    }
    if terms.is_empty() { None } else { Some(terms.join(" OR ")) }
}

/// Top `limit` files for `question`, best first, one row per file.
pub fn search(conn: &Connection, project_root: &str, question: &str, limit: usize, md_weight: f64) -> Result<Vec<LexHit>> {
    let Some(expr) = match_expression(question) else {
        return Ok(Vec::new());
    };
    let sql = format!(
        "SELECT f.rel_path, l.file_path,
                bm25(file_fts, {W_PATH:.1}, {W_NAMES:.1}, {W_CONTENT:.1})
                  * CASE WHEN f.rel_path LIKE '%.md' OR f.rel_path LIKE '%.markdown' THEN ?3 ELSE 1.0 END AS s
         FROM file_fts f JOIN lexical_files l ON l.id = f.rowid
         WHERE file_fts MATCH ?1 AND l.project_root = ?2
         ORDER BY s LIMIT ?4"
    );
    let names = exact_names(question);
    // Fetch extra candidates so an exact-name file outside the BM25 top
    // `limit` can still be promoted.
    let fetch = if names.is_empty() { limit } else { limit.max(1) * 4 };
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(params![expr, project_root, md_weight, fetch as i64], |r| {
        Ok(LexHit {
            rel_path: r.get(0)?,
            file_path: r.get(1)?,
            // bm25() is lower-is-better (negative); report higher-is-better.
            score: -r.get::<_, f64>(2)?,
        })
    })?;
    let mut hits = rows.collect::<std::result::Result<Vec<_>, _>>()?;
    // A file named after an identifier in the question is its definition:
    // stable-sort those first, BM25 order otherwise unchanged.
    hits.sort_by_key(|h| !names.contains(&file_stem(&h.rel_path)));
    hits.truncate(limit);
    Ok(hits)
}

/// Compound identifiers in the question (contain - _ or .), lowercased and
/// stripped of punctuation and any extension: "cfn-careful-guard.sh?" -> "cfn-careful-guard".
fn exact_names(question: &str) -> Vec<String> {
    question
        .split_whitespace()
        .map(|w| w.trim_matches(|c: char| !c.is_alphanumeric() && c != '-' && c != '_' && c != '.'))
        .map(|w| w.trim_end_matches('.'))
        .filter(|w| w.contains(['-', '_', '.']) && w.len() >= 3)
        .map(|w| file_stem(w))
        .collect()
}

fn file_stem(path: &str) -> String {
    let base = path.rsplit('/').next().unwrap_or(path);
    let stem = match base.rfind('.') {
        Some(i) if i > 0 => &base[..i],
        _ => base,
    };
    stem.to_lowercase()
}

/// Weighted reciprocal-rank fusion: lexical leads, semantic file list
/// (best first) adds `semantic_weight`. Markdown is dropped from the
/// semantic list (deep dive: semantic md hits were noise).
pub fn fuse(lexical: &[LexHit], semantic_files: &[String], semantic_weight: f64, limit: usize) -> Vec<LexHit> {
    let mut order: Vec<LexHit> = Vec::new();
    let mut add = |file_path: &str, rel_path: &str, inc: f64, order: &mut Vec<LexHit>| {
        match order.iter_mut().find(|h| h.file_path == file_path) {
            Some(h) => h.score += inc,
            None => order.push(LexHit { rel_path: rel_path.to_string(), file_path: file_path.to_string(), score: inc }),
        }
    };
    for (i, h) in lexical.iter().enumerate() {
        add(&h.file_path, &h.rel_path, 1.0 / (RRF_K + i as f64 + 1.0), &mut order);
    }
    let mut seen: Vec<&str> = Vec::new();
    for f in semantic_files {
        if f.ends_with(".md") || f.ends_with(".markdown") || seen.contains(&f.as_str()) {
            continue;
        }
        seen.push(f);
        let rank = seen.len() as f64;
        add(f, f, semantic_weight / (RRF_K + rank), &mut order);
    }
    order.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));
    order.truncate(limit);
    order
}

#[cfg(test)]
mod tests {
    use super::*;

    fn db() -> Connection {
        let c = Connection::open_in_memory().unwrap();
        migrate(&c).unwrap();
        c
    }

    fn add(c: &Connection, root: &str, rel: &str, content: &str) {
        upsert_file(c, root, &format!("{root}/{rel}"), rel, &[], content).unwrap();
    }

    fn paths(h: &[LexHit]) -> Vec<&str> {
        h.iter().map(|x| x.rel_path.as_str()).collect()
    }

    /// Live index 2026-10-30: "Where is the cfn-careful-guard hook defined?"
    /// ranked three tests that name the hook many times above the hook itself.
    /// A file whose name (minus extension) equals an identifier in the
    /// question is the definition and ranks first.
    #[test]
    fn test_exact_file_name_match_outranks_heavy_mentions() {
        let c = db();
        let noisy = "cfn-careful-guard cfn-careful-guard careful guard hook defined cfn-careful-guard\n".repeat(20);
        add(&c, "/p", "tests/test-careful-guard-force-push.sh", &noisy);
        add(&c, "/p", "tests/test-jev-careful-guard.sh", &noisy);
        add(&c, "/p", ".claude/hooks/cfn-careful-guard.sh", "#!/bin/sh\n# Guard for rm\nexit 0\n");
        let h = search(&c, "/p", "Where is the cfn-careful-guard hook defined?", 3, 0.3).unwrap();
        assert_eq!(paths(&h)[0], ".claude/hooks/cfn-careful-guard.sh", "{h:?}");
        assert_eq!(h.len(), 3, "{h:?}");
    }

    #[test]
    fn test_migrate_is_idempotent_and_detectable() {
        let c = Connection::open_in_memory().unwrap();
        assert!(!is_available(&c).unwrap());
        migrate(&c).unwrap();
        migrate(&c).unwrap();
        assert!(is_available(&c).unwrap());
    }

    /// E1 of the benchmark: the hook file has the words only in its path.
    #[test]
    fn test_path_match_ranks_first_one_row_per_file() {
        let c = db();
        add(&c, "/p", ".claude/hooks/cfn-careful-guard.sh", "#!/bin/bash\nset -e\n");
        add(&c, "/p", "docs/notes.sh", "careful careful guard mentioned once");
        add(&c, "/p", "lib/other.sh", "unrelated");
        let h = search(&c, "/p", "Where is the cfn-careful-guard hook defined?", 5, 1.0).unwrap();
        assert_eq!(paths(&h)[0], ".claude/hooks/cfn-careful-guard.sh", "{h:?}");
        assert_eq!(h.len(), 2, "one row per matching file: {h:?}");
        assert!(h[0].score > h[1].score);
    }

    #[test]
    fn test_markdown_down_weighted() {
        let c = db();
        add(&c, "/p", "docs/reaper.md", "reap orphan workers reaper");
        add(&c, "/p", "hooks/reaper.sh", "reap orphan workers reaper");
        let h = search(&c, "/p", "orphan reaper", 5, DEFAULT_MD_WEIGHT).unwrap();
        assert_eq!(paths(&h), vec!["hooks/reaper.sh", "docs/reaper.md"]);
        let even = search(&c, "/p", "orphan reaper", 5, 1.0).unwrap();
        assert!((even[0].score - even[1].score).abs() < 1e-9, "same text, same score at weight 1: {even:?}");
    }

    #[test]
    fn test_upsert_replaces_and_delete_removes() {
        let c = db();
        add(&c, "/p", "a.sh", "alpha");
        add(&c, "/p", "a.sh", "bravo");
        assert!(search(&c, "/p", "alpha", 5, 1.0).unwrap().is_empty());
        assert_eq!(search(&c, "/p", "bravo", 5, 1.0).unwrap().len(), 1);
        delete_file(&c, "/p/a.sh").unwrap();
        assert!(search(&c, "/p", "bravo", 5, 1.0).unwrap().is_empty());
        delete_file(&c, "/p/missing.sh").unwrap();
    }

    #[test]
    fn test_project_isolation() {
        let c = db();
        add(&c, "/p", "a.sh", "zebra");
        add(&c, "/q", "a.sh", "zebra");
        let h = search(&c, "/p", "zebra", 5, 1.0).unwrap();
        assert_eq!(h.len(), 1);
        assert_eq!(h[0].file_path, "/p/a.sh");
    }

    #[test]
    fn test_names_column_is_searchable() {
        let c = db();
        upsert_file(&c, "/p", "/p/x.sh", "x.sh", &["parse_memory_to_kb".to_string()], "").unwrap();
        let h = search(&c, "/p", "Where is parse_memory_to_kb defined?", 5, 1.0).unwrap();
        assert_eq!(paths(&h), vec!["x.sh"]);
    }

    #[test]
    fn test_match_expression_drops_stopwords_and_quotes_terms() {
        assert_eq!(match_expression("Where is the a of?"), None);
        let m = match_expression("Who uses run-with-memory-limit.sh AND (x\"").unwrap();
        assert!(m.contains("\"run with memory limit sh\""), "{m}");
        assert!(m.contains("\"memory\""), "{m}");
        assert!(!m.contains("\"uses\""), "{m}");
        // Hostile FTS syntax must not error.
        let c = db();
        add(&c, "/p", "a.sh", "x");
        search(&c, "/p", "NEAR( \" * - ^ AND OR NOT col:x", 5, 1.0).unwrap();
    }

    #[test]
    fn test_fuse_lexical_leads_semantic_breaks_ties() {
        let lex = vec![
            LexHit { rel_path: "a.sh".into(), file_path: "/p/a.sh".into(), score: 2.0 },
            LexHit { rel_path: "b.sh".into(), file_path: "/p/b.sh".into(), score: 1.0 },
        ];
        // A semantic-only file at weight 0.15 never overtakes a lexical hit.
        let sem = vec!["/p/notes.md".to_string(), "/p/c.sh".to_string()];
        let f = fuse(&lex, &sem, 0.15, 5);
        let fp: Vec<&str> = f.iter().map(|h| h.file_path.as_str()).collect();
        assert_eq!(fp, vec!["/p/a.sh", "/p/b.sh", "/p/c.sh"]);
        assert_eq!(fuse(&lex, &sem, 0.15, 1).len(), 1);
        // Semantic agreement breaks a near-tie between adjacent lexical hits.
        let f2 = fuse(&lex, &["/p/b.sh".to_string()], 0.15, 5);
        assert_eq!(paths(&f2), vec!["b.sh", "a.sh"]);
    }
}
