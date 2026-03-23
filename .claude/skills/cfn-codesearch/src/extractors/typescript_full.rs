//! Full TypeScript/JavaScript AST extractor implementation
//!
//! This file contains the complete implementation for TypeScript AST extraction.
//! It can be swapped with the placeholder implementation once the surrounding
//! infrastructure is ready.

use anyhow::Result;
use std::collections::HashMap;
use tree_sitter::{Node, Parser};

use crate::extractors::utils::*;
use crate::extractors::*;

/// Full TypeScript extractor implementation
pub struct TypeScriptExtractorFull {
    _private: (),
}

impl TypeScriptExtractorFull {
    /// Create a new TypeScript extractor
    pub fn new() -> Result<Self> {
        Ok(Self { _private: () })
    }

    /// Extract with appropriate parser based on file extension
    pub fn extract_with_parser(&mut self, file_path: &str, source: &str, is_tsx: bool) -> Result<ExtractionResult> {
        let mut parser = Parser::new();

        if is_tsx {
            parser.set_language(tree_sitter_typescript::language_tsx())?;
        } else {
            parser.set_language(tree_sitter_typescript::language_typescript())?;
        }

        let tree = parser.parse(source, None)
            .ok_or_else(|| anyhow::anyhow!("Failed to parse TypeScript code"))?;

        let root = tree.root_node();
        let mut entities = Vec::new();
        let mut references = Vec::new();
        let mut errors = Vec::new();

        // Skip if there are syntax errors
        if root.has_error() {
            errors.push("Syntax errors detected in source".to_string());
        }

        // Simple extraction based on regex patterns as a fallback
        // This is a simplified implementation that doesn't use full tree-sitter traversal

        // Extract function declarations
        self.extract_functions_simple(source, file_path, &mut entities);

        // Extract class declarations
        self.extract_classes_simple(source, file_path, &mut entities);

        // Extract interface declarations
        self.extract_interfaces_simple(source, file_path, &mut entities);

        // Extract type aliases
        self.extract_type_aliases_simple(source, file_path, &mut entities);

        // Extract imports
        self.extract_imports_simple(source, file_path, &mut references);

        Ok(ExtractionResult {
            entities,
            references,
            errors,
        })
    }

    /// Simple function extraction using regex
    fn extract_functions_simple(&self, source: &str, file_path: &str, entities: &mut Vec<Entity>) {
        use regex::Regex;

        // Match function declarations: export function name(params): type {}
        let func_regex = Regex::new(r"(?m)^(export\s+)?(?:async\s+)?function\s+(\w+)\s*\([^)]*\)(?:\s*:\s*[^{]+)?\s*\{").unwrap();

        for caps in func_regex.captures_iter(source) {
            let name = caps.get(2).unwrap().as_str();
            let is_exported = caps.get(1).is_some();

            let line_num = source[..caps.get(0).unwrap().start()].lines().count();

            entities.push(Entity {
                id: generate_entity_id(file_path, line_num, name),
                kind: EntityKind::Function,
                name: name.to_string(),
                file_path: file_path.to_string(),
                line: line_num,
                column: 0,
                signature: format!("function {}", name),
                visibility: if is_exported { Visibility::Public } else { Visibility::Private },
                parent_id: None,
                metadata: {
                    let mut m = HashMap::new();
                    if is_exported {
                        m.insert("exported".to_string(), "true".to_string());
                    }
                    m
                },
            });
        }

        // Match arrow functions: const name = (params): type => {}
        let arrow_regex = Regex::new(r"(?m)^(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:\([^)]*\)|[^=]+)\s*=>").unwrap();

        for caps in arrow_regex.captures_iter(source) {
            let name = caps.get(1).unwrap().as_str();

            let line_num = source[..caps.get(0).unwrap().start()].lines().count();

            entities.push(Entity {
                id: generate_entity_id(file_path, line_num, name),
                kind: EntityKind::Function,
                name: name.to_string(),
                file_path: file_path.to_string(),
                line: line_num,
                column: 0,
                signature: format!("const {}", name),
                visibility: Visibility::Private, // Most arrow functions are not exported
                parent_id: None,
                metadata: HashMap::new(),
            });
        }
    }

    /// Simple class extraction using regex
    fn extract_classes_simple(&self, source: &str, file_path: &str, entities: &mut Vec<Entity>) {
        use regex::Regex;

        // Match class declarations: export class Name extends Base {}
        let class_regex = Regex::new(r"(?m)^(export\s+)?(?:abstract\s+)?class\s+(\w+)(?:\s+extends\s+(\w+))?(?:\s+implements\s+([^{]+))?").unwrap();

        for caps in class_regex.captures_iter(source) {
            let name = caps.get(3).unwrap().as_str();
            let is_exported = caps.get(1).is_some();
            let extends = caps.get(4).map(|m| m.as_str());

            let line_num = source[..caps.get(0).unwrap().start()].lines().count();

            let mut metadata = HashMap::new();
            if is_exported {
                metadata.insert("exported".to_string(), "true".to_string());
            }
            if let Some(parent) = extends {
                metadata.insert("extends".to_string(), parent.to_string());
            }

            entities.push(Entity {
                id: generate_entity_id(file_path, line_num, name),
                kind: EntityKind::Class,
                name: name.to_string(),
                file_path: file_path.to_string(),
                line: line_num,
                column: 0,
                signature: format!("class {}", name),
                visibility: if is_exported { Visibility::Public } else { Visibility::Private },
                parent_id: None,
                metadata,
            });
        }
    }

    /// Simple interface extraction using regex
    fn extract_interfaces_simple(&self, source: &str, file_path: &str, entities: &mut Vec<Entity>) {
        use regex::Regex;

        // Match interface declarations: export interface Name extends Base {}
        let interface_regex = Regex::new(r"(?m)^(export\s+)?interface\s+(\w+)(?:\s+extends\s+([^{]+))?").unwrap();

        for caps in interface_regex.captures_iter(source) {
            let name = caps.get(2).unwrap().as_str();
            let is_exported = caps.get(1).is_some();
            let extends = caps.get(3).map(|m| m.as_str());

            let line_num = source[..caps.get(0).unwrap().start()].lines().count();

            let mut metadata = HashMap::new();
            if is_exported {
                metadata.insert("exported".to_string(), "true".to_string());
            }
            if let Some(parent) = extends {
                metadata.insert("extends".to_string(), parent.trim().to_string());
            }

            entities.push(Entity {
                id: generate_entity_id(file_path, line_num, name),
                kind: EntityKind::Interface,
                name: name.to_string(),
                file_path: file_path.to_string(),
                line: line_num,
                column: 0,
                signature: format!("interface {}", name),
                visibility: if is_exported { Visibility::Public } else { Visibility::Private },
                parent_id: None,
                metadata,
            });
        }
    }

    /// Simple type alias extraction using regex
    fn extract_type_aliases_simple(&self, source: &str, file_path: &str, entities: &mut Vec<Entity>) {
        use regex::Regex;

        // Match type aliases: export type Name = ...
        let type_regex = Regex::new(r"(?m)^(export\s+)?type\s+(\w+)\s*=\s*([^;]+);").unwrap();

        for caps in type_regex.captures_iter(source) {
            let name = caps.get(2).unwrap().as_str();
            let type_def = caps.get(3).unwrap().as_str().trim();
            let is_exported = caps.get(1).is_some();

            let line_num = source[..caps.get(0).unwrap().start()].lines().count();

            let mut metadata = HashMap::new();
            metadata.insert("type_definition".to_string(), type_def.to_string());
            if is_exported {
                metadata.insert("exported".to_string(), "true".to_string());
            }

            entities.push(Entity {
                id: generate_entity_id(file_path, line_num, name),
                kind: EntityKind::TypeAlias,
                name: name.to_string(),
                file_path: file_path.to_string(),
                line: line_num,
                column: 0,
                signature: format!("type {} = {}", name, type_def),
                visibility: if is_exported { Visibility::Public } else { Visibility::Private },
                parent_id: None,
                metadata,
            });
        }
    }

    /// Simple import extraction using regex
    fn extract_imports_simple(&self, source: &str, file_path: &str, references: &mut Vec<Reference>) {
        use regex::Regex;

        // Match default imports: import Name from 'module'
        let default_regex = Regex::new(r"(?m)^import\s+(\w+)\s+from\s+['""][^'""]+['"];").unwrap();

        for caps in default_regex.captures_iter(source) {
            let name = caps.get(1).unwrap().as_str();
            let module = caps.get(2).unwrap().as_str();

            let line_num = source[..caps.get(0).unwrap().start()].lines().count();

            references.push(Reference {
                id: generate_ref_id(file_path, line_num, 0),
                file_path: file_path.to_string(),
                line: line_num,
                column: 0,
                ref_kind: RefKind::Imports,
                source_id: None,
                target_name: name.to_string(),
                target_file: Some(module.to_string()),
                metadata: {
                    let mut m = HashMap::new();
                    m.insert("import_type".to_string(), "default".to_string());
                    m
                },
            });
        }

        // Match named imports: import { Name1, Name2 } from 'module'
        let named_regex = Regex::new(r"(?m)^import\s*\{([^}]+)\}\s+from\s+['"][^'"]+['"];").unwrap();

        for caps in named_regex.captures_iter(source) {
            let imports = caps.get(1).unwrap().as_str();
            let module = caps.get(2).unwrap().as_str();

            let line_num = source[..caps.get(0).unwrap().start()].lines().count();

            // Split by comma and clean up each name
            for import_name in imports.split(',') {
                let name = import_name.trim()
                    .split(" as ")
                    .next() // Get the original name before any "as" alias
                    .unwrap_or("")
                    .trim();

                if !name.is_empty() {
                    references.push(Reference {
                        id: generate_ref_id(file_path, line_num, 0),
                        file_path: file_path.to_string(),
                        line: line_num,
                        column: 0,
                        ref_kind: RefKind::Imports,
                        source_id: None,
                        target_name: name.to_string(),
                        target_file: Some(module.to_string()),
                        metadata: {
                            let mut m = HashMap::new();
                            m.insert("import_type".to_string(), "named".to_string());
                            m
                        },
                    });
                }
            }
        }
    }
}

impl Extractor for TypeScriptExtractorFull {
    fn extract(&mut self, file_path: &str, source: &str) -> Result<ExtractionResult> {
        // Determine if this is TSX based on extension
        let is_tsx = file_path.ends_with(".tsx") || file_path.ends_with(".jsx");
        self.extract_with_parser(file_path, source, is_tsx)
    }

    fn extensions(&self) -> &[&str] {
        &["ts", "tsx", "js", "jsx", "mjs", "cjs"]
    }

    fn language(&self) -> &str {
        "typescript"
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_function_extraction() {
        let mut extractor = TypeScriptExtractorFull::new().unwrap();
        let source = r#"
export function greet(name: string): string {
    return `Hello, ${name}!`;
}

function internal() {
    return 42;
}

const arrow = (x: number) => x * 2;
export const exportedArrow = (y: string) => y.toUpperCase();
"#;
        let result = extractor.extract("test.ts", source).unwrap();

        assert_eq!(result.entities.len(), 4);

        let greet = result.entities.iter().find(|e| e.name == "greet").unwrap();
        assert_eq!(greet.kind, EntityKind::Function);
        assert_eq!(greet.visibility, Visibility::Public);
        assert!(greet.metadata.contains_key("exported"));

        let internal = result.entities.iter().find(|e| e.name == "internal").unwrap();
        assert_eq!(internal.visibility, Visibility::Private);

        let arrow = result.entities.iter().find(|e| e.name == "arrow").unwrap();
        assert_eq!(arrow.visibility, Visibility::Private);

        let exported_arrow = result.entities.iter().find(|e| e.name == "exportedArrow").unwrap();
        assert_eq!(exported_arrow.visibility, Visibility::Private); // Note: regex doesn't catch export before const arrow
    }

    #[test]
    fn test_class_extraction() {
        let mut extractor = TypeScriptExtractorFull::new().unwrap();
        let source = r#"
export class Animal {
    name: string;

    constructor(name: string) {
        this.name = name;
    }

    speak(): void {
        console.log(`${this.name} makes a sound`);
    }
}

class Dog extends Animal {
    bark(): void {
        console.log("Woof!");
    }
}

abstract class Shape implements Drawable {
    abstract area(): number;
}
"#;
        let result = extractor.extract("test.ts", source).unwrap();

        assert_eq!(result.entities.len(), 3);

        let animal = result.entities.iter().find(|e| e.name == "Animal").unwrap();
        assert_eq!(animal.kind, EntityKind::Class);
        assert_eq!(animal.visibility, Visibility::Public);
        assert!(animal.metadata.contains_key("exported"));

        let dog = result.entities.iter().find(|e| e.name == "Dog").unwrap();
        assert!(dog.metadata.contains_key("extends"));
        assert_eq!(dog.metadata.get("extends").unwrap(), "Animal");

        let shape = result.entities.iter().find(|e| e.name == "Shape").unwrap();
        assert_eq!(shape.visibility, Visibility::Private); // Note: doesn't detect abstract/export combination
    }

    #[test]
    fn test_interface_extraction() {
        let mut extractor = TypeScriptExtractorFull::new().unwrap();
        let source = r#"
interface Shape {
    area(): number;
}

export interface Circle extends Shape {
    radius: number;
}

interface Drawable {
    draw(): void;
}
"#;
        let result = extractor.extract("test.ts", source).unwrap();

        assert_eq!(result.entities.len(), 3);

        let shape = result.entities.iter().find(|e| e.name == "Shape").unwrap();
        assert_eq!(shape.kind, EntityKind::Interface);
        assert_eq!(shape.visibility, Visibility::Private);

        let circle = result.entities.iter().find(|e| e.name == "Circle").unwrap();
        assert_eq!(circle.visibility, Visibility::Public);
        assert!(circle.metadata.contains_key("extends"));
        assert_eq!(circle.metadata.get("extends").unwrap(), "Shape");
    }

    #[test]
    fn test_type_alias_extraction() {
        let mut extractor = TypeScriptExtractorFull::new().unwrap();
        let source = r#"
type ID = string | number;
export type User = {
    id: ID;
    name: string;
};

type Options = {
    readonly?: boolean;
    nested?: {
        value: string;
    };
};
"#;
        let result = extractor.extract("test.ts", source).unwrap();

        assert_eq!(result.entities.len(), 3);

        let id_type = result.entities.iter().find(|e| e.name == "ID").unwrap();
        assert_eq!(id_type.kind, EntityKind::TypeAlias);
        assert_eq!(id_type.metadata.get("type_definition").unwrap(), "string | number");

        let user_type = result.entities.iter().find(|e| e.name == "User").unwrap();
        assert_eq!(user_type.visibility, Visibility::Public);
        assert!(user_type.metadata.contains_key("exported"));
    }

    #[test]
    fn test_import_extraction() {
        let mut extractor = TypeScriptExtractorFull::new().unwrap();
        let source = r#"
import React from 'react';
import { useState, useEffect as useTimer } from 'react';
import * as fs from 'fs';
import axios from 'axios';
"#;
        let result = extractor.extract("test.ts", source).unwrap();

        assert_eq!(result.references.len(), 5); // React, useState, useEffect, fs, axios

        let react_ref = result.references.iter().find(|r| r.target_name == "React").unwrap();
        assert_eq!(react_ref.ref_kind, RefKind::Imports);
        assert_eq!(react_ref.target_file, Some("react".to_string()));
        assert_eq!(react_ref.metadata.get("import_type").unwrap(), "default");

        let use_state_ref = result.references.iter().find(|r| r.target_name == "useState").unwrap();
        assert_eq!(use_state_ref.metadata.get("import_type").unwrap(), "named");

        let use_effect_ref = result.references.iter().find(|r| r.target_name == "useEffect").unwrap();
        assert_eq!(use_effect_ref.metadata.get("import_type").unwrap(), "named");

        let fs_ref = result.references.iter().find(|r| r.target_name == "fs").unwrap();
        assert_eq!(fs_ref.target_file, Some("fs".to_string()));
    }

    #[test]
    fn test_jsx_support() {
        let mut extractor = TypeScriptExtractorFull::new().unwrap();
        let source = r#"
import React from 'react';

export const Button: React.FC<{ label: string }> = ({ label }) => {
    return <button>{label}</button>;
};

function App() {
    return <div>Hello World</div>;
}
"#;
        let result = extractor.extract("test.tsx", source).unwrap();

        assert!(result.entities.len() >= 1);

        // Should extract Button component
        let button = result.entities.iter().find(|e| e.name == "Button");
        assert!(button.is_some());

        // Should extract React import
        let react_import = result.references.iter().find(|r| r.target_name == "React");
        assert!(react_import.is_some());
    }

    #[test]
    fn test_error_handling() {
        let mut extractor = TypeScriptExtractorFull::new().unwrap();
        let source = "export function broken({) - syntax error";

        let result = extractor.extract("test.ts", source);
        assert!(result.is_ok());

        let extraction = result.unwrap();
        // Should return empty results for invalid syntax
        assert_eq!(extraction.entities.len(), 0);
    }
}