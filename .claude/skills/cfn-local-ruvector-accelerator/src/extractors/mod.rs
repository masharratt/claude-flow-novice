//! AST extractors for different programming languages
//!
//! This module contains language-specific extractors that parse source code
//! using tree-sitter and extract structured information about entities and references.

use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;


pub mod rust;
pub mod typescript;
// pub mod typescript_full; // Temporarily disabled due to regex issues

/// Create a Rust extractor instance
pub fn create_rust_extractor() -> Result<rust::RustExtractor> {
    rust::RustExtractor::new()
}

/// Create a TypeScript extractor instance
pub fn create_typescript_extractor() -> Result<typescript::TypeScriptExtractor> {
    typescript::TypeScriptExtractor::new()
}

/// Common entity kinds across languages
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum EntityKind {
    // Functions
    Function,
    Method,
    Constructor,
    Getter,
    Setter,

    // Types
    Class,
    Interface,
    Struct,
    Enum,
    TypeAlias,
    Trait,

    // Modules
    Module,
    Namespace,

    // Variables
    Variable,
    Constant,
    Parameter,

    // Other
    Import,
}

impl EntityKind {
    pub fn as_str(&self) -> &'static str {
        match self {
            EntityKind::Function => "function",
            EntityKind::Method => "method",
            EntityKind::Constructor => "constructor",
            EntityKind::Getter => "getter",
            EntityKind::Setter => "setter",
            EntityKind::Class => "class",
            EntityKind::Interface => "interface",
            EntityKind::Struct => "struct",
            EntityKind::Enum => "enum",
            EntityKind::TypeAlias => "typealias",
            EntityKind::Trait => "trait",
            EntityKind::Module => "module",
            EntityKind::Namespace => "namespace",
            EntityKind::Variable => "variable",
            EntityKind::Constant => "constant",
            EntityKind::Parameter => "parameter",
            EntityKind::Import => "import",
        }
    }
}

/// Reference kinds between entities
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum RefKind {
    Calls,           // Function calls
    Extends,         // Class inheritance
    Implements,      // Interface implementation
    Imports,         // Import statements
    Uses,            // Type usage
    Instantiates,    // Class instantiation (new)
    Overrides,       // Method overriding
    Reads,           // Variable read
    Writes,          // Variable write
}

/// Visibility levels
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum Visibility {
    Public,
    Private,
    Protected,
    Internal,
    FilePrivate,
}

/// A extracted code entity
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Entity {
    pub id: String,              // Unique identifier
    pub kind: EntityKind,        // Type of entity
    pub name: String,            // Entity name
    pub file_path: String,       // Source file path
    pub line: usize,             // Line number (0-indexed)
    pub column: usize,           // Column number (0-indexed)
    pub signature: String,       // Full signature including params/types
    pub visibility: Visibility,  // Visibility level
    pub parent_id: Option<String>, // Parent entity if nested
    pub metadata: HashMap<String, String>, // Language-specific metadata
}

/// A reference between entities
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Reference {
    pub id: String,              // Unique identifier
    pub file_path: String,       // Source file path
    pub line: usize,             // Line number (0-indexed)
    pub column: usize,           // Column number (0-indexed)
    pub ref_kind: RefKind,       // Type of reference
    pub source_id: Option<String>, // Source entity (if applicable)
    pub target_name: String,     // Target entity name
    pub target_file: Option<String>, // Target file if known
    pub metadata: HashMap<String, String>, // Additional context
}

/// Result of extraction
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExtractionResult {
    pub entities: Vec<Entity>,
    pub references: Vec<Reference>,
    pub errors: Vec<String>,
}

/// Trait for language-specific extractors
pub trait Extractor: Send + Sync {
    /// Extract entities and references from source code
    fn extract(&mut self, file_path: &str, source: &str) -> Result<ExtractionResult>;

    /// Get the file extensions this extractor handles
    fn extensions(&self) -> &[&str];

    /// Get the language name
    fn language(&self) -> &str;
}

/// Utility functions for extractors
pub mod utils {
    use super::*;
    
use tree_sitter::Node;

    /// Get the text content of a node
    pub fn node_text<'a>(node: &Node, source: &'a str) -> &'a str {
        &source[node.start_byte()..node.end_byte()]
    }

    /// Get the text of a named child by field name
    pub fn child_text<'a>(node: &Node, source: &'a str, field: &str) -> Option<&'a str> {
        node.child_by_field_name(field)
            .map(|child| node_text(&child, source))
    }

    /// Extract identifier name from node
    pub fn extract_name(node: &Node, source: &str) -> Option<String> {
        let name_node = node.child_by_field_name("name")
            .or_else(|| node.child_by_field_name("property"))
            .or_else(|| node.child_by_field_name("binding"));

        name_node.map(|n| node_text(&n, source).trim().to_string())
    }

    /// Extract visibility from modifiers
    pub fn extract_visibility(node: &Node, _source: &str, default: Visibility) -> Visibility {
        // Check for visibility modifiers in children
        let mut cursor = node.walk();
        for child in node.children(&mut cursor) {
            match child.kind() {
                "public" | "export" => return Visibility::Public,
                "private" => return Visibility::Private,
                "protected" => return Visibility::Protected,
                "internal" => return Visibility::Internal,
                _ => {}
            }
        }
        default
    }

    /// Generate unique ID for entity
    pub fn generate_entity_id(file_path: &str, line: usize, name: &str) -> String {
        format!("{}:{}:{}", file_path.replace(':', "_"), line, name)
    }

    /// Generate unique ID for reference
    pub fn generate_ref_id(file_path: &str, line: usize, column: usize) -> String {
        format!("ref:{}:{}:{}", file_path.replace(':', "_"), line, column)
    }

    /// Check if node is exported
    pub fn is_exported(node: &Node) -> bool {
        let mut cursor = node.walk();
        for child in node.children(&mut cursor) {
            if child.kind() == "export" || child.kind() == "export_statement" {
                return true;
            }
        }
        false
    }

    /// Extract type annotation
    pub fn extract_type_annotation(node: &Node, source: &str) -> Option<String> {
        if let Some(type_node) = node.child_by_field_name("type") {
            Some(node_text(&type_node, source).trim().to_string())
        } else {
            None
        }
    }

    /// Extract parameters from a parameter list
    pub fn extract_parameters(node: &Node, source: &str) -> Vec<(String, Option<String>)> {
        let mut params = Vec::new();

        if let Some(param_list) = node.child_by_field_name("parameters") {
            let mut cursor = param_list.walk();
            for child in param_list.named_children(&mut cursor) {
                if child.kind() == "required_parameter"
                   || child.kind() == "optional_parameter"
                   || child.kind() == "rest_parameter"
                   || child.kind() == "parameter" {
                    if let Some(name) = extract_name(&child, source) {
                        let type_annot = extract_type_annotation(&child, source);
                        params.push((name, type_annot));
                    }
                }
            }
        }

        params
    }
}
