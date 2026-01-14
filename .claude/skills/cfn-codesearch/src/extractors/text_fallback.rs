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

    /// Extract meaningful text chunks from file content
    fn extract_text_chunks(source: &str, file_path: &str) -> Vec<Entity> {
        let mut entities = Vec::new();
        let mut line_num = 0;

        for line in source.lines() {
            line_num += 1;

            // Skip empty lines and comments
            let trimmed = line.trim();
            if trimmed.is_empty() || trimmed.starts_with('#') {
                continue;
            }

            // Extract meaningful chunks (lines with substantial content)
            if trimmed.len() > 10 && !trimmed.starts_with("//") && !trimmed.starts_with("*") {
                entities.push(Entity {
                    id: format!("text:{}:{}:{}", file_path, line_num, trimmed.len()),
                    kind: EntityKind::Variable, // Use Variable as generic text chunk
                    name: trimmed.chars().take(50).collect::<String>(), // First 50 chars as name
                    file_path: file_path.to_string(),
                    line: line_num,
                    column: 0,
                    signature: trimmed.to_string(),
                    visibility: Visibility::Public,
                    parent_id: None,
                    metadata: {
                        let mut m = HashMap::new();
                        m.insert("chunk_type".to_string(), "text".to_string());
                        m.insert("length".to_string(), trimmed.len().to_string());
                        m
                    },
                });
            }
        }

        entities
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

    /// Extract structure from YAML files
    fn extract_yaml_structure(source: &str, file_path: &str) -> Vec<Entity> {
        let mut entities = Vec::new();
        let mut line_num = 0;

        // Simple YAML key extraction without external dependencies
        for line in source.lines() {
            line_num += 1;

            let trimmed = line.trim();

            // Look for YAML keys (lines with colon but not comments or values only)
            if let Some(colon_pos) = trimmed.find(':') {
                let key_part = trimmed[..colon_pos].trim();

                // Skip if it's a comment or already a value
                if !key_part.is_empty() && !key_part.starts_with('#') && !key_part.starts_with('-') {
                    let indent = line.len() - line.trim_start().len();

                    entities.push(Entity {
                        id: format!("yaml:{}:{}:{}", file_path, line_num, key_part),
                        kind: EntityKind::Variable,
                        name: key_part.to_string(),
                        file_path: file_path.to_string(),
                        line: line_num,
                        column: indent,
                        signature: line.to_string(),
                        visibility: Visibility::Public,
                        parent_id: None,
                        metadata: {
                            let mut m = HashMap::new();
                            m.insert("chunk_type".to_string(), "yaml".to_string());
                            m.insert("indent_level".to_string(), (indent / 2).to_string());
                            m
                        },
                    });
                }
            }
        }

        entities
    }

    /// Extract structure from Markdown files
    fn extract_markdown_structure(source: &str, file_path: &str) -> Vec<Entity> {
        let mut entities = Vec::new();
        let mut line_num = 0;
        let mut current_section = String::new();

        for line in source.lines() {
            line_num += 1;

            let trimmed = line.trim();

            // Extract headings
            if trimmed.starts_with('#') {
                let level = trimmed.chars().take_while(|&c| c == '#').count();
                let heading = trimmed[level..].trim().to_string();

                current_section = heading.clone();

                entities.push(Entity {
                    id: format!("md:{}:{}:{}", file_path, line_num, heading),
                    kind: match level {
                        1 => EntityKind::Module,
                        2 => EntityKind::Namespace,
                        _ => EntityKind::Variable,
                    },
                    name: heading,
                    file_path: file_path.to_string(),
                    line: line_num,
                    column: 0,
                    signature: format!("{} {}", "#".repeat(level), current_section),
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

            // Extract code blocks
            if trimmed.starts_with("```") {
                let lang = trimmed[3..].trim().to_string();
                let name = if lang.is_empty() {
                    "code_block".to_string()
                } else {
                    format!("code_{}", lang)
                };

                entities.push(Entity {
                    id: format!("md:{}:{}:{}", file_path, line_num, name),
                    kind: EntityKind::Variable,
                    name,
                    file_path: file_path.to_string(),
                    line: line_num,
                    column: 0,
                    signature: trimmed.to_string(),
                    visibility: Visibility::Public,
                    parent_id: None,
                    metadata: {
                        let mut m = HashMap::new();
                        m.insert("chunk_type".to_string(), "markdown_code".to_string());
                        m.insert("language".to_string(), lang);
                        m
                    },
                });
            }
        }

        entities
    }

    /// Extract structure from shell scripts
    fn extract_shell_structure(source: &str, file_path: &str) -> Vec<Entity> {
        let mut entities = Vec::new();
        let mut line_num = 0;

        for line in source.lines() {
            line_num += 1;

            let trimmed = line.trim();

            // Extract function definitions
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

            // Extract variable assignments
            if trimmed.contains('=') && !trimmed.starts_with('#') && !trimmed.contains("==") {
                if let Some(eq_pos) = trimmed.find('=') {
                    let var_part = trimmed[..eq_pos].trim();

                    // Only extract if it looks like a variable name
                    if var_part.chars().all(|c| c.is_alphanumeric() || c == '_') && !var_part.is_empty() {
                        entities.push(Entity {
                            id: format!("sh:{}:{}:{}", file_path, line_num, var_part),
                            kind: EntityKind::Variable,
                            name: var_part.to_string(),
                            file_path: file_path.to_string(),
                            line: line_num,
                            column: 0,
                            signature: trimmed.to_string(),
                            visibility: Visibility::Public,
                            parent_id: None,
                            metadata: {
                                let mut m = HashMap::new();
                                m.insert("chunk_type".to_string(), "shell_variable".to_string());
                                m
                            },
                        });
                    }
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

        assert!(!result.entities.is_empty());

        let version_entity = result.entities.iter().find(|e| e.name == "version");
        assert!(version_entity.is_some());

        let services_entity = result.entities.iter().find(|e| e.name == "services");
        assert!(services_entity.is_some());
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

        let db_url = result.entities.iter().find(|e| e.name == "DATABASE_URL");
        assert!(db_url.is_some());

        let setup_fn = result.entities.iter().find(|e| e.name == "setup_environment");
        assert!(setup_fn.is_some());
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

        // Should extract meaningful lines
        assert!(!result.entities.is_empty());
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
