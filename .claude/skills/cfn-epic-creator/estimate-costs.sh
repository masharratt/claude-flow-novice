#!/usr/bin/env bash
set -euo pipefail

# CFN Epic Creator - Estimate Costs
# Aggregates cost estimates from all personas in epic JSON

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
CFN Epic Creator - Estimate Costs

USAGE:
    ./estimate-costs.sh <json-file> [OPTIONS]

REQUIRED ARGUMENTS:
    <json-file>    Path to the epic JSON file

OPTIONS:
    -p, --persona <name>    Show costs for specific persona only
                            Valid: product-owner, architect, security-specialist,
                                  performance-specialist, accessibility-advocate,
                                  devops-engineer
    
    -t, --type <type>       Filter by recommendation type
                            Valid: blocking, suggested
    
    -r, --priority <prio>   Filter by recommendation priority
                            Valid: critical, high, medium, low
    
    -f, --format <fmt>      Output format
                            Valid: summary (default), detailed, csv, json
    
    -c, --currency <curr>   Currency symbol for display (default: $)
    
    -s, --sort-by <field>   Sort personas by field
                            Valid: total, blocking, suggested, name
    
    -o, --output <file>     Write output to file instead of stdout
    
    --no-colors             Disable colored output
    
    -h, --help              Show this help message

EXAMPLES:
    # Show cost summary
    ./estimate-costs.sh epic.json

    # Detailed breakdown by persona
    ./estimate-costs.sh epic.json --format=detailed

    # CSV export
    ./estimate-costs.sh epic.json --format=csv --output=costs.csv

    # Costs for blocking recommendations only
    ./estimate-costs.sh epic.json --type=blocking

    # Sort by highest cost
    ./estimate-costs.sh epic.json --sort-by=total

HELP_EOF
}

# Parse currency value to number
parse_currency() {
    local value="$1"
    # Remove currency symbols, commas, and whitespace
    echo "$value" | sed 's/[$£€¥,]//g' | tr -d ' ' | grep -o '[0-9]*\.?[0-9]*' | head -1
}

# Format number as currency
format_currency() {
    local number="$1"
    local currency="$2"
    
    # Check if it's a valid number
    if ! echo "$number" | grep -qE '^[0-9]*\.?[0-9]+$'; then
        echo "${currency}0"
        return
    fi
    
    # Format with commas
    printf "${currency}%'d" "$(echo "$number" | cut -d. -f1)" 2>/dev/null || echo "${currency}${number}"
}

# Calculate cost estimates
calculate_costs() {
    local json_file="$1"
    local persona_filter="$2"
    local type_filter="$3"
    local priority_filter="$4"
    local format="$5"
    local currency="$6"
    local sort_by="$7"
    local use_colors="$8"
    
    # Build base query
    local personas_query='.epic.personas'
    if [[ -n "$persona_filter" ]]; then
        personas_query="${personas_query}[] | select(.name == \"${persona_filter}\")"
    else
        personas_query="${personas_query}[]"
    fi
    
    # Extract cost data
    local cost_data
    cost_data=$(jq -r "
        ${personas_query} |
        {
            name: .name,
            total_estimated: (
                .recommendations |
                map(
                    select(
                        ${type_filter:+(.type == \"${type_filter}\")} |
                        ${priority_filter:+(.priority == \"${priority_filter}\")}
                    )
                ) |
                map(
                    .estimatedCost // \"0\" |
                    if test(\"^[0-9]+$\") then 
                        tonumber 
                    else 
                        (capture(\"(?<currency>[$£€¥]?)(?<amount>[0-9,]+\\.?[0-9]*)\") | .amount | gsub(\",\"; \"\") | tonumber) // 0
                    end
                ) |
                add
            ),
            recommendations: (
                .recommendations |
                map(
                    select(
                        ${type_filter:+(.type == \"${type_filter}\")} |
                        ${priority_filter:+(.priority == \"${priority_filter}\")}
                    )
                )
            ),
            categories: .costAnalysis // {}
        } |
        {
            persona: .name,
            total: .total_estimated,
            blocking: ([.recommendations[] | select(.type == \"blocking\")] | map(.estimatedCost // \"0\" | if test(\"^[0-9]+$\") then tonumber else (capture(\"(?<currency>[$£€¥]?)(?<amount>[0-9,]+\\.?[0-9]*)\") | .amount | gsub(\",\"; \"\") | tonumber) // 0 end) | add),
            suggested: ([.recommendations[] | select(.type == \"suggested\")] | map(.estimatedCost // \"0\" | if test(\"^[0-9]+$\") then tonumber else (capture(\"(?<currency>[$£€¥]?)(?<amount>[0-9,]+\\.?[0-9]*)\") | .amount | gsub(\",\"; \"\") | tonumber) // 0 end) | add),
            count: (.recommendations | length),
            categories: .categories
        }
    " "$json_file")
    
    # Apply sorting
    if [[ -n "$sort_by" ]]; then
        case "$sort_by" in
            "total")
                cost_data=$(echo "$cost_data" | jq -s 'sort_by(.total) | reverse | .[]')
                ;;
            "blocking")
                cost_data=$(echo "$cost_data" | jq -s 'sort_by(.blocking) | reverse | .[]')
                ;;
            "suggested")
                cost_data=$(echo "$cost_data" | jq -s 'sort_by(.suggested) | reverse | .[]')
                ;;
            "name")
                cost_data=$(echo "$cost_data" | jq -s 'sort_by(.persona) | .[]')
                ;;
        esac
    fi
    
    # Output based on format
    case "$format" in
        "detailed")
            output_detailed "$cost_data" "$currency" "$use_colors"
            ;;
        "csv")
            output_csv "$cost_data" "$currency"
            ;;
        "json")
            echo "$cost_data"
            ;;
        *)
            output_summary "$cost_data" "$currency" "$use_colors"
            ;;
    esac
}

# Output summary format
output_summary() {
    local cost_data="$1"
    local currency="$2"
    local use_colors="$3"
    
    local grand_total=0
    local grand_blocking=0
    local grand_suggested=0
    local grand_count=0
    
    # Header
    if [[ "$use_colors" == true ]]; then
        echo -e "${CYAN}=== Epic Cost Estimate Summary ===${NC}"
    else
        echo "=== Epic Cost Estimate Summary ==="
    fi
    echo ""
    
    # Table header
    printf "%-25s %12s %12s %12s %8s\n" "Persona" "Total" "Blocking" "Suggested" "Count"
    printf "%-25s %12s %12s %12s %8s\n" "------------------------" "------------" "------------" "------------" "--------"
    
    # Process each persona
    while IFS= read -r persona; do
        local name
        name=$(jq -r '.persona' <<< "$persona")
        local total
        total=$(jq -r '.total' <<< "$persona")
        local blocking
        blocking=$(jq -r '.blocking' <<< "$persona")
        local suggested
        suggested=$(jq -r '.suggested' <<< "$persona")
        local count
        count=$(jq -r '.count' <<< "$persona")
        
        # Format display name
        local display_name
        display_name=$(echo "$name" | sed 's/-/ /g' | sed 's/\b\w/\u&/g')
        
        # Format costs
        local total_fmt
        total_fmt=$(format_currency "$total" "$currency")
        local blocking_fmt
        blocking_fmt=$(format_currency "$blocking" "$currency")
        local suggested_fmt
        suggested_fmt=$(format_currency "$suggested" "$currency")
        
        # Color coding for high costs
        if [[ "$use_colors" == true ]]; then
            if (( $(echo "$total > 100000" | bc -l) )); then
                display_name="${RED}${display_name}${NC}"
            elif (( $(echo "$total > 50000" | bc -l) )); then
                display_name="${YELLOW}${display_name}${NC}"
            fi
        fi
        
        # Output row
        printf "%-25s %12s %12s %12s %8s\n" "$display_name" "$total_fmt" "$blocking_fmt" "$suggested_fmt" "$count"
        
        # Update totals
        grand_total=$(echo "$grand_total + $total" | bc)
        grand_blocking=$(echo "$grand_blocking + $blocking" | bc)
        grand_suggested=$(echo "$grand_suggested + $suggested" | bc)
        grand_count=$((grand_count + count))
    done <<< "$cost_data"
    
    # Separator
    printf "%-25s %12s %12s %12s %8s\n" "------------------------" "------------" "------------" "------------" "--------"
    
    # Grand total
    if [[ "$use_colors" == true ]]; then
        local total_fmt
        total_fmt=$(format_currency "$grand_total" "$currency")
        printf "${GREEN}%-25s %12s${NC} ${GREEN}%12s${NC} ${GREEN}%12s${NC} %8s\n" "GRAND TOTAL" "$total_fmt" "$(format_currency "$grand_blocking" "$currency")" "$(format_currency "$grand_suggested" "$currency")" "$grand_count"
    else
        printf "%-25s %12s %12s %12s %8s\n" "GRAND TOTAL" "$(format_currency "$grand_total" "$currency")" "$(format_currency "$grand_blocking" "$currency")" "$(format_currency "$grand_suggested" "$currency")" "$grand_count"
    fi
    
    echo ""
    
    # Additional analysis
    if [[ "$use_colors" == true ]]; then
        echo -e "${CYAN}Cost Analysis:${NC}"
    else
        echo "Cost Analysis:"
    fi
    
    # Calculate percentages
    local blocking_percent
    blocking_percent=$(echo "scale=1; ($grand_blocking * 100) / $grand_total" | bc)
    local suggested_percent
    suggested_percent=$(echo "scale=1; ($grand_suggested * 100) / $grand_total" | bc)
    
    echo "  Blocking recommendations: $(format_currency "$grand_blocking" "$currency") (${blocking_percent}%)"
    echo "  Suggested recommendations: $(format_currency "$grand_suggested" "$currency") (${suggested_percent}%)"
    echo "  Average cost per recommendation: $(format_currency "$(echo "scale=2; $grand_total / $grand_count" | bc)" "$currency")"
}

# Output detailed format
output_detailed() {
    local cost_data="$1"
    local currency="$2"
    local use_colors="$3"
    
    while IFS= read -r persona; do
        local name
        name=$(jq -r '.persona' <<< "$persona")
        local display_name
        display_name=$(echo "$name" | sed 's/-/ /g' | sed 's/\b\w/\u&/g')
        local total
        total=$(jq -r '.total' <<< "$persona")
        local blocking
        blocking=$(jq -r '.blocking' <<< "$persona")
        local suggested
        suggested=$(jq -r '.suggested' <<< "$persona")
        local categories
        categories=$(jq -c '.categories' <<< "$persona")
        
        if [[ "$use_colors" == true ]]; then
            echo -e "${CYAN}=== ${display_name} ===${NC}"
        else
            echo "=== ${display_name} ==="
        fi
        
        echo "Total Cost: $(format_currency "$total" "$currency")"
        echo "  - Blocking: $(format_currency "$blocking" "$currency")"
        echo "  - Suggested: $(format_currency "$suggested" "$currency")"
        
        # Show categories if available
        if [[ "$categories" != "{}" && "$categories" != "null" ]]; then
            echo ""
            echo "Cost by Category:"
            echo "$categories" | jq -r 'to_entries[] | "  \(.key): \(.value)"' | sed "s/^/  /"
        fi
        
        echo ""
        echo "---"
        echo ""
    done <<< "$cost_data"
}

# Output CSV format
output_csv() {
    local cost_data="$1"
    local currency="$2"
    
    # CSV header
    echo "Persona,Total,Blocking,Suggested,Count"
    
    # CSV rows
    while IFS= read -r persona; do
        local name
        name=$(jq -r '.persona' <<< "$persona")
        local total
        total=$(jq -r '.total' <<< "$persona")
        local blocking
        blocking=$(jq -r '.blocking' <<< "$persona")
        local suggested
        suggested=$(jq -r '.suggested' <<< "$persona")
        local count
        count=$(jq -r '.count' <<< "$persona")
        
        echo "\"$name\",$total,$blocking,$suggested,$count"
    done <<< "$cost_data"
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

# Main execution
main() {
    # Parse command line arguments
    local json_file=""
    local persona_filter=""
    local type_filter=""
    local priority_filter=""
    local format="summary"
    local currency="$"
    local sort_by=""
    local output_file=""
    local use_colors=true
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
                if [[ "$type_filter" != "blocking" && "$type_filter" != "suggested" ]]; then
                    log_error "Invalid type: $type_filter"
                    exit 1
                fi
                shift 2
                ;;
            -r|--priority)
                priority_filter="$2"
                case "$priority_filter" in
                    "critical"|"high"|"medium"|"low") ;;
                    *) log_error "Invalid priority: $priority_filter"; exit 1 ;;
                esac
                shift 2
                ;;
            -f|--format)
                format="$2"
                case "$format" in
                    "summary"|"detailed"|"csv"|"json") ;;
                    *) log_error "Invalid format: $format"; exit 1 ;;
                esac
                shift 2
                ;;
            -c|--currency)
                currency="$2"
                shift 2
                ;;
            -s|--sort-by)
                sort_by="$2"
                case "$sort_by" in
                    "total"|"blocking"|"suggested"|"name") ;;
                    *) log_error "Invalid sort field: $sort_by"; exit 1 ;;
                esac
                shift 2
                ;;
            -o|--output)
                output_file="$2"
                shift 2
                ;;
            --no-colors)
                use_colors=false
                shift
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
    
    # Check if bc is available for floating point arithmetic
    if ! command -v bc >/dev/null 2>&1; then
        log_error "Required command 'bc' not found. Please install bc for floating point calculations."
        exit 1
    fi
    
    # Calculate and output costs
    local output
    output=$(calculate_costs "$json_file" "$persona_filter" "$type_filter" "$priority_filter" "$format" "$currency" "$sort_by" "$use_colors")
    
    # Output to file or stdout
    if [[ -n "$output_file" ]]; then
        echo "$output" > "$output_file"
        log_success "Cost estimates written to: $output_file"
    else
        echo "$output"
    fi
    
    exit 0
}

# Execute main function
main "$@"
