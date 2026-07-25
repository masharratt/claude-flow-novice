//! Benchmark: fastembed (local BGE-small) vs OpenAI text-embedding-3-small
//!
//! Compares embedding quality and speed across 20 code search queries.
//! Measures: cosine similarity correlation, ranking agreement (Kendall's tau),
//! top-k overlap, and latency.
//!
//! Usage: cargo run --example embedding_benchmark --release

use anyhow::{Result, anyhow};
use fastembed::{TextEmbedding, EmbeddingModel, InitOptions};
use std::time::Instant;

/// 20 code search queries spanning different intent types
const QUERIES: &[&str] = &[
    // Structural queries
    "database connection pool initialization",
    "file path validation and sanitization",
    "hash function for content deduplication",
    // Semantic queries
    "error handling and retry logic for failed connections",
    "batch processing with parallel execution",
    "vector similarity search with cosine distance",
    "graph traversal to find dependency chains",
    "incremental indexing that skips unchanged files",
    // API/pattern queries
    "REST API endpoint authentication middleware",
    "serialization and deserialization of JSON data",
    "async function that generates embeddings from text",
    "SQL query to find entities by name pattern",
    // Domain-specific
    "tree-sitter AST parsing for Rust source code",
    "HNSW approximate nearest neighbor search",
    "Bolt protocol connection to Memgraph database",
    "OpenAI API key configuration and validation",
    // Cross-cutting
    "logging and tracing for debugging",
    "unit test with mock dependencies",
    "command line argument parsing with clap",
    "migration script for schema changes",
];

/// 20 code snippets (documents) to search against — representative of actual indexed entities
const DOCUMENTS: &[&str] = &[
    "pub fn new(url: &str) -> Result<Pool> { let config = PoolConfig::new(url); Pool::connect(config).await }",
    "fn validate_path(path: &Path, root: &Path) -> Result<()> { if !path.starts_with(root) { return Err(anyhow!(\"path traversal\")); } }",
    "fn calculate_file_hash(path: &Path) -> Result<String> { let mut hasher = Sha256::new(); hasher.update(fs::read(path)?); Ok(hex::encode(hasher.finalize())) }",
    "async fn retry_with_backoff<F, T>(f: F, max_retries: u32) -> Result<T> where F: Fn() -> Future<Output=Result<T>> { for attempt in 0..max_retries { match f().await { Ok(v) => return Ok(v), Err(e) => { warn!(\"Retry {}: {}\", attempt, e); sleep(Duration::from_millis(100 << attempt)).await; } } } }",
    "fn process_batch(items: &[Item]) -> Vec<Result> { items.par_iter().map(|item| process_single(item)).collect() }",
    "pub fn cosine_similarity(a: &[f32], b: &[f32]) -> f32 { let dot: f32 = a.iter().zip(b).map(|(x,y)| x*y).sum(); let norm_a = a.iter().map(|x| x*x).sum::<f32>().sqrt(); let norm_b = b.iter().map(|x| x*x).sum::<f32>().sqrt(); dot / (norm_a * norm_b) }",
    "fn find_dependents(entity: &str, max_depth: u32) -> Vec<Entity> { graph.run(query(\"MATCH (e:Entity {name: $name})<-[:USES|CALLS*1..$depth]-(dep) RETURN dep\")) }",
    "fn is_file_indexed(&self, path: &Path, hash: &str) -> bool { self.store.check_file_hash(path, hash).unwrap_or(false) }",
    "async fn auth_middleware(req: Request, next: Next) -> Response { let token = req.headers().get(\"Authorization\"); match validate_jwt(token) { Ok(claims) => next.run(req).await, Err(_) => Response::new(StatusCode::UNAUTHORIZED) } }",
    "#[derive(Serialize, Deserialize)] struct Entity { id: i64, name: String, kind: EntityKind, metadata: serde_json::Value }",
    "pub async fn generate_embeddings(&self, texts: &[String]) -> Result<Vec<Vec<f32>>> { let response = self.client.post(\"https://api.openai.com/v1/embeddings\").json(&request).send().await?; }",
    "fn search_entities(&self, pattern: &str) -> Result<Vec<Entity>> { self.conn.prepare(\"SELECT * FROM entities WHERE name LIKE ?1\")?.query_map(params![format!(\"%{}%\", pattern)], |row| Entity::from_row(row)) }",
    "fn parse_rust_file(source: &str) -> ExtractionResult { let mut parser = Parser::new(); parser.set_language(tree_sitter_rust::language()).unwrap(); let tree = parser.parse(source, None).unwrap(); extract_entities(&tree) }",
    "pub async fn search_similar(&self, query: &[f32], limit: usize) -> Vec<SearchResult> { self.client.search_points(SearchPointsBuilder::new(COLLECTION, query, limit).with_payload(true)).await }",
    "let graph = Graph::connect(ConfigBuilder::default().uri(\"bolt://localhost:7687\").user(\"\").password(\"\").db(\"memgraph\").build()?).await?;",
    "fn validate_api_key() -> Result<String> { env::var(\"OPENAI_API_KEY\").map_err(|_| anyhow!(\"OPENAI_API_KEY not set\")) }",
    "use tracing::{info, debug, warn, error}; info!(\"Processing file: {}\", path.display()); debug!(\"Entity count: {}\", entities.len());",
    "#[test] fn test_entity_crud() { let store = TestStore::new(); store.insert(mock_entity()); assert_eq!(store.count(), 1); }",
    "#[derive(Parser)] struct Cli { #[arg(long, env)] project_dir: PathBuf, #[arg(long, default_value = \"10\")] max_results: usize }",
    "fn run_migration(conn: &Connection) -> Result<()> { conn.execute_batch(\"ALTER TABLE entities ADD COLUMN project_root TEXT; CREATE INDEX idx_project ON entities(project_root);\") }",
];

fn cosine_sim(a: &[f32], b: &[f32]) -> f32 {
    let dot: f32 = a.iter().zip(b).map(|(x, y)| x * y).sum();
    let na: f32 = a.iter().map(|x| x * x).sum::<f32>().sqrt();
    let nb: f32 = b.iter().map(|x| x * x).sum::<f32>().sqrt();
    if na == 0.0 || nb == 0.0 { 0.0 } else { dot / (na * nb) }
}

fn rank_documents(query_emb: &[f32], doc_embs: &[Vec<f32>]) -> Vec<(usize, f32)> {
    let mut scored: Vec<(usize, f32)> = doc_embs.iter()
        .enumerate()
        .map(|(i, d)| (i, cosine_sim(query_emb, d)))
        .collect();
    scored.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap());
    scored
}

/// Top-k overlap: how many of the top-k results are the same between two rankings
fn topk_overlap(rank_a: &[(usize, f32)], rank_b: &[(usize, f32)], k: usize) -> f32 {
    let top_a: std::collections::HashSet<usize> = rank_a.iter().take(k).map(|(i, _)| *i).collect();
    let top_b: std::collections::HashSet<usize> = rank_b.iter().take(k).map(|(i, _)| *i).collect();
    let overlap = top_a.intersection(&top_b).count();
    overlap as f32 / k as f32
}

/// Kendall's tau rank correlation (simplified — concordant vs discordant pairs)
fn kendall_tau(rank_a: &[(usize, f32)], rank_b: &[(usize, f32)]) -> f32 {
    let n = rank_a.len();
    // Build position maps
    let mut pos_a = vec![0usize; n];
    let mut pos_b = vec![0usize; n];
    for (pos, (idx, _)) in rank_a.iter().enumerate() {
        pos_a[*idx] = pos;
    }
    for (pos, (idx, _)) in rank_b.iter().enumerate() {
        pos_b[*idx] = pos;
    }

    let mut concordant = 0i64;
    let mut discordant = 0i64;
    for i in 0..n {
        for j in (i + 1)..n {
            let a_diff = pos_a[i] as i64 - pos_a[j] as i64;
            let b_diff = pos_b[i] as i64 - pos_b[j] as i64;
            if a_diff * b_diff > 0 {
                concordant += 1;
            } else if a_diff * b_diff < 0 {
                discordant += 1;
            }
        }
    }
    let total = concordant + discordant;
    if total == 0 { 1.0 } else { (concordant - discordant) as f32 / total as f32 }
}

fn call_openai_sync(texts: &[&str]) -> Result<Vec<Vec<f32>>> {
    let api_key = std::env::var("OPENAI_API_KEY")
        .map_err(|_| anyhow!("OPENAI_API_KEY not set"))?;

    let client = reqwest::blocking::Client::new();
    let body = serde_json::json!({
        "input": texts,
        "model": "text-embedding-3-small"
    });

    let resp = client.post("https://api.openai.com/v1/embeddings")
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json")
        .json(&body)
        .send()?;

    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().unwrap_or_default();
        return Err(anyhow!("OpenAI API error {}: {}", status, text));
    }

    let json: serde_json::Value = resp.json()?;
    let embeddings: Vec<Vec<f32>> = json["data"].as_array()
        .ok_or_else(|| anyhow!("No data in response"))?
        .iter()
        .map(|item| {
            item["embedding"].as_array().unwrap()
                .iter()
                .map(|v| v.as_f64().unwrap() as f32)
                .collect()
        })
        .collect();

    Ok(embeddings)
}

fn main() -> Result<()> {
    println!("╔══════════════════════════════════════════════════════════════╗");
    println!("║  Embedding Benchmark: fastembed (local) vs OpenAI (API)    ║");
    println!("╠══════════════════════════════════════════════════════════════╣");
    println!("║  Local:  BGE-small-en-v1.5 (384-dim, ~33MB ONNX)          ║");
    println!("║  API:    text-embedding-3-small (1536-dim, OpenAI)         ║");
    println!("║  Corpus: 20 queries × 20 code documents                   ║");
    println!("╚══════════════════════════════════════════════════════════════╝\n");

    // --- Load fastembed model ---
    println!("Loading fastembed model (first run downloads ~33MB)...");
    let fe_load_start = Instant::now();
    let model = TextEmbedding::try_new(
        InitOptions::new(EmbeddingModel::BGESmallENV15)
            .with_show_download_progress(true)
    )?;
    let fe_load_ms = fe_load_start.elapsed().as_millis();
    println!("  Model loaded in {}ms\n", fe_load_ms);

    // --- Generate fastembed embeddings ---
    println!("Generating fastembed embeddings...");
    let fe_start = Instant::now();
    let fe_query_embs = model.embed(QUERIES.to_vec(), None)?;
    let fe_query_ms = fe_start.elapsed().as_millis();

    let fe_doc_start = Instant::now();
    let fe_doc_embs = model.embed(DOCUMENTS.to_vec(), None)?;
    let fe_doc_ms = fe_doc_start.elapsed().as_millis();
    println!("  {} queries in {}ms ({:.1}ms/query)", QUERIES.len(), fe_query_ms, fe_query_ms as f64 / QUERIES.len() as f64);
    println!("  {} documents in {}ms ({:.1}ms/doc)\n", DOCUMENTS.len(), fe_doc_ms, fe_doc_ms as f64 / DOCUMENTS.len() as f64);

    // --- Generate OpenAI embeddings ---
    println!("Generating OpenAI embeddings...");
    let oai_start = Instant::now();
    let all_texts: Vec<&str> = QUERIES.iter().chain(DOCUMENTS.iter()).copied().collect();
    let oai_all = call_openai_sync(&all_texts)?;
    let oai_ms = oai_start.elapsed().as_millis();
    let oai_query_embs: Vec<Vec<f32>> = oai_all[..QUERIES.len()].to_vec();
    let oai_doc_embs: Vec<Vec<f32>> = oai_all[QUERIES.len()..].to_vec();
    println!("  {} texts in {}ms ({:.1}ms/text)\n", all_texts.len(), oai_ms, oai_ms as f64 / all_texts.len() as f64);

    // --- Compare rankings ---
    println!("═══════════════════════════════════════════════════════════════");
    println!(" Per-Query Ranking Comparison");
    println!("═══════════════════════════════════════════════════════════════");
    println!("{:<4} {:<55} {:>6} {:>6} {:>6}", "#", "Query", "τ", "T3", "T5");
    println!("{}", "─".repeat(81));

    let mut total_tau = 0.0f32;
    let mut total_top3 = 0.0f32;
    let mut total_top5 = 0.0f32;
    let mut top1_agree = 0u32;

    for (i, query) in QUERIES.iter().enumerate() {
        let fe_ranking = rank_documents(&fe_query_embs[i], &fe_doc_embs);
        let oai_ranking = rank_documents(&oai_query_embs[i], &oai_doc_embs);

        let tau = kendall_tau(&fe_ranking, &oai_ranking);
        let top3 = topk_overlap(&fe_ranking, &oai_ranking, 3);
        let top5 = topk_overlap(&fe_ranking, &oai_ranking, 5);

        if fe_ranking[0].0 == oai_ranking[0].0 {
            top1_agree += 1;
        }

        total_tau += tau;
        total_top3 += top3;
        total_top5 += top5;

        let truncated: String = if query.len() > 52 { format!("{}...", &query[..52]) } else { query.to_string() };
        println!("{:<4} {:<55} {:>5.2} {:>5.0}% {:>5.0}%", i + 1, truncated, tau, top3 * 100.0, top5 * 100.0);
    }

    let n = QUERIES.len() as f32;
    println!("{}", "─".repeat(81));
    println!("{:<4} {:<55} {:>5.2} {:>5.0}% {:>5.0}%", "AVG", "", total_tau / n, total_top3 / n * 100.0, total_top5 / n * 100.0);

    // --- Show top-1 results side by side for divergences ---
    println!("\n═══════════════════════════════════════════════════════════════");
    println!(" Top-1 Results (where they disagree)");
    println!("═══════════════════════════════════════════════════════════════");

    for (i, query) in QUERIES.iter().enumerate() {
        let fe_ranking = rank_documents(&fe_query_embs[i], &fe_doc_embs);
        let oai_ranking = rank_documents(&oai_query_embs[i], &oai_doc_embs);

        if fe_ranking[0].0 != oai_ranking[0].0 {
            let truncated: String = if query.len() > 60 { format!("{}...", &query[..60]) } else { query.to_string() };
            println!("\nQ{}: {}", i + 1, truncated);
            let fe_doc: String = DOCUMENTS[fe_ranking[0].0].chars().take(80).collect();
            let oai_doc: String = DOCUMENTS[oai_ranking[0].0].chars().take(80).collect();
            println!("  FE  [doc {:>2}] ({:.3}): {}...", fe_ranking[0].0, fe_ranking[0].1, fe_doc);
            println!("  OAI [doc {:>2}] ({:.3}): {}...", oai_ranking[0].0, oai_ranking[0].1, oai_doc);
        }
    }

    // --- Summary ---
    println!("\n╔══════════════════════════════════════════════════════════════╗");
    println!("║  Summary                                                   ║");
    println!("╠══════════════════════════════════════════════════════════════╣");
    println!("║  Kendall's τ (avg):    {:>5.2}  (1.0 = identical ranking)  ║", total_tau / n);
    println!("║  Top-3 overlap (avg):  {:>4.0}%  (100% = same top 3)       ║", total_top3 / n * 100.0);
    println!("║  Top-5 overlap (avg):  {:>4.0}%  (100% = same top 5)       ║", total_top5 / n * 100.0);
    println!("║  Top-1 agreement:      {}/{} ({:.0}%)                       ║", top1_agree, QUERIES.len(), top1_agree as f32 / n * 100.0);
    println!("╠══════════════════════════════════════════════════════════════╣");
    println!("║  Latency                                                   ║");
    println!("║  fastembed load:       {:>5}ms (one-time)                  ║", fe_load_ms);
    println!("║  fastembed query:      {:>5.1}ms/query                      ║", fe_query_ms as f64 / QUERIES.len() as f64);
    println!("║  OpenAI API:           {:>5.1}ms/query (batch)              ║", oai_ms as f64 / all_texts.len() as f64);
    println!("╚══════════════════════════════════════════════════════════════╝");

    Ok(())
}
