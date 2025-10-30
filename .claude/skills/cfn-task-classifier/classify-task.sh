#!/bin/bash

# Task Type Classifier for CFN v3
# Usage: classify-task.sh "task description" [--format=json|simple]

TASK_DESCRIPTION=""
OUTPUT_FORMAT="simple"

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --format=*)
      OUTPUT_FORMAT="${1#*=}"
      shift
      ;;
    *)
      TASK_DESCRIPTION="$1"
      shift
      ;;
  esac
done

if [ -z "$TASK_DESCRIPTION" ]; then
  echo "Usage: classify-task.sh 'task description' [--format=json|simple]" >&2
  exit 1
fi

# Convert to lowercase for matching
TASK_LOWER=$(echo "$TASK_DESCRIPTION" | tr '[:upper:]' '[:lower:]')

# Task type keyword arrays (for backward compatibility)
SOFTWARE_KEYWORDS=(
  "implement" "build" "code" "develop" "create api" "backend" "frontend"
  "rest" "graphql" "database" "authentication" "bug fix" "refactor"
  "optimize code" "web app" "full-stack" "api endpoint" "microservice"
  "sdk" "library" "framework" "testing" "unit test" "integration test"
)

CONTENT_KEYWORDS=(
  "write" "article" "blog post" "copy" "content" "documentation"
  "guide" "tutorial" "whitepaper" "seo" "marketing copy"
  "product description" "technical writing" "user manual" "readme"
  "how-to" "explainer" "case study" "press release"
)

RESEARCH_KEYWORDS=(
  "research" "analyze" "study" "investigate" "data analysis"
  "statistical analysis" "literature review" "market research"
  "competitive analysis" "feasibility study" "survey" "experiment"
  "hypothesis" "methodology" "findings" "insights" "report"
)

DESIGN_KEYWORDS=(
  "design" "ui" "ux" "mockup" "wireframe" "prototype"
  "user interface" "user experience" "visual design" "branding"
  "style guide" "accessibility" "responsive design" "figma"
  "sketch" "adobe xd" "design system" "component library"
)

INFRASTRUCTURE_KEYWORDS=(
  "deploy" "infrastructure" "devops" "cloud" "kubernetes" "docker"
  "terraform" "aws" "azure" "gcp" "ci/cd" "monitoring" "logging"
  "scaling" "networking" "security configuration" "load balancer"
  "container" "orchestration" "helm" "ansible" "jenkins"
)

DATA_KEYWORDS=(
  "etl" "pipeline" "data warehouse" "data lake" "streaming"
  "real-time processing" "batch" "data quality" "schema"
  "data model" "apache spark" "airflow" "data integration"
  "olap" "oltp" "dimensional modeling" "star schema" "snowflake"
  "databricks" "redshift" "bigquery" "data migration"
)

# Domain-specific keyword arrays (Phase 2.4 enhancement)
FRONTEND_KEYWORDS=(
  "react" "vue" "angular" "ui" "ux" "css" "html" "component" "tsx" "jsx"
  "frontend" "web app" "responsive" "bootstrap" "tailwind" "sass" "less"
  "webpack" "vite" "dom" "browser" "client-side" "spa" "pwa"
)

BACKEND_KEYWORDS=(
  "api" "server" "endpoint" "authentication" "database" "nodejs" "python" "java"
  "backend" "rest" "graphql" "microservice" "service" "lambda" "function"
  "express" "fastapi" "django" "spring" "controller" "middleware" "orm"
)

SECURITY_KEYWORDS=(
  "auth" "jwt" "oauth" "encryption" "security" "vulnerability" "penetration"
  "authentication" "authorization" "ssl" "tls" "https" "certificate"
  "firewall" "cors" "xss" "csrf" "sql injection" "sanitize" "hashing"
)

DEVOPS_KEYWORDS=(
  "deploy" "docker" "kubernetes" "ci/cd" "terraform" "aws" "azure" "gcp"
  "devops" "pipeline" "container" "orchestration" "helm" "ansible" "jenkins"
  "github actions" "gitlab ci" "circle ci" "monitoring" "logging" "prometheus"
)

TESTING_KEYWORDS=(
  "test" "unittest" "integration" "e2e" "jest" "pytest" "mocha"
  "testing" "unit test" "integration test" "end-to-end" "tdd" "bdd"
  "selenium" "cypress" "playwright" "test coverage" "mock" "stub"
)

DATABASE_KEYWORDS=(
  "sql" "nosql" "postgres" "mongodb" "redis" "schema" "migration"
  "database" "query" "index" "transaction" "mysql" "sqlite" "dynamodb"
  "cassandra" "elasticsearch" "orm" "prisma" "sequelize" "typeorm"
)

DOCUMENTATION_KEYWORDS=(
  "docs" "readme" "guide" "tutorial" "documentation" "manual"
  "how-to" "technical writing" "user guide" "api docs" "javadoc"
  "swagger" "openapi" "markdown" "wiki" "confluence" "docstring"
)

# Count matches per category
count_matches() {
  local -n keywords=$1
  local count=0

  for keyword in "${keywords[@]}"; do
    if echo "$TASK_LOWER" | grep -q "$keyword"; then
      ((count++))
    fi
  done

  echo "$count"
}

# Count task type matches (backward compatibility)
SOFTWARE_COUNT=$(count_matches SOFTWARE_KEYWORDS)
CONTENT_COUNT=$(count_matches CONTENT_KEYWORDS)
RESEARCH_COUNT=$(count_matches RESEARCH_KEYWORDS)
DESIGN_COUNT=$(count_matches DESIGN_KEYWORDS)
INFRASTRUCTURE_COUNT=$(count_matches INFRASTRUCTURE_KEYWORDS)
DATA_COUNT=$(count_matches DATA_KEYWORDS)

# Count domain matches (Phase 2.4 enhancement)
FRONTEND_COUNT=$(count_matches FRONTEND_KEYWORDS)
BACKEND_COUNT=$(count_matches BACKEND_KEYWORDS)
SECURITY_COUNT=$(count_matches SECURITY_KEYWORDS)
DEVOPS_COUNT=$(count_matches DEVOPS_KEYWORDS)
TESTING_COUNT=$(count_matches TESTING_KEYWORDS)
DATABASE_COUNT=$(count_matches DATABASE_KEYWORDS)
DOCUMENTATION_COUNT=$(count_matches DOCUMENTATION_KEYWORDS)

# Find task type with highest count
MAX_COUNT=0
TASK_TYPE="software-development"  # Default

if [ "$SOFTWARE_COUNT" -gt "$MAX_COUNT" ]; then
  MAX_COUNT=$SOFTWARE_COUNT
  TASK_TYPE="software-development"
fi

if [ "$CONTENT_COUNT" -gt "$MAX_COUNT" ]; then
  MAX_COUNT=$CONTENT_COUNT
  TASK_TYPE="content-creation"
fi

if [ "$RESEARCH_COUNT" -gt "$MAX_COUNT" ]; then
  MAX_COUNT=$RESEARCH_COUNT
  TASK_TYPE="research"
fi

if [ "$DESIGN_COUNT" -gt "$MAX_COUNT" ]; then
  MAX_COUNT=$DESIGN_COUNT
  TASK_TYPE="design"
fi

if [ "$INFRASTRUCTURE_COUNT" -gt "$MAX_COUNT" ]; then
  MAX_COUNT=$INFRASTRUCTURE_COUNT
  TASK_TYPE="infrastructure"
fi

if [ "$DATA_COUNT" -gt "$MAX_COUNT" ]; then
  MAX_COUNT=$DATA_COUNT
  TASK_TYPE="data-engineering"
fi

# Detect domains (multi-domain support)
DOMAINS=()
DOMAIN_THRESHOLD=1  # Minimum keyword matches to include domain

if [ "$FRONTEND_COUNT" -ge "$DOMAIN_THRESHOLD" ]; then
  DOMAINS+=("frontend")
fi

if [ "$BACKEND_COUNT" -ge "$DOMAIN_THRESHOLD" ]; then
  DOMAINS+=("backend")
fi

if [ "$SECURITY_COUNT" -ge "$DOMAIN_THRESHOLD" ]; then
  DOMAINS+=("security")
fi

if [ "$DEVOPS_COUNT" -ge "$DOMAIN_THRESHOLD" ]; then
  DOMAINS+=("devops")
fi

if [ "$TESTING_COUNT" -ge "$DOMAIN_THRESHOLD" ]; then
  DOMAINS+=("testing")
fi

if [ "$DATABASE_COUNT" -ge "$DOMAIN_THRESHOLD" ]; then
  DOMAINS+=("database")
fi

if [ "$DOCUMENTATION_COUNT" -ge "$DOMAIN_THRESHOLD" ]; then
  DOMAINS+=("documentation")
fi

# Default to "general" if no domains detected
if [ "${#DOMAINS[@]}" -eq 0 ]; then
  DOMAINS+=("general")
fi

# Assess complexity
COMPLEXITY="medium"  # Default
WORD_COUNT=$(echo "$TASK_DESCRIPTION" | wc -w)

# Word count heuristic
if [ "$WORD_COUNT" -lt 10 ]; then
  COMPLEXITY="low"
elif [ "$WORD_COUNT" -gt 30 ]; then
  COMPLEXITY="high"
fi

# Adjust for technical terms
TECHNICAL_TERMS_COUNT=0
TECHNICAL_TERMS=("implement" "architect" "optimize" "refactor" "integrate" "design" "analyze" "migrate")

for term in "${TECHNICAL_TERMS[@]}"; do
  if echo "$TASK_LOWER" | grep -q "$term"; then
    ((TECHNICAL_TERMS_COUNT++))
  fi
done

# High technical complexity indicators
if [ "$TECHNICAL_TERMS_COUNT" -gt 2 ]; then
  COMPLEXITY="high"
fi

# Multi-domain tasks are inherently more complex
if [ "${#DOMAINS[@]}" -ge 3 ]; then
  COMPLEXITY="high"
fi

# Output format selection
if [ "$OUTPUT_FORMAT" = "json" ]; then
  # Build domains JSON array
  DOMAINS_JSON="["
  for i in "${!DOMAINS[@]}"; do
    if [ "$i" -gt 0 ]; then
      DOMAINS_JSON+=","
    fi
    DOMAINS_JSON+="\"${DOMAINS[$i]}\""
  done
  DOMAINS_JSON+="]"

  # Output JSON
  cat <<EOF
{
  "task_type": "$TASK_TYPE",
  "domains": $DOMAINS_JSON,
  "complexity": "$COMPLEXITY",
  "keyword_counts": {
    "frontend": $FRONTEND_COUNT,
    "backend": $BACKEND_COUNT,
    "security": $SECURITY_COUNT,
    "devops": $DEVOPS_COUNT,
    "testing": $TESTING_COUNT,
    "database": $DATABASE_COUNT,
    "documentation": $DOCUMENTATION_COUNT
  },
  "task_type_counts": {
    "software": $SOFTWARE_COUNT,
    "content": $CONTENT_COUNT,
    "research": $RESEARCH_COUNT,
    "design": $DESIGN_COUNT,
    "infrastructure": $INFRASTRUCTURE_COUNT,
    "data": $DATA_COUNT
  }
}
EOF
else
  # Simple format (backward compatibility)
  echo "$TASK_TYPE"
fi