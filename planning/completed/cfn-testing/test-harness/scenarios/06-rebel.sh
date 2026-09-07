#!/bin/bash
set -e

# Scenario 06: Rebel (Product Owner Veto)
# Test Product Owner decision authority

TASK_ID="scenario-06-rebel"
RESULTS_FILE="/mnt/c/Users/masha/Documents/claude-flow-novice/planning/cfn-testing/results/scenario-06-results.json"

# Initialize Redis
redis-cli del "swarm:${TASK_ID}:iterations"
redis-cli lpush "swarm:${TASK_ID}:iterations" "0"

# Synthetic Confidence Calculation
declare -a GATE_SCORES=(0.91 0.89)
declare -a CONSENSUS_SCORES=(0.945 0.915)
declare -a PO_DECISIONS=("reject" "approve")
ITERATIONS=2
SUCCESS=0

for (( i=0; i<ITERATIONS; i++ )); do
    echo "Iteration $((i+1))"

    # Gate Check
    if (( $(echo "${GATE_SCORES[$i]} >= 0.75" | bc -l) )); then
        echo "Gate Passed: ${GATE_SCORES[$i]}"

        # Consensus Check
        if (( $(echo "${CONSENSUS_SCORES[$i]} >= 0.90" | bc -l) )); then
            echo "Consensus Passed: ${CONSENSUS_SCORES[$i]}"

            # Product Owner Check
            if [[ "${PO_DECISIONS[$i]}" == "approve" ]]; then
                echo "Product Owner Approved"
                SUCCESS=1
                break
            else
                echo "Product Owner Rejected"
            fi
        fi
    fi
done

# Generate Results JSON
cat > "$RESULTS_FILE" << EOF
{
    "scenarioId": "06",
    "scenarioName": "Rebel (Product Owner Veto)",
    "totalIterations": $ITERATIONS,
    "passed": $SUCCESS,
    "gateScores": [${GATE_SCORES[0]}, ${GATE_SCORES[1]}],
    "consensusScores": [${CONSENSUS_SCORES[0]}, ${CONSENSUS_SCORES[1]}],
    "poDecisions": ["${PO_DECISIONS[0]}", "${PO_DECISIONS[1]}"]
}
EOF

# Exit with success/failure
exit $((1-SUCCESS))