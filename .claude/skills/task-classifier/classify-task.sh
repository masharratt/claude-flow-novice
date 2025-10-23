#!/bin/bash

# Task Type Classifier for CFN v3
# Usage: classify-task.sh "task description"

TASK_DESCRIPTION="${1:-}"

if [ -z "$TASK_DESCRIPTION" ]; then
  echo "Usage: classify-task.sh 'task description'" >&2
  exit 1
fi

# Convert to lowercase for matching
TASK_LOWER=$(echo "$TASK_DESCRIPTION" | tr '[:upper:]' '[:lower:]')

# Keyword arrays per category
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

SOFTWARE_COUNT=$(count_matches SOFTWARE_KEYWORDS)
CONTENT_COUNT=$(count_matches CONTENT_KEYWORDS)
RESEARCH_COUNT=$(count_matches RESEARCH_KEYWORDS)
DESIGN_COUNT=$(count_matches DESIGN_KEYWORDS)
INFRASTRUCTURE_COUNT=$(count_matches INFRASTRUCTURE_KEYWORDS)
DATA_COUNT=$(count_matches DATA_KEYWORDS)

# Find category with highest count
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

echo "$TASK_TYPE"