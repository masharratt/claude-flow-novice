use anyhow::{Result, Context};
use rusqlite::{Connection, params};
use std::path::Path;
use tracing::{info, debug};

use crate::search_engine::IndexMetadata;

#[derive(Debug)]
pub struct DatabaseStats {
    pub num_embeddings: usize,
    pub num_patterns: usize,
    pub num_files: usize,
    pub database_size_bytes: u64,
}

pub struct SqliteStore {
    conn: Connection,
}

impl SqliteStore {
    pub fn new(db_path: &Path) -> Result<Self> {
        let conn = Connection::open(db_path)
            .context("Failed to open database")?;

        Ok(Self { conn })
    }

    pub fn initialize(&self) -> Result<()> {
        debug!("Initializing database schema");

        self.conn.execute_batch(
            r#"
            CREATE TABLE IF NOT EXISTS embeddings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                pattern TEXT NOT NULL UNIQUE,
                embedding BLOB NOT NULL,
                metadata TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                file_hash TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS files (
                path TEXT PRIMARY KEY,
                hash TEXT NOT NULL,
                last_indexed INTEGER NOT NULL,
                patterns_count INTEGER DEFAULT 0
            );

            CREATE INDEX IF NOT EXISTS idx_embeddings_pattern ON embeddings(pattern);
            CREATE INDEX IF NOT EXISTS idx_embeddings_created_at ON embeddings(created_at);
            CREATE INDEX IF NOT EXISTS idx_files_path ON files(path);
            "#
        )?;

        info!("Database schema initialized");
        Ok(())
    }

    pub fn store_embedding(&self, pattern: &str, embedding: &[f32], metadata: &IndexMetadata) -> Result<()> {
        debug!("Storing embedding for pattern: {}", pattern);

        // Serialize embedding to bytes
        let embedding_bytes: Vec<u8> = embedding
            .iter()
            .flat_map(|&v| v.to_le_bytes().to_vec())
            .collect();

        // Serialize metadata
        let metadata_json = serde_json::to_string(metadata)?;

        // Store in database
        self.conn.execute(
            "INSERT OR REPLACE INTO embeddings (pattern, embedding, metadata, created_at, file_hash) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![
                pattern,
                embedding_bytes,
                metadata_json,
                metadata.indexed_at,
                metadata.file_hash
            ],
        )?;

        // Update file record
        self.update_file_record(&metadata.path, &metadata.file_hash, metadata.indexed_at)?;

        Ok(())
    }

    pub fn get_embedding(&self, pattern: &str) -> Result<Option<(Vec<f32>, IndexMetadata)>> {
        debug!("Getting embedding for pattern: {}", pattern);

        let mut stmt = self.conn.prepare(
            "SELECT embedding, metadata FROM embeddings WHERE pattern = ?"
        )?;

        let mut rows = stmt.query([pattern])?;

        if let Some(row) = rows.next()? {
            // Deserialize embedding
            let embedding_bytes: Vec<u8> = row.get(0)?;
            let mut embedding: Vec<f32> = Vec::with_capacity(embedding_bytes.len() / 4);
            
            for chunk in embedding_bytes.chunks_exact(4) {
                let bytes: [u8; 4] = chunk.try_into().unwrap();
                embedding.push(f32::from_le_bytes(bytes));
            }

            // Deserialize metadata
            let metadata_json: String = row.get(1)?;
            let metadata: IndexMetadata = serde_json::from_str(&metadata_json)?;

            Ok(Some((embedding, metadata)))
        } else {
            Ok(None)
        }
    }

    pub fn search_patterns(&self, query: &str, limit: usize) -> Result<Vec<(String, f32)>> {
        debug!("Searching patterns with query: {}", query);

        let mut stmt = self.conn.prepare(
            "SELECT pattern FROM embeddings WHERE pattern LIKE ? LIMIT ?"
        )?;

        let mut rows = stmt.query([&format!("%{}%", query)])?;

        let mut results = Vec::new();
        while let Some(row) = rows.next()? {
            let pattern: String = row.get(0)?;
            // Simple scoring - in a real implementation, this would be vector similarity
            let score = 0.8;
            results.push((pattern, score));
        }

        Ok(results)
    }

    pub fn get_stats(&self) -> Result<DatabaseStats> {
        debug!("Getting database statistics");

        let mut stmt = self.conn.prepare("SELECT COUNT(*) FROM embeddings")?;
        let num_embeddings: i64 = stmt.query_row([], |row| row.get(0))?;

        let mut stmt = self.conn.prepare("SELECT COUNT(DISTINCT pattern) FROM embeddings")?;
        let num_patterns: i64 = stmt.query_row([], |row| row.get(0))?;

        let mut stmt = self.conn.prepare("SELECT COUNT(*) FROM files")?;
        let num_files: i64 = stmt.query_row([], |row| row.get(0))?;

        // Get database size
        let database_size_bytes = std::fs::metadata("index.db")
            .map(|m| m.len())
            .unwrap_or(0);

        Ok(DatabaseStats {
            num_embeddings: num_embeddings as usize,
            num_patterns: num_patterns as usize,
            num_files: num_files as usize,
            database_size_bytes,
        })
    }

    pub fn count_old_embeddings(&self, cutoff_timestamp: u64) -> Result<usize> {
        let mut stmt = self.conn.prepare(
            "SELECT COUNT(*) FROM embeddings WHERE created_at < ?"
        )?;
        
        let count: i64 = stmt.query_row([cutoff_timestamp], |row| row.get(0))?;
        Ok(count as usize)
    }

    pub fn remove_old_embeddings(&self, cutoff_timestamp: u64) -> Result<usize> {
        let rows_affected = self.conn.execute(
            "DELETE FROM embeddings WHERE created_at < ?",
            [cutoff_timestamp],
        )?;
        
        Ok(rows_affected)
    }

    pub fn count_orphaned_embeddings(&self) -> Result<usize> {
        let mut stmt = self.conn.prepare(
            "SELECT COUNT(*) FROM embeddings e LEFT JOIN files f ON e.file_hash = f.hash WHERE f.hash IS NULL"
        )?;
        
        let count: i64 = stmt.query_row([], |row| row.get(0))?;
        Ok(count as usize)
    }

    pub fn remove_orphaned_embeddings(&self) -> Result<usize> {
        let rows_affected = self.conn.execute(
            "DELETE FROM embeddings WHERE file_hash NOT IN (SELECT hash FROM files)",
            [],
        )?;
        
        Ok(rows_affected)
    }

    pub fn vacuum(&self) -> Result<()> {
        self.conn.execute("VACUUM", [])?;
        Ok(())
    }

    fn update_file_record(&self, path: &str, hash: &str, timestamp: u64) -> Result<()> {
        self.conn.execute(
            "INSERT OR REPLACE INTO files (path, hash, last_indexed) VALUES (?1, ?2, ?3)",
            params![path, hash, timestamp],
        )?;
        Ok(())
    }
}
