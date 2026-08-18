#!/usr/bin/env bash

# Pattern Analyzer for Workflow Codification System
# Analyzes ACE reflections to detect repeated workflow patterns suitable for codification
# Usage: ./analyze-patterns.sh [OPTIONS]

set -euo pipefail

# ============================================================================
# CONFIGURATION
# ============================================================================
readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly DEFAULT_DB_HOST="${CFN_DB_HOST:-localhost}"
readonly DEFAULT_DB_PORT="${CFN_DB_PORT:-5432}"
readonly DEFAULT_DB_NAME="${CFN_DB_NAME:-cfn_workflow}"
readonly DEFAULT_DB_USER="${CFN_DB_USER:-cfn_user}"
readonly DEFAULT_TIME_WINDOW_DAYS=90
readonly DEFAULT_MIN_OCCURRENCES=5
readonly DEFAULT_MIN_SIMILARITY=0.85
readonly DEFAULT_MIN_CONFIDENCE=0.90
readonly OUTPUT_DIR="/tmp/workflow-patterns"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# ============================================================================
# LOGGING FUNCTIONS
# ============================================================================
log() {
    echo -e "${BLUE}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $*" >&2
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $*" >&2
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $*" >&2
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $*" >&2
}

# ============================================================================
# USAGE FUNCTION
# ============================================================================
usage() {
    cat << EOF
Pattern Analyzer for Workflow Codification System

Analyzes ACE reflections from PostgreSQL to detect repeated workflow patterns
suitable for codification into executable skills.

Usage: $0 [OPTIONS]

Options:
  --db-host HOST         PostgreSQL host (default: localhost)
  --db-port PORT         PostgreSQL port (default: 5432)
  --db-name NAME         Database name (default: cfn_workflow)
  --db-user USER         Database user (default: cfn_user)
  --db-password PASS     Database password (env: CFN_DB_PASSWORD)
  --time-window DAYS     Analysis time window in days (default: 90)
  --min-occurrences N    Minimum pattern occurrences (default: 5)
  --min-similarity N     Minimum similarity score 0.0-1.0 (default: 0.85)
  --min-confidence N     Minimum confidence score 0.0-1.0 (default: 0.90)
  --output-dir DIR       Output directory for reports (default: /tmp/workflow-patterns)
  --output-format FMT    Output format: json|summary|both (default: both)
  --insert-db            Insert results into workflow_patterns table
  --verbose              Enable verbose logging
  --help                 Show this help message

Environment Variables:
  CFN_DB_HOST           PostgreSQL host
  CFN_DB_PORT           PostgreSQL port
  CFN_DB_NAME           Database name
  CFN_DB_USER           Database user
  CFN_DB_PASSWORD       Database password

Examples:
  # Basic analysis with default settings
  $0

  # Custom thresholds with database insertion
  $0 --min-occurrences 10 --min-similarity 0.90 --insert-db

  # Verbose mode with custom output directory
  $0 --verbose --output-dir ./patterns --output-format json

  # Production environment with environment variables
  export CFN_DB_PASSWORD=secret
  $0 --db-host db.production.com --insert-db

Output:
  - Pattern report in JSON format
  - Summary statistics
  - Optional database insertion into workflow_patterns table

EOF
}

# ============================================================================
# PARAMETER VALIDATION
# ============================================================================
validate_float() {
    local value="$1"
    local name="$2"
    local min="${3:-0.0}"
    local max="${4:-1.0}"

    if ! [[ "$value" =~ ^[0-9]+\.?[0-9]*$ ]]; then
        log_error "$name must be a valid number: $value"
        return 1
    fi

    if (( $(echo "$value < $min" | bc -l) )) || (( $(echo "$value > $max" | bc -l) )); then
        log_error "$name must be between $min and $max: $value"
        return 1
    fi
}

validate_integer() {
    local value="$1"
    local name="$2"
    local min="${3:-1}"

    if ! [[ "$value" =~ ^[0-9]+$ ]]; then
        log_error "$name must be a valid integer: $value"
        return 1
    fi

    if (( value < min )); then
        log_error "$name must be at least $min: $value"
        return 1
    fi
}

# ============================================================================
# DATABASE FUNCTIONS
# ============================================================================
check_postgresql_connection() {
    local host="$1"
    local port="$2"
    local dbname="$3"
    local user="$4"
    local password="${5:-}"

    log "Checking PostgreSQL connection to $host:$port/$dbname"

    # Check if psql is available
    if ! command -v psql &> /dev/null; then
        log_error "psql command not found. Please install PostgreSQL client."
        return 1
    fi

    # Build connection string
    local conn_str="host=$host port=$port dbname=$dbname user=$user"
    if [[ -n "$password" ]]; then
        export PGPASSWORD="$password"
    fi

    # Test connection
    if psql "$conn_str" -c "SELECT 1" &> /dev/null; then
        log_success "PostgreSQL connection successful"
        return 0
    else
        log_error "Cannot connect to PostgreSQL at $host:$port/$dbname"
        return 1
    fi
}

execute_query() {
    local host="$1"
    local port="$2"
    local dbname="$3"
    local user="$4"
    local password="$5"
    local query="$6"

    local conn_str="host=$host port=$port dbname=$dbname user=$user"
    if [[ -n "$password" ]]; then
        export PGPASSWORD="$password"
    fi

    # Execute query and return JSON output
    psql "$conn_str" -t -A -F"," -c "$query" 2>/dev/null || {
        log_error "Query execution failed"
        return 1
    }
}

# ============================================================================
# PATTERN ANALYSIS FUNCTIONS
# ============================================================================

# Generate normalized workflow signature from steps
generate_workflow_signature() {
    local workflow_steps="$1"

    # Extract commands from workflow steps (ignore parameters)
    # Normalize whitespace and case
    # Join with delimiter
    echo "$workflow_steps" | jq -r '
        if type == "array" then
            [.[] |
                gsub("^\\s+|\\s+$"; "") |
                gsub("\\s+"; " ") |
                split(" ")[0:3] |
                join(" ")
            ] |
            join(" → ")
        else
            empty
        end' 2>/dev/null || echo "unknown"
}

# Calculate Jaccard similarity between two sets
calculate_jaccard_similarity() {
    local steps_a="$1"
    local steps_b="$2"

    # Use jq to calculate set intersection and union
    local similarity
    similarity=$(jq -n \
        --argjson a "$steps_a" \
        --argjson b "$steps_b" \
        '
        ($a | unique) as $set_a |
        ($b | unique) as $set_b |
        ($set_a + $set_b | unique) as $union |
        ($set_a - ($set_a - $set_b)) as $intersection |
        if ($union | length) > 0 then
            ($intersection | length) / ($union | length)
        else
            0
        end
        ' 2>/dev/null)

    echo "$similarity"
}

# Calculate average pairwise similarity across reflection group
calculate_similarity_score() {
    local reflections_json="$1"

    # Extract workflow steps from all reflections
    local count
    count=$(echo "$reflections_json" | jq 'length')

    if (( count < 2 )); then
        echo "1.0"
        return
    fi

    local total_similarity=0
    local comparisons=0

    # Calculate pairwise similarities
    for (( i=0; i<count-1; i++ )); do
        for (( j=i+1; j<count; j++ )); do
            local steps_a
            local steps_b

            steps_a=$(echo "$reflections_json" | jq -c ".[$i].workflow_steps")
            steps_b=$(echo "$reflections_json" | jq -c ".[$j].workflow_steps")

            local similarity
            similarity=$(calculate_jaccard_similarity "$steps_a" "$steps_b")

            total_similarity=$(echo "$total_similarity + $similarity" | bc -l)
            ((comparisons++))
        done
    done

    # Calculate average
    if (( comparisons > 0 )); then
        echo "scale=3; $total_similarity / $comparisons" | bc -l
    else
        echo "0.0"
    fi
}

# Check if workflow is deterministic
check_deterministic() {
    local reflections_json="$1"

    # Heuristic 1: Check for non-deterministic patterns in workflow steps
    local has_nondeterministic
    has_nondeterministic=$(echo "$reflections_json" | jq -r '
        [.[] | .workflow_steps[] | select(
            test("random|timestamp|date|uuid|\\$\\(date|Math\\.random|rand\\(") or
            test("api\\..*\\.com|http://|https://") or
            test("curl |wget |fetch\\(")
        )] | length > 0
    ' 2>/dev/null)

    if [[ "$has_nondeterministic" == "true" ]]; then
        echo "false"
        return
    fi

    # Heuristic 2: Check output variance
    local unique_outputs
    local total_outputs

    unique_outputs=$(echo "$reflections_json" | jq '[.[].output] | unique | length' 2>/dev/null || echo "0")
    total_outputs=$(echo "$reflections_json" | jq 'length' 2>/dev/null || echo "1")

    # If more than 30% output variance, likely not deterministic
    local variance
    variance=$(echo "scale=3; $unique_outputs / $total_outputs" | bc -l 2>/dev/null || echo "1.0")

    if (( $(echo "$variance > 0.3" | bc -l) )); then
        echo "false"
    else
        echo "true"
    fi
}

# Estimate monthly cost savings from codifying workflow
estimate_cost_savings() {
    local occurrence_count="$1"
    local days_in_window="${2:-90}"

    # Constants
    local ai_input_tokens=5000
    local ai_output_tokens=2000
    local token_cost_per_million=0.50  # $0.50 per 1M tokens (Z.ai pricing)
    local script_cost=0.0001            # Negligible

    # Calculate per-execution savings
    local total_tokens=$((ai_input_tokens + ai_output_tokens))
    local ai_cost=$(echo "scale=6; ($total_tokens / 1000000) * $token_cost_per_million" | bc -l)
    local savings_per_execution=$(echo "scale=6; $ai_cost - $script_cost" | bc -l)

    # Estimate monthly executions
    local daily_rate=$(echo "scale=3; $occurrence_count / $days_in_window" | bc -l)
    local monthly_executions=$(echo "scale=0; $daily_rate * 30" | bc -l)

    # Calculate monthly savings
    local monthly_savings=$(echo "scale=2; $monthly_executions * $savings_per_execution" | bc -l)

    echo "$monthly_savings"
}

# Calculate priority based on multiple factors
calculate_priority() {
    local occurrence_count="$1"
    local estimated_savings="$2"
    local teams_count="$3"
    local confidence_score="$4"

    local score=0

    # Factor 1: Occurrence count (weight: 40%)
    if (( occurrence_count >= 20 )); then
        score=$((score + 40))
    elif (( occurrence_count >= 10 )); then
        score=$((score + 25))
    else
        score=$((score + 10))
    fi

    # Factor 2: Cost savings (weight: 30%)
    if (( $(echo "$estimated_savings >= 50" | bc -l) )); then
        score=$((score + 30))
    elif (( $(echo "$estimated_savings >= 20" | bc -l) )); then
        score=$((score + 20))
    else
        score=$((score + 10))
    fi

    # Factor 3: Teams affected (weight: 20%)
    if (( teams_count >= 3 )); then
        score=$((score + 20))
    elif (( teams_count >= 2 )); then
        score=$((score + 12))
    else
        score=$((score + 5))
    fi

    # Factor 4: Confidence score (weight: 10%)
    if (( $(echo "$confidence_score >= 0.90" | bc -l) )); then
        score=$((score + 10))
    elif (( $(echo "$confidence_score >= 0.80" | bc -l) )); then
        score=$((score + 6))
    else
        score=$((score + 3))
    fi

    # Determine priority
    if (( score >= 75 )); then
        echo "high"
    elif (( score >= 50 )); then
        echo "medium"
    else
        echo "low"
    fi
}

# ============================================================================
# MAIN PATTERN ANALYSIS FUNCTION
# ============================================================================
analyze_workflow_patterns() {
    local db_host="$1"
    local db_port="$2"
    local db_name="$3"
    local db_user="$4"
    local db_password="$5"
    local time_window="$6"
    local min_occurrences="$7"
    local min_similarity="$8"
    local min_confidence="$9"
    local insert_db="${10}"
    local verbose="${11}"

    log "Starting workflow pattern analysis"
    log "Parameters: time_window=${time_window}d, min_occurrences=${min_occurrences}, min_similarity=${min_similarity}, min_confidence=${min_confidence}"

    # Create output directory
    mkdir -p "$OUTPUT_DIR"

    # STEP 1: Query ACE reflections from last N days
    log "Querying ACE reflections from last ${time_window} days"

    local query="
        SELECT
            cr.id,
            cr.task_id,
            cr.team_id,
            cr.content,
            cr.workflow_steps::text,
            cr.confidence,
            cr.created_at::text,
            COALESCE(cr.metadata->>'tags', '[]') as tags,
            COALESCE(cr.metadata->>'domain', 'general') as domain,
            COALESCE(cr.metadata->>'output', '') as output
        FROM context_reflections cr
        WHERE
            cr.created_at > NOW() - INTERVAL '${time_window} days' AND
            cr.confidence >= 0.75 AND
            jsonb_array_length(COALESCE(cr.workflow_steps, '[]'::jsonb)) >= 2
        ORDER BY cr.created_at DESC
    "

    local reflections_raw
    reflections_raw=$(execute_query "$db_host" "$db_port" "$db_name" "$db_user" "$db_password" "$query")

    if [[ -z "$reflections_raw" ]]; then
        log_warning "No reflections found in the specified time window"
        echo '{"patterns": [], "metadata": {"total_reflections": 0, "patterns_found": 0}}'
        return 0
    fi

    # Convert CSV to JSON
    local reflections_json
    reflections_json=$(echo "$reflections_raw" | awk -F',' '
        BEGIN { printf "[" }
        {
            if (NR > 1) printf ","
            printf "{\"id\":\"%s\",\"task_id\":\"%s\",\"team_id\":\"%s\",\"content\":\"%s\",\"workflow_steps\":%s,\"confidence\":%s,\"created_at\":\"%s\",\"tags\":%s,\"domain\":\"%s\",\"output\":\"%s\"}",
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10
        }
        END { printf "]" }
    ' 2>/dev/null)

    local total_reflections
    total_reflections=$(echo "$reflections_json" | jq 'length' 2>/dev/null || echo "0")

    log "Retrieved $total_reflections reflections"

    if [[ "$verbose" == "true" ]]; then
        log "Sample reflection: $(echo "$reflections_json" | jq '.[0]' 2>/dev/null)"
    fi

    # STEP 2: Group reflections by workflow signature
    log "Grouping reflections by workflow similarity"

    # Create associative array for workflow groups
    declare -A workflow_groups
    local signatures=()

    # Process each reflection
    for idx in $(seq 0 $((total_reflections - 1))); do
        local reflection
        reflection=$(echo "$reflections_json" | jq -c ".[$idx]")

        local workflow_steps
        workflow_steps=$(echo "$reflection" | jq -c '.workflow_steps')

        local signature
        signature=$(generate_workflow_signature "$workflow_steps")

        # Add to group
        if [[ -z "${workflow_groups[$signature]:-}" ]]; then
            workflow_groups["$signature"]="$reflection"
            signatures+=("$signature")
        else
            workflow_groups["$signature"]=$(echo "[${workflow_groups[$signature]},$reflection]" | jq -c '.')
        fi
    done

    log "Found ${#signatures[@]} unique workflow signatures"

    # STEP 3: Filter groups with >= min_occurrences
    log "Filtering patterns with >= $min_occurrences occurrences"

    local candidate_patterns=()

    for signature in "${signatures[@]}"; do
        local group="${workflow_groups[$signature]}"
        local group_count

        # Handle both single reflection and array
        if echo "$group" | jq -e 'type == "array"' &>/dev/null; then
            group_count=$(echo "$group" | jq 'length')
        else
            group="[$group]"
            group_count=1
        fi

        if (( group_count >= min_occurrences )); then
            # Calculate similarity score
            local similarity
            similarity=$(calculate_similarity_score "$group")

            # Calculate average confidence
            local avg_confidence
            avg_confidence=$(echo "$group" | jq '[.[].confidence] | add / length')

            # Check if deterministic
            local is_deterministic
            is_deterministic=$(check_deterministic "$group")

            if [[ "$verbose" == "true" ]]; then
                log "Pattern: $signature - occurrences=$group_count, similarity=$similarity, confidence=$avg_confidence, deterministic=$is_deterministic"
            fi

            # Apply filters
            if (( $(echo "$similarity >= $min_similarity" | bc -l) )) && \
               (( $(echo "$avg_confidence >= $min_confidence" | bc -l) )) && \
               [[ "$is_deterministic" == "true" ]]; then

                # Extract common workflow steps
                local common_steps
                common_steps=$(echo "$group" | jq '[.[0].workflow_steps]' | jq -c '.[0]')

                # Extract unique teams
                local teams_affected
                teams_affected=$(echo "$group" | jq -r '[.[].team_id] | unique | join(",")')
                local teams_count
                teams_count=$(echo "$group" | jq '[.[].team_id] | unique | length')

                # Estimate cost savings
                local estimated_savings
                estimated_savings=$(estimate_cost_savings "$group_count" "$time_window")

                # Calculate priority
                local priority
                priority=$(calculate_priority "$group_count" "$estimated_savings" "$teams_count" "$avg_confidence")

                # Create pattern object
                local pattern
                pattern=$(jq -n \
                    --arg signature "$signature" \
                    --argjson steps "$common_steps" \
                    --arg count "$group_count" \
                    --arg teams "$teams_affected" \
                    --arg similarity "$similarity" \
                    --arg confidence "$avg_confidence" \
                    --arg deterministic "$is_deterministic" \
                    --arg savings "$estimated_savings" \
                    --arg priority "$priority" \
                    '{
                        pattern_name: $signature,
                        workflow_steps: $steps,
                        occurrence_count: ($count | tonumber),
                        teams_affected: ($teams | split(",")),
                        similarity_score: ($similarity | tonumber),
                        confidence_score: ($confidence | tonumber),
                        deterministic: ($deterministic == "true"),
                        estimated_savings_usd: ($savings | tonumber),
                        priority: $priority,
                        status: "detected"
                    }')

                candidate_patterns+=("$pattern")

                log_success "Pattern detected: $signature (priority: $priority, savings: \$$estimated_savings/month)"
            fi
        fi
    done

    log "Found ${#candidate_patterns[@]} candidate patterns after filtering"

    # STEP 4: Sort patterns by priority
    local patterns_json="[]"
    for pattern in "${candidate_patterns[@]}"; do
        patterns_json=$(echo "$patterns_json" | jq --argjson p "$pattern" '. + [$p]')
    done

    # Sort by priority (high → medium → low) and estimated savings
    patterns_json=$(echo "$patterns_json" | jq '
        sort_by(
            if .priority == "high" then 0
            elif .priority == "medium" then 1
            else 2 end,
            -.estimated_savings_usd
        )')

    # STEP 5: Generate output
    local timestamp
    timestamp=$(date -u +%Y-%m-%dT%H:%M:%SZ)

    local report
    report=$(jq -n \
        --argjson patterns "$patterns_json" \
        --arg timestamp "$timestamp" \
        --arg total_reflections "$total_reflections" \
        --arg patterns_found "${#candidate_patterns[@]}" \
        --arg time_window "$time_window" \
        --arg min_occurrences "$min_occurrences" \
        --arg min_similarity "$min_similarity" \
        --arg min_confidence "$min_confidence" \
        '{
            metadata: {
                analysis_timestamp: $timestamp,
                time_window_days: ($time_window | tonumber),
                total_reflections_analyzed: ($total_reflections | tonumber),
                patterns_found: ($patterns_found | tonumber),
                filters: {
                    min_occurrences: ($min_occurrences | tonumber),
                    min_similarity: ($min_similarity | tonumber),
                    min_confidence: ($min_confidence | tonumber)
                }
            },
            patterns: $patterns
        }')

    # Save to file
    local output_file="${OUTPUT_DIR}/pattern-analysis-${timestamp}.json"
    echo "$report" > "$output_file"
    log_success "Pattern analysis report saved to: $output_file"

    # STEP 6: Insert into database if requested
    if [[ "$insert_db" == "true" ]]; then
        log "Inserting patterns into workflow_patterns table"

        for idx in $(seq 0 $((${#candidate_patterns[@]} - 1))); do
            local pattern="${candidate_patterns[$idx]}"

            local pattern_name
            local workflow_steps
            local occurrence_count
            local teams_affected
            local similarity_score
            local confidence_score
            local deterministic
            local estimated_savings
            local priority

            pattern_name=$(echo "$pattern" | jq -r '.pattern_name')
            workflow_steps=$(echo "$pattern" | jq -c '.workflow_steps')
            occurrence_count=$(echo "$pattern" | jq -r '.occurrence_count')
            teams_affected=$(echo "$pattern" | jq -r '.teams_affected | join(",")')
            similarity_score=$(echo "$pattern" | jq -r '.similarity_score')
            confidence_score=$(echo "$pattern" | jq -r '.confidence_score')
            deterministic=$(echo "$pattern" | jq -r '.deterministic')
            estimated_savings=$(echo "$pattern" | jq -r '.estimated_savings_usd')
            priority=$(echo "$pattern" | jq -r '.priority')

            # Check if pattern already exists
            local exists_query="
                SELECT id FROM workflow_patterns
                WHERE pattern_name = '$pattern_name'
            "

            local existing_id
            existing_id=$(execute_query "$db_host" "$db_port" "$db_name" "$db_user" "$db_password" "$exists_query" | head -1)

            if [[ -z "$existing_id" ]]; then
                # Insert new pattern
                local insert_query="
                    INSERT INTO workflow_patterns (
                        pattern_name,
                        workflow_steps,
                        occurrence_count,
                        teams_affected,
                        similarity_score,
                        deterministic,
                        confidence_score,
                        estimated_savings_usd,
                        priority,
                        status,
                        created_at
                    ) VALUES (
                        '$pattern_name',
                        '$workflow_steps'::jsonb,
                        $occurrence_count,
                        ARRAY['${teams_affected//,/\',\'}'],
                        $similarity_score,
                        $deterministic,
                        $confidence_score,
                        $estimated_savings,
                        '$priority',
                        'detected',
                        NOW()
                    )
                "

                if execute_query "$db_host" "$db_port" "$db_name" "$db_user" "$db_password" "$insert_query" &>/dev/null; then
                    log_success "Inserted pattern: $pattern_name"
                else
                    log_error "Failed to insert pattern: $pattern_name"
                fi
            else
                log "Pattern already exists in database: $pattern_name (id: $existing_id)"
            fi
        done
    fi

    # Return JSON report
    echo "$report"
}

# ============================================================================
# MAIN EXECUTION
# ============================================================================
main() {
    # Default parameters
    local db_host="$DEFAULT_DB_HOST"
    local db_port="$DEFAULT_DB_PORT"
    local db_name="$DEFAULT_DB_NAME"
    local db_user="$DEFAULT_DB_USER"
    local db_password="${CFN_DB_PASSWORD:-}"
    local time_window="$DEFAULT_TIME_WINDOW_DAYS"
    local min_occurrences="$DEFAULT_MIN_OCCURRENCES"
    local min_similarity="$DEFAULT_MIN_SIMILARITY"
    local min_confidence="$DEFAULT_MIN_CONFIDENCE"
    local output_format="both"
    local insert_db="false"
    local verbose="false"

    # Parse command line arguments
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --db-host)
                db_host="$2"
                shift 2
                ;;
            --db-port)
                db_port="$2"
                shift 2
                ;;
            --db-name)
                db_name="$2"
                shift 2
                ;;
            --db-user)
                db_user="$2"
                shift 2
                ;;
            --db-password)
                db_password="$2"
                shift 2
                ;;
            --time-window)
                time_window="$2"
                shift 2
                ;;
            --min-occurrences)
                min_occurrences="$2"
                shift 2
                ;;
            --min-similarity)
                min_similarity="$2"
                shift 2
                ;;
            --min-confidence)
                min_confidence="$2"
                shift 2
                ;;
            --output-dir)
                OUTPUT_DIR="$2"
                shift 2
                ;;
            --output-format)
                output_format="$2"
                shift 2
                ;;
            --insert-db)
                insert_db="true"
                shift
                ;;
            --verbose)
                verbose="true"
                shift
                ;;
            --help)
                usage
                exit 0
                ;;
            *)
                log_error "Unknown option: $1"
                usage
                exit 1
                ;;
        esac
    done

    # Validate parameters
    validate_integer "$time_window" "time-window" 1 || exit 1
    validate_integer "$min_occurrences" "min-occurrences" 1 || exit 1
    validate_float "$min_similarity" "min-similarity" 0.0 1.0 || exit 1
    validate_float "$min_confidence" "min-confidence" 0.0 1.0 || exit 1

    # Check PostgreSQL connection
    if ! check_postgresql_connection "$db_host" "$db_port" "$db_name" "$db_user" "$db_password"; then
        log_error "PostgreSQL connection check failed"
        exit 1
    fi

    # Run pattern analysis
    local report
    report=$(analyze_workflow_patterns \
        "$db_host" \
        "$db_port" \
        "$db_name" \
        "$db_user" \
        "$db_password" \
        "$time_window" \
        "$min_occurrences" \
        "$min_similarity" \
        "$min_confidence" \
        "$insert_db" \
        "$verbose")

    # Output results based on format
    case "$output_format" in
        json)
            echo "$report" | jq '.'
            ;;
        summary)
            echo "$report" | jq -r '
                "Pattern Analysis Summary",
                "========================",
                "",
                "Analysis Timestamp: " + .metadata.analysis_timestamp,
                "Time Window: " + (.metadata.time_window_days | tostring) + " days",
                "Total Reflections Analyzed: " + (.metadata.total_reflections_analyzed | tostring),
                "Patterns Found: " + (.metadata.patterns_found | tostring),
                "",
                "Filters:",
                "  Min Occurrences: " + (.metadata.filters.min_occurrences | tostring),
                "  Min Similarity: " + (.metadata.filters.min_similarity | tostring),
                "  Min Confidence: " + (.metadata.filters.min_confidence | tostring),
                "",
                "Patterns by Priority:",
                "  High: " + ([.patterns[] | select(.priority == "high")] | length | tostring),
                "  Medium: " + ([.patterns[] | select(.priority == "medium")] | length | tostring),
                "  Low: " + ([.patterns[] | select(.priority == "low")] | length | tostring),
                "",
                "Top 5 Patterns:",
                (.patterns[:5] | to_entries | .[] | "  " + (.key + 1 | tostring) + ". " + .value.pattern_name + " (priority: " + .value.priority + ", savings: $" + (.value.estimated_savings_usd | tostring) + "/month)")
            '
            ;;
        both)
            # Summary to stderr
            echo "$report" | jq -r '
                "Pattern Analysis Summary",
                "========================",
                "",
                "Analysis Timestamp: " + .metadata.analysis_timestamp,
                "Total Patterns Found: " + (.metadata.patterns_found | tostring),
                "High Priority: " + ([.patterns[] | select(.priority == "high")] | length | tostring),
                "Medium Priority: " + ([.patterns[] | select(.priority == "medium")] | length | tostring),
                "Low Priority: " + ([.patterns[] | select(.priority == "low")] | length | tostring)
            ' >&2
            echo "" >&2
            # JSON to stdout
            echo "$report" | jq '.'
            ;;
        *)
            log_error "Invalid output format: $output_format (must be json|summary|both)"
            exit 1
            ;;
    esac

    log_success "Pattern analysis completed successfully"
}

# Run main function if script is executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
