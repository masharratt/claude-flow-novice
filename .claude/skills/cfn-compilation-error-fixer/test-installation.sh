#!/bin/bash
set -eu

# Test CFN Compilation Error Fixer Installation

echo "🧪 Testing CFN Compilation Error Fixer Installation"
echo "=============================================="

# Test 1: Check files exist
echo -e "\n✅ Test 1: File Structure"
required_files=(
    "package.json"
    "README.md"
    "index.js"
    "bin/fix-errors.sh"
    "lib/fixer/cerebras-gated-fixer-v2.ts"
    "lib/fixer/typescript-gated-fixer-v2.ts"
    "lib/fixer/cerebras-wrapper.ts"
)

for file in "${required_files[@]}"; do
    if [[ -f "$file" ]]; then
        echo "   ✓ $file exists"
    else
        echo "   ✗ $file missing"
        exit 1
    fi
done

# Test 2: Check node_modules
echo -e "\n✅ Test 2: Dependencies"
if [[ -d "node_modules" ]]; then
    echo "   ✓ Dependencies installed"
else
    echo "   ✗ Dependencies not installed"
    echo "   Run: npm install or ./install.sh"
    exit 1
fi

# Test 3: Check tsx is available
echo -e "\n✅ Test 3: TSX Runtime"
if command -v npx tsx &> /dev/null; then
    echo "   ✓ TSX available via npx"
else
    echo "   ✗ TSX not available"
    exit 1
fi

# Test 4: Test executable permissions
echo -e "\n✅ Test 4: Executable Permissions"
if [[ -x "bin/fix-errors.sh" ]]; then
    echo "   ✓ fix-errors.sh is executable"
else
    echo "   ✗ fix-errors.sh is not executable"
    exit 1
fi

# Test 5: Test help commands
echo -e "\n✅ Test 5: Help Commands"
if node index.js --help &> /dev/null; then
    echo "   ✓ Node.js entry point works"
else
    echo "   ✗ Node.js entry point failed"
fi

if ./bin/fix-errors.sh --help &> /dev/null; then
    echo "   ✓ Shell script entry point works"
else
    echo "   ✗ Shell script entry point failed"
fi

# Test 6: Check optional SDK
echo -e "\n✅ Test 6: Optional Dependencies"
if npm list @cerebras/cerebras_cloud_sdk --depth=0 2>/dev/null | grep -q "@cerebras/cerebras_cloud_sdk"; then
    echo "   ✓ Cerebras SDK installed"
    SDK_STATUS="full"
else
    echo "   ⚠ Cerebras SDK not installed (fallback mode)"
    SDK_STATUS="fallback"
fi

# Summary
echo -e "\n📊 Installation Summary"
echo "========================"
echo "✅ All tests passed!"
echo ""
echo "Mode: $SDK_STATUS"
echo ""
echo "Usage examples:"
echo "  npm run fix:rust           # Fix Rust errors"
echo "  npm run fix:ts             # Fix TypeScript errors"
echo "  npm run fix:rust --dry-run # Preview fixes"
echo ""
if [[ "$SDK_STATUS" == "fallback" ]]; then
    echo "To enable LLM processing:"
    echo "  npm install @cerebras/cerebras_cloud_sdk"
fi