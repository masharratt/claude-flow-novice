#!/bin/bash
# Redis Cleanup Script for CFN Loop
# Prevents orphaned keys and memory leaks

set -euo pipefail

# Configuration
DEFAULT_TTL=3600  # 1 hour
SWARM_PREFIX="swarm:"
CFN_PREFIX="cfn_loop:task:"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}🧹 CFN Loop Redis Cleanup${NC}"

# Function to show current Redis usage
show_usage() {
    echo -e "${YELLOW}Current Redis Usage:${NC}"
    local total_keys=$(redis-cli keys "*" | wc -l)
    local swarm_keys=$(redis-cli keys "${SWARM_PREFIX}*" | wc -l)
    local cfn_keys=$(redis-cli keys "${CFN_PREFIX}*" | wc -l)

    echo "Total keys: $total_keys"
    echo "Swarm keys: $swarm_keys"
    echo "CFN Loop keys: $cfn_keys"
    echo ""
}

# Function to cleanup orphaned keys
cleanup_orphaned() {
    echo -e "${YELLOW}Cleaning up orphaned keys...${NC}"

    # Find and clean up keys without TTL
    local keys_without_ttl=$(redis-cli keys "${SWARM_PREFIX}*" | xargs -I {} sh -c 'redis-cli ttl {} | grep -q "^-1$" && echo {}')

    if [ -n "$keys_without_ttl" ]; then
        echo "Setting TTL on orphaned keys:"
        echo "$keys_without_ttl" | xargs -I {} echo "  - {}"
        echo "$keys_without_ttl" | xargs -I {} redis-cli expire {} $DEFAULT_TTL
        echo -e "${GREEN}✓ Set $DEFAULT_TTL TTL on $(echo "$keys_without_ttl" | wc -l) keys${NC}"
    else
        echo -e "${GREEN}✓ No orphaned keys found${NC}"
    fi
}

# Function to cleanup old task data
cleanup_old_tasks() {
    echo -e "${YELLOW}Cleaning up tasks older than 24 hours...${NC}"

    # Find keys with old timestamps
    local old_keys=$(redis-cli --scan --pattern "${SWARM_PREFIX}*:*" | \
        grep -E ":[0-9]{10}:" | \
        awk -F: '{ if ($NF < $(date +%s) - 86400) print $0 }')

    if [ -n "$old_keys" ]; then
        echo "Removing old task keys:"
        echo "$old_keys" | xargs -I {} echo "  - {}"
        echo "$old_keys" | xargs -I {} redis-cli del {}
        echo -e "${GREEN}✓ Removed $(echo "$old_keys" | wc -l) old keys${NC}"
    else
        echo -e "${GREEN}✓ No old keys found${NC}"
    fi
}

# Function to set TTL on all keys
set_ttl_on_all() {
    echo -e "${YELLOW}Setting TTL on all CFN Loop keys...${NC}"

    local all_keys=$(redis-cli keys "${SWARM_PREFIX}*")
    local count=0

    for key in $all_keys; do
        if redis-cli ttl "$key" | grep -q "^-1$"; then
            redis-cli expire "$key" $DEFAULT_TTL
            ((count++))
        fi
    done

    echo -e "${GREEN}✓ Set TTL on $count keys${NC}"
}

# Function to validate Redis health
validate_redis() {
    echo -e "${YELLOW}Validating Redis health...${NC}"

    # Check Redis connection
    if ! redis-cli ping > /dev/null 2>&1; then
        echo -e "${RED}✗ Redis is not responding${NC}"
        exit 1
    fi

    # Check memory usage
    local memory=$(redis-cli info memory | grep used_memory_human | cut -d: -f2 | tr -d '\r')
    echo -e "${GREEN}✓ Redis is healthy (Memory: $memory)${NC}"
}

# Main execution
case "${1:-all}" in
    "usage")
        show_usage
        ;;
    "orphaned")
        cleanup_orphaned
        ;;
    "old")
        cleanup_old_tasks
        ;;
    "ttl")
        set_ttl_on_all
        ;;
    "validate")
        validate_redis
        ;;
    "all")
        show_usage
        validate_redis
        cleanup_orphaned
        cleanup_old_tasks
        set_ttl_on_all
        echo -e "${GREEN}🎉 Cleanup complete!${NC}"
        ;;
    *)
        echo "Usage: $0 [usage|orphaned|old|ttl|validate|all]"
        exit 1
        ;;
esac