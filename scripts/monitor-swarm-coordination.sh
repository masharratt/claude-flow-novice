#!/bin/bash
# Real-time Redis coordination monitoring

TOPOLOGY=${1:-"*"}
CHANNEL_PREFIX="swarm:${TOPOLOGY}"

echo "📊 Swarm Coordination Monitor"
echo "🔍 Watching: ${CHANNEL_PREFIX}"
echo "───────────────────────────────────────"

# Watch Redis keys with auto-refresh
watch -n 1 "
echo '🔑 Active Keys:'
redis-cli keys '${CHANNEL_PREFIX}:*' | sort

echo ''
echo '📈 Status Summary:'
for key in \$(redis-cli keys '${CHANNEL_PREFIX}:*:status'); do
  agent=\$(echo \$key | cut -d: -f3)
  status=\$(redis-cli get \$key)
  echo \"  \$agent: \$status\"
done

echo ''
echo '🚦 Coordination State:'
redis-cli get '${CHANNEL_PREFIX}:status' || echo 'Not set'

echo ''
echo '⏱️  Timestamp: \$(date +%H:%M:%S)'
"