//! Python AST extractor implementation
//!
//! Extracts entities and references from Python source code using tree-sitter-python.

use anyhow::{Result, anyhow};
use crate::extractors::*;
use tree_sitter::{Parser, Node};

/// Python extractor implementation
pub struct PythonExtractor {
    parser: Parser,
}

impl Clone for PythonExtractor {
    fn clone(&self) -> Self {
        let mut parser = Parser::new();
        parser.set_language(tree_sitter_python::language()).ok();
        Self { parser }
    }
}

impl PythonExtractor {
    /// Create a new Python extractor
    pub fn new() -> Result<Self> {
        let mut parser = Parser::new();
        parser.set_language(tree_sitter_python::language())?;
        Ok(Self { parser })
    }

    /// Extract a function or async function entity.
    /// `parent_class_name` is Some when this function is a method inside a class body.
    fn extract_function(
        &self,
        node: &Node,
        source: &str,
        file_path: &str,
        parent_class_name: Option<&str>,
    ) -> Option<Entity> {
        // Accept function_definition directly, or decorated_definition wrapping one
        let func_node = match node.kind() {
            "function_definition" => *node,
            "decorated_definition" => {
                // Find the inner function_definition
                let mut cursor = node.walk();
                let inner = node.named_children(&mut cursor)
                    .find(|c| c.kind() == "function_definition")?;
                inner
            }
            _ => return None,
        };

        let name_node = func_node.child_by_field_name("name")?;
        let name_text = utils::node_text(&name_node, source);

        // Build signature: first line of the function definition
        let full_src = &source[func_node.start_byte()..func_node.end_byte()];
        let signature = full_src.lines().next().unwrap_or(full_src).to_string();

        // Determine kind: method vs function
        let kind = if parent_class_name.is_some() {
            EntityKind::Method
        } else {
            EntityKind::Function
        };

        // Visibility: Python convention — names starting with _ are private
        let visibility = if name_text.starts_with('_') {
            Visibility::Private
        } else {
            Visibility::Public
        };

        let mut meta = std::collections::HashMap::new();

        // Extract parameters (skip self/cls for methods)
        if let Some(params_node) = func_node.child_by_field_name("parameters") {
            let params_src = &source[params_node.start_byte()..params_node.end_byte()];
            meta.insert("parameters".to_string(), params_src.to_string());
        }

        // Capture docstring if present (first statement is expression_statement containing string)
        if let Some(body) = func_node.child_by_field_name("body") {
            if let Some(docstring) = extract_docstring(&body, source) {
                meta.insert("docstring".to_string(), docstring);
            }
        }

        // Check for async keyword
        if is_async_function(&func_node, source) {
            meta.insert("async".to_string(), "true".to_string());
        }

        if let Some(class_name) = parent_class_name {
            meta.insert("class".to_string(), class_name.to_string());
        }

        Some(Entity {
            id: utils::generate_entity_id(file_path, func_node.start_position().row, name_text),
            kind,
            name: name_text.to_string(),
            file_path: file_path.to_string(),
            line: func_node.start_position().row,
            column: func_node.start_position().column,
            signature,
            visibility,
            parent_id: None,
            metadata: meta,
        })
    }

    /// Extract a class entity and its methods.
    fn extract_class(
        &self,
        node: &Node,
        source: &str,
        file_path: &str,
    ) -> Vec<Entity> {
        // Accept class_definition directly, or decorated_definition wrapping one
        let class_node = match node.kind() {
            "class_definition" => *node,
            "decorated_definition" => {
                let mut cursor = node.walk();
                let inner = node.named_children(&mut cursor)
                    .find(|c| c.kind() == "class_definition");
                match inner {
                    Some(n) => n,
                    None => return vec![],
                }
            }
            _ => return vec![],
        };

        let name_node = match class_node.child_by_field_name("name") {
            Some(n) => n,
            None => return vec![],
        };
        let class_name = utils::node_text(&name_node, source);

        let full_src = &source[class_node.start_byte()..class_node.end_byte()];
        let signature = full_src.lines().next().unwrap_or(full_src).to_string();

        let mut meta = std::collections::HashMap::new();

        // Capture base classes
        if let Some(args_node) = class_node.child_by_field_name("superclasses") {
            let bases_src = &source[args_node.start_byte()..args_node.end_byte()];
            meta.insert("bases".to_string(), bases_src.to_string());
        }

        // Capture class-level docstring
        if let Some(body) = class_node.child_by_field_name("body") {
            if let Some(docstring) = extract_docstring(&body, source) {
                meta.insert("docstring".to_string(), docstring);
            }
        }

        let class_entity = Entity {
            id: utils::generate_entity_id(file_path, class_node.start_position().row, class_name),
            kind: EntityKind::Class,
            name: class_name.to_string(),
            file_path: file_path.to_string(),
            line: class_node.start_position().row,
            column: class_node.start_position().column,
            signature,
            visibility: if class_name.starts_with('_') { Visibility::Private } else { Visibility::Public },
            parent_id: None,
            metadata: meta,
        };

        let mut entities = vec![class_entity];

        // Extract methods from the class body
        if let Some(body) = class_node.child_by_field_name("body") {
            let mut cursor = body.walk();
            for child in body.named_children(&mut cursor) {
                match child.kind() {
                    "function_definition" | "decorated_definition" => {
                        if let Some(method) = self.extract_function(&child, source, file_path, Some(class_name)) {
                            entities.push(method);
                        }
                    }
                    _ => {}
                }
            }
        }

        entities
    }

    /// Extract module-level assignments that look like constants (ALL_CAPS names).
    fn extract_constants(
        &self,
        node: &Node,
        source: &str,
        file_path: &str,
    ) -> Vec<Entity> {
        let mut entities = Vec::new();

        if node.kind() != "expression_statement" {
            return entities;
        }

        // Look for assignment inside expression_statement
        let mut cursor = node.walk();
        for child in node.named_children(&mut cursor) {
            if child.kind() == "assignment" {
                if let Some(left) = child.child_by_field_name("left") {
                    let name_text = utils::node_text(&left, source);
                    // Only treat ALL_CAPS identifiers as constants
                    if left.kind() == "identifier"
                        && name_text.chars().all(|c| c.is_ascii_uppercase() || c == '_' || c.is_ascii_digit())
                        && !name_text.is_empty()
                    {
                        let signature = &source[child.start_byte()..child.end_byte()];
                        let first_line = signature.lines().next().unwrap_or(signature).to_string();
                        entities.push(Entity {
                            id: utils::generate_entity_id(file_path, child.start_position().row, name_text),
                            kind: EntityKind::Constant,
                            name: name_text.to_string(),
                            file_path: file_path.to_string(),
                            line: child.start_position().row,
                            column: child.start_position().column,
                            signature: first_line,
                            visibility: Visibility::Public,
                            parent_id: None,
                            metadata: std::collections::HashMap::new(),
                        });
                    }
                }
            }
        }

        entities
    }

    /// Extract import references from import statements.
    fn extract_imports(&self, node: &Node, source: &str, file_path: &str) -> Vec<Reference> {
        let mut refs = Vec::new();

        match node.kind() {
            "import_statement" => {
                // import foo, bar
                let mut cursor = node.walk();
                for child in node.named_children(&mut cursor) {
                    if child.kind() == "dotted_name" || child.kind() == "aliased_import" {
                        let name_text = utils::node_text(&child, source);
                        refs.push(Reference {
                            id: utils::generate_ref_id(file_path, node.start_position().row, node.start_position().column),
                            file_path: file_path.to_string(),
                            line: node.start_position().row,
                            column: node.start_position().column,
                            ref_kind: RefKind::Imports,
                            source_id: None,
                            target_name: name_text.to_string(),
                            target_file: None,
                            metadata: std::collections::HashMap::new(),
                        });
                    }
                }
            }
            "import_from_statement" => {
                // from foo import bar, baz
                let module_name = node.child_by_field_name("module_name")
                    .map(|n| utils::node_text(&n, source).to_string())
                    .unwrap_or_default();

                let mut cursor = node.walk();
                for child in node.named_children(&mut cursor) {
                    if child.kind() == "dotted_name" || child.kind() == "aliased_import" {
                        let name_text = utils::node_text(&child, source);
                        let mut meta = std::collections::HashMap::new();
                        if !module_name.is_empty() {
                            meta.insert("module".to_string(), module_name.clone());
                        }
                        refs.push(Reference {
                            id: utils::generate_ref_id(file_path, child.start_position().row, child.start_position().column),
                            file_path: file_path.to_string(),
                            line: child.start_position().row,
                            column: child.start_position().column,
                            ref_kind: RefKind::Imports,
                            source_id: None,
                            target_name: name_text.to_string(),
                            target_file: None,
                            metadata: meta,
                        });
                    }
                }
            }
            _ => {}
        }

        refs
    }

    /// Walk the tree extracting call references.
    fn extract_call_references(&self, node: &Node, source: &str, file_path: &str) -> Vec<Reference> {
        let mut refs = Vec::new();

        if node.kind() == "call" {
            if let Some(func_node) = node.child_by_field_name("function") {
                let func_text = utils::node_text(&func_node, source);
                // Extract simple calls and attribute access calls (obj.method())
                let target = if func_node.kind() == "attribute" {
                    func_node.child_by_field_name("attribute")
                        .map(|n| utils::node_text(&n, source).to_string())
                        .unwrap_or_else(|| func_text.to_string())
                } else {
                    func_text.to_string()
                };

                refs.push(Reference {
                    id: utils::generate_ref_id(file_path, node.start_position().row, node.start_position().column),
                    file_path: file_path.to_string(),
                    line: node.start_position().row,
                    column: node.start_position().column,
                    ref_kind: RefKind::Calls,
                    source_id: None,
                    target_name: target,
                    target_file: None,
                    metadata: std::collections::HashMap::new(),
                });
            }
        }

        // Recurse into children
        let mut cursor = node.walk();
        for child in node.children(&mut cursor) {
            refs.extend(self.extract_call_references(&child, source, file_path));
        }

        refs
    }
}

/// Check whether a function_definition node has the `async` keyword.
fn is_async_function(node: &Node, source: &str) -> bool {
    // In tree-sitter-python the async keyword appears as a named child of type "async"
    // before the "def" keyword in async function definitions.
    let mut cursor = node.walk();
    for child in node.children(&mut cursor) {
        if child.kind() == "async" || utils::node_text(&child, source) == "async" {
            return true;
        }
    }
    false
}

/// Extract the first docstring from a block/suite node (Python body).
/// Returns the raw string literal text (without surrounding quotes).
fn extract_docstring(body_node: &Node, source: &str) -> Option<String> {
    let mut cursor = body_node.walk();
    for child in body_node.named_children(&mut cursor) {
        if child.kind() == "expression_statement" {
            let mut inner_cursor = child.walk();
            for inner in child.named_children(&mut inner_cursor) {
                if inner.kind() == "string" {
                    let raw = utils::node_text(&inner, source);
                    // Strip surrounding triple or single quotes
                    let stripped = raw
                        .trim_start_matches("\"\"\"")
                        .trim_end_matches("\"\"\"")
                        .trim_start_matches("'''")
                        .trim_end_matches("'''")
                        .trim_start_matches('"')
                        .trim_end_matches('"')
                        .trim_start_matches('\'')
                        .trim_end_matches('\'')
                        .trim();
                    return Some(stripped.to_string());
                }
            }
        }
        // The docstring must be the first statement; stop after first non-trivial child
        break;
    }
    None
}

impl Extractor for PythonExtractor {
    fn extract(&mut self, file_path: &str, source: &str) -> Result<ExtractionResult> {
        let tree = self.parser.parse(source, None)
            .ok_or_else(|| anyhow!("Failed to parse Python code"))?;

        let root = tree.root_node();
        let mut entities = Vec::new();
        let mut references = Vec::new();
        let mut errors = Vec::new();

        if root.has_error() {
            errors.push("Syntax errors detected in source".to_string());
        }

        // Walk top-level nodes
        let mut cursor = root.walk();
        for node in root.named_children(&mut cursor) {
            match node.kind() {
                "function_definition" | "decorated_definition" => {
                    // Top-level function (may be decorated)
                    if let Some(entity) = self.extract_function(&node, source, file_path, None) {
                        entities.push(entity);
                    }
                    // If decorated_definition wraps a class, handle it too
                    if node.kind() == "decorated_definition" {
                        let mut inner_cursor = node.walk();
                        let has_class = node.named_children(&mut inner_cursor)
                            .any(|c| c.kind() == "class_definition");
                        if has_class {
                            entities.extend(self.extract_class(&node, source, file_path));
                        }
                    }
                }
                "class_definition" => {
                    entities.extend(self.extract_class(&node, source, file_path));
                }
                "expression_statement" => {
                    entities.extend(self.extract_constants(&node, source, file_path));
                }
                "import_statement" | "import_from_statement" => {
                    references.extend(self.extract_imports(&node, source, file_path));
                }
                _ => {}
            }
        }

        // Extract call references from entire tree
        references.extend(self.extract_call_references(&root, source, file_path));

        Ok(ExtractionResult {
            entities,
            references,
            errors,
        })
    }

    fn extensions(&self) -> &[&str] {
        &["py"]
    }

    fn language(&self) -> &str {
        "python"
    }
}
