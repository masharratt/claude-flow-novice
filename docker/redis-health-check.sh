#!/bin/sh
# DEPRECATED: This shell script has been migrated to TypeScript
#
# Use the TypeScript version instead:
#   src/docker/health-check/redis-health-check.ts
#
# The TypeScript version provides:
#   - Full type safety and compile-time error checking
#   - Comprehensive test coverage (100% in jest)
#   - Better error handling and retry logic
#   - Security-hardened password handling
#   - Proper environment variable management
#
# This file will be removed in the next major version.
# To use the new TypeScript version:
#
#   import { RedisHealthCheck } from 'src/docker/health-check/redis-health-check';
#   const checker = new RedisHealthCheck({ host, port, password });
#   const result = await checker.check();
#

echo "⚠️  DEPRECATED: docker/redis-health-check.sh has been migrated to TypeScript"
echo "   Use: src/docker/health-check/redis-health-check.ts instead"
exit 1
