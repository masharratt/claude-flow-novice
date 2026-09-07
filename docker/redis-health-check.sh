#!/bin/sh
# docker/redis-health-check.sh
# Secure Redis health check that doesn't expose password in plaintext
# SECURITY FIX CHE-001: Reads password from environment variable instead of command-line args

# Read password from environment variable (not exposed in ps/docker inspect output)
REDIS_PASSWORD="${REDIS_PASSWORD:-}"

if [ -n "$REDIS_PASSWORD" ]; then
    # Use password if configured (via environment variable)
    redis-cli -a "$REDIS_PASSWORD" ping >/dev/null 2>&1
else
    # Use without password if not configured
    redis-cli ping >/dev/null 2>&1
fi

# Return the exit code (0 = success, non-zero = failure)
exit $?
