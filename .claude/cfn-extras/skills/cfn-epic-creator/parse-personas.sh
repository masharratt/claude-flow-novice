#!/usr/bin/env bash
set -euo pipefail

# CFN Epic Creator - Parse Personas
# Extracts specific persona insights from generated epic JSON

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $*"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $*"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $*"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $*" >&2
}

# Show help message
show_help() {
    cat << 'HELP_EOF'
CFN Epic Creator - Parse Personas

USAGE:
    ./parse-personas.sh <json-file> [OPTIONS]

REQUIRED ARGUMENTS:
    <json-file>    Path to the epic JSON file

OPTIONS:
    -p, --persona <name>    Extract insights for specific persona only
                            Valid: product-owner, architect, security-specialist,
                                  performance-specialist, accessibility-advocate,
                                  devops-engineer
    
    -t, --type <type>       Filter by recommendation type
                            Valid: blocking, suggested
    
    -r, --priority <prio>   Filter by recommendation priority
                            Valid: critical, high, medium, low
    
    -f, --format <fmt>      Output format
                            Valid: text (default), json, markdown
    
    -c, --count             Show only counts per persona
    
    -s, --summary           Show summarized insights only
    
    -o, --output <file>     Write output to file instead of stdout
    
    -h, --help              Show this help message

EXAMPLES:
    # Show all persona insights
    ./parse-personas.sh epic.json

    # Extract only architect insights
    ./parse-personas.sh epic.json --persona=architect

    # Show all blocking recommendations
    ./parse-personas.sh epic.json --type=blocking

    # Show critical and high priority items
    ./parse-personas.sh epic.json --priority=critical --priority=high

    # Export as markdown
    ./parse-personas.sh epic.json --format=markdown --output=personas.md

HELP_EOF
}

# Parse persona insights
parse_persona_insights() {
    local json_file="$1"
    local persona_filter="$2"
    local type_filter="$3"
    local priority_filters="$4"
    local format="$5"
    local count_only="$6"
    local summary_only="$7"
    
    # Build jq query based on filters
    local base_query='.epic.personas'
    
    if [[ -n "$persona_filter" ]]; then
        base_query="${base_query}[] | select(.name == \"${persona_filter}\")"
    else
        base_query="${base_query}[]"
    fi
    
    # If count only requested
    if [[ "$count_only" == true ]]; then
        show_counts "$json_file" "$persona_filter" "$type_filter" "$priority_filters"
        return 0
    fi
    
    # Output based on format
    case "$format" in
        "json")
            output_json "$json_file" "$base_query" "$type_filter" "$priority_filters" "$summary_only"
            ;;
        "markdown")
            output_markdown "$json_file" "$base_query" "$type_filter" "$priority_filters" "$summary_only"
            ;;
        *)
            output_text "$json_file" "$base_query" "$type_filter" "$priority_filters" "$summary_only"
            ;;
    esac
}

# Show counts per persona
show_counts() {
    local json_file="$1"
    local persona_filter="$2"
    local type_filter="$3"
    local priority_filters="$4"
    
    local count_query='.epic.personas[]'
    
    if [[ -n "$persona_filter" ]]; then
        count_query="${count_query} | select(.name == \"${persona_filter}\")"
    fi
    
    echo "Persona Insight Counts:"
    echo "======================="
    
    jq -r "
        ${count_query} |
        {
            persona: .name,
            insights: (.insights | length),
            recommendations: (
                .recommendations |
                map(select(
                    ${type_filter:+(.type == \"${type_filter}\")} |
                    ${priority_filters:+(.priority == \"${priority_filters}\")}
                )) |
                length
            ),
            blocking: (
                .recommendations |
                map(select(.type == \"blocking\"${priority_filters:+ and .priority == \"${priority_filters}\"})) |
                length
            )
        } |
        \"\(.persona): \(.insights) insights, \(.recommendations) recommendations (\(.blocking) blocking)\"
    " "$json_file"
}

# Output in text format
output_text() {
    local json_file="$1"
    local base_query="$2"
    local type_filter="$3"
    local priority_filters="$4"
    local summary_only="$5"
    
    jq -r "
        ${base_query} |
        {
            name: .name,
            status: .status,
            order: .reviewOrder
        } |
        \"=== \(.name | ascii_upcase) ===\"
    " "$json_file"
    
    jq -r "
        ${base_query} |
        \"Status: \(.status) | Review Order: \(.reviewOrder)\"
    " "$json_file"
    
    if [[ -z "$summary_only" ]]; then
        echo ""
        echo "Insights:"
        echo "--------"
        jq -r "
            ${base_query} |
            .insights[] |
            \"• \(.).\"
        " "$json_file"
    fi
    
    echo ""
    echo "Recommendations:"
    echo "---------------"
    
    local rec_query="${base_query}.recommendations[]"
    if [[ -n "$type_filter" ]]; then
        rec_query="${rec_query} | select(.type == \"${type_filter}\")"
    fi
    
    if [[ -n "$priority_filters" ]]; then
        rec_query="${rec_query} | select(.priority == \"${priority_filters}\")"
    fi
    
    jq -r "
        ${rec_query} |
        {
            id: .id,
            title: .title,
            type: .type,
            priority: .priority,
            cost: .estimatedCost // \"Not specified\",
            description: .description
        } |
        \"\(.type | ascii_upcase): \(.title) [\(.priority | ascii_upcase)]\"
    " "$json_file"
    
    if [[ -z "$summary_only" ]]; then
        jq -r "
            ${rec_query} |
            \"  Cost: \(.estimatedCost // \"Not specified\")\"
        " "$json_file"
        
        echo ""
        jq -r "
            ${rec_query} |
            .description |
            split(\"\\n\")[] |
            select(length > 0) |
            \"  \(.)\"
        " "$json_file"
        echo ""
    fi
}

# Output in JSON format
output_json() {
    local json_file="$1"
    local base_query="$2"
    local type_filter="$3"
    local priority_filters="$4"
    local summary_only="$5"
    
    local query="${base_query}"
    
    if [[ -n "$type_filter" ]] || [[ -n "$priority_filters" ]]; then
        query="${query} | 
        .recommendations |= map(
            select(
                ${type_filter:+(.type == \"${type_filter}\")} |
                ${priority_filters:+(.priority == \"${priority_filters}\")}
            )
        )"
    fi
    
    if [[ -n "$summary_only" ]]; then
        query="${query} | 
        {
            name: .name,
            status: .status,
            reviewOrder: .reviewOrder,
            insightCount: (.insights | length),
            recommendationCount: (.recommendations | length),
            blockingCount: ([.recommendations[] | select(.type == \"blocking\")] | length)
        }"
    fi
    
    jq -c "$query" "$json_file"
}

# Output in Markdown format
output_markdown() {
    local json_file="$1"
    local base_query="$2"
    local type_filter="$3"
    local priority_filters="$4"
    local summary_only="$5"
    
    # Header
    echo "# Persona Insights"
    echo ""
    
    # Generate markdown for each persona
    jq -r "
        ${base_query} |
        \"## \(.name | ascii_upcase | gsub(\"-\"; \" \") | gsub(\"SPECIALIST\"; \"Specialist\"))\"
    " "$json_file"
    
    echo ""
    
    jq -r "
        ${base_query} |
        \"**Status:** \(.status) | **Review Order:** \(.reviewOrder)\"
    " "$json_file"
    
    echo ""
    
    if [[ -z "$summary_only" ]]; then
        echo "### Insights"
        echo ""
        jq -r "
            ${base_query} |
            .insights[] |
            \"- \(.).\"
        " "$json_file"
        echo ""
    fi
    
    echo "### Recommendations"
    echo ""
    
    local rec_query="${base_query}.recommendations[]"
    if [[ -n "$type_filter" ]]; then
        rec_query="${rec_query} | select(.type == \"${type_filter}\")"
    fi
    
    if [[ -n "$priority_filters" ]]; then
        rec_query="${rec_query} | select(.priority == \"${priority_filters}\")"
    fi
    
    # Create table header
    echo "| Type | Priority | ID | Title | Cost |"
    echo "|------|----------|----|-------|------|"
    
    # Table rows
    jq -r "
        ${rec_query} |
        \"| \(.type) | \(.priority) | \(.id) | \(.title) | \(.estimatedCost // \"N/A\") |\"
    " "$json_file"
    
    echo ""
    
    if [[ -z "$summary_only" ]]; then
        echo "### Recommendation Details"
        echo ""
        
        jq -r "
            ${rec_query} |
            \"#### \(.title) (\\`\\(.id)\\`)\"
        " "$json_file"
        
        echo ""
        
        jq -r "
            ${rec_query} |
            \"**Type:** \(.type | ascii_upcase)  \n**Priority:** \(.priority | ascii_upcase)  \n**Estimated Cost:** \(.estimatedCost // \"Not specified\")\"
        " "$json_file"
        
        echo ""
        
        jq -r "
            ${rec_query} |
            .description |
            split(\"\\n\")[] |
            select(length > 0) |
            \"\(.)\"
        " "$json_file"
        
        echo ""
        echo "---"
        echo ""
    fi
}

# Validate persona name
validate_persona() {
    local persona="$1"
    local valid_personas=("product-owner" "architect" "security-specialist" "performance-specialist" "accessibility-advocate" "devops-engineer")
    
    for valid in "${valid_personas[@]}"; do
        if [[ "$persona" == "$valid" ]]; then
            return 0
        fi
    done
    
    return 1
}

# Validate recommendation type
validate_type() {
    local type="$1"
    case "$type" in
        "blocking"|"suggested")
            return 0
            ;;
        *)
            return 1
            ;;
    esac
}

# Validate priority
validate_priority() {
    local priority="$1"
    case "$priority" in
        "critical"|"high"|"medium"|"low")
            return 0
            ;;
        *)
            return 1
            ;;
    esac
}

# Validate format
validate_format() {
    local format="$1"
    case "$format" in
        "text"|"json"|"markdown")
            return 0
            ;;
        *)
            return 1
            ;;
    esac
}

# Main execution
main() {
    # Parse command line arguments
    local json_file=""
    local persona_filter=""
    local type_filter=""
    local priority_filters=""
    local format="text"
    local count_only=false
    local summary_only=false
    local output_file=""
    local show_help=false
    
    while [[ $# -gt 0 ]]; do
        case $1 in
            -h|--help)
                show_help=true
                shift
                ;;
            -p|--persona)
                persona_filter="$2"
                validate_persona "$persona_filter" || { log_error "Invalid persona: $persona_filter"; exit 1; }
                shift 2
                ;;
            -t|--type)
                type_filter="$2"
                validate_type "$type_filter" || { log_error "Invalid type: $type_filter"; exit 1; }
                shift 2
                ;;
            -r|--priority)
                priority_filters="$2"
                validate_priority "$priority_filters" || { log_error "Invalid priority: $priority_filters"; exit 1; }
                shift 2
                ;;
            -f|--format)
                format="$2"
                validate_format "$format" || { log_error "Invalid format: $format"; exit 1; }
                shift 2
                ;;
            -c|--count)
                count_only=true
                shift
                ;;
            -s|--summary)
                summary_only=true
                shift
                ;;
            -o|--output)
                output_file="$2"
                shift 2
                ;;
            -*)
                log_error "Unknown option: $1"
                log_error "Use -h or --help for usage information"
                exit 1
                ;;
            *)
                if [[ -z "$json_file" ]]; then
                    json_file="$1"
                else
                    log_error "Too many arguments"
                    log_error "Use -h or --help for usage information"
                    exit 1
                fi
                shift
                ;;
        esac
    done
    
    # Show help if requested
    if [[ "$show_help" == true ]]; then
        show_help
        exit 0
    fi
    
    # Validate required arguments
    if [[ -z "$json_file" ]]; then
        log_error "Missing required JSON file path"
        log_error "Use -h or --help for usage information"
        exit 1
    fi
    
    # Check if file exists
    if [[ ! -f "$json_file" ]]; then
        log_error "File not found: $json_file"
        exit 1
    fi
    
    # Check if valid JSON
    if ! jq empty "$json_file" 2>/dev/null; then
        log_error "Invalid JSON format in: $json_file"
        exit 1
    fi
    
    # Run parsing
    local output
    output=$(parse_persona_insights "$json_file" "$persona_filter" "$type_filter" "$priority_filters" "$format" "$count_only" "$summary_only")
    
    # Output to file or stdout
    if [[ -n "$output_file" ]]; then
        echo "$output" > "$output_file"
        log_success "Persona insights written to: $output_file"
    else
        echo "$output"
    fi
    
    exit 0
}

# Execute main function
main "$@"
