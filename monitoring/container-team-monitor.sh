#!/bin/bash
# Real-time monitoring script for container-based CFN team deployment

set -e

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${BLUE}🐳 CFN Container Team Deployment Monitor${NC}"
echo "==============================================="

# Function to check CFN task status
check_cfn_tasks() {
    echo -e "\n${YELLOW}📋 Active CFN Tasks:${NC}"
    redis-cli KEYS "cfn_loop:*" | while read -r key; do
        if [[ -n "$key" ]]; then
            echo -e "  ${GREEN}✅${NC} $key"

            # Check if it's a container monitoring task
            if [[ "$key" =~ (container|monitor|dashboard) ]]; then
                echo -e "    ${BLUE}🎯 Container monitoring task detected!${NC}"

                # Get task details
                redis-cli HGETALL "$key" 2>/dev/null | while read -r field; do
                    if [[ -n "$field" ]]; then
                        echo -e "    ${GREEN}  - $field${NC}"
                    fi
                done
            fi
        fi
    done
}

# Function to check Docker containers
check_containers() {
    echo -e "\n${YELLOW}🐳 CFN-Related Containers:${NC}"

    # Look for CFN containers
    docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" | grep -E "(cfn|orchestrator|agent)" || echo "  No CFN containers running yet"
}

# Function to check CFN processes
check_processes() {
    echo -e "\n${YELLOW}🔄 CFN Processes:${NC}"

    local cfn_processes=$(ps aux | grep "claude-flow-novice" | grep -v grep | wc -l)
    echo "  CFN agent processes: $cfn_processes"

    if [ $cfn_processes -gt 0 ]; then
        ps aux | grep "claude-flow-novice" | grep -v grep | while read -r line; do
            echo -e "    ${GREEN}✅${NC} $line"
        done
    else
        echo -e "    ${RED}❌ No CFN processes found${NC}"
    fi
}

# Function to check Redis coordination
check_redis_coordination() {
    echo -e "\n${YELLOW}🔴 Redis Coordination Status:${NC}"

    # Test Redis connectivity
    if redis-cli ping > /dev/null 2>&1; then
        echo -e "  ${GREEN}✅ Redis connected${NC}"

        # Check coordination keys
        local coord_keys=$(redis-cli KEYS "swarm:*" | wc -l)
        echo "  Swarm coordination keys: $coord_keys"

        # Check for container team keys
        local container_keys=$(redis-cli KEYS "*container*" | wc -l)
        echo "  Container-related keys: $container_keys"

    else
        echo -e "  ${RED}❌ Redis not responding${NC}"
    fi
}

# Function to look for new container team task
find_container_task() {
    echo -e "\n${YELLOW}🔍 Looking for Container Team Task...${NC}"

    # Check recent Redis activity
    redis-cli KEYS "cfn_loop:*" | while read -r key; do
        if [[ -n "$key" ]]; then
            # Check task description in context
            local context=$(redis-cli HGET "$key" "context" 2>/dev/null)
            if [[ "$context" =~ (container|monitor|dashboard) ]]; then
                echo -e "  ${GREEN}🎯 FOUND:${NC} $key"
                echo -e "    ${BLUE}Context:${NC} ${context:0:100}..."
            fi
        fi
    done
}

# Main monitoring loop
echo -e "\n${BLUE}Starting monitoring (Press Ctrl+C to stop)${NC}"

while true; do
    clear
    echo -e "${BLUE}🐳 CFN Container Team Deployment Monitor${NC}"
    echo "==============================================="
    echo -e "${YELLOW}Last checked: $(date)${NC}"

    check_cfn_tasks
    check_containers
    check_processes
    check_redis_coordination
    find_container_task

    echo -e "\n${GREEN}🔄 Next check in 10 seconds... (Ctrl+C to stop)${NC}"
    sleep 10
done