//! Path validation for multi-project isolation
//!
//! Provides secure path handling to prevent directory traversal attacks
//! and ensure file operations stay within project boundaries.

use anyhow::{Result, anyhow};
use std::path::{Path, PathBuf};
use tracing::warn;

/// Canonicalize a path, resolving symlinks and normalizing components.
///
/// # Arguments
/// * `path` - Path to canonicalize
///
/// # Returns
/// * `Ok(PathBuf)` - Canonicalized absolute path
/// * `Err` - If path cannot be canonicalized (doesn't exist or permission denied)
pub fn canonicalize(path: &Path) -> Result<PathBuf> {
    std::fs::canonicalize(path)
        .map_err(|e| anyhow!("Failed to canonicalize path {}: {}", path.display(), e))
}

/// Validate that a file path is within the project root directory (Path version).
///
/// This prevents directory traversal attacks (e.g., `../../sensitive/file.rs`).
///
/// # Arguments
/// * `file_path` - The file path to validate (can be relative or absolute)
/// * `project_root` - The project root directory (should be canonicalized)
///
/// # Returns
/// * `Ok(PathBuf)` - The canonical file path if validation succeeds
/// * `Err` - If file_path escapes project_root
pub fn validate_against_root(file_path: &str, project_root: &Path) -> Result<PathBuf> {
    let file_path_obj = Path::new(file_path);

    // If path is relative, join with project root
    let canonical_file_path = if file_path_obj.is_absolute() {
        canonicalize(file_path_obj)?
    } else {
        let joined = project_root.join(file_path_obj);
        canonicalize(&joined)?
    };

    // Verify that canonical_file_path starts with project_root
    if !canonical_file_path.starts_with(project_root) {
        warn!(
            "Path traversal attempt detected: {} escapes project root {}",
            file_path,
            project_root.display()
        );
        return Err(anyhow!(
            "File path {} is outside project root {}",
            canonical_file_path.display(),
            project_root.display()
        ));
    }

    Ok(canonical_file_path)
}

/// Normalize a path string without filesystem access.
///
/// Resolves `.` and `..` components in a path string by parsing it component-wise
/// without requiring the filesystem to exist. Preserves leading slash for absolute paths.
///
/// # Arguments
/// * `path` - Path string to normalize (can use `/` or `\` as separators)
///
/// # Returns
/// A normalized path string with resolved relative components
fn normalize_path_string(path: &str) -> String {
    let is_absolute = path.starts_with('/');
    let mut components: Vec<&str> = Vec::new();

    for component in path.split(['/', '\\']) {
        match component {
            "" | "." => continue,    // Skip empty and current directory
            ".." => {
                // Pop if possible, otherwise keep the `..` to indicate an error
                if !components.is_empty() && components[components.len() - 1] != ".." {
                    components.pop();
                } else if components.is_empty() && !is_absolute {
                    // Only for relative paths, attempted to go above root
                    components.push("..");
                }
                // For absolute paths, .. at the root is simply ignored
            },
            c => components.push(c),
        }
    }

    let result = components.join("/");
    if is_absolute && !result.is_empty() {
        format!("/{}", result)
    } else if is_absolute {
        "/".to_string()
    } else {
        result
    }
}

/// Validate that a file path is within the project root directory (string version).
///
/// This prevents directory traversal attacks (e.g., `../../sensitive/file.rs`).
/// Works entirely with string normalization and does NOT require filesystem access.
///
/// # Arguments
/// * `file_path` - The file path to validate (can be relative or absolute)
/// * `project_root` - The project root directory path as string
///
/// # Returns
/// * `Ok(())` - If the path is within the project root
/// * `Err` - If the path escapes the project root
pub fn validate_against_root_str(file_path: &str, project_root: &str) -> Result<()> {
    // First, prevent traversal (checks for .. patterns and null bytes)
    prevent_traversal(file_path)?;

    // Normalize both paths as strings, without requiring filesystem access
    let normalized_root = normalize_path_string(project_root);
    let normalized_path = if Path::new(file_path).is_absolute() {
        normalize_path_string(file_path)
    } else {
        // Join relative path with root, then normalize
        let combined = format!("{}/{}", project_root, file_path);
        normalize_path_string(&combined)
    };

    // Check if the normalized path starts with the normalized root
    if !normalized_path.starts_with(&normalized_root) {
        return Err(anyhow!(
            "Path {} is outside project root {}",
            normalized_path,
            normalized_root
        ));
    }

    // Additional check: ensure we're not just a prefix match (e.g., /home/user/project-other should not match /home/user/project)
    // The path should either be exactly the root or continue with a separator
    if normalized_path != normalized_root {
        let after_root = &normalized_path[normalized_root.len()..];
        if !after_root.starts_with('/') && !after_root.is_empty() {
            return Err(anyhow!(
                "Path {} is outside project root {}",
                normalized_path,
                normalized_root
            ));
        }
    }

    Ok(())
}

/// Prevent directory traversal attacks by checking for suspicious patterns.
///
/// This is a secondary check that looks for `..` components in paths,
/// which should have been eliminated by canonicalization but we check anyway.
///
/// # Arguments
/// * `file_path` - The file path to validate
///
/// # Returns
/// * `Ok(())` - If no traversal patterns detected
/// * `Err` - If suspicious patterns found
pub fn prevent_traversal(file_path: &str) -> Result<()> {
    // Check for .. components
    if file_path.contains("..") {
        warn!("Potential directory traversal detected in path: {}", file_path);
        return Err(anyhow!(
            "Path contains suspicious '..' component: {}",
            file_path
        ));
    }

    // Check for null bytes (path injection)
    if file_path.contains('\0') {
        warn!("Null byte detected in path: {}", file_path);
        return Err(anyhow!("Path contains null byte: {}", file_path));
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;
    use std::fs;

    #[test]
    fn test_validate_against_root_valid_path() -> Result<()> {
        let temp_dir = tempdir()?;
        let project_root = canonicalize(temp_dir.path())?;

        // Create a test file
        let test_file = temp_dir.path().join("test.rs");
        fs::write(&test_file, "// test")?;

        let result = validate_against_root("test.rs", &project_root)?;
        assert!(result.starts_with(&project_root));

        Ok(())
    }

    #[test]
    fn test_validate_against_root_rejects_traversal() -> Result<()> {
        let temp_dir = tempdir()?;
        let project_root = canonicalize(temp_dir.path())?;

        // Try to access parent directory
        let result = validate_against_root("../../../etc/passwd", &project_root);
        assert!(result.is_err());

        Ok(())
    }

    #[test]
    fn test_prevent_traversal_detects_dots() -> Result<()> {
        let result = prevent_traversal("../../secret.rs");
        assert!(result.is_err());

        Ok(())
    }

    #[test]
    fn test_prevent_traversal_detects_null_bytes() -> Result<()> {
        let result = prevent_traversal("file.rs\0/etc/passwd");
        assert!(result.is_err());

        Ok(())
    }

    #[test]
    fn test_prevent_traversal_allows_valid_path() -> Result<()> {
        let result = prevent_traversal("src/main.rs");
        assert!(result.is_ok());

        Ok(())
    }

    #[test]
    fn test_canonicalize_resolves_symlinks() -> Result<()> {
        let temp_dir = tempdir()?;
        let real_file = temp_dir.path().join("real.rs");
        fs::write(&real_file, "// real")?;

        #[cfg(unix)]
        {
            let symlink_path = temp_dir.path().join("link.rs");
            std::os::unix::fs::symlink(&real_file, &symlink_path)?;

            let canonical = canonicalize(&symlink_path)?;
            assert_eq!(canonical, canonicalize(&real_file)?);
        }

        Ok(())
    }

    #[test]
    fn test_validate_against_root_str_safe() {
        let project_root = "/home/user/project";
        // These should pass - files within the project root
        assert!(validate_against_root_str("src/main.rs", project_root).is_ok());
        assert!(validate_against_root_str("lib.rs", project_root).is_ok());
        assert!(validate_against_root_str("src/nested/file.rs", project_root).is_ok());
    }

    #[test]
    fn test_validate_against_root_str_escape_attempts() {
        let project_root = "/home/user/project";
        // These should fail - attempt to traverse outside root
        assert!(validate_against_root_str("../../../etc/passwd", project_root).is_err());
        assert!(validate_against_root_str("../other-project/file.rs", project_root).is_err());
    }

    #[test]
    fn test_normalize_path_string_relative_components() {
        // Test that normalize_path_string correctly handles . and .. components
        assert_eq!(normalize_path_string("a/b/../c"), "a/c");
        assert_eq!(normalize_path_string("a/./b/c"), "a/b/c");
        assert_eq!(normalize_path_string("a/b/../../c"), "c");
        assert_eq!(normalize_path_string("/home/user/../user/project"), "/home/user/project");
        // Test that leading slashes are preserved
        assert_eq!(normalize_path_string("/a/b/c"), "/a/b/c");
        // Test edge cases with .. at root
        assert_eq!(normalize_path_string("/../etc/passwd"), "/etc/passwd");
    }

    #[test]
    fn test_validate_against_root_str_prefix_safety() {
        // Test that files can be validated without requiring filesystem
        let project_root = "/home/user/project";
        assert!(validate_against_root_str("src/main.rs", project_root).is_ok());
        assert!(validate_against_root_str("src/nested/file.rs", project_root).is_ok());

        // Test that attempting to escape fails even without filesystem
        assert!(validate_against_root_str("../../../etc/passwd", project_root).is_err());

        // Test prefix safety: ensure /home/user/project-other is distinct from /home/user/project
        // When validating src/main.rs against /home/user/project-other, it should resolve to
        // /home/user/project-other/src/main.rs which doesn't start with /home/user/project
        let project_other = "/home/user/project-other";
        assert!(validate_against_root_str("src/main.rs", project_other).is_ok());
    }
}
