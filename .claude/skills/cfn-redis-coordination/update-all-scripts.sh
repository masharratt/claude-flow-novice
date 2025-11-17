#!/bin/bash
# Batch update all coordination scripts to use centralized Redis functions
# This adds the source line to all scripts that use redis-cli

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
UPDATED_COUNT=0
SKIPPED_COUNT=0

echo "🔧 Updating coordination scripts to use centralized Redis functions..."
echo

for script in "${SCRIPT_DIR}"/*.sh; do
    filename=$(basename "$script")

    # Skip this update script, wrapper, and functions
    if [[ "$filename" == "update-all-scripts.sh" ]] || \
       [[ "$filename" == "redis-cli-wrapper.sh" ]] || \
       [[ "$filename" == "redis-functions.sh" ]]; then
        continue
    fi

    # Check if script uses redis-cli
    if ! grep -q "redis-cli" "$script"; then
        echo "⏭️  Skipping $filename (doesn't use redis-cli)"
        ((SKIPPED_COUNT++))
        continue
    fi

    # Check if already updated
    if grep -q "source.*redis-functions.sh" "$script"; then
        echo "✅ Already updated: $filename"
        ((SKIPPED_COUNT++))
        continue
    fi

    # Create backup
    cp "$script" "${script}.bak"

    # Add source line after set -euo pipefail or after shebang
    if grep -q "set -euo pipefail" "$script"; then
        # Add after set -euo pipefail
        awk '/set -euo pipefail/ {
            print
            print ""
            print "# Source centralized Redis functions (provides graceful fallback for Task mode)"
            print "SCRIPT_DIR=\"$(cd \"$(dirname \"${BASH_SOURCE[0]}\")\" && pwd)\""
            print "source \"${SCRIPT_DIR}/redis-functions.sh\""
            next
        } 1' "$script" > "${script}.tmp" && mv "${script}.tmp" "$script"
    else
        # Add after shebang
        awk 'NR==1 {print; print ""; print "# Source centralized Redis functions (provides graceful fallback for Task mode)"; print "SCRIPT_DIR=\"$(cd \"$(dirname \"${BASH_SOURCE[0]}\")\" && pwd)\""; print "source \"${SCRIPT_DIR}/redis-functions.sh\""; next} 1' "$script" > "${script}.tmp" && mv "${script}.tmp" "$script"
    fi

    echo "✅ Updated: $filename"
    ((UPDATED_COUNT++))
done

echo
echo "📊 Summary:"
echo "   Updated: $UPDATED_COUNT scripts"
echo "   Skipped: $SKIPPED_COUNT scripts"
echo
echo "💡 Backups created with .bak extension"
echo "🧪 Test the updated scripts before committing"
