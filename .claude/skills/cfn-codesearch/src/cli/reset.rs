use anyhow::{Result, Context};
use std::path::{Path, PathBuf};
use std::fs;
use tracing::info;

pub struct ResetCommand {
    project_dir: PathBuf,
    confirm: bool,
}

impl ResetCommand {
    pub fn new(project_dir: &Path, confirm: bool) -> Self {
        Self {
            project_dir: project_dir.to_path_buf(),
            confirm,
        }
    }

    pub fn execute(&self) -> Result<()> {
        let ruvector_dir = self.project_dir.join(".ruvector");
        
        if !self.confirm {
            eprintln!("⚠️  This will delete all indexed data!");
            eprintln!("To proceed, run with --confirm");
            return Ok(());
        }

        if ruvector_dir.exists() {
            fs::remove_dir_all(&ruvector_dir)?;
            info!("Reset complete: removed .ruvector directory");
        } else {
            info!("No RuVector data found to reset");
        }

        Ok(())
    }
}
