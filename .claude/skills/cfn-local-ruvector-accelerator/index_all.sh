#!/bin/bash
# Index all files in the project

echo "Starting comprehensive indexing of all files..."
cd .claude/skills/cfn-local-ruvector-accelerator

# Clear existing index
rm -rf index/

# Define file extensions to index
declare -a file_types=("rs" "py" "js" "ts" "tsx" "jsx" "go" "java" "json" "yaml" "yml" "md" "sh" "sql" "html" "css" "xml" "toml" "cfg" "ini" "conf" "txt")

# Count total files
total_files=0
for ext in "${file_types[@]}"; do
    count=$(find ../../ -type f -name "*.${ext}" 2>/dev/null | grep -v "/target/" | grep -v "/node_modules/" | grep -v "/.git/" | wc -l)
    total_files=$((total_files + count))
    echo "Found ${count} .${ext} files"
done

echo -e "\nTotal files to index: ${total_files}\n"

# Index each file type
start_time=$(date +%s)

for ext in "${file_types[@]}"; do
    echo -e "\n=== Indexing .${ext} files ==="

    # Check if any files exist
    file_list=$(find ../../ -type f -name "*.${ext}" 2>/dev/null | grep -v "/target/" | grep -v "/node_modules/" | grep -v "/.git/" | head -5)
    if [ -z "$file_list" ]; then
        echo "No .${ext} files found"
        continue
    fi

    # Index this file type
    local-ruvector index --path ../.. --types ${ext} --force

    if [ $? -eq 0 ]; then
        echo "✅ Successfully indexed .${ext} files"
    else
        echo "❌ Error indexing .${ext} files"
    fi
done

end_time=$(date +%s)
duration=$((end_time - start_time))

echo -e "\n=== Indexing Complete ==="
echo "Duration: ${duration} seconds"
echo "Files indexed: ${total_files}"

# Show index size
if [ -d "index" ]; then
    index_size=$(du -sh index | cut -f1)
    echo "Index size: ${index_size}"
fi

# Show database stats
if [ -f "index/index.db" ]; then
    echo -e "\n=== Database Statistics ==="
    sqlite3 index/index.db "SELECT 'entities: ' || COUNT(*) FROM entities;"
    sqlite3 index/index.db "SELECT 'embeddings: ' || COUNT(*) FROM embeddings;"
    sqlite3 index/index.db "SELECT 'references: ' || COUNT(*) FROM references;"
fi