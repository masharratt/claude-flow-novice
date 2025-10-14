#!/bin/bash

# ACE Context Query Helper Script
# Simple CLI for querying adaptive context bullets
# Usage: ./scripts/ace-query.sh [options]

DB_PATH="./.artifacts/database/swarm-memory.db"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

print_help() {
    cat <<EOF
ACE Context Query Helper

Usage:
  ./scripts/ace-query.sh [command] [options]

Commands:
  stats                     Show bullet statistics
  query [category]          Query bullets by category
  search <keyword>          Search bullets by keyword
  top [N]                   Show top N bullets by priority (default: 10)
  recent [N]                Show N most recently used bullets (default: 10)
  add                       Interactive add new bullet
  mark-helpful <bullet-id>  Mark bullet as helpful
  mark-harmful <bullet-id>  Mark bullet as harmful
  health                    Check system health metrics

Examples:
  ./scripts/ace-query.sh stats
  ./scripts/ace-query.sh query strategy
  ./scripts/ace-query.sh search "redis"
  ./scripts/ace-query.sh top 5
  ./scripts/ace-query.sh mark-helpful STRAT-001

EOF
}

print_stats() {
    echo -e "${BLUE}📊 ACE System Statistics${NC}"
    echo ""

    sqlite3 "$DB_PATH" <<SQL
.mode column
.headers off
SELECT
    'Total Bullets:' as label,
    COUNT(*) as value
FROM adaptive_context
WHERE is_active = 1

UNION ALL SELECT
    'Avg Confidence:',
    ROUND(AVG(confidence_score), 2)
FROM adaptive_context
WHERE is_active = 1

UNION ALL SELECT
    'High Priority (≥8):',
    COUNT(*)
FROM adaptive_context
WHERE is_active = 1 AND priority >= 8

UNION ALL SELECT
    'Total Usage Events:',
    COUNT(*)
FROM context_usage_log

UNION ALL SELECT
    'Helpful/Harmful Ratio:',
    CASE
        WHEN SUM(harmful_count) > 0
        THEN ROUND(CAST(SUM(helpful_count) AS REAL) / SUM(harmful_count), 1) || ':1'
        ELSE 'N/A (no harmful events)'
    END
FROM adaptive_context
WHERE is_active = 1;
SQL

    echo ""
    echo -e "${YELLOW}📚 Bullets by Category${NC}"

    sqlite3 "$DB_PATH" <<SQL
.mode column
.headers off
SELECT
    '  ' || category || ':',
    COUNT(*) || ' bullets'
FROM adaptive_context
WHERE is_active = 1
GROUP BY category
ORDER BY COUNT(*) DESC;
SQL
}

query_category() {
    local category="$1"

    if [ -z "$category" ]; then
        echo "Usage: ./scripts/ace-query.sh query [category]"
        echo "Categories: strategy, pattern, edge_case, domain_insight, anti_pattern, optimization"
        exit 1
    fi

    echo -e "${BLUE}🔍 Querying Category: $category${NC}"
    echo ""

    sqlite3 "$DB_PATH" <<SQL
.mode list
SELECT
    '## [' || bullet_id || '] ' || content || char(10) ||
    '**Confidence:** ' || confidence_score ||
    ' | **Helpful:** ' || helpful_count ||
    ' | **Harmful:** ' || harmful_count ||
    ' | **Priority:** ' || priority || char(10) ||
    '**Tags:** ' || tags || char(10) ||
    '---' || char(10)
FROM adaptive_context
WHERE is_active = 1
    AND category = '$category'
ORDER BY priority DESC, confidence_score DESC
LIMIT 10;
SQL

    local count=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM adaptive_context WHERE is_active = 1 AND category = '$category';")
    echo ""
    echo -e "${GREEN}✅ Found $count bullets in category '$category'${NC}"
}

search_keyword() {
    local keyword="$1"

    if [ -z "$keyword" ]; then
        echo "Usage: ./scripts/ace-query.sh search <keyword>"
        exit 1
    fi

    echo -e "${BLUE}🔍 Searching for: $keyword${NC}"
    echo ""

    sqlite3 "$DB_PATH" <<SQL
.mode list
SELECT
    '## [' || bullet_id || '] ' || content || char(10) ||
    '**Confidence:** ' || confidence_score ||
    ' | **Priority:** ' || priority || char(10) ||
    '**Category:** ' || category || char(10) ||
    '---' || char(10)
FROM adaptive_context
WHERE is_active = 1
    AND (content LIKE '%$keyword%' OR tags LIKE '%$keyword%')
ORDER BY priority DESC, confidence_score DESC
LIMIT 20;
SQL

    local count=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM adaptive_context WHERE is_active = 1 AND (content LIKE '%$keyword%' OR tags LIKE '%$keyword%');")
    echo ""
    echo -e "${GREEN}✅ Found $count bullets matching '$keyword'${NC}"
}

show_top() {
    local limit="${1:-10}"

    echo -e "${BLUE}⭐ Top $limit Bullets (by Priority)${NC}"
    echo ""

    sqlite3 "$DB_PATH" <<SQL
.mode list
SELECT
    '  [' || bullet_id || '] ' ||
    SUBSTR(content, 1, 70) || '...' || char(10) ||
    '  Confidence: ' || confidence_score ||
    ' | Priority: ' || priority ||
    ' | Category: ' || category || char(10)
FROM adaptive_context
WHERE is_active = 1
ORDER BY priority DESC, confidence_score DESC
LIMIT $limit;
SQL
}

show_recent() {
    local limit="${1:-10}"

    echo -e "${BLUE}🕐 $limit Most Recently Used Bullets${NC}"
    echo ""

    sqlite3 "$DB_PATH" <<SQL
.mode list
SELECT
    '  [' || bullet_id || '] ' ||
    SUBSTR(content, 1, 70) || '...' || char(10) ||
    '  Last used: ' || COALESCE(datetime(last_used_at), 'Never') ||
    ' | Usage count: ' || usage_count || char(10)
FROM adaptive_context
WHERE is_active = 1
ORDER BY last_used_at DESC NULLS LAST
LIMIT $limit;
SQL
}

mark_helpful() {
    local bullet_id="$1"

    if [ -z "$bullet_id" ]; then
        echo "Usage: ./scripts/ace-query.sh mark-helpful <bullet-id>"
        exit 1
    fi

    # Check bullet exists
    local exists=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM adaptive_context WHERE bullet_id = '$bullet_id' AND is_active = 1;")

    if [ "$exists" -eq 0 ]; then
        echo -e "${YELLOW}⚠️  Bullet $bullet_id not found or inactive${NC}"
        exit 1
    fi

    # Generate unique usage log ID
    local usage_id="usage-$(date +%s)-$(shuf -i 1000-9999 -n 1)"

    sqlite3 "$DB_PATH" <<SQL
INSERT INTO context_usage_log (
    id, bullet_id, task_id, usage_outcome, outcome_reason, created_at
) VALUES (
    '$usage_id',
    '$bullet_id',
    'manual-test',
    'helpful',
    'Marked as helpful via CLI',
    CURRENT_TIMESTAMP
);
SQL

    # Get updated counts
    local counts=$(sqlite3 "$DB_PATH" "SELECT helpful_count, confidence_score FROM adaptive_context WHERE bullet_id = '$bullet_id';")

    echo -e "${GREEN}✅ Marked $bullet_id as helpful${NC}"
    echo "Updated: $counts"
}

mark_harmful() {
    local bullet_id="$1"

    if [ -z "$bullet_id" ]; then
        echo "Usage: ./scripts/ace-query.sh mark-harmful <bullet-id>"
        exit 1
    fi

    # Check bullet exists
    local exists=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM adaptive_context WHERE bullet_id = '$bullet_id' AND is_active = 1;")

    if [ "$exists" -eq 0 ]; then
        echo -e "${YELLOW}⚠️  Bullet $bullet_id not found or inactive${NC}"
        exit 1
    fi

    # Generate unique usage log ID
    local usage_id="usage-$(date +%s)-$(shuf -i 1000-9999 -n 1)"

    sqlite3 "$DB_PATH" <<SQL
INSERT INTO context_usage_log (
    id, bullet_id, task_id, usage_outcome, outcome_reason, created_at
) VALUES (
    '$usage_id',
    '$bullet_id',
    'manual-test',
    'harmful',
    'Marked as harmful via CLI',
    CURRENT_TIMESTAMP
);
SQL

    # Get updated counts
    local counts=$(sqlite3 "$DB_PATH" "SELECT harmful_count, confidence_score FROM adaptive_context WHERE bullet_id = '$bullet_id';")

    echo -e "${YELLOW}⚠️  Marked $bullet_id as harmful${NC}"
    echo "Updated: $counts"
}

check_health() {
    echo -e "${BLUE}🏥 ACE System Health Check${NC}"
    echo ""

    local total=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM adaptive_context WHERE is_active = 1;")
    local avg_conf=$(sqlite3 "$DB_PATH" "SELECT ROUND(AVG(confidence_score), 2) FROM adaptive_context WHERE is_active = 1;")
    local helpful=$(sqlite3 "$DB_PATH" "SELECT SUM(helpful_count) FROM adaptive_context WHERE is_active = 1;")
    local harmful=$(sqlite3 "$DB_PATH" "SELECT SUM(harmful_count) FROM adaptive_context WHERE is_active = 1;")

    echo "Total Bullets: $total"
    echo "Avg Confidence: $avg_conf"

    # Health assessment
    if (( $(echo "$avg_conf >= 0.75" | bc -l) )); then
        echo -e "Confidence: ${GREEN}✅ Healthy (≥0.75)${NC}"
    elif (( $(echo "$avg_conf >= 0.60" | bc -l) )); then
        echo -e "Confidence: ${YELLOW}⚠️  Warning (0.60-0.75)${NC}"
    else
        echo -e "Confidence: ${YELLOW}❌ Critical (<0.60)${NC}"
    fi

    if [ "$harmful" -gt 0 ]; then
        local ratio=$(echo "scale=1; $helpful / $harmful" | bc)
        echo "Helpful/Harmful Ratio: $ratio:1"

        if (( $(echo "$ratio >= 20" | bc -l) )); then
            echo -e "Usage Pattern: ${GREEN}✅ Excellent (≥20:1)${NC}"
        elif (( $(echo "$ratio >= 10" | bc -l) )); then
            echo -e "Usage Pattern: ${YELLOW}⚠️  Good (10-20:1)${NC}"
        else
            echo -e "Usage Pattern: ${YELLOW}⚠️  Needs Review (<10:1)${NC}"
        fi
    else
        echo "Helpful/Harmful Ratio: N/A (no harmful events yet)"
    fi

    echo ""
    echo "💡 Recommendations:"

    # Check for unused bullets
    local unused=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM adaptive_context WHERE is_active = 1 AND usage_count = 0;")
    if [ "$unused" -gt 0 ]; then
        echo "  - $unused bullets never used (consider reviewing)"
    fi

    # Check for low confidence
    local low_conf=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM adaptive_context WHERE is_active = 1 AND confidence_score < 0.60;")
    if [ "$low_conf" -gt 0 ]; then
        echo "  - $low_conf bullets have low confidence (<0.60)"
    fi

    # Check for harmful bullets
    local high_harmful=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM adaptive_context WHERE is_active = 1 AND harmful_count >= 3;")
    if [ "$high_harmful" -gt 0 ]; then
        echo "  - $high_harmful bullets with ≥3 harmful marks (consider archiving)"
    fi

    if [ "$unused" -eq 0 ] && [ "$low_conf" -eq 0 ] && [ "$high_harmful" -eq 0 ]; then
        echo -e "  ${GREEN}✅ System is healthy, no issues detected${NC}"
    fi
}

# Main script logic
case "$1" in
    stats)
        print_stats
        ;;
    query)
        query_category "$2"
        ;;
    search)
        search_keyword "$2"
        ;;
    top)
        show_top "$2"
        ;;
    recent)
        show_recent "$2"
        ;;
    mark-helpful)
        mark_helpful "$2"
        ;;
    mark-harmful)
        mark_harmful "$2"
        ;;
    health)
        check_health
        ;;
    help|--help|-h)
        print_help
        ;;
    "")
        print_help
        ;;
    *)
        echo "Unknown command: $1"
        echo ""
        print_help
        exit 1
        ;;
esac
