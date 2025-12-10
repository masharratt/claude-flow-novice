# 1. Initialize local RuVector
./target/release/local-ruvector init

# 2. Index your codebase
./target/release/local-ruvector index --path /path/to/project --types rs

# 3. Query patterns instantly
./target/release/local-ruvector query --pattern "authentication rust" --limit 5