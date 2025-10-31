#!/bin/bash
# Sales + Support Deployment Script
# Week 5 Deployment - Cross-Team Escalation Testing

set -euo pipefail

# Deployment Configuration
SALES_COORDINATOR_CONFIG="/tmp/sales-coordinator.json"
SUPPORT_COORDINATOR_CONFIG="/tmp/support-coordinator.json"

# Create Sales Coordinator Configuration
cat > "$SALES_COORDINATOR_CONFIG" << EOF
{
    "team": "Sales",
    "escalation_path": ["Support", "Engineering"],
    "monitoring_enabled": true,
    "cost_tracking": true
}
EOF

# Create Support Coordinator Configuration
cat > "$SUPPORT_COORDINATOR_CONFIG" << EOF
{
    "team": "Support",
    "escalation_path": ["Engineering"],
    "monitoring_enabled": true,
    "cost_tracking": true
}
EOF

# Deploy Coordinators via Docker Compose
docker-compose -f docker-compose.yml up -d sales-coordinator support-coordinator

# Validate Coordinator Startup
docker ps | grep -E "sales-coordinator|support-coordinator"

echo "✅ Sales and Support Coordinators Deployed Successfully"