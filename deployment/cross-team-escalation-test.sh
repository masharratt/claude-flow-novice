#!/bin/bash
# Cross-Team Escalation Test Script
# Validates Sales → Support → Engineering Communication

set -euo pipefail

# Simulate Sales Issue Escalation
simulate_sales_escalation() {
    local issue_severity="high"
    local issue_type="billing_discrepancy"

    echo "🔍 Sales Issue: $issue_type (Severity: $issue_severity)"

    # Simulate escalation to Support
    support_response=$(curl -s http://support-coordinator/escalate \
        -d "{
            'source_team': 'Sales',
            'issue_type': '$issue_type',
            'severity': '$issue_severity'
        }")

    if [[ "$support_response" == *"escalated"* ]]; then
        echo "✅ Support Escalation Successful"
        return 0
    else
        echo "❌ Support Escalation Failed"
        return 1
    fi
}

# Simulate Support to Engineering Escalation
simulate_support_escalation() {
    local original_issue_type="billing_discrepancy"

    echo "🔍 Support Escalating to Engineering"

    engineering_response=$(curl -s http://engineering-coordinator/escalate \
        -d "{
            'source_team': 'Support',
            'original_issue_type': '$original_issue_type'
        }")

    if [[ "$engineering_response" == *"resolved"* ]]; then
        echo "✅ Engineering Resolution Successful"
        return 0
    else
        echo "❌ Engineering Escalation Failed"
        return 1
    fi
}

# Main Escalation Workflow
main() {
    simulate_sales_escalation
    simulate_support_escalation
}

main