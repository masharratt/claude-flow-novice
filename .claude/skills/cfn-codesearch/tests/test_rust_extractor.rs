use anyhow::Result;
use local_codesearch::extractors::{Extractor, create_rust_extractor};

#[test]
fn test_rust_extractor_basic() -> Result<()> {
    // Note: This test will fail until tree-sitter-rust is properly integrated
    // It serves as a template for when integration is complete

    let mut extractor = create_rust_extractor()?;

    let source = r#"
    pub fn add(a: i32, b: i32) -> i32 {
        a + b
    }

    struct Point<T> {
        pub x: T,
        pub y: T,
    }

    impl<T> Point<T> {
        pub fn new(x: T, y: T) -> Self {
            Point { x, y }
        }
    }
    "#;

    let result = extractor.extract("test.rs", source)?;

    // Verify entities were extracted
    assert!(!result.entities.is_empty(), "Should extract entities");
    assert!(!result.references.is_empty(), "Should extract references");

    // Check for function entity
    let function = result.entities.iter()
        .find(|e| e.kind == local_codesearch::extractors::EntityKind::Function);
    assert!(function.is_some(), "Should find function entity");

    // Check for struct entity
    let struct_entity = result.entities.iter()
        .find(|e| e.kind == local_codesearch::extractors::EntityKind::Struct);
    assert!(struct_entity.is_some(), "Should find struct entity");

    // Check for impl entity
    let impl_entity = result.entities.iter()
        .find(|e| e.kind == local_codesearch::extractors::EntityKind::Class);
    assert!(impl_entity.is_some(), "Should find impl entity");

    println!("Extracted {} entities and {} references",
             result.entities.len(),
             result.references.len());

    Ok(())
}

#[test]
fn test_rust_extractor_extensions() -> Result<()> {
    let extractor = create_rust_extractor()?;
    assert_eq!(extractor.extensions(), &["rs"]);
    assert_eq!(extractor.language(), "rust");
    Ok(())
}

#[test]
fn test_extract_complex_rust_code() -> Result<()> {
    let mut extractor = create_rust_extractor()?;

    let source = r#"
    use std::collections::HashMap;
    use serde::{Deserialize, Serialize};

    #[derive(Debug, Clone, Serialize, Deserialize)]
    pub enum ResponseStatus {
        Success,
        Error(String),
    }

    pub trait Handler {
        type Request;
        type Response;

        async fn handle(&self, req: Self::Request) -> Self::Response;
    }

    pub struct ApiHandler {
        client: reqwest::Client,
        base_url: String,
    }

    impl Handler for ApiHandler {
        type Request = String;
        type Response = Result<ResponseStatus, reqwest::Error>;

        async fn handle(&self, req: Self::Request) -> Self::Response {
            let response = self.client
                .post(&self.base_url)
                .json(&req)
                .send()
                .await?;

            Ok(ResponseStatus::Success)
        }
    }

    pub type ApiResult<T> = Result<T, Box<dyn std::error::Error>>;
    "#;

    let result = extractor.extract("complex.rs", source)?;

    // Verify various entity types
    let entities: std::collections::HashMap<_, _> = result.entities
        .iter()
        .map(|e| (e.kind.clone(), e))
        .collect();

    // Should have imports, enum, trait, struct, impl, type alias
    assert!(entities.contains_key(&local_codesearch::extractors::EntityKind::Enum));
    assert!(entities.contains_key(&local_codesearch::extractors::EntityKind::Interface));
    assert!(entities.contains_key(&local_codesearch::extractors::EntityKind::Struct));
    assert!(entities.contains_key(&local_codesearch::extractors::EntityKind::Class));

    // Check references
    let call_refs: Vec<_> = result.references.iter()
        .filter(|r| r.ref_kind == local_codesearch::extractors::RefKind::Calls)
        .collect();
    assert!(!call_refs.is_empty(), "Should have function call references");

    let type_refs: Vec<_> = result.references.iter()
        .filter(|r| r.ref_kind == local_codesearch::extractors::RefKind::Uses)
        .collect();
    assert!(!type_refs.is_empty(), "Should have type usage references");

    let imports: Vec<_> = result.references.iter()
        .filter(|r| r.ref_kind == local_codesearch::extractors::RefKind::Imports)
        .collect();
    assert!(!imports.is_empty(), "Should have import references");

    println!("Complex code extraction:");
    println!("  Entities: {}", result.entities.len());
    println!("  References: {}", result.references.len());
    println!("  Call references: {}", call_refs.len());
    println!("  Type references: {}", type_refs.len());
    println!("  Imports: {}", imports.len());

    Ok(())
}