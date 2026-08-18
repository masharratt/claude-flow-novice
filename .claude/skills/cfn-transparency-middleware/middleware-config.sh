#!/usr/bin/env bash

# Transparency Middleware Configuration
# Version: 1.0.0

# Redis Configuration
export REDIS_HOST="${REDIS_HOST:-localhost}"
export REDIS_PORT="${REDIS_PORT:-6379}"

# Transparency Levels
TRANSPARENCY_LEVELS=(
    "minimal"    # Minimal logging, low overhead
    "detailed"   # Standard operational insights
    "verbose"    # Comprehensive logging
    "debug"      # Maximum verbosity and tracing
)

# Performance Thresholds
export MAX_OVERHEAD_PERCENTAGE=5
export MAX_MESSAGE_LATENCY_MS=50
export MAX_MEMORY_USAGE_MB=10

# Logging Configuration
export LOG_RETENTION_DAYS=7
export LOG_MAX_SIZE_MB=100

# Test-specific Configuration
export TEST_TIMEOUT_SECONDS=30
export TEST_MESSAGE_COUNT=1000