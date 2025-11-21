#!/bin/bash
# CI/CD Pipeline Performance Comparison Tool

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(git rev-parse --show-toplevel)"
RESULTS_DIR="$PROJECT_ROOT/.artifacts/performance-comparison"
DATE_STAMP=$(date +%Y%m%d_%H%M%S)

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_header() {
    echo -e "${CYAN}=== $1 ===${NC}"
}

# Initialize results directory
init_results() {
    mkdir -p "$RESULTS_DIR"
    log_info "Results directory: $RESULTS_DIR"
}

# Validate GitHub CLI installation
validate_gh_cli() {
    if ! command -v gh &> /dev/null; then
        log_error "GitHub CLI (gh) is not installed"
        log_info "Install it from: https://cli.github.com/"
        exit 1
    fi
    
    # Check if authenticated
    if ! gh auth status &> /dev/null; then
        log_error "GitHub CLI is not authenticated"
        log_info "Run: gh auth login"
        exit 1
    fi
    
    log_success "GitHub CLI validated"
}

# Get repository information
get_repo_info() {
    local repo_info
    repo_info=$(gh repo view --json nameWithOwner,defaultBranch)
    
    REPO_NAME=$(echo "$repo_info" | jq -r '.nameWithOwner')
    DEFAULT_BRANCH=$(echo "$repo_info" | jq -r '.defaultBranch')
    
    log_info "Repository: $REPO_NAME"
    log_info "Default branch: $DEFAULT_BRANCH"
}

# Collect workflow run data
collect_workflow_data() {
    local workflow_name="$1"
    local days_back="${2:-30}"
    local results_file="$RESULTS_DIR/${workflow_name}_runs_${DATE_STAMP}.json"
    
    log_info "Collecting data for workflow: $workflow_name"
    
    # Get workflow runs for the specified period
    gh run list \
        --repo "$REPO_NAME" \
        --workflow "$workflow_name" \
        --limit 100 \
        --json createdAt,status,conclusion,displayTitle,headBranch,headSha,databaseId,duration,updatedAt \
        > "$results_file"
    
    local run_count
    run_count=$(jq length "$results_file")
    
    log_success "Collected $run_count workflow runs"
    
    echo "$results_file"
}

# Analyze workflow performance
analyze_workflow_performance() {
    local results_file="$1"
    local workflow_name="$2"
    
    log_info "Analyzing performance for: $workflow_name"
    
    # Extract metrics using jq
    local total_runs
    total_runs=$(jq length "$results_file")
    
    local successful_runs
    successful_runs=$(jq '[.[] | select(.conclusion == "success")] | length' "$results_file")
    
    local failed_runs
    failed_runs=$(jq '[.[] | select(.conclusion == "failure")] | length' "$results_file")
    
    local avg_duration
    avg_duration=$(jq '[.[] | select(.duration != null) | .duration] | add / length' "$results_file")
    
    local max_duration
    max_duration=$(jq '[.[] | select(.duration != null) | .duration] | max' "$results_file")
    
    local min_duration
    min_duration=$(jq '[.[] | select(.duration != null) | .duration] | min' "$results_file")
    
    # Calculate success rate
    local success_rate
    if [[ $total_runs -gt 0 ]]; then
        success_rate=$(echo "scale=2; $successful_runs * 100 / $total_runs" | bc)
    else
        success_rate="0"
    fi
    
    # Generate analysis results
    local analysis_file="$RESULTS_DIR/${workflow_name}_analysis_${DATE_STAMP}.json"
    
    jq -n \
        --arg workflow "$workflow_name" \
        --argjson total_runs "$total_runs" \
        --argjson successful_runs "$successful_runs" \
        --argjson failed_runs "$failed_runs" \
        --arg success_rate "$success_rate" \
        --argjson avg_duration "$avg_duration" \
        --argjson max_duration "$max_duration" \
        --argjson min_duration "$min_duration" \
        --arg analysis_date "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
        '{
            workflow: $workflow,
            analysis_date: $analysis_date,
            total_runs: $total_runs,
            successful_runs: $successful_runs,
            failed_runs: $failed_runs,
            success_rate: ($success_rate | tonumber),
            avg_duration_seconds: $avg_duration,
            max_duration_seconds: $max_duration,
            min_duration_seconds: $min_duration,
            avg_duration_minutes: ($avg_duration / 60),
            max_duration_minutes: ($max_duration / 60),
            min_duration_minutes: ($min_duration / 60)
        }' > "$analysis_file"
    
    log_success "Analysis saved to: $analysis_file"
    
    echo "$analysis_file"
}

# Compare current vs optimized workflows
compare_workflows() {
    log_header "Workflow Performance Comparison"
    
    local current_ci_file="$RESULTS_DIR/CI Pipeline_runs_${DATE_STAMP}.json"
    local optimized_ci_file="$RESULTS_DIR/CI Pipeline Optimized_runs_${DATE_STAMP}.json"
    local current_cd_file="$RESULTS_DIR/Deployment Pipeline_runs_${DATE_STAMP}.json"
    local optimized_cd_file="$RESULTS_DIR/Deployment Pipeline Optimized_runs_${DATE_STAMP}.json"
    
    # Check which files exist
    local ci_comparison=false
    local cd_comparison=false
    
    if [[ -f "$current_ci_file" ]] && [[ -f "$optimized_ci_file" ]]; then
        ci_comparison=true
    fi
    
    if [[ -f "$current_cd_file" ]] && [[ -f "$optimized_cd_file" ]]; then
        cd_comparison=true
    fi
    
    # Generate comparison report
    local comparison_file="$RESULTS_DIR/comparison_report_${DATE_STAMP}.json"
    
    if $ci_comparison; then
        log_info "Comparing CI workflows..."
        
        local current_ci_analysis
        current_ci_analysis=$(analyze_workflow_performance "$current_ci_file" "CI Pipeline")
        
        local optimized_ci_analysis
        optimized_ci_analysis=$(analyze_workflow_performance "$optimized_ci_file" "CI Pipeline Optimized")
        
        # Calculate improvements
        local current_duration
        current_duration=$(jq '.avg_duration_minutes' "$current_ci_analysis")
        
        local optimized_duration
        optimized_duration=$(jq '.avg_duration_minutes' "$optimized_ci_analysis")
        
        local time_improvement
        if (( $(echo "$current_duration > 0" | bc -l) )); then
            time_improvement=$(echo "scale=2; ($current_duration - $optimized_duration) * 100 / $current_duration" | bc)
        else
            time_improvement="0"
        fi
        
        jq -n \
            --argjson current "$(cat "$current_ci_analysis")" \
            --argjson optimized "$(cat "$optimized_ci_analysis")" \
            --argjson time_improvement "$time_improvement" \
            '{
                ci_comparison: {
                    current: $current,
                    optimized: $optimized,
                    time_improvement_percent: ($time_improvement | tonumber)
                }
            }' > "$comparison_file"
        
        log_success "CI comparison completed"
    fi
    
    if $cd_comparison; then
        log_info "Comparing CD workflows..."
        
        local current_cd_analysis
        current_cd_analysis=$(analyze_workflow_performance "$current_cd_file" "Deployment Pipeline")
        
        local optimized_cd_analysis
        optimized_cd_analysis=$(analyze_workflow_performance "$optimized_cd_file" "Deployment Pipeline Optimized")
        
        # Calculate improvements
        local current_duration
        current_duration=$(jq '.avg_duration_minutes' "$current_cd_analysis")
        
        local optimized_duration
        optimized_duration=$(jq '.avg_duration_minutes' "$optimized_cd_analysis")
        
        local time_improvement
        if (( $(echo "$current_duration > 0" | bc -l) )); then
            time_improvement=$(echo "scale=2; ($current_duration - $optimized_duration) * 100 / $current_duration" | bc)
        else
            time_improvement="0"
        fi
        
        local current_success_rate
        current_success_rate=$(jq '.success_rate' "$current_cd_analysis")
        
        local optimized_success_rate
        optimized_success_rate=$(jq '.success_rate' "$optimized_cd_analysis")
        
        local success_improvement
        success_improvement=$(echo "scale=2; $optimized_success_rate - $current_success_rate" | bc)
        
        # Update or create comparison file
        if [[ -f "$comparison_file" ]]; then
            jq --argjson current_cd "$(cat "$current_cd_analysis")" \
               --argjson optimized_cd "$(cat "$optimized_cd_analysis")" \
               --argjson time_improvement "$time_improvement" \
               --argjson success_improvement "$success_improvement" \
               '.cd_comparison = {
                   current: $current_cd,
                   optimized: $optimized_cd,
                   time_improvement_percent: ($time_improvement | tonumber),
                   success_improvement_percent: ($success_improvement | tonumber)
               }' "$comparison_file" > "${comparison_file}.tmp" && \
               mv "${comparison_file}.tmp" "$comparison_file"
        else
            jq -n \
                --argjson current_cd "$(cat "$current_cd_analysis")" \
                --argjson optimized_cd "$(cat "$optimized_cd_analysis")" \
                --argjson time_improvement "$time_improvement" \
                --argjson success_improvement "$success_improvement" \
                '{
                    cd_comparison: {
                        current: $current_cd,
                        optimized: $optimized_cd,
                        time_improvement_percent: ($time_improvement | tonumber),
                        success_improvement_percent: ($success_improvement | tonumber)
                    }
                }' > "$comparison_file"
        fi
        
        log_success "CD comparison completed"
    fi
    
    echo "$comparison_file"
}

# Generate human-readable report
generate_report() {
    local comparison_file="$1"
    
    if [[ ! -f "$comparison_file" ]]; then
        log_warning "No comparison data available for report generation"
        return
    fi
    
    local report_file="$RESULTS_DIR/performance_report_${DATE_STAMP}.md"
    
    cat > "$report_file" << 'EOF'
# CI/CD Pipeline Performance Report

Generated on: 
EOF

    echo "Generated on: $(date -u)" >> "$report_file"
    echo >> "$report_file"
    echo "Repository: $REPO_NAME" >> "$report_file"
    echo "Analysis Period: Last 30 days" >> "$report_file"
    echo >> "$report_file"
    
    # Add CI comparison if available
    if jq -e '.ci_comparison' "$comparison_file" > /dev/null; then
        echo "## CI Pipeline Comparison" >> "$report_file"
        echo >> "$report_file"
        
        local current_duration
        current_duration=$(jq '.ci_comparison.current.avg_duration_minutes' "$comparison_file")
        
        local optimized_duration
        optimized_duration=$(jq '.ci_comparison.optimized.avg_duration_minutes' "$comparison_file")
        
        local time_improvement
        time_improvement=$(jq '.ci_comparison.time_improvement_percent' "$comparison_file")
        
        local current_success_rate
        current_success_rate=$(jq '.ci_comparison.current.success_rate' "$comparison_file")
        
        local optimized_success_rate
        optimized_success_rate=$(jq '.ci_comparison.optimized.success_rate' "$comparison_file")
        
        cat >> "$report_file" << EOF
| Metric | Current | Optimized | Improvement |
|--------|---------|-----------|-------------|
| Average Duration | ${current_duration} min | ${optimized_duration} min | ${time_improvement}% |
| Success Rate | ${current_success_rate}% | ${optimized_success_rate}% | $(echo "$optimized_success_rate - $current_success_rate" | bc)% |
| Total Runs | $(jq '.ci_comparison.current.total_runs' "$comparison_file") | $(jq '.ci_comparison.optimized.total_runs' "$comparison_file") | - |

EOF
    fi
    
    # Add CD comparison if available
    if jq -e '.cd_comparison' "$comparison_file" > /dev/null; then
        echo "## CD Pipeline Comparison" >> "$report_file"
        echo >> "$report_file"
        
        local current_duration
        current_duration=$(jq '.cd_comparison.current.avg_duration_minutes' "$comparison_file")
        
        local optimized_duration
        optimized_duration=$(jq '.cd_comparison.optimized.avg_duration_minutes' "$comparison_file")
        
        local time_improvement
        time_improvement=$(jq '.cd_comparison.time_improvement_percent' "$comparison_file")
        
        local current_success_rate
        current_success_rate=$(jq '.cd_comparison.current.success_rate' "$comparison_file")
        
        local optimized_success_rate
        optimized_success_rate=$(jq '.cd_comparison.optimized.success_rate' "$comparison_file")
        
        cat >> "$report_file" << EOF
| Metric | Current | Optimized | Improvement |
|--------|---------|-----------|-------------|
| Average Duration | ${current_duration} min | ${optimized_duration} min | ${time_improvement}% |
| Success Rate | ${current_success_rate}% | ${optimized_success_rate}% | $(echo "$optimized_success_rate - $current_success_rate" | bc)% |
| Total Runs | $(jq '.cd_comparison.current.total_runs' "$comparison_file") | $(jq '.cd_comparison.optimized.total_runs' "$comparison_file") | - |

EOF
    fi
    
    # Add recommendations
    cat >> "$report_file" << 'EOF'

## Recommendations

### Performance Optimizations
- Monitor cache hit rates to ensure dependency caching is effective
- Consider increasing parallelism for test jobs if resources allow
- Review service container startup times and optimize where possible

### Reliability Improvements
- Implement progressive health checks with appropriate timeouts
- Set up monitoring for deployment rollback scenarios
- Configure alerts for pipeline failures and performance degradation

### Cost Optimization
- Review resource allocation for workflow runners
- Consider using self-hosted runners for specific workloads
- Optimize artifact retention policies

### Monitoring
- Set up dashboards to track pipeline performance over time
- Monitor success rates and identify patterns in failures
- Track resource utilization and optimize accordingly

EOF
    
    log_success "Report generated: $report_file"
    echo "$report_file"
}

# Display summary
display_summary() {
    local comparison_file="$1"
    
    if [[ ! -f "$comparison_file" ]]; then
        log_warning "No comparison data to display"
        return
    fi
    
    log_header "Performance Summary"
    
    # Display CI improvements
    if jq -e '.ci_comparison' "$comparison_file" > /dev/null; then
        local time_improvement
        time_improvement=$(jq '.ci_comparison.time_improvement_percent' "$comparison_file")
        
        echo "CI Pipeline:"
        echo "  Time Improvement: ${time_improvement}%"
        
        if (( $(echo "$time_improvement > 0" | bc -l) )); then
            echo -e "  Status: ${GREEN}Improved${NC}"
        else
            echo -e "  Status: ${RED}Degraded${NC}"
        fi
        echo
    fi
    
    # Display CD improvements
    if jq -e '.cd_comparison' "$comparison_file" > /dev/null; then
        local time_improvement
        time_improvement=$(jq '.cd_comparison.time_improvement_percent' "$comparison_file")
        
        local success_improvement
        success_improvement=$(jq '.cd_comparison.success_improvement_percent' "$comparison_file")
        
        echo "CD Pipeline:"
        echo "  Time Improvement: ${time_improvement}%"
        echo "  Success Rate Improvement: ${success_improvement}%"
        
        if (( $(echo "$time_improvement > 0" | bc -l) )); then
            echo -e "  Status: ${GREEN}Improved${NC}"
        else
            echo -e "  Status: ${RED}Degraded${NC}"
        fi
        echo
    fi
}

# Main execution
main() {
    local mode="${1:-full}"
    local days_back="${2:-30}"
    
    echo "=== CI/CD Pipeline Performance Comparison Tool ==="
    echo
    
    init_results
    validate_gh_cli
    get_repo_info
    
    case "$mode" in
        "collect")
            log_info "Collecting workflow data..."
            
            # Try to collect data for both current and optimized workflows
            if collect_workflow_data "CI Pipeline" "$days_back" > /dev/null; then
                log_success "CI Pipeline data collected"
            fi
            
            if collect_workflow_data "CI Pipeline Optimized" "$days_back" > /dev/null; then
                log_success "CI Pipeline Optimized data collected"
            fi
            
            if collect_workflow_data "Deployment Pipeline" "$days_back" > /dev/null; then
                log_success "Deployment Pipeline data collected"
            fi
            
            if collect_workflow_data "Deployment Pipeline Optimized" "$days_back" > /dev/null; then
                log_success "Deployment Pipeline Optimized data collected"
            fi
            ;;
            
        "compare")
            log_info "Comparing workflows..."
            local comparison_file
            comparison_file=$(compare_workflows)
            
            local report_file
            report_file=$(generate_report "$comparison_file")
            
            display_summary "$comparison_file"
            ;;
            
        "full")
            log_info "Running full analysis..."
            
            # Collect data
            log_info "Step 1: Collecting workflow data..."
            collect_workflow_data "CI Pipeline" "$days_back" > /dev/null || true
            collect_workflow_data "CI Pipeline Optimized" "$days_back" > /dev/null || true
            collect_workflow_data "Deployment Pipeline" "$days_back" > /dev/null || true
            collect_workflow_data "Deployment Pipeline Optimized" "$days_back" > /dev/null || true
            
            # Analyze and compare
            log_info "Step 2: Analyzing performance..."
            local comparison_file
            comparison_file=$(compare_workflows)
            
            # Generate report
            log_info "Step 3: Generating report..."
            local report_file
            report_file=$(generate_report "$comparison_file")
            
            # Display summary
            log_info "Step 4: Displaying summary..."
            display_summary "$comparison_file"
            
            echo
            log_success "Full analysis completed!"
            log_info "Report available at: $report_file"
            ;;
            
        *)
            echo "Usage: $0 [collect|compare|full] [days_back]"
            echo "  collect  - Collect workflow data from GitHub"
            echo "  compare  - Compare workflows and generate report"
            echo "  full     - Run complete analysis (default)"
            echo "  days_back - Number of days to analyze (default: 30)"
            exit 1
            ;;
    esac
}

# Check dependencies
if ! command -v jq &> /dev/null; then
    log_error "jq is not installed. Please install it to continue."
    exit 1
fi

if ! command -v bc &> /dev/null; then
    log_error "bc is not installed. Please install it to continue."
    exit 1
fi

# Run main function with all arguments
main "$@"