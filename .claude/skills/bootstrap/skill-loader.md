---
name: skill-loader
category: foundation
team: foundation
approval_level: auto
approval_criteria:
  max_commands: 3
  test_coverage: 0.95
  no_external_calls: true
tags: [skill-loading, cache, foundation]
version: 1.0.0
owner: cfn-core
---

# Skill Loader - Bootstrap Skill

## Overview
Dynamic skill loading from database, skill cache management, and hash validation patterns. Enables runtime skill injection and adaptive specialization.

**⚠️ SECURITY NOTE:** This skill uses SQL queries with bash variable interpolation. While basic escaping (`${var//\'/\'\'}`) is applied, this pattern has limitations and should only be used with trusted inputs in controlled bootstrap environments. See database-connection.md for full security documentation.

## SQL Injection Protection

### Identifier Validation
```bash
# SQL INJECTION PROTECTION: Validate identifier before interpolation
validate_sql_identifier() {
    local identifier="$1"
    local identifier_type="${2:-identifier}"

    # Strict validation: only allow safe SQL identifiers
    # Pattern: starts with letter/underscore, contains only alphanumeric/underscore
    if [[ ! "$identifier" =~ ^[a-zA-Z_][a-zA-Z0-9_-]*$ ]]; then
        echo "ERROR: Invalid $identifier_type '$identifier' - must match ^[a-zA-Z_][a-zA-Z0-9_-]*$" >&2
        return 1
    fi

    return 0
}
```

## Database-Driven Skill Loading

### Load Skill from Database
```bash
#!/bin/bash
set -euo pipefail

load_skill_from_db() {
    local db_path="$1"
    local skill_name="$2"
    local cache_dir="${3:-./.skill-cache}"

    # Validate database exists
    if [[ ! -f "$db_path" ]]; then
        echo "ERROR: Database not found: $db_path" >&2
        return 1
    fi

    # SQL INJECTION PREVENTION: Validate skill name before query
    validate_sql_identifier "$skill_name" "skill name" || return 1

    # Query skill content (validated identifier - safe to interpolate)
    local skill_content
    skill_content=$(sqlite3 "$db_path" <<EOF
SELECT content FROM skills WHERE name = '${skill_name//\'/\'\'}' LIMIT 1;
EOF
)

    if [[ -z "$skill_content" ]]; then
        echo "ERROR: Skill not found: $skill_name" >&2
        return 1
    fi

    # Create cache directory
    mkdir -p "$cache_dir"

    # Write to cache file
    local cache_file="${cache_dir}/${skill_name}.md"
    echo "$skill_content" > "$cache_file"

    echo "$cache_file"
}

# Usage
SKILL_FILE=$(load_skill_from_db "./data/skills.db" "database-connection")
echo "Loaded skill: $SKILL_FILE"
```

### Load Multiple Skills
```bash
load_skills_batch() {
    local db_path="$1"
    local cache_dir="${2:-./.skill-cache}"
    shift 2
    local skill_names=("$@")

    local -a loaded_skills=()
    local -a failed_skills=()

    for skill_name in "${skill_names[@]}"; do
        if skill_file=$(load_skill_from_db "$db_path" "$skill_name" "$cache_dir" 2>/dev/null); then
            loaded_skills+=("$skill_file")
            echo "Loaded: $skill_name"
        else
            failed_skills+=("$skill_name")
            echo "Failed: $skill_name" >&2
        fi
    done

    if [[ ${#failed_skills[@]} -gt 0 ]]; then
        echo "ERROR: Failed to load ${#failed_skills[@]} skills: ${failed_skills[*]}" >&2
        return 1
    fi

    printf '%s\n' "${loaded_skills[@]}"
}

# Usage
SKILLS=("database-connection" "error-handling" "bash-fundamentals")
load_skills_batch "./data/skills.db" "./.skill-cache" "${SKILLS[@]}"
```

### Query Skills by Category
```bash
load_skills_by_category() {
    local db_path="$1"
    local category="$2"
    local cache_dir="${3:-./.skill-cache}"

    # SQL INJECTION PREVENTION: Validate category name before query
    validate_sql_identifier "$category" "category name" || return 1

    # Get skill names in category (validated identifier - safe to interpolate)
    local skill_names
    skill_names=$(sqlite3 "$db_path" <<EOF
SELECT name FROM skills WHERE category = '${category//\'/\'\'}' ORDER BY name;
EOF
)

    if [[ -z "$skill_names" ]]; then
        echo "WARNING: No skills found in category: $category" >&2
        return 0
    fi

    # Load each skill
    local -a loaded_skills=()
    while IFS= read -r skill_name; do
        if skill_file=$(load_skill_from_db "$db_path" "$skill_name" "$cache_dir"); then
            loaded_skills+=("$skill_file")
        fi
    done <<< "$skill_names"

    printf '%s\n' "${loaded_skills[@]}"
}

# Usage
load_skills_by_category "./data/skills.db" "foundation" "./.skill-cache"
```

## Skill Cache Management

### Cache Initialization
```bash
initialize_skill_cache() {
    local cache_dir="${1:-./.skill-cache}"
    local max_age_seconds="${2:-86400}"  # Default 24 hours

    # Create cache directory
    mkdir -p "$cache_dir"

    # Create cache metadata file
    local metadata_file="${cache_dir}/.cache-metadata"
    cat > "$metadata_file" <<EOF
{
  "initialized_at": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "max_age_seconds": $max_age_seconds,
  "version": "1.0.0"
}
EOF

    echo "Cache initialized: $cache_dir"
}
```

### Cache Invalidation
```bash
invalidate_skill_cache() {
    local cache_dir="${1:-./.skill-cache}"
    local skill_name="${2:-}"

    if [[ -z "$skill_name" ]]; then
        # Invalidate entire cache
        echo "Invalidating entire cache: $cache_dir"
        rm -rf "$cache_dir"
        mkdir -p "$cache_dir"
    else
        # Invalidate specific skill
        local cache_file="${cache_dir}/${skill_name}.md"
        if [[ -f "$cache_file" ]]; then
            echo "Invalidating cached skill: $skill_name"
            rm -f "$cache_file"
        fi
    fi
}
```

### Cache Cleanup (Age-Based)
```bash
cleanup_skill_cache() {
    local cache_dir="${1:-./.skill-cache}"
    local max_age_seconds="${2:-86400}"  # Default 24 hours

    if [[ ! -d "$cache_dir" ]]; then
        echo "Cache directory does not exist: $cache_dir"
        return 0
    fi

    local current_time=$(date +%s)
    local removed_count=0

    # Find and remove old cache files
    while IFS= read -r -d '' file; do
        local file_time=$(stat -f%m "$file" 2>/dev/null || stat -c%Y "$file")
        local age=$((current_time - file_time))

        if [[ $age -gt $max_age_seconds ]]; then
            echo "Removing stale cache file: $(basename "$file") (age: ${age}s)"
            rm -f "$file"
            ((removed_count++))
        fi
    done < <(find "$cache_dir" -type f -name "*.md" -print0)

    echo "Removed $removed_count stale cache files"
}
```

### Cache Statistics
```bash
get_cache_stats() {
    local cache_dir="${1:-./.skill-cache}"

    if [[ ! -d "$cache_dir" ]]; then
        echo "Cache directory does not exist: $cache_dir"
        return 1
    fi

    local total_files=$(find "$cache_dir" -type f -name "*.md" | wc -l)
    local total_size=$(du -sb "$cache_dir" 2>/dev/null | cut -f1)
    local cache_age=0

    local metadata_file="${cache_dir}/.cache-metadata"
    if [[ -f "$metadata_file" ]]; then
        local init_time=$(jq -r '.initialized_at' "$metadata_file" 2>/dev/null || echo "unknown")
        echo "Cache Statistics:"
        echo "  Directory: $cache_dir"
        echo "  Initialized: $init_time"
        echo "  Total files: $total_files"
        echo "  Total size: $total_size bytes"
    fi
}
```

## Hash Validation

### Compute Content Hash
```bash
compute_content_hash() {
    local content="$1"
    local algorithm="${2:-sha256}"

    case "$algorithm" in
        md5)
            echo -n "$content" | md5sum | cut -d' ' -f1
            ;;
        sha256)
            echo -n "$content" | sha256sum | cut -d' ' -f1
            ;;
        *)
            echo "ERROR: Unsupported hash algorithm: $algorithm" >&2
            return 1
            ;;
    esac
}

compute_file_content_hash() {
    local file_path="$1"
    local algorithm="${2:-sha256}"

    if [[ ! -f "$file_path" ]]; then
        echo "ERROR: File not found: $file_path" >&2
        return 1
    fi

    case "$algorithm" in
        md5)
            md5sum "$file_path" | cut -d' ' -f1
            ;;
        sha256)
            sha256sum "$file_path" | cut -d' ' -f1
            ;;
        *)
            echo "ERROR: Unsupported hash algorithm: $algorithm" >&2
            return 1
            ;;
    esac
}
```

### Validate Skill Hash
```bash
validate_skill_hash() {
    local db_path="$1"
    local skill_name="$2"
    local cache_file="$3"

    # SQL INJECTION PREVENTION: Validate skill name before query
    validate_sql_identifier "$skill_name" "skill name" || return 1

    # Get stored hash from database (validated identifier - safe to interpolate)
    local stored_hash
    stored_hash=$(sqlite3 "$db_path" <<EOF
SELECT hash FROM skills WHERE name = '${skill_name//\'/\'\'}' LIMIT 1;
EOF
)

    if [[ -z "$stored_hash" ]]; then
        echo "WARNING: No hash found for skill: $skill_name" >&2
        return 0  # No hash to validate
    fi

    # Compute hash of cached file
    local actual_hash
    actual_hash=$(compute_file_content_hash "$cache_file" "sha256")

    if [[ "$actual_hash" != "$stored_hash" ]]; then
        echo "ERROR: Hash mismatch for skill: $skill_name" >&2
        echo "  Expected: $stored_hash" >&2
        echo "  Actual: $actual_hash" >&2
        return 1
    fi

    echo "Hash validated: $skill_name"
    return 0
}
```

### Update Skill Hash in Database
```bash
update_skill_hash() {
    local db_path="$1"
    local skill_name="$2"
    local skill_content="$3"

    # SQL INJECTION PREVENTION: Validate skill name before query
    validate_sql_identifier "$skill_name" "skill name" || return 1

    # Compute hash of new content
    local new_hash
    new_hash=$(compute_content_hash "$skill_content" "sha256")

    # Update hash in database (validated identifier - safe to interpolate)
    sqlite3 "$db_path" <<EOF
UPDATE skills SET hash = '$new_hash' WHERE name = '${skill_name//\'/\'\'}';
EOF

    echo "Updated hash for skill: $skill_name ($new_hash)"
}
```

## Skill Loading with Validation

### Load and Validate Skill
```bash
load_and_validate_skill() {
    local db_path="$1"
    local skill_name="$2"
    local cache_dir="${3:-./.skill-cache}"
    local validate_hash="${4:-true}"

    # Load skill from database
    local cache_file
    cache_file=$(load_skill_from_db "$db_path" "$skill_name" "$cache_dir") || return 1

    # Validate hash if requested
    if [[ "$validate_hash" == "true" ]]; then
        if ! validate_skill_hash "$db_path" "$skill_name" "$cache_file"; then
            echo "ERROR: Hash validation failed, removing cached file" >&2
            rm -f "$cache_file"
            return 1
        fi
    fi

    echo "$cache_file"
}
```

### Load Skills with Dependency Resolution
```bash
load_skills_with_dependencies() {
    local db_path="$1"
    local skill_name="$2"
    local cache_dir="${3:-./.skill-cache}"

    local -a loaded_skills=()
    local -a skill_queue=("$skill_name")
    local -A processed_skills=()

    while [[ ${#skill_queue[@]} -gt 0 ]]; do
        local current_skill="${skill_queue[0]}"
        skill_queue=("${skill_queue[@]:1}")  # Remove first element

        # Skip if already processed
        [[ -n "${processed_skills[$current_skill]:-}" ]] && continue
        processed_skills[$current_skill]=1

        # Load skill
        local cache_file
        cache_file=$(load_and_validate_skill "$db_path" "$current_skill" "$cache_dir") || {
            echo "ERROR: Failed to load skill: $current_skill" >&2
            return 1
        }

        loaded_skills+=("$cache_file")

        # Get dependencies (if any)
        local dependencies
        dependencies=$(sqlite3 "$db_path" <<EOF
SELECT depends_on FROM skill_dependencies WHERE skill_name = '${current_skill//\'/\'\'}';
EOF
)

        # Add dependencies to queue
        while IFS= read -r dep; do
            [[ -z "$dep" ]] && continue
            skill_queue+=("$dep")
        done <<< "$dependencies"
    done

    printf '%s\n' "${loaded_skills[@]}"
}
```

## Agent Context Injection

### Build Skill Context for Agent
```bash
build_agent_skill_context() {
    local db_path="$1"
    local agent_type="$2"
    local cache_dir="${3:-./.skill-cache}"

    # SQL INJECTION PREVENTION: Validate agent type before query
    validate_sql_identifier "$agent_type" "agent type" || return 1

    # Get required skills for agent type (validated identifier - safe to interpolate)
    local skill_names
    skill_names=$(sqlite3 "$db_path" <<EOF
SELECT s.name
FROM skills s
JOIN agent_skills a ON s.id = a.skill_id
JOIN agents ag ON a.agent_id = ag.id
WHERE ag.type = '${agent_type//\'/\'\'}'
ORDER BY a.priority;
EOF
)

    if [[ -z "$skill_names" ]]; then
        echo "WARNING: No skills configured for agent type: $agent_type" >&2
        return 0
    fi

    local skill_context=""

    # Load each skill and concatenate
    while IFS= read -r skill_name; do
        local cache_file
        if cache_file=$(load_and_validate_skill "$db_path" "$skill_name" "$cache_dir"); then
            skill_context+=$'\n\n'
            skill_context+="# Skill: $skill_name"
            skill_context+=$'\n\n'
            skill_context+=$(cat "$cache_file")
        fi
    done <<< "$skill_names"

    echo "$skill_context"
}

# Usage
AGENT_CONTEXT=$(build_agent_skill_context "./data/skills.db" "backend-developer")
echo "Agent context built (${#AGENT_CONTEXT} chars)"
```

### Inject Skills into Agent Prompt
```bash
inject_skills_into_prompt() {
    local base_prompt="$1"
    local skill_context="$2"

    # Create enhanced prompt
    cat <<EOF
$base_prompt

## Specialized Skills

The following skills are available for this agent:

$skill_context

---

Use these skills to guide your work and ensure best practices.
EOF
}

# Usage
BASE_PROMPT=$(cat agent-base-prompt.txt)
SKILL_CONTEXT=$(build_agent_skill_context "./data/skills.db" "backend-developer")
ENHANCED_PROMPT=$(inject_skills_into_prompt "$BASE_PROMPT" "$SKILL_CONTEXT")
```

## Performance Optimization

### Preload Bootstrap Skills
```bash
preload_bootstrap_skills() {
    local db_path="$1"
    local cache_dir="${2:-./.skill-cache}"

    # Bootstrap skills that should always be loaded
    local -a bootstrap_skills=(
        "database-connection"
        "error-handling"
        "bash-fundamentals"
        "file-operations"
        "skill-loader"
    )

    echo "Preloading ${#bootstrap_skills[@]} bootstrap skills..."

    local start_time=$(date +%s)

    if load_skills_batch "$db_path" "$cache_dir" "${bootstrap_skills[@]}"; then
        local end_time=$(date +%s)
        local duration=$((end_time - start_time))
        echo "Bootstrap skills loaded in ${duration}s"
        return 0
    else
        echo "ERROR: Failed to preload bootstrap skills" >&2
        return 1
    fi
}
```

### Parallel Skill Loading
```bash
load_skills_parallel() {
    local db_path="$1"
    local cache_dir="${2:-./.skill-cache}"
    shift 2
    local skill_names=("$@")

    local load_timeout="${SKILL_LOAD_TIMEOUT:-30}"  # Default 30 seconds

    local -a pids=()

    # Load skills in parallel with timeout protection
    for skill_name in "${skill_names[@]}"; do
        (
            timeout "$load_timeout" load_and_validate_skill "$db_path" "$skill_name" "$cache_dir" &>/dev/null
            local exit_code=$?
            if [[ $exit_code -eq 124 ]]; then
                echo "ERROR: Skill load timeout after ${load_timeout}s: $skill_name" >&2
                exit 124
            fi
            exit $exit_code
        ) &
        pids+=($!)
    done

    # Wait for all loads to complete
    local failed=0
    local timeout_failures=0
    for pid in "${pids[@]}"; do
        wait "$pid"
        local exit_code=$?
        if [[ $exit_code -ne 0 ]]; then
            ((failed++))
            if [[ $exit_code -eq 124 ]]; then
                ((timeout_failures++))
            fi
        fi
    done

    if [[ $failed -gt 0 ]]; then
        echo "ERROR: $failed skills failed to load (${timeout_failures} timeouts)" >&2
        return 1
    fi

    echo "All ${#skill_names[@]} skills loaded successfully"
}
```

## Success Criteria

- ✅ Dynamic skill loading from SQLite database
- ✅ Skill cache initialization and management
- ✅ Age-based cache cleanup and invalidation
- ✅ SHA-256 hash validation for content integrity
- ✅ Dependency resolution for skill loading
- ✅ Agent-specific skill context building
- ✅ Skill injection into agent prompts
- ✅ Bootstrap skill preloading
- ✅ Parallel skill loading for performance
- ✅ Cache statistics and monitoring
- ✅ Error handling for missing or invalid skills
