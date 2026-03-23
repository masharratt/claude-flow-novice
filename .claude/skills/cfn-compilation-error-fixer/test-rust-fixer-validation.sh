#!/bin/bash
set -eu

echo "🧪 Rust Error Fixer Validation Tests"
echo "===================================="

# Test 1: Validate fixer can be parsed
echo -e "\n✅ Test 1: Syntax Validation"
cd lib/fixer

# Check TypeScript syntax
if npx tsc --noEmit cerebras-gated-fixer-v2.ts 2>/dev/null; then
  echo "   ✓ TypeScript syntax is valid"
else
  echo "   ✗ TypeScript syntax error"
  echo "   Run: npx tsc --noEmit cerebras-gated-fixer-v2.ts to see errors"
fi

# Test 2: Validate imports and dependencies
echo -e "\n✅ Test 2: Dependency Validation"
if [ -f "package.json" ]; then
  echo "   ✓ package.json exists"
  if npm list @cerebras/cerebras_cloud_sdk &>/dev/null; then
    echo "   ✓ Cerebras SDK installed"
  else
    echo "   ⚠️  Cerebras SDK not installed (run: npm install)"
  fi
fi

# Test 3: Validate gate implementations
echo -e "\n✅ Test 3: Gate Implementations"
gates=("LineCount" "FnSignature" "ImportDup" "BraceBalance" "SemanticDiff" "OrphanedCode" "ImportPath" "PatternDup" "ImplLocation" "TypeCast" "MatchArm" "Regression")

for gate in "${gates[@]}"; do
  if grep -q "name: '$gate'" cerebras-gated-fixer-v2.ts; then
    echo "   ✓ Gate $gate configured"
  else
    echo "   ✗ Gate $gate missing"
  fi
done

# Test 4: Validate error classification
echo -e "\n✅ Test 4: Error Classification"
errors=("E0308" "E0412" "E0433" "E0425" "E0599" "E0277" "E0382" "E0063" "E0061" "E0282")

for err in "${errors[@]}"; do
  if grep -q "'$err'" cerebras-gated-fixer-v2.ts; then
    echo "   ✓ Error $err classified"
  else
    echo "   ⚠️  Error $err not found"
  fi
done

echo -e "\n🎉 Validation Complete!"
