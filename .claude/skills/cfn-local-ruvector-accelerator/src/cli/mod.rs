pub mod init;
pub mod index;
pub mod query;
pub mod stats;
pub mod cleanup;
pub mod migration;
pub mod reset;
pub mod export;

// Re-export the command structs only, not internal types
pub use init::InitCommand;
pub use index::IndexCommand;
pub use query::{QueryCommand, BatchQueryCommand};
pub use stats::StatsCommand;
pub use cleanup::CleanupCommand;
pub use migration::MigrationCommand;
pub use reset::ResetCommand;
pub use export::{ExportCommand, ExportFormat};
