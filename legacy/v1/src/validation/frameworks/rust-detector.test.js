/**
 * Comprehensive Test Suite for Rust Framework Detection
 * Phase 2 Integration Testing with Byzantine Validation
 *
 * Tests the RustFrameworkDetector across various Rust project types
 * including web frameworks, database integrations, workspace configurations,
 * and Byzantine consensus validation.
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { RustFrameworkDetector } from './rust-detector.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('RustFrameworkDetector', () => {
  let detector;
  let tempDir;

  beforeEach(async () => {
    // Create temporary test directory
    tempDir = path.join(__dirname, '..', '..', '..', 'temp', `rust-test-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });

    detector = new RustFrameworkDetector({ basePath: tempDir });
  });

  afterEach(async () => {
    if (detector) {
      await detector.cleanup();
    }

    // Clean up temp directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors in tests
    }
  });

  describe('Core Rust Project Detection', () => {
    test('should detect basic Rust project with Cargo.toml', async () => {
      // Create basic Rust project structure
      await createBasicRustProject(tempDir);

      const result = await detector.detectRustFramework();

      expect(result.isRustProject).toBe(true);
      expect(result.detected).toBe('rust');
      expect(result.confidence).toBeGreaterThan(0.7);
      expect(result.evidence.files['Cargo.toml']).toBe(true);
      expect(result.evidence.files.rustFileCount).toBeGreaterThan(0);
    });

    test('should detect Rust workspace configuration', async () => {
      // Create workspace project
      await createRustWorkspace(tempDir);

      const result = await detector.detectRustFramework();

      expect(result.isRustProject).toBe(true);
      expect(result.evidence.workspace).toBeDefined();
      expect(result.evidence.workspace.members).toHaveLength(2);
      expect(result.confidence).toBeGreaterThan(0.8);
    });

    test('should detect Rust edition information', async () => {
      // Create project with specific edition
      await createRustProjectWithEdition(tempDir, '2021');

      const result = await detector.detectRustFramework();

      expect(result.isRustProject).toBe(true);
      expect(result.evidence.editions).toContain('2021');
      expect(result.evidence.cargo.edition).toBe('2021');
    });

    test('should handle missing Cargo.toml gracefully', async () => {
      // Create directory with only .rs files
      await fs.writeFile(path.join(tempDir, 'main.rs'), 'fn main() { println!("Hello"); }');

      const result = await detector.detectRustFramework();

      expect(result.isRustProject).toBe(false);
      expect(result.detected).toBe('unknown');
      expect(result.confidence).toBeLessThan(0.5);
    });
  });

  describe('Web Framework Detection', () => {
    test('should detect Axum web framework', async () => {
      await createAxumProject(tempDir);

      const result = await detector.detectRustFramework();

      expect(result.isRustProject).toBe(true);
      expect(result.frameworks.web).toEqual(
        expect.arrayContaining([expect.objectContaining({ name: 'axum' })]),
      );
      expect(result.scores.webFrameworks.axum).toBeGreaterThan(0);
    });

    test('should detect Warp web framework', async () => {
      await createWarpProject(tempDir);

      const result = await detector.detectRustFramework();

      expect(result.isRustProject).toBe(true);
      expect(result.frameworks.web).toEqual(
        expect.arrayContaining([expect.objectContaining({ name: 'warp' })]),
      );
    });

    test('should detect Actix-web framework', async () => {
      await createActixWebProject(tempDir);

      const result = await detector.detectRustFramework();

      expect(result.isRustProject).toBe(true);
      expect(result.frameworks.web).toEqual(
        expect.arrayContaining([expect.objectContaining({ name: 'actix-web' })]),
      );
    });

    test('should detect Rocket framework', async () => {
      await createRocketProject(tempDir);

      const result = await detector.detectRustFramework();

      expect(result.isRustProject).toBe(true);
      expect(result.frameworks.web).toEqual(
        expect.arrayContaining([expect.objectContaining({ name: 'rocket' })]),
      );
    });
  });

  describe('Database Framework Detection', () => {
    test('should detect Diesel ORM', async () => {
      await createDieselProject(tempDir);

      const result = await detector.detectRustFramework();

      expect(result.isRustProject).toBe(true);
      expect(result.frameworks.database).toEqual(
        expect.arrayContaining([expect.objectContaining({ name: 'diesel' })]),
      );
    });

    test('should detect SeaORM', async () => {
      await createSeaOrmProject(tempDir);

      const result = await detector.detectRustFramework();

      expect(result.isRustProject).toBe(true);
      expect(result.frameworks.database).toEqual(
        expect.arrayContaining([expect.objectContaining({ name: 'sea-orm' })]),
      );
    });

    test('should detect SQLx', async () => {
      await createSqlxProject(tempDir);

      const result = await detector.detectRustFramework();

      expect(result.isRustProject).toBe(true);
      expect(result.frameworks.database).toEqual(
        expect.arrayContaining([expect.objectContaining({ name: 'sqlx' })]),
      );
    });
  });

  describe('Async Runtime Detection', () => {
    test('should detect Tokio runtime', async () => {
      await createTokioProject(tempDir);

      const result = await detector.detectRustFramework();

      expect(result.isRustProject).toBe(true);
      expect(result.frameworks.async).toEqual(
        expect.arrayContaining([expect.objectContaining({ name: 'tokio' })]),
      );
    });

    test('should detect async-std runtime', async () => {
      await createAsyncStdProject(tempDir);

      const result = await detector.detectRustFramework();

      expect(result.isRustProject).toBe(true);
      expect(result.frameworks.async).toEqual(
        expect.arrayContaining([expect.objectContaining({ name: 'async-std' })]),
      );
    });
  });

  describe('Testing Framework Detection', () => {
    test('should detect built-in testing framework', async () => {
      await createRustProjectWithTests(tempDir);

      const result = await detector.detectRustFramework();

      expect(result.isRustProject).toBe(true);
      expect(result.frameworks.testing).toEqual(
        expect.arrayContaining([expect.objectContaining({ name: 'builtin' })]),
      );
    });

    test('should detect Criterion benchmarking', async () => {
      await createCriterionProject(tempDir);

      const result = await detector.detectRustFramework();

      expect(result.isRustProject).toBe(true);
      expect(result.frameworks.testing).toEqual(
        expect.arrayContaining([expect.objectContaining({ name: 'criterion' })]),
      );
    });

    test('should detect PropTest property testing', async () => {
      await createPropTestProject(tempDir);

      const result = await detector.detectRustFramework();

      expect(result.isRustProject).toBe(true);
      expect(result.frameworks.testing).toEqual(
        expect.arrayContaining([expect.objectContaining({ name: 'proptest' })]),
      );
    });
  });

  describe('Byzantine Consensus Validation', () => {
    test('should achieve Byzantine consensus for clear Rust project', async () => {
      await createComplexRustProject(tempDir);

      const result = await detector.detectRustFramework();

      expect(result.isRustProject).toBe(true);
      expect(result.metadata.byzantineConsensus).toBe(true);
      expect(result.confidence).toBeGreaterThan(0.8);
    });

    test('should fail Byzantine consensus for ambiguous project', async () => {
      // Create minimal project with little evidence
      await fs.writeFile(path.join(tempDir, 'Cargo.toml'), '[package]\nname = "test"');

      const result = await detector.detectRustFramework();

      expect(result.metadata.byzantineConsensus).toBe(false);
    });

    test('should validate file evidence correctly', async () => {
      await createBasicRustProject(tempDir);

      const result = await detector.detectRustFramework();
      const fileValidation = detector.validateFileEvidence(result);

      expect(fileValidation).toBe(true);
    });

    test('should validate cargo evidence correctly', async () => {
      await createRustProjectWithDependencies(tempDir);

      const result = await detector.detectRustFramework();
      const cargoValidation = detector.validateCargoEvidence(result);

      expect(cargoValidation).toBe(true);
    });
  });

  describe('Performance and Edge Cases', () => {
    test('should complete detection within reasonable time', async () => {
      await createLargeRustProject(tempDir);

      const startTime = Date.now();
      const result = await detector.detectRustFramework();
      const detectionTime = Date.now() - startTime;

      expect(result.isRustProject).toBe(true);
      expect(detectionTime).toBeLessThan(5000); // 5 seconds max
      expect(result.metadata.detectionTime).toBeLessThan(5000);
    });

    test('should handle corrupted Cargo.toml gracefully', async () => {
      await fs.writeFile(path.join(tempDir, 'Cargo.toml'), 'invalid toml content [[[');

      const result = await detector.detectRustFramework();

      expect(result.isRustProject).toBe(false);
      expect(result.error).toBeDefined();
    });

    test('should handle nested workspace structure', async () => {
      await createNestedRustWorkspace(tempDir);

      const result = await detector.detectRustFramework();

      expect(result.isRustProject).toBe(true);
      expect(result.evidence.workspace).toBeDefined();
      expect(result.evidence.workspace.validMembers).toBeGreaterThan(0);
    });

    test('should limit file analysis for performance', async () => {
      // Create project with many files
      await createRustProjectWithManyFiles(tempDir, 100);

      const result = await detector.detectRustFramework();

      expect(result.isRustProject).toBe(true);
      expect(result.metadata.filesAnalyzed).toBeLessThan(100); // Should be limited
    });
  });

  describe('Complex Project Scenarios', () => {
    test('should detect full-stack Rust web application', async () => {
      await createFullStackRustApp(tempDir);

      const result = await detector.detectRustFramework();

      expect(result.isRustProject).toBe(true);
      expect(result.frameworks.web.length).toBeGreaterThan(0);
      expect(result.frameworks.database.length).toBeGreaterThan(0);
      expect(result.frameworks.async.length).toBeGreaterThan(0);
      expect(result.confidence).toBeGreaterThan(0.9);
    });

    test('should handle multi-crate workspace with different frameworks', async () => {
      await createMultiFrameworkWorkspace(tempDir);

      const result = await detector.detectRustFramework();

      expect(result.isRustProject).toBe(true);
      expect(result.evidence.workspace.members.length).toBeGreaterThan(2);
      expect(result.frameworks.web.length).toBeGreaterThan(0);
      expect(result.frameworks.database.length).toBeGreaterThan(0);
    });
  });
});

// Test Helper Functions

async function createBasicRustProject(dir) {
  const cargoToml = `[package]
name = "test-project"
version = "0.1.0"
edition = "2021"

[dependencies]`;

  const mainRs = `fn main() {
    println!("Hello, world!");
}

#[cfg(test)]
mod tests {
    #[test]
    fn it_works() {
        assert_eq!(2 + 2, 4);
    }
}`;

  await fs.mkdir(path.join(dir, 'src'), { recursive: true });
  await fs.writeFile(path.join(dir, 'Cargo.toml'), cargoToml);
  await fs.writeFile(path.join(dir, 'src/main.rs'), mainRs);
}

async function createRustWorkspace(dir) {
  const workspaceToml = `[workspace]
members = ["web", "core"]
resolver = "2"

[workspace.dependencies]
serde = "1.0"`;

  const webCargoToml = `[package]
name = "web"
version = "0.1.0"
edition = "2021"

[dependencies]
axum = "0.6"
tokio = { version = "1.0", features = ["full"] }`;

  const coreCargoToml = `[package]
name = "core"
version = "0.1.0"
edition = "2021"

[dependencies]
serde = { workspace = true }`;

  await fs.writeFile(path.join(dir, 'Cargo.toml'), workspaceToml);

  // Create workspace members
  await fs.mkdir(path.join(dir, 'web', 'src'), { recursive: true });
  await fs.mkdir(path.join(dir, 'core', 'src'), { recursive: true });

  await fs.writeFile(path.join(dir, 'web', 'Cargo.toml'), webCargoToml);
  await fs.writeFile(path.join(dir, 'core', 'Cargo.toml'), coreCargoToml);

  await fs.writeFile(path.join(dir, 'web', 'src', 'main.rs'), 'fn main() {}');
  await fs.writeFile(path.join(dir, 'core', 'src', 'lib.rs'), 'pub fn hello() {}');
}

async function createRustProjectWithEdition(dir, edition) {
  const cargoToml = `[package]
name = "edition-test"
version = "0.1.0"
edition = "${edition}"

[dependencies]`;

  await fs.mkdir(path.join(dir, 'src'), { recursive: true });
  await fs.writeFile(path.join(dir, 'Cargo.toml'), cargoToml);
  await fs.writeFile(path.join(dir, 'src/main.rs'), 'fn main() { println!("Hello"); }');
}

async function createAxumProject(dir) {
  const cargoToml = `[package]
name = "axum-app"
version = "0.1.0"
edition = "2021"

[dependencies]
axum = "0.6"
tokio = { version = "1.0", features = ["full"] }
tower = "0.4"
tower-http = "0.4"`;

  const mainRs = `use axum::{
    routing::get,
    http::StatusCode,
    Json, Router,
};
use serde::{Deserialize, Serialize};

#[tokio::main]
async fn main() {
    let app = Router::new()
        .route("/", get(root))
        .route("/users", get(get_users));

    axum::Server::bind(&"0.0.0.0:3000".parse().unwrap())
        .serve(app.into_make_service())
        .await
        .unwrap();
}

async fn root() -> &'static str {
    "Hello, World!"
}

async fn get_users() -> Json<Vec<User>> {
    Json(vec![])
}

#[derive(Serialize, Deserialize)]
struct User {
    id: u64,
    username: String,
}`;

  await fs.mkdir(path.join(dir, 'src'), { recursive: true });
  await fs.writeFile(path.join(dir, 'Cargo.toml'), cargoToml);
  await fs.writeFile(path.join(dir, 'src/main.rs'), mainRs);
}

async function createWarpProject(dir) {
  const cargoToml = `[package]
name = "warp-app"
version = "0.1.0"
edition = "2021"

[dependencies]
warp = "0.3"
tokio = { version = "1", features = ["macros", "rt-multi-thread"] }`;

  const mainRs = `use warp::Filter;

#[tokio::main]
async fn main() {
    let hello = warp::path!("hello" / String)
        .map(|name| format!("Hello, {}!", name));

    warp::serve(hello)
        .run(([127, 0, 0, 1], 3030))
        .await;
}`;

  await fs.mkdir(path.join(dir, 'src'), { recursive: true });
  await fs.writeFile(path.join(dir, 'Cargo.toml'), cargoToml);
  await fs.writeFile(path.join(dir, 'src/main.rs'), mainRs);
}

async function createActixWebProject(dir) {
  const cargoToml = `[package]
name = "actix-app"
version = "0.1.0"
edition = "2021"

[dependencies]
actix-web = "4"
actix-rt = "2"`;

  const mainRs = `use actix_web::{web, App, HttpResponse, HttpServer, Result};

async fn greet() -> Result<HttpResponse> {
    Ok(HttpResponse::Ok().json("Hello world!"))
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    HttpServer::new(|| {
        App::new()
            .route("/hello", web::get().to(greet))
    })
    .bind("127.0.0.1:8080")?
    .run()
    .await
}`;

  await fs.mkdir(path.join(dir, 'src'), { recursive: true });
  await fs.writeFile(path.join(dir, 'Cargo.toml'), cargoToml);
  await fs.writeFile(path.join(dir, 'src/main.rs'), mainRs);
}

async function createRocketProject(dir) {
  const cargoToml = `[package]
name = "rocket-app"
version = "0.1.0"
edition = "2021"

[dependencies]
rocket = "0.5"`;

  const mainRs = `use rocket::{get, launch, routes};

#[get("/")]
fn index() -> &'static str {
    "Hello, world!"
}

#[launch]
fn rocket() -> _ {
    rocket::build().mount("/", routes![index])
}`;

  await fs.mkdir(path.join(dir, 'src'), { recursive: true });
  await fs.writeFile(path.join(dir, 'Cargo.toml'), cargoToml);
  await fs.writeFile(path.join(dir, 'src/main.rs'), mainRs);
}

async function createDieselProject(dir) {
  const cargoToml = `[package]
name = "diesel-app"
version = "0.1.0"
edition = "2021"

[dependencies]
diesel = { version = "2.0", features = ["postgres"] }
diesel_migrations = "2.0"`;

  const modelsRs = `use diesel::prelude::*;

#[derive(Queryable)]
pub struct Post {
    pub id: i32,
    pub title: String,
    pub body: String,
}

#[derive(Insertable)]
#[diesel(table_name = posts)]
pub struct NewPost<'a> {
    pub title: &'a str,
    pub body: &'a str,
}`;

  const schemaRs = `table! {
    posts (id) {
        id -> Int4,
        title -> Varchar,
        body -> Text,
    }
}`;

  await fs.mkdir(path.join(dir, 'src'), { recursive: true });
  await fs.mkdir(path.join(dir, 'migrations'), { recursive: true });
  await fs.writeFile(path.join(dir, 'Cargo.toml'), cargoToml);
  await fs.writeFile(path.join(dir, 'src/models.rs'), modelsRs);
  await fs.writeFile(path.join(dir, 'src/schema.rs'), schemaRs);
  await fs.writeFile(path.join(dir, 'diesel.toml'), '[print_schema]\nfile = "src/schema.rs"');
}

async function createSeaOrmProject(dir) {
  const cargoToml = `[package]
name = "sea-orm-app"
version = "0.1.0"
edition = "2021"

[dependencies]
sea-orm = { version = "0.11", features = ["sqlx-postgres", "runtime-tokio-rustls", "macros"] }`;

  const entitiesRs = `use sea_orm::entity::prelude::*;

#[derive(Clone, Debug, PartialEq, DeriveEntityModel)]
#[sea_orm(table_name = "posts")]
pub struct Model {
    #[sea_orm(primary_key)]
    pub id: i32,
    pub title: String,
    pub content: String,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {}

impl ActiveModelTrait for ActiveModel {}`;

  await fs.mkdir(path.join(dir, 'src'), { recursive: true });
  await fs.mkdir(path.join(dir, 'src/entities'), { recursive: true });
  await fs.writeFile(path.join(dir, 'Cargo.toml'), cargoToml);
  await fs.writeFile(path.join(dir, 'src/entities/posts.rs'), entitiesRs);
}

async function createSqlxProject(dir) {
  const cargoToml = `[package]
name = "sqlx-app"
version = "0.1.0"
edition = "2021"

[dependencies]
sqlx = { version = "0.6", features = ["runtime-tokio-rustls", "postgres"] }
tokio = { version = "1", features = ["full"] }`;

  const mainRs = `use sqlx::PgPool;

#[derive(sqlx::FromRow)]
struct User {
    id: i64,
    name: String,
}

#[tokio::main]
async fn main() -> Result<(), sqlx::Error> {
    let pool = PgPool::connect("postgres://localhost/test").await?;

    let users: Vec<User> = sqlx::query_as!(
        User,
        "SELECT id, name FROM users"
    )
    .fetch_all(&pool)
    .await?;

    Ok(())
}`;

  await fs.mkdir(path.join(dir, 'src'), { recursive: true });
  await fs.mkdir(path.join(dir, 'migrations'), { recursive: true });
  await fs.writeFile(path.join(dir, 'Cargo.toml'), cargoToml);
  await fs.writeFile(path.join(dir, 'src/main.rs'), mainRs);
  await fs.writeFile(path.join(dir, '.env'), 'DATABASE_URL=postgres://localhost/test');
}

async function createTokioProject(dir) {
  const cargoToml = `[package]
name = "tokio-app"
version = "0.1.0"
edition = "2021"

[dependencies]
tokio = { version = "1", features = ["full"] }`;

  const mainRs = `use tokio::time::{sleep, Duration};

#[tokio::main]
async fn main() {
    println!("Hello");

    sleep(Duration::from_millis(1000)).await;

    println!("world");

    let handle = tokio::spawn(async {
        "return value"
    });

    println!("Got: {}", handle.await.unwrap());
}

#[tokio::test]
async fn test_async() {
    assert_eq!(1 + 1, 2);
}`;

  await fs.mkdir(path.join(dir, 'src'), { recursive: true });
  await fs.writeFile(path.join(dir, 'Cargo.toml'), cargoToml);
  await fs.writeFile(path.join(dir, 'src/main.rs'), mainRs);
}

async function createAsyncStdProject(dir) {
  const cargoToml = `[package]
name = "async-std-app"
version = "0.1.0"
edition = "2021"

[dependencies]
async-std = { version = "1", features = ["attributes"] }`;

  const mainRs = `use async_std::task;

#[async_std::main]
async fn main() {
    let handle = task::spawn(async {
        "hello world"
    });

    println!("{}", handle.await);
}

#[async_std::test]
async fn test_async() {
    assert_eq!(2 * 2, 4);
}`;

  await fs.mkdir(path.join(dir, 'src'), { recursive: true });
  await fs.writeFile(path.join(dir, 'Cargo.toml'), cargoToml);
  await fs.writeFile(path.join(dir, 'src/main.rs'), mainRs);
}

async function createRustProjectWithTests(dir) {
  const cargoToml = `[package]
name = "test-project"
version = "0.1.0"
edition = "2021"

[dependencies]`;

  const libRs = `pub fn add(left: usize, right: usize) -> usize {
    left + right
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn it_works() {
        let result = add(2, 2);
        assert_eq!(result, 4);
    }

    #[test]
    fn test_addition() {
        assert_eq!(add(5, 5), 10);
        assert_ne!(add(3, 2), 6);
        assert!(add(1, 1) > 1);
    }
}`;

  const testRs = `use test_project::add;

#[test]
fn integration_test() {
    assert_eq!(add(10, 10), 20);
}`;

  await fs.mkdir(path.join(dir, 'src'), { recursive: true });
  await fs.mkdir(path.join(dir, 'tests'), { recursive: true });
  await fs.writeFile(path.join(dir, 'Cargo.toml'), cargoToml);
  await fs.writeFile(path.join(dir, 'src/lib.rs'), libRs);
  await fs.writeFile(path.join(dir, 'tests/integration_test.rs'), testRs);
}

async function createCriterionProject(dir) {
  const cargoToml = `[package]
name = "criterion-app"
version = "0.1.0"
edition = "2021"

[dev-dependencies]
criterion = "0.4"

[[bench]]
name = "my_benchmark"
harness = false`;

  const benchRs = `use criterion::{black_box, criterion_group, criterion_main, Criterion};

fn fibonacci(n: u64) -> u64 {
    match n {
        0 => 1,
        1 => 1,
        n => fibonacci(n-1) + fibonacci(n-2),
    }
}

fn criterion_benchmark(c: &mut Criterion) {
    c.bench_function("fib 20", |b| b.iter(|| fibonacci(black_box(20))));
}

criterion_group!(benches, criterion_benchmark);
criterion_main!(benches);`;

  await fs.mkdir(path.join(dir, 'src'), { recursive: true });
  await fs.mkdir(path.join(dir, 'benches'), { recursive: true });
  await fs.writeFile(path.join(dir, 'Cargo.toml'), cargoToml);
  await fs.writeFile(path.join(dir, 'src/lib.rs'), 'pub fn hello() {}');
  await fs.writeFile(path.join(dir, 'benches/my_benchmark.rs'), benchRs);
}

async function createPropTestProject(dir) {
  const cargoToml = `[package]
name = "proptest-app"
version = "0.1.0"
edition = "2021"

[dev-dependencies]
proptest = "1"`;

  const libRs = `pub fn reverse<T: Clone>(xs: &[T]) -> Vec<T> {
    let mut rev = vec![];
    for x in xs.iter().rev() {
        rev.push(x.clone())
    }
    rev
}

#[cfg(test)]
mod tests {
    use super::*;
    use proptest::prelude::*;

    proptest! {
        #[test]
        fn test_reverse(ref s in "\\\\PC*") {
            prop_assert_eq!(reverse(&reverse(s)), s);
        }

        #[test]
        fn test_reverse_length(ref s in any::<Vec<u8>>()) {
            prop_assert_eq!(reverse(s).len(), s.len());
        }
    }
}`;

  await fs.mkdir(path.join(dir, 'src'), { recursive: true });
  await fs.writeFile(path.join(dir, 'Cargo.toml'), cargoToml);
  await fs.writeFile(path.join(dir, 'src/lib.rs'), libRs);
}

async function createComplexRustProject(dir) {
  // Combine multiple framework types for complex validation
  await createBasicRustProject(dir);
  await createAxumProject(dir);

  // Add additional complexity
  const complexCargoToml = `[package]
name = "complex-project"
version = "0.1.0"
edition = "2021"

[dependencies]
axum = "0.6"
tokio = { version = "1.0", features = ["full"] }
diesel = { version = "2.0", features = ["postgres"] }
serde = { version = "1.0", features = ["derive"] }

[dev-dependencies]
criterion = "0.4"
proptest = "1"`;

  await fs.writeFile(path.join(dir, 'Cargo.toml'), complexCargoToml);
}

async function createRustProjectWithDependencies(dir) {
  const cargoToml = `[package]
name = "deps-project"
version = "0.1.0"
edition = "2021"
authors = ["Test Author <test@example.com>"]
description = "A test project with dependencies"

[dependencies]
serde = { version = "1.0", features = ["derive"] }
tokio = { version = "1.0", features = ["full"] }
clap = "4.0"
reqwest = { version = "0.11", features = ["json"] }

[dev-dependencies]
tokio-test = "0.4"`;

  await fs.mkdir(path.join(dir, 'src'), { recursive: true });
  await fs.writeFile(path.join(dir, 'Cargo.toml'), cargoToml);
  await fs.writeFile(path.join(dir, 'src/main.rs'), 'fn main() { println!("Hello"); }');
}

async function createLargeRustProject(dir) {
  // Create project with moderate complexity for performance testing
  await createRustWorkspace(dir);

  // Add more files and modules
  for (let i = 0; i < 10; i++) {
    const modRs = `pub mod submod_${i} {
    pub fn function_${i}() -> i32 { ${i} }

    #[cfg(test)]
    mod tests {
        #[test]
        fn test_function_${i}() {
            assert_eq!(super::function_${i}(), ${i});
        }
    }
}`;

    await fs.writeFile(path.join(dir, 'core', 'src', `mod_${i}.rs`), modRs);
  }
}

async function createNestedRustWorkspace(dir) {
  const workspaceToml = `[workspace]
members = ["crates/*"]
resolver = "2"`;

  const webCargoToml = `[package]
name = "web-service"
version = "0.1.0"
edition = "2021"

[dependencies]
axum = "0.6"`;

  const coreCargoToml = `[package]
name = "core-lib"
version = "0.1.0"
edition = "2021"`;

  await fs.writeFile(path.join(dir, 'Cargo.toml'), workspaceToml);

  await fs.mkdir(path.join(dir, 'crates', 'web', 'src'), { recursive: true });
  await fs.mkdir(path.join(dir, 'crates', 'core', 'src'), { recursive: true });

  await fs.writeFile(path.join(dir, 'crates', 'web', 'Cargo.toml'), webCargoToml);
  await fs.writeFile(path.join(dir, 'crates', 'core', 'Cargo.toml'), coreCargoToml);

  await fs.writeFile(path.join(dir, 'crates', 'web', 'src', 'main.rs'), 'fn main() {}');
  await fs.writeFile(path.join(dir, 'crates', 'core', 'src', 'lib.rs'), 'pub fn hello() {}');
}

async function createRustProjectWithManyFiles(dir, fileCount) {
  await createBasicRustProject(dir);

  for (let i = 0; i < fileCount; i++) {
    const content = `pub fn func_${i}() -> i32 { ${i} }`;
    await fs.writeFile(path.join(dir, 'src', `file_${i}.rs`), content);
  }
}

async function createFullStackRustApp(dir) {
  const cargoToml = `[package]
name = "fullstack-app"
version = "0.1.0"
edition = "2021"

[dependencies]
axum = "0.6"
tokio = { version = "1.0", features = ["full"] }
diesel = { version = "2.0", features = ["postgres"] }
serde = { version = "1.0", features = ["derive"] }

[dev-dependencies]
criterion = "0.4"`;

  const mainRs = `use axum::routing::get;
use diesel::prelude::*;
use tokio;

#[tokio::main]
async fn main() {
    let app = axum::Router::new()
        .route("/", get(|| async { "Hello World" }));

    axum::Server::bind(&"0.0.0.0:3000".parse().unwrap())
        .serve(app.into_make_service())
        .await
        .unwrap();
}`;

  await fs.mkdir(path.join(dir, 'src'), { recursive: true });
  await fs.mkdir(path.join(dir, 'migrations'), { recursive: true });
  await fs.mkdir(path.join(dir, 'benches'), { recursive: true });

  await fs.writeFile(path.join(dir, 'Cargo.toml'), cargoToml);
  await fs.writeFile(path.join(dir, 'src/main.rs'), mainRs);
  await fs.writeFile(path.join(dir, 'diesel.toml'), '[print_schema]\nfile = "src/schema.rs"');
}

async function createMultiFrameworkWorkspace(dir) {
  const workspaceToml = `[workspace]
members = ["web-api", "database", "cli-tool"]
resolver = "2"`;

  const webApiToml = `[package]
name = "web-api"
version = "0.1.0"
edition = "2021"

[dependencies]
axum = "0.6"
tokio = { version = "1.0", features = ["full"] }`;

  const databaseToml = `[package]
name = "database"
version = "0.1.0"
edition = "2021"

[dependencies]
diesel = { version = "2.0", features = ["postgres"] }`;

  const cliToolToml = `[package]
name = "cli-tool"
version = "0.1.0"
edition = "2021"

[dependencies]
clap = "4.0"`;

  await fs.writeFile(path.join(dir, 'Cargo.toml'), workspaceToml);

  // Create workspace members
  for (const member of ['web-api', 'database', 'cli-tool']) {
    await fs.mkdir(path.join(dir, member, 'src'), { recursive: true });

    let cargoToml;
    switch (member) {
      case 'web-api':
        cargoToml = webApiToml;
        break;
      case 'database':
        cargoToml = databaseToml;
        break;
      case 'cli-tool':
        cargoToml = cliToolToml;
        break;
    }

    await fs.writeFile(path.join(dir, member, 'Cargo.toml'), cargoToml);

    if (member === 'database') {
      await fs.writeFile(path.join(dir, member, 'src', 'lib.rs'), 'pub fn connect() {}');
    } else {
      await fs.writeFile(path.join(dir, member, 'src', 'main.rs'), 'fn main() {}');
    }
  }
}
