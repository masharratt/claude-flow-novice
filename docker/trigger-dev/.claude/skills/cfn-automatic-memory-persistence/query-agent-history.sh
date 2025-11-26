#!/bin/bash
# Query agent output history from SQLite

# Enable strict error handling
set -euo pipefail

# Input validation
if [[ $# -lt 1 ]]; then
    echo "Usage: $0 <AGENT_ID> [TASK_ID] [MAX_ENTRIES]"
    exit 1
fi

AGENT_ID="$1"
TASK_ID="${2:-}"
MAX_ENTRIES="${3:-10}"

# Call TypeScript query layer
node -e "
const { SQLiteAdapter } = require('./src/cli/sqlite-adapter');
const adapter = new SQLiteAdapter();

const queryPattern = '${AGENT_ID}' + (process.argv[2] ? '/output/${TASK_ID}' : '/output/*');

try {
  const results = adapter.query(queryPattern, {
    limit: parseInt('${MAX_ENTRIES}'),
    order: 'timestamp DESC'
  });

  console.log(JSON.stringify(results, null, 2));
} catch (error) {
  console.error('Query failed:', error);
  process.exit(1);
}
" "${TASK_ID}"