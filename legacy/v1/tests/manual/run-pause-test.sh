#!/bin/bash
# Quick test runner for SDK pause demonstration

echo "🧪 SDK Pause vs Waiting Test"
echo "============================"
echo ""

# Check if SDK installed
if ! npm list @anthropic-ai/claude-code > /dev/null 2>&1; then
  echo "📦 Installing @anthropic-ai/claude-code..."
  npm install @anthropic-ai/claude-code --save-dev
  echo ""
fi

echo "▶️  Running test..."
echo ""

node test/sdk-pause-vs-waiting.test.js

echo ""
echo "✅ Test complete. See results above."
