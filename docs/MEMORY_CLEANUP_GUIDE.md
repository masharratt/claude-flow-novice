# Memory Cleanup Guide - Task Mode Conversation Forks

## Quick Reference

### Automatic Cleanup (Default)

Starting with v2.16.0, all conversation fork data automatically expires after 24 hours.

**No manual intervention required for normal operation.**

### Configuration

```bash
# .env configuration
CFN_MESSAGE_TTL=86400      # Message list TTL (seconds, default: 24h)
CFN_FORK_TTL=86400          # Fork snapshot TTL (seconds, default: 24h)
CFN_MAX_MESSAGES=100        # Max messages per agent (optional)
```

**TTL Presets:**
- Development: `CFN_MESSAGE_TTL=3600` (1 hour)
- Staging: `CFN_MESSAGE_TTL=43200` (12 hours)
- Production: `CFN_MESSAGE_TTL=86400` (24 hours)
- Long-term: `CFN_MESSAGE_TTL=604800` (7 days)

## Manual Cleanup Commands

### 1. Monitor Memory Usage

```bash
# Get memory statistics for a task
node -e "
const { getTaskMemoryStats } = require('./dist/cli/conversation-fork-cleanup.js');
const stats = getTaskMemoryStats('task-id-123', 'agent-id-456');
console.log('Messages:', stats.messageCount);
console.log('Forks:', stats.forkCount);
console.log('Estimated size:', stats.estimatedSizeKB, 'KB');
"
```

### 2. Clean Up Specific Task

```bash
# Remove all messages and forks for a completed task
node -e "
const { cleanupTaskMessages } = require('./dist/cli/conversation-fork-cleanup.js');
cleanupTaskMessages('task-id-123', 'agent-id-456');
"
```

### 3. Clean Up Orphaned Forks

```bash
# Remove forks where metadata expired but messages remain
node -e "
const { cleanupOrphanedForks } = require('./dist/cli/conversation-fork-cleanup.js');
cleanupOrphanedForks('task-id-123', 'agent-id-456');
"
```

### 4. Configure Auto-Cleanup for Task

```bash
# Set TTL and trim message list
node -e "
const { configureAutoCleanup } = require('./dist/cli/conversation-fork-cleanup.js');
configureAutoCleanup('task-id-123', 'agent-id-456', {
  messageTTL: 86400,           // 24 hours
  maxMessagesPerAgent: 100,    // Keep last 100 messages
  autoCleanupForks: true       // Clean orphaned forks
});
"
```

### 5. Emergency Full Cleanup

**⚠️ WARNING: This deletes ALL conversation history for ALL tasks**

```bash
# Emergency cleanup (use with extreme caution)
node -e "
const { emergencyCleanupAll } = require('./dist/cli/conversation-fork-cleanup.js');
console.log('WARNING: This will delete ALL conversation history');
console.log('Press Ctrl+C to cancel, or wait 5s to proceed...');
setTimeout(() => {
  emergencyCleanupAll();
  console.log('All conversation data deleted');
}, 5000);
"
```

## Redis Commands (Direct Access)

### Check TTL on Keys

```bash
# List all message keys
redis-cli keys "swarm:*:*:messages"

# Check TTL on specific key
redis-cli ttl "swarm:task-123:agent-456:messages"
# -1 = no expiration (memory leak!)
# -2 = key doesn't exist
# N = expires in N seconds

# Check all message keys for missing TTL
redis-cli keys "swarm:*:*:messages" | while read key; do
  ttl=$(redis-cli ttl "$key")
  if [ "$ttl" -eq -1 ]; then
    echo "NO TTL: $key"
  fi
done
```

### Manual TTL Setting

```bash
# Set 24h TTL on message list
redis-cli expire "swarm:task-123:agent-456:messages" 86400

# Set 24h TTL on fork messages
redis-cli expire "swarm:task-123:agent-456:fork:fork-5:messages" 86400
```

### Delete Specific Keys

```bash
# Delete message list
redis-cli del "swarm:task-123:agent-456:messages"

# Delete all forks for agent
redis-cli keys "swarm:task-123:agent-456:fork:*:messages" | xargs redis-cli del
redis-cli keys "swarm:task-123:agent-456:fork:*:meta" | xargs redis-cli del
```

### Memory Monitoring

```bash
# Check Redis memory usage
redis-cli info memory | grep used_memory_human

# Count conversation keys
redis-cli keys "swarm:*" | wc -l

# Count by pattern
echo "Message lists: $(redis-cli keys 'swarm:*:*:messages' | wc -l)"
echo "Fork snapshots: $(redis-cli keys 'swarm:*:*:fork:*:messages' | wc -l)"
echo "Fork metadata: $(redis-cli keys 'swarm:*:*:fork:*:meta' | wc -l)"
```

## Troubleshooting

### High Memory Usage

**Symptom:** Redis memory growing >100MB

**Diagnosis:**
```bash
# Check for keys without TTL
redis-cli keys "swarm:*" | while read key; do
  ttl=$(redis-cli ttl "$key")
  if [ "$ttl" -eq -1 ]; then
    len=$(redis-cli llen "$key" 2>/dev/null || echo "N/A")
    echo "NO TTL: $key (length: $len)"
  fi
done
```

**Fix:**
```bash
# Set TTL on all message keys
redis-cli keys "swarm:*:*:messages" | while read key; do
  redis-cli expire "$key" 86400
done

# Set TTL on all fork message keys
redis-cli keys "swarm:*:*:fork:*:messages" | while read key; do
  redis-cli expire "$key" 86400
done
```

### Orphaned Forks

**Symptom:** Fork messages remain after metadata expires

**Diagnosis:**
```bash
# Find orphaned forks
redis-cli keys "swarm:*:*:fork:*:messages" | while read msg_key; do
  # Extract fork ID from key
  fork_id=$(echo "$msg_key" | sed 's/.*:fork:\(.*\):messages/\1/')
  task_id=$(echo "$msg_key" | cut -d: -f2)
  agent_id=$(echo "$msg_key" | cut -d: -f3)

  # Check if metadata exists
  meta_key="swarm:${task_id}:${agent_id}:fork:${fork_id}:meta"
  exists=$(redis-cli exists "$meta_key")

  if [ "$exists" -eq 0 ]; then
    echo "ORPHANED: $msg_key (metadata missing)"
  fi
done
```

**Fix:**
```bash
# Delete orphaned fork messages
node -e "
const { cleanupOrphanedForks } = require('./dist/cli/conversation-fork-cleanup.js');
const { execSync } = require('child_process');

// Get all unique task/agent combinations
const keys = execSync('redis-cli keys \"swarm:*:*:messages\"').toString().trim().split('\n');
keys.forEach(key => {
  const parts = key.split(':');
  const taskId = parts[1];
  const agentId = parts[2];
  cleanupOrphanedForks(taskId, agentId);
});
"
```

### Slow Redis Operations

**Symptom:** CFN Loop executions taking longer than normal

**Diagnosis:**
```bash
# Check Redis slow log
redis-cli slowlog get 10

# Check number of keys
redis-cli dbsize

# Check memory fragmentation
redis-cli info memory | grep mem_fragmentation_ratio
```

**Fix:**
```bash
# If too many keys (>10,000), run emergency cleanup
# (After backing up important data)
node -e "
const { emergencyCleanupAll } = require('./dist/cli/conversation-fork-cleanup.js');
emergencyCleanupAll();
"

# Restart Redis to defragment
docker-compose restart redis
```

## Monitoring Scripts

### Continuous Memory Monitor

```bash
#!/bin/bash
# monitor-memory.sh - Run in background to track memory usage

while true; do
  timestamp=$(date +"%Y-%m-%d %H:%M:%S")
  memory=$(redis-cli info memory | grep used_memory_human | cut -d: -f2 | tr -d '\r')
  key_count=$(redis-cli dbsize | cut -d: -f2)
  msg_count=$(redis-cli keys "swarm:*:*:messages" | wc -l)
  fork_count=$(redis-cli keys "swarm:*:*:fork:*:messages" | wc -l)

  echo "[$timestamp] Memory: $memory | Keys: $key_count | Messages: $msg_count | Forks: $fork_count"

  sleep 60  # Check every minute
done
```

### Daily Cleanup Cron

```bash
# Add to crontab for daily maintenance
# crontab -e

# Clean up orphaned forks daily at 3 AM
0 3 * * * /usr/bin/node -e "const { emergencyCleanupAll } = require('/path/to/dist/cli/conversation-fork-cleanup.js'); console.log('Daily cleanup:', new Date()); emergencyCleanupAll();" >> /var/log/cfn-cleanup.log 2>&1
```

## Best Practices

### 1. Development Environment

```bash
# Use short TTL for rapid testing
export CFN_MESSAGE_TTL=300    # 5 minutes
export CFN_FORK_TTL=300       # 5 minutes
```

### 2. Production Environment

```bash
# Use standard 24h TTL
export CFN_MESSAGE_TTL=86400  # 24 hours
export CFN_FORK_TTL=86400     # 24 hours

# Enable monitoring
./monitor-memory.sh &
```

### 3. High-Volume Environments

```bash
# Aggressive cleanup for high task volume
export CFN_MESSAGE_TTL=43200      # 12 hours
export CFN_FORK_TTL=43200         # 12 hours
export CFN_MAX_MESSAGES=50        # Limit to 50 messages per agent

# Run hourly orphan cleanup
# crontab: 0 * * * * node -e "..."
```

### 4. Debugging/Investigation

```bash
# Disable auto-cleanup temporarily
export CFN_MESSAGE_TTL=604800     # 7 days
export CFN_FORK_TTL=604800        # 7 days

# Re-enable after debugging
unset CFN_MESSAGE_TTL CFN_FORK_TTL
```

## Performance Tuning

### Memory Limits

```yaml
# docker-compose.yml - Set Redis memory limit
services:
  redis:
    image: redis:7-alpine
    command: redis-server --maxmemory 256mb --maxmemory-policy allkeys-lru
```

### Eviction Policies

```bash
# LRU eviction when memory full (least recently used)
redis-cli config set maxmemory-policy allkeys-lru

# Volatile LRU (only evict keys with TTL)
redis-cli config set maxmemory-policy volatile-lru

# No eviction (returns errors when full) - NOT RECOMMENDED
redis-cli config set maxmemory-policy noeviction
```

## Support

For issues or questions:
- Check test suite: `./tests/test-memory-leak-task-mode.sh`
- Review bug documentation: `docs/BUG_19_MEMORY_LEAK_TASK_MODE.md`
- Monitor Redis: `redis-cli monitor`
- Enable debug logging: `export CFN_LOG_LEVEL=debug`
