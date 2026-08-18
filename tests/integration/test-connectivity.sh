#!/usr/bin/env bash

# Simple connectivity test script
# Tests basic network and system connectivity

echo "=== Connectivity Test Results ==="
echo "Timestamp: $(date)"
echo "Host: $(hostname)"
echo

# Test 1: Localhost connectivity
echo "1. Testing localhost connectivity..."
if ping -c 1 localhost &>/dev/null; then
    echo "✅ localhost: SUCCESS"
else
    echo "❌ localhost: FAILED"
fi

# Test 2: Internet connectivity (Google DNS)
echo "2. Testing internet connectivity..."
if ping -c 1 8.8.8.8 &>/dev/null; then
    echo "✅ Internet (8.8.8.8): SUCCESS"
else
    echo "❌ Internet (8.8.8.8): FAILED"
fi

# Test 3: DNS resolution
echo "3. Testing DNS resolution..."
if nslookup google.com &>/dev/null; then
    echo "✅ DNS (google.com): SUCCESS"
else
    echo "❌ DNS (google.com): FAILED"
fi

# Test 4: Local Redis connectivity
echo "4. Testing Redis connectivity..."
if redis-cli ping &>/dev/null; then
    echo "✅ Redis: SUCCESS"
else
    echo "❌ Redis: FAILED"
fi

# Test 5: File system access
echo "5. Testing file system access..."
if touch /tmp/connectivity-test.$$ && rm /tmp/connectivity-test.$$; then
    echo "✅ File system: SUCCESS"
else
    echo "❌ File system: FAILED"
fi

echo
echo "=== Test Complete ==="