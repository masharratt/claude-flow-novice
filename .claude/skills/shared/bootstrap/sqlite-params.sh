#!/usr/bin/env bash
# SQLite Parameterized Query Utilities
# Prevents SQL injection by properly binding parameters

set -euo pipefail

# Validate SQL identifier (table name, column name)
validate_sql_identifier() {
    local identifier="$1"
    local context="${2:-identifier}"

    # Only allow alphanumeric, underscore, and dots for schema.table
    if [[ ! "$identifier" =~ ^[a-zA-Z_][a-zA-Z0-9_.]*$ ]]; then
        echo "Error: Invalid $context: '$identifier'" >&2
        echo "Only letters, numbers, underscores, and dots allowed" >&2
        return 1
    fi

    # Max length check
    if [[ ${#identifier} -gt 64 ]]; then
        echo "Error: $context too long (max 64 chars): '$identifier'" >&2
        return 1
    fi
}

# Execute parameterized query with positional parameters
execute_query() {
    local db_path="$1"
    local query="$2"
    shift 2
    local params=("$@")

    # Validate database path
    if [[ ! -f "$db_path" ]]; then
        echo "Error: Database file not found: $db_path" >&2
        return 1
    fi

    # Build the parameter list for sqlite3
    local param_list=""
    for param in "${params[@]}"; do
        # Escape single quotes in parameter
        param="${param//\'/\'\'}"
        param_list="$param_list '$param'"
    done

    # Execute query with parameters
    if [[ ${#params[@]} -gt 0 ]]; then
        # Create temporary SQL script with parameters
        local temp_sql=$(mktemp)
        echo "BEGIN TRANSACTION;" > "$temp_sql"

        # Replace ? placeholders with properly quoted values
        local modified_query="$query"
        local temp_params=()

        # Build array of quoted parameters
        for param in "${params[@]}"; do
            param="${param//\'/\'\'}"
            temp_params+=("'$param'")
        done

        # Replace all ? placeholders with quoted parameters
        local param_index=0
        while [[ "$modified_query" == *"?"* ]] && [[ $param_index -lt ${#temp_params[@]} ]]; do
            modified_query="${modified_query/\?/${temp_params[$param_index]}}"
            ((param_index++))
        done

        echo "$modified_query;" >> "$temp_sql"
        echo "COMMIT;" >> "$temp_sql"

        sqlite3 "$db_path" < "$temp_sql"
        rm -f "$temp_sql"
    else
        sqlite3 "$db_path" "$query"
    fi
}

# Execute INSERT with parameters
execute_insert() {
    local db_path="$1"
    local table="$2"
    local columns="$3"
    shift 3
    local values=("$@")

    validate_sql_identifier "$table" "table name"

    # Build placeholders
    local placeholders=""
    for ((i=1; i<=${#values[@]}; i++)); do
        if [[ $i -gt 1 ]]; then
            placeholders="$placeholders, "
        fi
        placeholders="$placeholders?"
    done

    local query="INSERT INTO $table ($columns) VALUES ($placeholders)"
    execute_query "$db_path" "$query" "${values[@]}"
}

# Execute UPDATE with parameters
execute_update() {
    local db_path="$1"
    local table="$2"
    local set_clause="$3"
    local where_clause="${4:-}"
    shift 4
    local params=("$@")

    validate_sql_identifier "$table" "table name"

    local query="UPDATE $table SET $set_clause"
    if [[ -n "$where_clause" ]]; then
        query="$query WHERE $where_clause"
    fi

    execute_query "$db_path" "$query" "${params[@]}"
}

# Execute SELECT with parameters
execute_select() {
    local db_path="$1"
    local query="$2"
    shift 2
    local params=("$@")

    execute_query "$db_path" "$query" "${params[@]}"
}

# Create table safely
create_table() {
    local db_path="$1"
    local table="$2"
    local definition="$3"

    validate_sql_identifier "$table" "table name"

    # Validate definition doesn't contain semicolons except at end
    if [[ "$definition" == *";"* ]]; then
        echo "Error: Table definition should not contain multiple statements" >&2
        return 1
    fi

    local query="CREATE TABLE IF NOT EXISTS $table ($definition)"
    sqlite3 "$db_path" "$query"
}

# Export functions for sourcing
export -f validate_sql_identifier
export -f execute_query
export -f execute_insert
export -f execute_update
export -f execute_select
export -f create_table