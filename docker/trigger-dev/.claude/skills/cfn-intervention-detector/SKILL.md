# Intervention Detector Skill

## Purpose
Detect problematic patterns in agent performance during CFN Loop iterations that may require intervention.

## Detection Mechanisms
1. **Confidence Plateau**:
   - Minimal confidence improvement over multiple iterations
   - Threshold: Δ < 0.05 for 2+ consecutive iterations

2. **Recurring Feedback**:
   - Same feedback theme repeated 3+ times
   - Indicates underlying issue not being addressed

3. **Deliverables Stuck**:
   - No new files created in 2+ consecutive iterations

## Configuration
- Configurable thresholds
- Flexible input parsing
- JSON output for easy integration

## Usage
```bash
./detect-intervention.sh \
  --iteration N \
  --confidence-history "0.72,0.75,0.76" \
  --feedback-history "theme1;theme2;theme3"
```

## Output Formats
- Trigger type
- Detailed reasoning
- Recommended action

## Implementation Notes
- Use bash for performance
- Minimize external dependencies
- Provide clear, actionable output