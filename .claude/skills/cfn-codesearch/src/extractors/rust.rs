//! Rust AST extractor implementation
//!
//! Extracts entities and references from Rust source code using tree-sitter-rust.

use anyhow::{Result, anyhow};
use crate::extractors::*;
use tree_sitter::{Parser, Node};

/// Rust extractor implementation
pub struct RustExtractor {
    parser: Parser,
}

impl Clone for RustExtractor {
    fn clone(&self) -> Self {
        // Create a new parser instance since tree_sitter::Parser doesn't implement Clone
        let mut parser = Parser::new();
        // Note: we can't recover the language from the parser, so we set it again
        parser.set_language(tree_sitter_rust::language()).ok();
        Self { parser }
    }
}

impl RustExtractor {
    /// Create a new Rust extractor
    pub fn new() -> Result<Self> {
        let mut parser = Parser::new();
        parser.set_language(tree_sitter_rust::language())?;

        Ok(Self { parser })
    }

    /// Extract function entity
    fn extract_function(&self, node: &Node, source: &str, file_path: &str) -> Option<Entity> {
        if node.kind() != "function_item" {
            return None;
        }

        let name = node.child_by_field_name("name")?;
        let name_text = utils::node_text(&name, source);

        let signature = source[node.start_byte()..node.end_byte()].to_string();

        let visibility = if utils::extract_visibility(node, source, Visibility::Private) == Visibility::Public {
            Visibility::Public
        } else {
            Visibility::Private
        };

        Some(Entity {
            id: utils::generate_entity_id(file_path, node.start_position().row, name_text),
            kind: EntityKind::Function,
            name: name_text.to_string(),
            file_path: file_path.to_string(),
            line: node.start_position().row,
            column: node.start_position().column,
            signature,
            visibility,
            parent_id: None,
            metadata: {
                let mut meta = std::collections::HashMap::new();

                // Extract parameters
                if let Some(params) = node.child_by_field_name("parameters") {
                    let param_list = utils::extract_parameters(&params, source);
                    let param_names: Vec<String> = param_list.iter().map(|(name, _)| name.clone()).collect();
                    meta.insert("parameters".to_string(), param_names.join(", "));
                }

                // Extract return type
                if let Some(ret_type) = node.child_by_field_name("return_type") {
                    if let Some(type_text) = utils::extract_type_annotation(&ret_type, source) {
                        meta.insert("return_type".to_string(), type_text);
                    }
                }

                meta
            },
        })
    }

    /// Extract struct entity
    fn extract_struct(&self, node: &Node, source: &str, file_path: &str) -> Option<Entity> {
        if node.kind() != "struct_item" {
            return None;
        }

        let name = node.child_by_field_name("name")?;
        let name_text = utils::node_text(&name, source);

        let signature = source[node.start_byte()..node.end_byte()].to_string();

        let visibility = if utils::extract_visibility(node, source, Visibility::Private) == Visibility::Public {
            Visibility::Public
        } else {
            Visibility::Private
        };

        Some(Entity {
            id: utils::generate_entity_id(file_path, node.start_position().row, name_text),
            kind: EntityKind::Struct,
            name: name_text.to_string(),
            file_path: file_path.to_string(),
            line: node.start_position().row,
            column: node.start_position().column,
            signature,
            visibility,
            parent_id: None,
            metadata: {
                let mut meta = std::collections::HashMap::new();

                // Extract fields
                if let Some(field_list) = node.child_by_field_name("body") {
                    let mut cursor = field_list.walk();
                    let mut field_num = 0;
                    for child in field_list.named_children(&mut cursor) {
                        if child.kind() == "field_declaration" {
                            if let Some(field_name) = utils::extract_name(&child, source) {
                                if let Some(field_type) = utils::extract_type_annotation(&child, source) {
                                    meta.insert(format!("field_{}", field_num),
                                            format!("{}: {}", field_name, field_type));
                                    field_num += 1;
                                }
                            }
                        }
                    }
                }

                meta
            },
        })
    }

    /// Extract trait entity
    fn extract_trait(&self, node: &Node, source: &str, file_path: &str) -> Option<Entity> {
        if node.kind() != "trait_item" {
            return None;
        }

        let name = node.child_by_field_name("name")?;
        let name_text = utils::node_text(&name, source);

        let signature = source[node.start_byte()..node.end_byte()].to_string();

        let visibility = if utils::extract_visibility(node, source, Visibility::Private) == Visibility::Public {
            Visibility::Public
        } else {
            Visibility::Private
        };

        Some(Entity {
            id: utils::generate_entity_id(file_path, node.start_position().row, name_text),
            kind: EntityKind::Trait,
            name: name_text.to_string(),
            file_path: file_path.to_string(),
            line: node.start_position().row,
            column: node.start_position().column,
            signature,
            visibility,
            parent_id: None,
            metadata: std::collections::HashMap::new(),
        })
    }

    /// Extract impl block
    fn extract_impl(&self, node: &Node, source: &str, file_path: &str) -> Option<Entity> {
        if node.kind() != "impl_item" {
            return None;
        }

        let type_name = node.child_by_field_name("type")?;
        let type_text = utils::node_text(&type_name, source);

        let signature = source[node.start_byte()..node.end_byte()].to_string();

        Some(Entity {
            id: utils::generate_entity_id(file_path, node.start_position().row, type_text),
            kind: EntityKind::Class, // Use Class for impl blocks
            name: type_text.to_string(),
            file_path: file_path.to_string(),
            line: node.start_position().row,
            column: node.start_position().column,
            signature,
            visibility: Visibility::Public,
            parent_id: None,
            metadata: {
                let mut meta = std::collections::HashMap::new();

                // Check if it's a trait implementation
                if let Some(trait_type) = node.child_by_field_name("trait") {
                    let trait_text = utils::node_text(&trait_type, source);
                    meta.insert("trait".to_string(), trait_text.to_string());
                }

                meta
            },
        })
    }

    /// Extract enum entity
    fn extract_enum(&self, node: &Node, source: &str, file_path: &str) -> Option<Entity> {
        if node.kind() != "enum_item" {
            return None;
        }

        let name = node.child_by_field_name("name")?;
        let name_text = utils::node_text(&name, source);

        let signature = source[node.start_byte()..node.end_byte()].to_string();

        let visibility = if utils::extract_visibility(node, source, Visibility::Private) == Visibility::Public {
            Visibility::Public
        } else {
            Visibility::Private
        };

        Some(Entity {
            id: utils::generate_entity_id(file_path, node.start_position().row, name_text),
            kind: EntityKind::Enum,
            name: name_text.to_string(),
            file_path: file_path.to_string(),
            line: node.start_position().row,
            column: node.start_position().column,
            signature,
            visibility,
            parent_id: None,
            metadata: std::collections::HashMap::new(),
        })
    }

    /// Extract references (function calls, type usage, etc.)
    fn extract_references(&self, node: &Node, source: &str, file_path: &str) -> Vec<Reference> {
        let mut references = Vec::new();

        match node.kind() {
            "call_expression" => {
                // Extract function call reference
                if let Some(func_node) = node.child_by_field_name("function") {
                    let func_text = utils::node_text(&func_node, source);

                    // Handle simple identifiers
                    if func_node.kind() == "identifier" {
                        references.push(Reference {
                            id: utils::generate_ref_id(file_path, node.start_position().row, node.start_position().column),
                            file_path: file_path.to_string(),
                            line: node.start_position().row,
                            column: node.start_position().column,
                            ref_kind: RefKind::Calls,
                            source_id: None,
                            target_name: func_text.to_string(),
                            target_file: None,
                            metadata: std::collections::HashMap::new(),
                        });
                    }
                    // Handle field expressions (e.g., module::function)
                    else if func_node.kind() == "field_expression" {
                        if let Some(field_node) = func_node.child_by_field_name("field") {
                            let field_text = utils::node_text(&field_node, source);
                            references.push(Reference {
                                id: utils::generate_ref_id(file_path, node.start_position().row, node.start_position().column),
                                file_path: file_path.to_string(),
                                line: node.start_position().row,
                                column: node.start_position().column,
                                ref_kind: RefKind::Calls,
                                source_id: None,
                                target_name: field_text.to_string(),
                                target_file: None,
                                metadata: std::collections::HashMap::new(),
                            });
                        }
                    }
                }
            }

            "type_identifier" => {
                // Extract type usage
                let type_text = utils::node_text(&node, source);
                references.push(Reference {
                    id: utils::generate_ref_id(file_path, node.start_position().row, node.start_position().column),
                    file_path: file_path.to_string(),
                    line: node.start_position().row,
                    column: node.start_position().column,
                    ref_kind: RefKind::Uses,
                    source_id: None,
                    target_name: type_text.to_string(),
                    target_file: None,
                    metadata: std::collections::HashMap::new(),
                });
            }

            "use_declaration" => {
                // Extract import reference
                if let Some(path_node) = node.child_by_field_name("path") {
                    let path_text = utils::node_text(&path_node, source);

                    // Get the last segment of the path
                    let segments: Vec<&str> = path_text.split("::").collect();
                    if let Some(last_segment) = segments.last() {
                        references.push(Reference {
                            id: utils::generate_ref_id(file_path, node.start_position().row, node.start_position().column),
                            file_path: file_path.to_string(),
                            line: node.start_position().row,
                            column: node.start_position().column,
                            ref_kind: RefKind::Imports,
                            source_id: None,
                            target_name: last_segment.to_string(),
                            target_file: None,
                            metadata: {
                                let mut meta = std::collections::HashMap::new();
                                meta.insert("full_path".to_string(), path_text.to_string());
                                meta
                            },
                        });
                    }
                }
            }

            _ => {}
        }

        // Recursively check children
        let mut cursor = node.walk();
        for child in node.children(&mut cursor) {
            references.extend(self.extract_references(&child, source, file_path));
        }

        references
    }
}

impl Extractor for RustExtractor {
    fn extract(&mut self, file_path: &str, source: &str) -> Result<ExtractionResult> {
        let tree = self.parser.parse(source, None)
            .ok_or_else(|| anyhow!("Failed to parse Rust code"))?;

        let root = tree.root_node();
        let mut entities = Vec::new();
        let mut references = Vec::new();
        let mut errors = Vec::new();

        // Walk the tree and extract entities
        let mut cursor = root.walk();
        for node in root.children(&mut cursor) {
            match node.kind() {
                "function_item" => {
                    if let Some(entity) = self.extract_function(&node, source, file_path) {
                        entities.push(entity);
                    }
                }
                "struct_item" => {
                    if let Some(entity) = self.extract_struct(&node, source, file_path) {
                        entities.push(entity);
                    }
                }
                "trait_item" => {
                    if let Some(entity) = self.extract_trait(&node, source, file_path) {
                        entities.push(entity);
                    }
                }
                "impl_item" => {
                    if let Some(entity) = self.extract_impl(&node, source, file_path) {
                        entities.push(entity);
                    }
                }
                "enum_item" => {
                    if let Some(entity) = self.extract_enum(&node, source, file_path) {
                        entities.push(entity);
                    }
                }
                "source_file" => {
                    // Recursively process the source file
                    let mut inner_cursor = node.walk();
                    for child in node.named_children(&mut inner_cursor) {
                        match child.kind() {
                            "function_item" => {
                                if let Some(entity) = self.extract_function(&child, source, file_path) {
                                    entities.push(entity);
                                }
                            }
                            "struct_item" => {
                                if let Some(entity) = self.extract_struct(&child, source, file_path) {
                                    entities.push(entity);
                                }
                            }
                            "trait_item" => {
                                if let Some(entity) = self.extract_trait(&child, source, file_path) {
                                    entities.push(entity);
                                }
                            }
                            "impl_item" => {
                                if let Some(entity) = self.extract_impl(&child, source, file_path) {
                                    entities.push(entity);
                                }
                            }
                            "enum_item" => {
                                if let Some(entity) = self.extract_enum(&child, source, file_path) {
                                    entities.push(entity);
                                }
                            }
                            _ => {}
                        }
                    }
                }
                _ => {}
            }
        }

        // Extract all references
        references = self.extract_references(&root, source, file_path);

        Ok(ExtractionResult {
            entities,
            references,
            errors,
        })
    }

    fn extensions(&self) -> &[&str] {
        &["rs"]
    }

    fn language(&self) -> &str {
        "rust"
    }
}