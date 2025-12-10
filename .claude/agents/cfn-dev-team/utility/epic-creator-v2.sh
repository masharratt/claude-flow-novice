#!/bin/bash
set -euo pipefail

# Epic Creator v2 - Sequential Persona Review Agent
# Creates comprehensive epic definitions with sequential reviews from 6 key personas

# Default values
MODE="standard"
ENFORCE_DEVOPS=false
OUTPUT_FILE=""
EPIC_DESCRIPTION=""

# Parse command line arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --mode=*)
      MODE="${1#--mode=}"
      if [[ ! "$MODE" =~ ^(mvp|standard|enterprise)$ ]]; then
        echo "Error: --mode must be one of: mvp, standard, enterprise"
        exit 1
      fi
      shift
      ;;
    --mode)
      MODE="$2"
      if [[ ! "$MODE" =~ ^(mvp|standard|enterprise)$ ]]; then
        echo "Error: --mode must be one of: mvp, standard, enterprise"
        exit 1
      fi
      shift 2
      ;;
    --enforce-devops)
      ENFORCE_DEVOPS=true
      shift
      ;;
    --output=*)
      OUTPUT_FILE="${1#--output=}"
      shift
      ;;
    --output)
      OUTPUT_FILE="$2"
      shift 2
      ;;
    -*)
      echo "Error: Unknown option $1"
      echo "Usage: $0 \"<epic-description>\" [--mode=mvp|standard|enterprise] [--enforce-devops] [--output=<path>]"
      exit 1
      ;;
    *)
      if [[ -z "$EPIC_DESCRIPTION" ]]; then
        EPIC_DESCRIPTION="$1"
      else
        echo "Error: Multiple epic descriptions provided"
        exit 1
      fi
      shift
      ;;
  esac
done

# Validate epic description
if [[ -z "$EPIC_DESCRIPTION" ]]; then
  echo "Error: Epic description is required"
  echo "Usage: $0 \"<epic-description>\" [--mode=mvp|standard|enterprise] [--enforce-devops] [--output=<path>]"
  exit 1
fi

# Set default output file if not provided
if [[ -z "$OUTPUT_FILE" ]]; then
  TIMESTAMP=$(date +"%Y-%m-%d-%H-%M-%S")
  OUTPUT_FILE="epic-with-personas-$TIMESTAMP.json"
fi

# Create epic JSON structure
create_epic_json() {
  local description="$1"
  local mode="$2"
  local enforce_devops="$3"

  # Generate epic ID and metadata
  local epic_id="EPIC-$(date +%s | tail -c 7)"
  local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%S.%3NZ")

  # Start JSON structure
  cat << EOF
{
  "epic": {
    "id": "$epic_id",
    "title": "$(extract_title "$description")",
    "description": $(
      # Properly escape the description for JSON
      echo "$description" | jq -Rs .
    ),
    "priority": "high",
    "estimatedDuration": "TBD",
    "budget": "TBD",
    "status": "in-review",
    "metadata": {
      "createdAt": "$timestamp",
      "reviewMode": "$mode",
      "devopsEnforced": $enforce_devops
    },
    "personas": [
EOF

  # Sequential persona reviews
  review_product_owner "$description" "$mode"
  echo ","

  review_architect "$description" "$mode"
  echo ","

  review_security_specialist "$description" "$mode"
  echo ","

  review_performance_specialist "$description" "$mode"
  echo ","

  review_accessibility_advocate "$description" "$mode"
  echo ","

  review_devops_engineer "$description" "$mode" "$enforce_devops"

  cat << EOF
    ],
    "implementationRoadmap": [],
    "totalCostBreakdown": {},
    "riskAssessment": {}
  }
}
EOF
}

# Extract title from description (first sentence or first 50 chars)
extract_title() {
  local description="$1"
  local title=$(echo "$description" | cut -c1-50 | sed 's/\.$//')
  if [[ ${#title} -lt 20 ]]; then
    title="$title..."
  fi
  echo "$title"
}

# Product Owner Review
review_product_owner() {
  local description="$1"
  local mode="$2"

  cat << EOF
      {
        "name": "product-owner",
        "reviewOrder": 1,
        "status": "completed",
        "insights": [
EOF

  # Generate insights based on description
  if echo "$description" | grep -qi "user\|customer\|market"; then
    echo "          \"User-centric approach identified in requirements\","
  fi
  if echo "$description" | grep -qi "mvp\|prototype\|feature"; then
    echo "          \"MVP features should be prioritized for early delivery\","
  fi
  echo "          \"Clear value proposition needed for stakeholder alignment\""

  cat << EOF
        ],
        "recommendations": [
EOF

  # Generate recommendations
  local rec_count=0

  if [[ "$mode" != "mvp" ]]; then
    cat << EOF
          {
            "id": "PO-001",
            "title": "Create detailed user story mapping",
            "type": "blocking",
            "priority": "critical",
            "estimatedCost": "\$5,000",
            "description": "Map user journeys to ensure all features address real user needs"
          },
EOF
    ((rec_count++))
  fi

  cat << EOF
          {
            "id": "PO-00$(($rec_count + 2))",
            "title": "Define success metrics and KPIs",
            "type": "suggested",
            "priority": "high",
            "estimatedCost": "\$3,000",
            "description": "Establish measurable success criteria for the epic"
          }
EOF

  if [[ "$mode" == "enterprise" ]]; then
    cat << EOF
          ,
          {
            "id": "PO-00$(($rec_count + 3))",
            "title": "Conduct market analysis and competitor review",
            "type": "suggested",
            "priority": "high",
            "estimatedCost": "\$10,000",
            "description": "Ensure competitive differentiation and market fit"
          }
EOF
  fi

  cat << EOF
        ],
        "costAnalysis": {
          "productPlanning": "\$8,000",
          "userResearch": "\$5,000",
          "stakeholderManagement": "\$4,000"
        }
      }
EOF
}

# Architect Review
review_architect() {
  local description="$1"
  local mode="$2"

  cat << EOF
      {
        "name": "architect",
        "reviewOrder": 2,
        "status": "completed",
        "insights": [
EOF

  # Generate technical insights
  if echo "$description" | grep -qi "scalable\|scale\|performance"; then
    echo "          \"Scalability requirements will drive architectural decisions\","
  fi
  if echo "$description" | grep -qi "api\|service\|microservice"; then
    echo "          \"API design and service boundaries need careful consideration\","
  fi
  echo "          \"Architecture must balance complexity with maintainability\""

  cat << EOF
        ],
        "recommendations": [
EOF

  # Always include architecture design as blocking
  cat << EOF
          {
            "id": "ARCH-001",
            "title": "Design system architecture with clear component boundaries",
            "type": "blocking",
            "priority": "critical",
            "estimatedCost": "\$15,000",
            "description": "Create detailed architecture diagrams and component specifications"
          },
EOF

  # Add additional recommendations based on mode
  if [[ "$mode" != "mvp" ]]; then
    cat << EOF
          {
            "id": "ARCH-002",
            "title": "Define integration patterns and data flows",
            "type": "suggested",
            "priority": "high",
            "estimatedCost": "\$8,000",
            "description": "Document how components will interact and share data"
          },
EOF
  fi

  if [[ "$mode" == "enterprise" ]]; then
    cat << EOF
          {
            "id": "ARCH-003",
            "title": "Create technology governance framework",
            "type": "suggested",
            "priority": "high",
            "estimatedCost": "\$12,000",
            "description": "Establish technology standards and review processes"
          },
EOF
  fi

  # Close recommendations array
  echo "          {"
  echo "            \"id\": \"ARCH-004\","
  echo "            \"title\": \"Plan for future extensibility and evolution\","
  echo "            \"type\": \"suggested\","
  echo "            \"priority\": \"medium\","
  echo "            \"estimatedCost\": \"\$5,000\","
  echo "            \"description\": \"Design for anticipated future requirements\""
  echo "          }"

  cat << EOF
        ],
        "costAnalysis": {
          "architectureDesign": "\$20,000",
          "technologySelection": "\$10,000",
          "documentation": "\$5,000"
        }
      }
EOF
}

# Security Specialist Review
review_security_specialist() {
  local description="$1"
  local mode="$2"

  cat << EOF
      {
        "name": "security-specialist",
        "reviewOrder": 3,
        "status": "completed",
        "insights": [
EOF

  # Generate security insights
  if echo "$description" | grep -qi "user\|auth\|login"; then
    echo "          \"Authentication and authorization mechanisms are critical\","
  fi
  if echo "$description" | grep -qi "data\|storage\|database"; then
    echo "          \"Data protection and privacy must be addressed early\","
  fi
  echo "          \"Security should be integrated throughout the development lifecycle\""

  cat << EOF
        ],
        "recommendations": [
EOF

  # Always include security assessment as blocking
  cat << EOF
          {
            "id": "SEC-001",
            "title": "Conduct threat modeling and security assessment",
            "type": "blocking",
            "priority": "critical",
            "estimatedCost": "\$12,000",
            "description": "Identify potential security threats and mitigation strategies"
          },
EOF

  # Add more recommendations based on mode
  if [[ "$mode" != "mvp" ]]; then
    cat << EOF
          {
            "id": "SEC-002",
            "title": "Implement secure coding standards and reviews",
            "type": "suggested",
            "priority": "high",
            "estimatedCost": "\$8,000",
            "description": "Establish security guidelines and review processes"
          },
EOF
  fi

  if [[ "$mode" == "enterprise" ]]; then
    cat << EOF
          {
            "id": "SEC-003",
            "title": "Perform penetration testing and security audit",
            "type": "suggested",
            "priority": "high",
            "estimatedCost": "\$15,000",
            "description": "Independent security validation and compliance assessment"
          },
EOF
  fi

  # Close recommendations
  echo "          {"
  echo "            \"id\": \"SEC-004\","
  echo "            \"title\": \"Plan for incident response and monitoring\","
  echo "            \"type\": \"suggested\","
  echo "            \"priority\": \"medium\","
  echo "            \"estimatedCost\": \"\$6,000\","
  echo "            \"description\": \"Prepare for security incident handling\""
  echo "          }"

  cat << EOF
        ],
        "costAnalysis": {
          "securityAssessment": "\$15,000",
          "implementation": "\$10,000",
          "testing": "\$8,000"
        }
      }
EOF
}

# Performance Specialist Review
review_performance_specialist() {
  local description="$1"
  local mode="$2"

  cat << EOF
      {
        "name": "performance-specialist",
        "reviewOrder": 4,
        "status": "completed",
        "insights": [
EOF

  # Generate performance insights
  if echo "$description" | grep -qi "real-time\|latency\|speed"; then
    echo "          \"Performance requirements will be critical for user experience\","
  fi
  if echo "$description" | grep -qi "database\|data\|storage"; then
    echo "          \"Database performance and query optimization must be considered\","
  fi
  echo "          \"Performance testing should start early and continue throughout\""

  cat << EOF
        ],
        "recommendations": [
EOF

  # Always include performance requirements as blocking
  cat << EOF
          {
            "id": "PERF-001",
            "title": "Define performance requirements and success criteria",
            "type": "blocking",
            "priority": "critical",
            "estimatedCost": "\$8,000",
            "description": "Establish measurable performance targets and SLAs"
          },
EOF

  if [[ "$mode" != "mvp" ]]; then
    cat << EOF
          {
            "id": "PERF-002",
            "title": "Implement performance monitoring and alerting",
            "type": "suggested",
            "priority": "high",
            "estimatedCost": "\$6,000",
            "description": "Set up tools to track performance metrics in production"
          },
EOF
  fi

  if [[ "$mode" == "enterprise" ]]; then
    cat << EOF
          {
            "id": "PERF-003",
            "title": "Conduct load testing and capacity planning",
            "type": "suggested",
            "priority": "high",
            "estimatedCost": "\$12,000",
            "description": "Test system behavior under expected and peak loads"
          },
EOF
  fi

  # Close recommendations
  echo "          {"
  echo "            \"id\": \"PERF-004\","
  echo "            \"title\": \"Create performance optimization plan\","
  echo "            \"type\": \"suggested\","
  echo "            \"priority\": \"medium\","
  echo "            \"estimatedCost\": \"\$5,000\","
  echo "            \"description\": \"Identify and plan for performance improvements\""
  echo "          }"

  cat << EOF
        ],
        "costAnalysis": {
          "performanceTesting": "\$10,000",
          "monitoring": "\$7,000",
          "optimization": "\$8,000"
        }
      }
EOF
}

# Accessibility Advocate Review
review_accessibility_advocate() {
  local description="$1"
  local mode="$2"

  cat << EOF
      {
        "name": "accessibility-advocate",
        "reviewOrder": 5,
        "status": "completed",
        "insights": [
EOF

  # Generate accessibility insights
  if echo "$description" | grep -qi "ui\|interface\|frontend\|web"; then
    echo "          \"UI components must meet WCAG 2.1 AA standards\","
  fi
  if echo "$description" | grep -qi "mobile\|responsive\|device"; then
    echo "          \"Responsive design essential for diverse device access\","
  fi
  echo "          \"Accessibility benefits all users, not just those with disabilities\""

  cat << EOF
        ],
        "recommendations": [
EOF

  # Always include basic accessibility as blocking
  cat << EOF
          {
            "id": "A11Y-001",
            "title": "Ensure WCAG 2.1 AA compliance for all user interfaces",
            "type": "blocking",
            "priority": "critical",
            "estimatedCost": "\$10,000",
            "description": "Make the application accessible to users with disabilities"
          },
EOF

  if [[ "$mode" != "mvp" ]]; then
    cat << EOF
          {
            "id": "A11Y-002",
            "title": "Conduct accessibility testing with assistive technologies",
            "type": "suggested",
            "priority": "high",
            "estimatedCost": "\$6,000",
            "description": "Test with screen readers, keyboard navigation, and other tools"
          },
EOF
  fi

  if [[ "$mode" == "enterprise" ]]; then
    cat << EOF
          {
            "id": "A11Y-003",
            "title": "Perform formal accessibility audit",
            "type": "suggested",
            "priority": "high",
            "estimatedCost": "\$12,000",
            "description": "Independent accessibility validation and certification"
          },
EOF
  fi

  # Close recommendations
  echo "          {"
  echo "            \"id\": \"A11Y-004\","
  echo "            \"title\": \"Create accessibility documentation and guides\","
  echo "            \"type\": \"suggested\","
  echo "            \"priority\": \"medium\","
  echo "            \"estimatedCost\": \"\$4,000\","
  echo "            \"description\": \"Document accessibility features and usage\""
  echo "          }"

  cat << EOF
        ],
        "costAnalysis": {
          "accessibilityImplementation": "\$15,000",
          "testing": "\$5,000",
          "training": "\$3,000"
        }
      }
EOF
}

# DevOps Engineer Review
review_devops_engineer() {
  local description="$1"
  local mode="$2"
  local enforce_devops="$3"

  local recommendation_type="suggested"
  if [[ "$enforce_devops" == "true" ]]; then
    recommendation_type="blocking"
  fi

  cat << EOF
      {
        "name": "devops-engineer",
        "reviewOrder": 6,
        "status": "completed",
        "insights": [
EOF

  # Generate DevOps insights
  if echo "$description" | grep -qi "deploy\|release\|production"; then
    echo "          \"Deployment strategy needs careful planning for smooth releases\","
  fi
  if echo "$description" | grep -qi "monitor\|observe\|metric"; then
    echo "          \"Observability is crucial for production stability\","
  fi
  echo "          \"Infrastructure as Code provides reproducibility and consistency\""

  cat << EOF
        ],
        "recommendations": [
EOF

  # Include CI/CD setup
  local priority="high"
  if [[ "$enforce_devops" == "true" ]]; then
    priority="critical"
  fi

  cat << EOF
          {
            "id": "DEVOPS-001",
            "title": "Set up CI/CD pipeline for automated builds and deployments",
            "type": "$recommendation_type",
            "priority": "$priority",
            "estimatedCost": "\$10,000",
            "description": "Automate testing, building, and deployment processes"
          },
EOF

  if [[ "$mode" != "mvp" ]]; then
    cat << EOF
          {
            "id": "DEVOPS-002",
            "title": "Implement infrastructure monitoring and alerting",
            "type": "$recommendation_type",
            "priority": "high",
            "estimatedCost": "\$7,000",
            "description": "Monitor application and infrastructure health"
          },
EOF
  fi

  if [[ "$mode" == "enterprise" ]]; then
    cat << EOF
          {
            "id": "DEVOPS-003",
            "title": "Establish disaster recovery and backup procedures",
            "type": "$recommendation_type",
            "priority": "high",
            "estimatedCost": "\$12,000",
            "description": "Ensure business continuity and data protection"
          },
EOF
  fi

  # Close recommendations
  echo "          {"
  echo "            \"id\": \"DEVOPS-004\","
  echo "            \"title\": \"Create runbooks and operational documentation\","
  echo "            \"type\": \"suggested\","
  echo "            \"priority\": \"medium\","
  echo "            \"estimatedCost\": \"\$5,000\","
  echo "            \"description\": \"Document operational procedures and troubleshooting\""
  echo "          }"

  cat << EOF
        ],
        "costAnalysis": {
          "infrastructureSetup": "\$15,000",
          "automation": "\$10,000",
          "monitoring": "\$8,000"
        }
      }
EOF
}

# Main execution
main() {
  echo "Creating epic with persona reviews..."
  echo "Mode: $MODE"
  echo "DevOps enforcement: $ENFORCE_DEVOPS"
  echo "Output file: $OUTPUT_FILE"
  echo ""

  # Check if jq is installed
  if ! command -v jq &> /dev/null; then
    echo "Error: jq is required but not installed. Please install jq."
    exit 1
  fi

  # Generate the epic JSON
  local epic_json
  epic_json=$(create_epic_json "$EPIC_DESCRIPTION" "$MODE" "$ENFORCE_DEVOPS")

  # Write to output file
  echo "$epic_json" | jq '.' > "$OUTPUT_FILE"

  echo "Epic created successfully: $OUTPUT_FILE"
  echo ""
  echo "Summary:"
  echo "- Generated sequential reviews from 6 personas"
  echo "- Total recommendations: $(echo "$epic_json" | jq '.epic.personas | map(.recommendations | length) | add')"
  echo "- Blocking recommendations: $(echo "$epic_json" | jq '.epic.personas | map(.recommendations | map(select(.type == "blocking")) | length) | add')"
  echo "- Suggested recommendations: $(echo "$epic_json" | jq '.epic.personas | map(.recommendations | map(select(.type == "suggested")) | length) | add')"
}

# Run main function
main "$@"