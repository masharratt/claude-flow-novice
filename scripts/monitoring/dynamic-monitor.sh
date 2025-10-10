#!/bin/bash

# Dynamic monitoring script for 50-agent stability test
# Pattern: 60s sleep x10 times, then 120s sleep x30 times

echo "🔍 Starting dynamic monitoring for 50-agent test..."
echo "   Phase 1: 60-second intervals (10 checks)"
echo "   Phase 2: 120-second intervals (30 checks)"

TOTAL_CHECKS=0

# Phase 1: 60-second intervals, 10 times
for i in {1..10}; do
    echo "📊 Check $TOTAL_CHECKS (Phase 1, $i/10) - $(date)"

    # Agent test status
    echo "   50-Agent Test: $(ps aux | grep 'node.*50-agent-test' | grep -v grep | wc -l) processes running"

    # Stability monitor status
    echo "   Monitor: $(ps aux | grep 'node.*stability-monitor' | grep -v grep | wc -l) processes running"

    # Memory usage
    AGENT_MEM=$(ps aux | grep 'node.*50-agent-test' | grep -v grep | awk '{sum+=$6} END {print sum/1024}')
    MONITOR_MEM=$(ps aux | grep 'node.*stability-monitor' | grep -v grep | awk '{sum+=$6} END {print sum/1024}')
    echo "   Memory: Agent=${AGENT_MEM:-0}MB, Monitor=${MONITOR_MEM:-0}MB"

    # /dev/shm usage
    TMPFS_USAGE=$(df /dev/shm | tail -1 | awk '{print $5}')
    echo "   tmpfs usage: $TMPFS_USAGE"

    # Check for recent coordination activity
    RECENT_LOG=$(tail -20 ./.artifacts/stability/stability-test.log 2>/dev/null | grep -c "coordination cycle")
    echo "   Recent coordination cycles: $RECENT_LOG"

    echo ""

    ((TOTAL_CHECKS++))
    sleep 60
done

echo "🔄 Phase 1 complete. Switching to 120-second intervals..."
echo ""

# Phase 2: 120-second intervals, 30 times
for i in {1..30}; do
    echo "📊 Check $TOTAL_CHECKS (Phase 2, $i/30) - $(date)"

    # Agent test status
    echo "   50-Agent Test: $(ps aux | grep 'node.*50-agent-test' | grep -v grep | wc -l) processes running"

    # Stability monitor status
    echo "   Monitor: $(ps aux | grep 'node.*stability-monitor' | grep -v grep | wc -l) processes running"

    # Memory usage
    AGENT_MEM=$(ps aux | grep 'node.*50-agent-test' | grep -v grep | awk '{sum+=$6} END {print sum/1024}')
    MONITOR_MEM=$(ps aux | grep 'node.*stability-monitor' | grep -v grep | awk '{sum+=$6} END {print sum/1024}')
    echo "   Memory: Agent=${AGENT_MEM:-0}MB, Monitor=${MONITOR_MEM:-0}MB"

    # /dev/shm usage
    TMPFS_USAGE=$(df /dev/shm | tail -1 | awk '{print $5}')
    echo "   tmpfs usage: $TMPFS_USAGE"

    # Check for recent coordination activity
    RECENT_LOG=$(tail -20 ./.artifacts/stability/stability-test.log 2>/dev/null | grep -c "coordination cycle")
    echo "   Recent coordination cycles: $RECENT_LOG"

    # Check for stability monitor alerts
    ALERTS=$(grep -c "MEMORY LEAK DETECTED\|FD LEAK DETECTED" ./.artifacts/stability/*.log 2>/dev/null || echo "0")
    echo "   Stability alerts: $ALERTS"

    # Process count for agents
    AGENT_PROCS=$(pgrep -f "agent-worker" | wc -l)
    echo "   Agent worker processes: $AGENT_PROCS"

    echo ""

    ((TOTAL_CHECKS++))
    sleep 120
done

echo "✅ Dynamic monitoring complete. Total checks: $TOTAL_CHECKS"
echo "📋 Final status report:"
echo "   Agent test status: $(ps aux | grep 'node.*50-agent-test' | grep -v grep | wc -l) processes"
echo "   Monitor status: $(ps aux | grep 'node.*stability-monitor' | grep -v grep | wc -l) processes"
echo "   Results available in: ./.artifacts/stability/"