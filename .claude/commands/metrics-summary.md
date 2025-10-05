# Metrics Summary

Display aggregated metrics statistics with configurable time frame and manage metrics tracking.

## Usage

```bash
# Display metrics summary
/metrics-summary [--minutes=60] [--provider=all] [--model=all]

# Manage tracking
/metrics-summary --enable    # Enable metrics tracking
/metrics-summary --disable   # Disable metrics tracking
/metrics-summary --status    # Check tracking status
```

## Parameters

### Display Metrics
- `--minutes` - Time frame in minutes (default: 60 = last hour)
  - Examples: 60 (1 hour), 1440 (24 hours), 10080 (7 days)
- `--provider` - Filter by provider: `all`, `anthropic`, `z.ai` (default: all)
- `--model` - Filter by model name (default: all)

### Manage Tracking
- `--enable` - Enable metrics tracking
- `--disable` - Disable metrics tracking
- `--status` - Check current tracking status

## Examples

```bash
# Last hour stats (all providers)
/metrics-summary

# Last 24 hours
/metrics-summary --minutes=1440

# Last hour Z.ai only
/metrics-summary --minutes=60 --provider=z.ai

# Last 7 days GLM-4.6 only
/metrics-summary --minutes=10080 --model=glm-4.6

# Enable/disable tracking
/metrics-summary --enable
/metrics-summary --disable
/metrics-summary --status
```

## Output

- **API Requests**: Total count by provider
- **Token Usage**: Input/Output/Total by provider and model
- **Error Rate**: Success vs error percentage
- **Cost Breakdown**: Estimated costs by provider (if pricing available)
- **Top Models**: Most used models in time frame
- **Performance**: Average API duration by provider
