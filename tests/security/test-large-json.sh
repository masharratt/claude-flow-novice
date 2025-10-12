#!/bin/bash

export AGENT_LIFECYCLE_DB="/tmp/test-large.db"
CLI="node .claude-flow-novice/dist/src/cli/main.js"

# Create large JSON
python3 << 'EOF' > /tmp/large-test.json
import json
data = {"x": "a" * 150000}
print(json.dumps(data))
EOF

echo "Testing large JSON (150KB)..."
echo "File size: $(wc -c < /tmp/large-test.json) bytes"

$CLI agent-lifecycle spawn \
  --id testlarge \
  --type coder \
  --acl-level 1 \
  --metadata "$(cat /tmp/large-test.json)" \
  --json 2>&1 | grep -A 2 "error"

rm -f /tmp/large-test.json /tmp/test-large.db
