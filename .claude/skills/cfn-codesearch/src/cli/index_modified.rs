use std::fs;
use std::path::{Path, PathBuf};
use std::io;
use walkdir::{WalkDir, DirEntry};

pub fn collect_files(root_dir: &Path, index_path: &Path) -> io::Result<Vec<PathBuf>> {
    let mut files = Vec::new();
    
    for entry in WalkDir::new(root_dir)
        .into_iter()
        .filter_entry(|e| {
            let path = e.path();
            
            // Skip the index file itself
            if path == index_path {
                return false;
            }
            
            // Skip specific directories
            if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                match name {
                    "node_modules" | "target" | "dist" | "build" => return false,
                    _ => {}
                }
            }
            
            true
        })
        .filter_map(|e| e.ok())
    {
        if entry.file_type().is_file() {
            files.push(entry.path().to_path_buf());
        }
    }
    
    Ok(files)
}