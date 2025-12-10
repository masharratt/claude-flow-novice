pub mod init;
pub mod index;
pub mod index_ast;
pub mod query;
pub mod stats;
pub mod cleanup;
pub mod migration;
pub mod reset;
pub mod export;
pub mod find;
pub mod refs;

// Re-export the command structs only, not internal types
pub use init::InitCommand;
pub use index::IndexCommand;
pub use index_ast::AstIndexCommand;
pub use query::{QueryCommand, BatchQueryCommand};
pub use stats::StatsCommand;
pub use cleanup::CleanupCommand;
pub use migration::MigrationCommand;
pub use reset::ResetCommand;
pub use export::{ExportCommand, ExportFormat};
pub use find::FindCommand;
pub use refs::RefsCommand;
