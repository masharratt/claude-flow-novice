# Build the binary
cargo build --release

# Initialize
./target/release/local-ruvector init

# Index your project (Rust files)
./target/release/local-ruvector index --path . --types rs --force

# Query patterns
./target/release/local-ruvector query --pattern "error handling"

# Find specific entities
./target/release/local-ruvector find --kind function --name "parse"