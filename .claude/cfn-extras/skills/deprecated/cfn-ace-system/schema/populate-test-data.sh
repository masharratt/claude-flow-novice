#!/usr/bin/env bash

##############################################################################
# ACE System: Test Data Population Script
# Generates realistic sample reflections for testing context queries
#
# Usage:
#   ./populate-test-data.sh [OPTIONS]
#
# Options:
#   --db-path           Path to SQLite database (default: .artifacts/database/swarm-memory.db)
#   --count             Number of reflections to generate (default: 10)
#   --clean             Drop existing reflections before inserting
##############################################################################

set -euo pipefail

# Default values
DB_PATH="${ACE_DB_PATH:-./.artifacts/database/swarm-memory.db}"
COUNT=10
CLEAN=false

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --db-path)
      DB_PATH="$2"
      shift 2
      ;;
    --count)
      COUNT="$2"
      shift 2
      ;;
    --clean)
      CLEAN=true
      shift
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

echo "=== ACE System: Populating Test Data ==="
echo "Database: $DB_PATH"
echo "Reflections to generate: $COUNT"

# Clean existing data if requested
if [[ "$CLEAN" == true ]]; then
  echo "Cleaning existing reflections..."
  sqlite3 "$DB_PATH" "DELETE FROM context_reflections;"
  echo "✓ Existing data cleared"
fi

# Sample domains
DOMAINS=("frontend" "backend" "security" "devops" "database" "api" "testing")

# Sample keywords by domain
declare -A DOMAIN_KEYWORDS=(
  ["frontend"]="react,typescript,ui,components,hooks,state-management,routing,error-boundary,forms,validation"
  ["backend"]="nodejs,express,api,rest,graphql,authentication,authorization,middleware,error-handling,logging"
  ["security"]="jwt,oauth,encryption,csrf,xss,sql-injection,rate-limiting,access-control,audit-logging"
  ["devops"]="docker,kubernetes,ci-cd,github-actions,deployment,monitoring,logging,redis,nginx,load-balancing"
  ["database"]="postgresql,sql,migrations,indexing,query-optimization,transactions,replication,backup"
  ["api"]="rest,graphql,openapi,swagger,versioning,pagination,rate-limiting,caching,webhooks"
  ["testing"]="jest,unit-tests,integration-tests,e2e,test-coverage,mocking,fixtures,ci-testing"
)

# Sample strategies by domain
declare -A DOMAIN_STRATEGIES=(
  ["frontend"]='{"title":"Error Boundary Pattern","description":"Wrap components in ErrorBoundary to prevent full app crashes","confidence":0.92,"tags":["react","error-handling","resilience"]}'
  ["backend"]='{"title":"JWT + Redis Session","description":"Use short-lived JWT with Redis for token revocation","confidence":0.95,"tags":["authentication","security","session"]}'
  ["security"]='{"title":"Rate Limiting Middleware","description":"Implement rate limiting per IP and per user","confidence":0.88,"tags":["security","rate-limiting","ddos"]}'
  ["devops"]='{"title":"Blue-Green Deployment","description":"Use blue-green strategy for zero-downtime deploys","confidence":0.90,"tags":["deployment","ci-cd","reliability"]}'
  ["database"]='{"title":"Index Optimization","description":"Add covering indexes for common query patterns","confidence":0.93,"tags":["performance","sql","optimization"]}'
  ["api"]='{"title":"API Versioning Strategy","description":"Use URL versioning (v1, v2) for backward compatibility","confidence":0.87,"tags":["api","versioning","compatibility"]}'
  ["testing"]='{"title":"Test Pyramid Pattern","description":"More unit tests, fewer integration tests, minimal e2e","confidence":0.89,"tags":["testing","strategy","quality"]}'
)

# Sample anti-patterns by domain
declare -A DOMAIN_ANTIPATTERNS=(
  ["frontend"]='{"title":"Missing Security Headers","description":"Always set CSP, X-Frame-Options, X-Content-Type-Options","severity":"critical","tags":["security","headers","vulnerability"]}'
  ["backend"]='{"title":"Long-lived Access Tokens","description":"Avoid tokens that last >15 minutes without refresh","severity":"critical","tags":["security","jwt","session"]}'
  ["security"]='{"title":"Unvalidated User Input","description":"Always validate and sanitize user input before processing","severity":"critical","tags":["security","validation","xss"]}'
  ["devops"]='{"title":"Missing Health Checks","description":"All services need /health endpoint for monitoring","severity":"warning","tags":["monitoring","reliability","health-checks"]}'
  ["database"]='{"title":"N+1 Query Problem","description":"Use JOIN or eager loading instead of multiple queries","severity":"warning","tags":["performance","sql","optimization"]}'
  ["api"]='{"title":"Missing API Rate Limits","description":"Always implement rate limiting to prevent abuse","severity":"critical","tags":["security","rate-limiting","api"]}'
  ["testing"]='{"title":"Testing Implementation Details","description":"Test behavior, not implementation. Avoid testing internals.","severity":"warning","tags":["testing","best-practices","maintainability"]}'
)

# Function to generate random ID
generate_id() {
  echo "refl-$(date +%s)-$RANDOM"
}

# Function to get random element from array
random_element() {
  local array_name=$1[@]
  local array=("${!array_name}")
  echo "${array[$RANDOM % ${#array[@]}]}"
}

# Function to generate reflection
generate_reflection() {
  local index=$1
  local domain=$(random_element DOMAINS)
  local reflection_type
  local confidence
  local curator_status
  local success_count
  local total_count

  # Determine reflection type (70% strategy, 20% anti-pattern, 10% edge-case)
  local rand=$((RANDOM % 100))
  if [[ $rand -lt 70 ]]; then
    reflection_type="strategy"
    confidence=$(awk -v min=0.75 -v max=0.98 'BEGIN{srand(); print min+rand()*(max-min)}')
    curator_status="curated"
    success_count=$((RANDOM % 20 + 5))
    total_count=$((success_count + RANDOM % 5))
  elif [[ $rand -lt 90 ]]; then
    reflection_type="anti-pattern"
    confidence=$(awk -v min=0.40 -v max=0.65 'BEGIN{srand(); print min+rand()*(max-min)}')
    curator_status="curated"
    success_count=0
    total_count=$((RANDOM % 10 + 1))
  else
    reflection_type="edge-case"
    confidence=$(awk -v min=0.70 -v max=0.90 'BEGIN{srand(); print min+rand()*(max-min)}')
    curator_status="curated"
    success_count=$((RANDOM % 5))
    total_count=$((success_count + RANDOM % 3))
  fi

  # Generate IDs
  local id=$(generate_id)
  local task_id="task-${domain}-$(date +%s)-$index"
  local agent_id="agent-${domain}-dev-$((RANDOM % 5 + 1))"
  local swarm_id="swarm-ace-test-001"

  # Get keywords for domain
  local keywords="${DOMAIN_KEYWORDS[$domain]}"

  # Build extracted_lessons JSON based on type
  local extracted_lessons
  if [[ "$reflection_type" == "strategy" ]]; then
    extracted_lessons="{\"strategies\":[${DOMAIN_STRATEGIES[$domain]}],\"antiPatterns\":[],\"edgeCases\":[]}"
  elif [[ "$reflection_type" == "anti-pattern" ]]; then
    extracted_lessons="{\"strategies\":[],\"antiPatterns\":[${DOMAIN_ANTIPATTERNS[$domain]}],\"edgeCases\":[]}"
  else
    extracted_lessons="{\"strategies\":[],\"antiPatterns\":[],\"edgeCases\":[{\"title\":\"Edge case in $domain\",\"description\":\"Unexpected behavior discovered\",\"tags\":[\"$domain\",\"edge-case\"]}]}"
  fi

  # Build metadata JSON
  local metadata="{\"domain\":[\"$domain\"],\"keywords\":[$keywords],\"tags\":[\"$domain\",\"test-data\"],\"severity\":\"medium\"}"

  # Build execution_trace JSON
  local iterations=$((RANDOM % 3 + 1))
  local execution_trace="{\"iterations\":$iterations,\"loops\":[\"loop3\",\"loop2\"],\"timeline\":[\"start\",\"loop3\",\"loop2\",\"product-owner\",\"complete\"]}"

  # Build feedback_signals JSON
  local feedback_signals="{\"loop2_feedback\":[\"Good implementation\",\"Add tests\"],\"product_owner_decision\":\"PROCEED\"}"

  # Calculate created_at (within last 30 days)
  local days_ago=$((RANDOM % 30))
  local created_at=$(date -d "$days_ago days ago" '+%Y-%m-%d %H:%M:%S' 2>/dev/null || date -v -${days_ago}d '+%Y-%m-%d %H:%M:%S')

  # Insert reflection
  sqlite3 "$DB_PATH" <<EOF
INSERT INTO context_reflections (
  id,
  reflection_type,
  task_id,
  agent_id,
  swarm_id,
  project_id,
  execution_trace,
  feedback_signals,
  extracted_lessons,
  metadata,
  curator_status,
  confidence,
  success_count,
  total_count,
  created_at,
  processed_at,
  acl_level
) VALUES (
  '$id',
  '$reflection_type',
  '$task_id',
  '$agent_id',
  '$swarm_id',
  'ace-test-project',
  '$execution_trace',
  '$feedback_signals',
  '$extracted_lessons',
  '$metadata',
  '$curator_status',
  $confidence,
  $success_count,
  $total_count,
  '$created_at',
  '$created_at',
  3
);
EOF

  echo "✓ Generated reflection $index: $reflection_type ($domain, confidence=$confidence)"
}

# Generate reflections
for i in $(seq 1 "$COUNT"); do
  generate_reflection "$i"
  # Small delay to ensure unique timestamps
  sleep 0.1
done

# Show summary
echo ""
echo "=== Test Data Summary ==="
sqlite3 "$DB_PATH" <<'EOF'
SELECT
  reflection_type,
  COUNT(*) as count,
  ROUND(AVG(confidence), 2) as avg_confidence,
  SUM(success_count) as total_successes,
  SUM(total_count) as total_uses
FROM context_reflections
GROUP BY reflection_type;
EOF

echo ""
echo "=== Domain Distribution ==="
sqlite3 "$DB_PATH" <<'EOF'
SELECT
  json_extract(metadata, '$.domain[0]') as domain,
  COUNT(*) as count
FROM context_reflections
GROUP BY domain
ORDER BY count DESC;
EOF

echo ""
echo "✓ Test data population complete!"
echo "Total reflections: $(sqlite3 "$DB_PATH" 'SELECT COUNT(*) FROM context_reflections;')"
