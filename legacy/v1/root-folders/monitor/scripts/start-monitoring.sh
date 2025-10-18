#!/bin/bash

# Premium Performance Monitor Startup Script
# Optimized for 96GB setup with 62GB RAM, 24 cores, DDR5-6400

echo "🚀 Starting Premium Performance Monitor..."
echo "📊 Hardware: 62GB RAM, 24 cores, DDR5-6400"
echo "⚡ Update interval: 1 second"

# Set environment variables for optimal performance
export NODE_ENV=production
export PORT=3001
export UPDATE_INTERVAL=1000
export BENCHMARK_THREADS=24
export MEMORY_WARNING_THRESHOLD=80
export CPU_WARNING_THRESHOLD=80
export UV_THREADPOOL_SIZE=32

# Enable garbage collection optimization
export NODE_OPTIONS="--max-old-space-size=8192 --max-semi-space-size=512"

# Check if Claude Flow is available
if command -v npx claude-flow@alpha &> /dev/null; then
    echo "🔗 Claude Flow detected - enabling hooks integration"
    export CLAUDE_FLOW_ENABLED=true

    # Initialize Claude Flow hooks
    npx claude-flow@alpha hooks pre-task --description "Starting premium performance monitor for 96GB setup"
else
    echo "⚠️ Claude Flow not found - running in standalone mode"
    export CLAUDE_FLOW_ENABLED=false
fi

# Check system resources
echo "🔍 Checking system resources..."

# Memory check
TOTAL_MEM=$(free -g | awk '/^Mem:/{print $2}')
if [ "$TOTAL_MEM" -lt 32 ]; then
    echo "⚠️ Warning: Less than 32GB RAM detected. Monitoring may be suboptimal."
fi

# CPU check
CPU_CORES=$(nproc)
if [ "$CPU_CORES" -lt 8 ]; then
    echo "⚠️ Warning: Less than 8 CPU cores detected. Performance may be limited."
fi

echo "💾 Available memory: ${TOTAL_MEM}GB"
echo "🔧 CPU cores: ${CPU_CORES}"

# Start the monitoring server
echo "🌟 Launching dashboard server..."
cd "$(dirname "$0")/../dashboard"

# Background process monitoring
(
    echo "📊 Background: Starting metrics collection..."
    sleep 5
    curl -s http://localhost:3001/health > /dev/null && echo "✅ Health check passed" || echo "❌ Health check failed"
) &

# Start the main server
node server.js

echo "🛑 Premium Performance Monitor stopped"