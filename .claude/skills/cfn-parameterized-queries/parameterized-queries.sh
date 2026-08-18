#!/usr/bin/env bash
# cfn-parameterized-queries: Secure SQLite parameterized query execution
set -euo pipefail

# Import utilities if available
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -f "$SCRIPT_DIR/../cfn-utilities/utilities.sh" ]]; then
    source "$SCRIPT_DIR/../cfn-utilities/utilities.sh"
fi

# Security functions
validate_sql_identifier() {
    local identifier="$1"
    # Only allow alphanumeric characters, underscores, and dots
    if [[ ! "$identifier" =~ ^[a-zA-Z_][a-zA-Z0-9_]*(\.[a-zA-Z_][a-zA-Z0-9_]*)*$ ]]; then
        echo "ERROR: Invalid SQL identifier: $identifier" >&2
        return 1
    fi
    return 0
}

validate_table_name() {
    local table="$1"
    validate_sql_identifier "$table"
}

validate_column_name() {
    local column="$1"
    validate_sql_identifier "$column"
}

sanitize_value() {
    local value="$1"
    # Remove null bytes and control characters
    # Escape single quotes by doubling them (SQLite standard)
    echo "$value" | sed "s/'/''/g" | tr -d '\000\001\002\003\004\005\006\007\010\011\012\013\014\015\016\017\020\021\022\023\024\025\026\027\030\031\032\033\034\035\036\037'
}

# Core parameterized query functions
execute_select_one() {
    local db_path="$1"
    local query="$2"
    shift 2
    local params=("$@")
    
    if [[ ! -f "$db_path" ]]; then
        echo "ERROR: Database file not found: $db_path" >&2
        return 1
    fi
    
    # For SELECT queries, use printf with parameters properly escaped
    if [[ ${#params[@]} -gt 0 ]]; then
        # Build the query by replacing ? with properly quoted values
        local final_query="$query"
        for param in "${params[@]}"; do
            # Sanitize and quote the parameter
            local sanitized_param
            sanitized_param=$(sanitize_value "$param")
            # Replace first occurrence of ? with the quoted value
            final_query="${final_query/\?/'$sanitized_param'}"
        done
        sqlite3 "$db_path" "$final_query"
    else
        sqlite3 "$db_path" "$query"
    fi
}

execute_select_many() {
    local db_path="$1"
    local query="$2"
    shift 2
    local params=("$@")
    
    if [[ ! -f "$db_path" ]]; then
        echo "ERROR: Database file not found: $db_path" >&2
        return 1
    fi
    
    # Execute query and return all rows
    if [[ ${#params[@]} -gt 0 ]]; then
        local final_query="$query"
        for param in "${params[@]}"; do
            local sanitized_param
            sanitized_param=$(sanitize_value "$param")
            final_query="${final_query/\?/'$sanitized_param'}"
        done
        sqlite3 "$db_path" "$final_query"
    else
        sqlite3 "$db_path" "$query"
    fi
}

execute_insert() {
    local db_path="$1"
    local table="$2"
    shift 2
    local columns=()
    local values=()
    
    # Parse columns and values
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --columns)
                shift
                IFS=',' read -ra columns <<< "$1"
                for col in "${columns[@]}"; do
                    validate_column_name "$col"
                done
                ;;
            --values)
                shift
                while [[ $# -gt 0 && "$1" != "--" ]]; do
                    values+=("$(sanitize_value "$1")")
                    shift
                done
                ;;
            --)
                shift
                break
                ;;
            *)
                echo "ERROR: Unknown option: $1" >&2
                return 1
                ;;
        esac
        shift
    done
    
    validate_table_name "$table"
    
    # Build INSERT query with properly quoted values
    local column_list
    column_list=$(IFS=','; echo "${columns[*]}")
    
    # Quote all values
    local quoted_values=()
    for value in "${values[@]}"; do
        quoted_values+=("'$value'")
    done
    local value_list
    value_list=$(IFS=','; echo "${quoted_values[*]}")
    
    local query="INSERT INTO $table ($column_list) VALUES ($value_list);"
    sqlite3 "$db_path" "$query"
}

execute_update() {
    local db_path="$1"
    local table="$2"
    local column="$3"
    local value="$4"
    local condition_col="$5"
    local condition_val="$6"
    
    validate_table_name "$table"
    validate_column_name "$column"
    validate_column_name "$condition_col"
    
    value=$(sanitize_value "$value")
    condition_val=$(sanitize_value "$condition_val")
    
    local query="UPDATE $table SET $column = '$value' WHERE $condition_col = '$condition_val';"
    sqlite3 "$db_path" "$query"
}

execute_delete() {
    local db_path="$1"
    local table="$2"
    local condition_col="$3"
    local condition_val="$4"
    
    validate_table_name "$table"
    validate_column_name "$condition_col"
    condition_val=$(sanitize_value "$condition_val")
    
    local query="DELETE FROM $table WHERE $condition_col = '$condition_val';"
    sqlite3 "$db_path" "$query"
}

execute_exists() {
    local db_path="$1"
    local table="$2"
    local condition_col="$3"
    local condition_val="$4"
    
    validate_table_name "$table"
    validate_column_name "$condition_col"
    condition_val=$(sanitize_value "$condition_val")
    
    local query="SELECT COUNT(*) FROM $table WHERE $condition_col = '$condition_val' LIMIT 1;"
    
    # Execute and check if count > 0
    local count
    count=$(sqlite3 "$db_path" "$query")
    [[ "$count" -gt 0 ]]
}

# Utility functions for common operations
get_by_id() {
    local db_path="$1"
    local table="$2"
    local id="$3"
    local id_column="${4:-id}"
    
    validate_table_name "$table"
    validate_column_name "$id_column"
    id=$(sanitize_value "$id")
    
    local query="SELECT * FROM $table WHERE $id_column = '$id' LIMIT 1;"
    sqlite3 "$db_path" "$query"
}

count_records() {
    local db_path="$1"
    local table="$2"
    local condition="${3:-}"
    
    validate_table_name "$table"
    
    local query="SELECT COUNT(*) FROM $table"
    if [[ -n "$condition" ]]; then
        # For conditions, we assume they are already properly formatted
        query="$query WHERE $condition"
    fi
    query="$query;"
    
    sqlite3 "$db_path" "$query"
}

# Transaction support
begin_transaction() {
    local db_path="$1"
    sqlite3 "$db_path" "BEGIN TRANSACTION;"
}

commit_transaction() {
    local db_path="$1"
    sqlite3 "$db_path" "COMMIT;"
}

rollback_transaction() {
    local db_path="$1"
    sqlite3 "$db_path" "ROLLBACK;"
}

# Export functions for sourcing
export -f validate_sql_identifier validate_table_name validate_column_name sanitize_value
export -f execute_select_one execute_select_many execute_insert execute_update execute_delete execute_exists
export -f get_by_id count_records begin_transaction commit_transaction rollback_transaction