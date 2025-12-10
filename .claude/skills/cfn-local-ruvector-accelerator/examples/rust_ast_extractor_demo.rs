//! Demo of Rust AST extractor using tree-sitter
//!
//! This example shows how to extract entities and references from Rust source code.

use anyhow::Result;
use local_ruvector::extractors::{Extractor, create_rust_extractor};

fn main() -> Result<()> {
    // Initialize logging
    tracing_subscriber::fmt()
        .with_env_filter("info")
        .init();

    // Create Rust extractor
    let mut extractor = create_rust_extractor()
        .expect("Failed to create Rust extractor");

    // Sample Rust code to analyze
    let source = r#"
    use std::collections::HashMap;
    use serde::{Serialize, Deserialize};

    #[derive(Debug, Serialize, Deserialize)]
    pub struct User {
        pub id: u64,
        pub username: String,
        pub email: Option<String>,
    }

    impl User {
        pub fn new(id: u64, username: String) -> Self {
            Self {
                id,
                username,
                email: None,
            }
        }

        pub fn with_email(mut self, email: String) -> Self {
            self.email = Some(email);
            self
        }
    }

    pub trait UserRepository {
        fn find_by_id(&self, id: u64) -> Option<User>;
        fn save(&mut self, user: User) -> Result<(), Box<dyn std::error::Error>>;
    }

    pub struct InMemoryUserRepository {
        users: HashMap<u64, User>,
    }

    impl UserRepository for InMemoryUserRepository {
        fn find_by_id(&self, id: u64) -> Option<User> {
            self.users.get(&id).cloned()
        }

        fn save(&mut self, user: User) -> Result<(), Box<dyn std::error::Error>> {
            self.users.insert(user.id, user);
            Ok(())
        }
    }

    fn create_user_manager() -> InMemoryUserRepository {
        let repo = InMemoryUserRepository {
            users: HashMap::new(),
        };

        // Create a new user
        let user = User::new(1, "alice".to_string())
            .with_email("alice@example.com".to_string());

        // Save the user
        let mut manager = repo;
        manager.save(user).expect("Failed to save user");

        manager
    }
    "#;

    println!("🔍 Analyzing Rust source code...\n");

    // Extract entities and references
    let result = extractor.extract("example.rs", source)?;

    // Print summary
    println!("📊 Extraction Results:");
    println!("  Total entities: {}", result.entities.len());
    println!("  Total references: {}", result.references.len());
    println!("  Errors: {}\n", result.errors.len());

    // Group entities by type
    let mut entity_counts = std::collections::HashMap::new();
    for entity in &result.entities {
        *entity_counts.entry(format!("{:?}", entity.kind)).or_insert(0) += 1;
    }

    println!("📦 Entity Types:");
    for (entity_type, count) in entity_counts {
        println!("  {}: {}", entity_type, count);
    }

    // Print entities
    println!("\n🏗️  Extracted Entities:");
    for entity in &result.entities {
        println!("  {} {} ({}:{}:{}) - {}",
            match entity.kind {
                local_ruvector::extractors::EntityKind::Function => "fn",
                local_ruvector::extractors::EntityKind::Struct => "struct",
                local_ruvector::extractors::EntityKind::Interface => "trait",
                local_ruvector::extractors::EntityKind::Class => "impl",
                local_ruvector::extractors::EntityKind::Enum => "enum",
                _ => "?",
            },
            entity.name,
            entity.file_path,
            entity.line + 1,
            entity.column + 1,
            match entity.visibility {
                local_ruvector::extractors::Visibility::Public => "pub",
                _ => "priv",
            }
        );

        // Show metadata for certain entity types
        match entity.kind {
            local_ruvector::extractors::EntityKind::Function => {
                if let Some(return_type) = entity.metadata.get("return_type") {
                    println!("    → Returns: {}", return_type);
                }
            }
            local_ruvector::extractors::EntityKind::Struct => {
                for (key, value) in entity.metadata.iter() {
                    if key.starts_with("field_") {
                        println!("    → Field: {}", value);
                    }
                }
            }
            _ => {}
        }
    }

    // Print references
    println!("\n🔗 Extracted References:");
    for reference in &result.references {
        let ref_type = match reference.ref_kind {
            local_ruvector::extractors::RefKind::Calls => "calls",
            local_ruvector::extractors::RefKind::Uses => "uses",
            local_ruvector::extractors::RefKind::Imports => "imports",
            local_ruvector::extractors::RefKind::Implements => "implements",
            _ => "?",
        };

        println!("  {} {} ({}:{}:{})",
            ref_type,
            reference.target_name,
            reference.file_path,
            reference.line + 1,
            reference.column + 1,
        );
    }

    // Print errors if any
    if !result.errors.is_empty() {
        println!("\n❌ Errors:");
        for error in &result.errors {
            println!("  {}", error);
        }
    }

    println!("\n✅ Analysis complete!");

    Ok(())
}