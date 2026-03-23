//! Text-based fallback indexer for non-code files
//!
//! Provides semantic text extraction for files that don't have AST extractors
//! (JSON, YAML, Markdown, Shell scripts, etc.)

use anyhow::Result;
use std::collections::HashMap;

use crate::extractors::*;

/// Text-based fallback extractor for non-code files
pub struct TextFallbackExtractor {
    _private: (),
}

impl Clone for TextFallbackExtractor {
    fn clone(&self) -> Self {
        Self { _private: () }
    }
}

impl TextFallbackExtractor {
    /// Create a new text fallback extractor
    pub fn new() -> Result<Self> {
        Ok(Self { _private: () })
    }

    /// Skip generic text files — they produce too much noise.
    /// Only structured file types (JSON, YAML, Markdown, Shell) get extracted.
    fn extract_text_chunks(_source: &str, _file_path: &str) -> Vec<Entity> {
        Vec::new()
    }

    /// Extract structured data from JSON files
    fn extract_json_structure(source: &str, file_path: &str) -> Vec<Entity> {
        let mut entities = Vec::new();

        if let Ok(value) = serde_json::from_str::<serde_json::Value>(source) {
            // Extract top-level keys as entities
            if let Some(obj) = value.as_object() {
                for (key, val) in obj.iter() {
                    let kind_str = match val {
                        serde_json::Value::Object(_) => "object",
                        serde_json::Value::Array(_) => "array",
                        serde_json::Value::String(_) => "string",
                        serde_json::Value::Number(_) => "number",
                        serde_json::Value::Bool(_) => "boolean",
                        serde_json::Value::Null => "null",
                    };

                    entities.push(Entity {
                        id: format!("json:{}:{}", file_path, key),
                        kind: EntityKind::Variable,
                        name: key.clone(),
                        file_path: file_path.to_string(),
                        line: 0,
                        column: 0,
                        signature: format!("{}: {}", key, kind_str),
                        visibility: Visibility::Public,
                        parent_id: None,
                        metadata: {
                            let mut m = HashMap::new();
                            m.insert("data_type".to_string(), kind_str.to_string());
                            m.insert("chunk_type".to_string(), "json".to_string());
                            m
                        },
                    });
                }
            }
        }

        entities
    }

    /// YAML files produce too much noise — every key becomes a "variable".
    /// Skip extraction; YAML structure isn't useful for code search.
    fn extract_yaml_structure(_source: &str, _file_path: &str) -> Vec<Entity> {
        Vec::new()
    }

    /// Extract structure from Markdown files — headings only (H1-H3).
    /// Code blocks and prose lines are skipped to avoid noise.
    fn extract_markdown_structure(source: &str, file_path: &str) -> Vec<Entity> {
        let mut entities = Vec::new();
        let mut line_num = 0;

        for line in source.lines() {
            line_num += 1;

            let trimmed = line.trim();

            // Only extract headings H1-H3
            if trimmed.starts_with('#') {
                let level = trimmed.chars().take_while(|&c| c == '#').count();
                if level > 3 { continue; }
                let heading = trimmed[level..].trim().to_string();
                if heading.is_empty() { continue; }

                entities.push(Entity {
                    id: format!("md:{}:{}:{}", file_path, line_num, heading),
                    kind: match level {
                        1 => EntityKind::Module,
                        _ => EntityKind::Namespace,
                    },
                    name: heading.clone(),
                    file_path: file_path.to_string(),
                    line: line_num,
                    column: 0,
                    signature: format!("{} {}", "#".repeat(level), heading),
                    visibility: Visibility::Public,
                    parent_id: None,
                    metadata: {
                        let mut m = HashMap::new();
                        m.insert("chunk_type".to_string(), "markdown".to_string());
                        m.insert("heading_level".to_string(), level.to_string());
                        m
                    },
                });
            }
        }

        entities
    }

    /// Extract structure from shell scripts — functions only.
    /// Variable assignments are too noisy (every config line becomes an entity).
    fn extract_shell_structure(source: &str, file_path: &str) -> Vec<Entity> {
        let mut entities = Vec::new();
        let mut line_num = 0;

        for line in source.lines() {
            line_num += 1;

            let trimmed = line.trim();

            // Extract function definitions only
            if (trimmed.starts_with("function ") || trimmed.contains("() {")) && !trimmed.starts_with("#") {
                let name = if trimmed.starts_with("function ") {
                    trimmed[9..].split('(').next().unwrap_or("unknown").trim().to_string()
                } else {
                    trimmed.split('(').next().unwrap_or("unknown").trim().to_string()
                };

                if !name.is_empty() && !name.starts_with('#') {
                    entities.push(Entity {
                        id: format!("sh:{}:{}:{}", file_path, line_num, name),
                        kind: EntityKind::Function,
                        name,
                        file_path: file_path.to_string(),
                        line: line_num,
                        column: 0,
                        signature: trimmed.to_string(),
                        visibility: Visibility::Private,
                        parent_id: None,
                        metadata: {
                            let mut m = HashMap::new();
                            m.insert("chunk_type".to_string(), "shell_function".to_string());
                            m
                        },
                    });
                }
            }
        }

        entities
    }
}

impl Extractor for TextFallbackExtractor {
    fn extract(&mut self, file_path: &str, source: &str) -> Result<ExtractionResult> {
        let entities = match Self::detect_file_type(file_path) {
            "json" => Self::extract_json_structure(source, file_path),
            "yaml" => Self::extract_yaml_structure(source, file_path),
            "markdown" => Self::extract_markdown_structure(source, file_path),
            "shell" => Self::extract_shell_structure(source, file_path),
            _ => Self::extract_text_chunks(source, file_path),
        };

        Ok(ExtractionResult {
            entities,
            references: Vec::new(),
            errors: Vec::new(),
        })
    }

    fn extensions(&self) -> &[&str] {
        &["json", "yaml", "yml", "md", "markdown", "sh", "bash", "txt", "config", "conf", "env"]
    }

    fn language(&self) -> &str {
        "text"
    }
}

impl TextFallbackExtractor {
    /// Detect file type from extension
    fn detect_file_type(file_path: &str) -> &str {
        if file_path.ends_with(".json") {
            "json"
        } else if file_path.ends_with(".yaml") || file_path.ends_with(".yml") {
            "yaml"
        } else if file_path.ends_with(".md") || file_path.ends_with(".markdown") {
            "markdown"
        } else if file_path.ends_with(".sh") || file_path.ends_with(".bash") {
            "shell"
        } else {
            "text"
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_json_extraction() {
        let mut extractor = TextFallbackExtractor::new().unwrap();
        let source = r#"
{
  "name": "test-project",
  "version": "1.0.0",
  "dependencies": {
    "react": "^18.0.0"
  },
  "scripts": {
    "start": "react-scripts start"
  }
}
"#;
        let result = extractor.extract("package.json", source).unwrap();

        assert!(!result.entities.is_empty());

        let name_entity = result.entities.iter().find(|e| e.name == "name");
        assert!(name_entity.is_some());

        let deps_entity = result.entities.iter().find(|e| e.name == "dependencies");
        assert!(deps_entity.is_some());
    }

    #[test]
    fn test_yaml_extraction() {
        let mut extractor = TextFallbackExtractor::new().unwrap();
        let source = r#"
version: 1.0.0
name: test-app
services:
  database:
    image: postgres:13
    ports:
      - "5432:5432"
"#;
        let result = extractor.extract("config.yaml", source).unwrap();

        // YAML keys are no longer extracted (too noisy for code search)
        assert!(result.entities.is_empty());
    }

    #[test]
    fn test_markdown_extraction() {
        let mut extractor = TextFallbackExtractor::new().unwrap();
        let source = r#"
# Main Title

This is the introduction.

## Section 1

Some content here.

### Subsection

```typescript
function hello() {
  console.log("Hello!");
}
```

## Section 2

More content.
"#;
        let result = extractor.extract("README.md", source).unwrap();

        assert!(!result.entities.is_empty());

        let main_title = result.entities.iter().find(|e| e.name == "Main Title");
        assert!(main_title.is_some());

        let section1 = result.entities.iter().find(|e| e.name == "Section 1");
        assert!(section1.is_some());
    }

    #[test]
    fn test_shell_extraction() {
        let mut extractor = TextFallbackExtractor::new().unwrap();
        let source = r#"
#!/bin/bash

DATABASE_URL="postgres://localhost:5432/mydb"
API_KEY="secret123"

function setup_environment() {
  echo "Setting up..."
}

function cleanup() {
  rm -rf /tmp/cache
}

setup_environment
"#;
        let result = extractor.extract("setup.sh", source).unwrap();

        assert!(!result.entities.is_empty());

        // Variables are no longer extracted (too noisy)
        let db_url = result.entities.iter().find(|e| e.name == "DATABASE_URL");
        assert!(db_url.is_none());

        // Functions are still extracted
        let setup_fn = result.entities.iter().find(|e| e.name == "setup_environment");
        assert!(setup_fn.is_some());

        let cleanup_fn = result.entities.iter().find(|e| e.name == "cleanup");
        assert!(cleanup_fn.is_some());
    }

    #[test]
    fn test_text_extraction() {
        let mut extractor = TextFallbackExtractor::new().unwrap();
        let source = r#"
This is a simple text file with some content.

Important: Process the following items carefully.

Details about the implementation:
- Item 1: Description here
- Item 2: More details
"#;
        let result = extractor.extract("notes.txt", source).unwrap();

        // Generic text files produce no entities (too noisy)
        assert!(result.entities.is_empty());
    }

    #[test]
    fn test_extensions() {
        let extractor = TextFallbackExtractor::new().unwrap();
        let exts = extractor.extensions();

        assert!(exts.contains(&"json"));
        assert!(exts.contains(&"yaml"));
        assert!(exts.contains(&"yml"));
        assert!(exts.contains(&"md"));
        assert!(exts.contains(&"sh"));
    }

    #[test]
    fn test_language() {
        let extractor = TextFallbackExtractor::new().unwrap();
        assert_eq!(extractor.language(), "text");
    }
}
