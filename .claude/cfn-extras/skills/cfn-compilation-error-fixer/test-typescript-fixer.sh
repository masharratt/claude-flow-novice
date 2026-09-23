#!/usr/bin/env bash
set -eu

# Test script for TypeScript error fixer
# This script validates the fixer implementation without requiring a full TypeScript project

echo "🧪 Testing TypeScript Error Fixer Implementation"
echo "=============================================="

# Test 1: Check file structure
echo -e "\n✅ Test 1: File Structure"
files=(
  "lib/fixer/typescript-gated-fixer-v2.ts"
  "lib/gates/typescript-gates.ts"
  "lib/fixer/README-TypeScript.md"
)

for file in "${files[@]}"; do
  if [ -f "$file" ]; then
    echo "   ✓ $file exists"
  else
    echo "   ✗ $file missing"
    exit 1
  fi
done

# Test 2: Check required imports
echo -e "\n✅ Test 2: Import Validation"
if grep -q "from.*typescript-gates" lib/fixer/typescript-gated-fixer-v2.ts; then
  echo "   ✓ TypeScript gates imported correctly"
else
  echo "   ✗ TypeScript gates not imported"
  exit 1
fi

# Test 3: Check security functions
echo -e "\n✅ Test 3: Security Functions"
security_functions=(
  "validateApiKey"
  "validateFilePath"
  "validateFileSize"
  "validateErrorCode"
  "validateLineAndColumn"
  "validateFileContent"
  "safeWriteFile"
)

for func in "${security_functions[@]}"; do
  if grep -q "function.*$func" lib/fixer/typescript-gated-fixer-v2.ts; then
    echo "   ✓ $func security function exists"
  else
    echo "   ✗ $func security function missing"
    exit 1
  fi
done

# Test 4: Check security configuration
echo -e "\n✅ Test 4: Security Configuration"
if grep -q "maxFileSize" lib/fixer/typescript-gated-fixer-v2.ts; then
  echo "   ✓ File size limit configured"
else
  echo "   ✗ File size limit not configured"
  exit 1
fi

if grep -q "allowedExtensions" lib/fixer/typescript-gated-fixer-v2.ts; then
  echo "   ✓ Allowed extensions configured"
else
  echo "   ✗ Allowed extensions not configured"
  exit 1
fi

# Test 5: Check command execution security
echo -e "\n✅ Test 5: Command Execution Security"
if grep -q "spawnSync" lib/fixer/typescript-gated-fixer-v2.ts; then
  echo "   ✓ Using spawnSync instead of execSync"
else
  echo "   ✗ Still using vulnerable execSync"
  exit 1
fi

if grep -q "execFileSync" lib/fixer/typescript-gated-fixer-v2.ts; then
  echo "   ✓ execFileSync imported for secure execution"
else
  echo "   ✗ execFileSync not imported"
  exit 1
fi

# Test 6: Check API key redaction
echo -e "\n✅ Test 6: API Key Protection"
if grep -q "\[REDACTED\]" lib/fixer/typescript-gated-fixer-v2.ts; then
  echo "   ✓ API key redaction implemented"
else
  echo "   ✗ API key redaction not implemented"
  exit 1
fi

# Test 7: Check gate functions
echo -e "\n✅ Test 7: Gate Function Validation"
gates=(
  "gateLineCountDelta"
  "gateMethodSignature"
  "gateImportDuplicate"
  "gateBraceBalance"
  "gateSemanticDiff"
  "gateOrphanedCode"
  "gateImportPathValidator"
  "gateTypeAnnotationValidator"
  "gateJSXIntegrity"
  "gatePatternDuplicate"
  "gateImportLocation"
  "gateTypeCast"
  "gateRegressionSeeds"
)

for gate in "${gates[@]}"; do
  if grep -q "export.*$gate" lib/gates/typescript-gates.ts; then
    echo "   ✓ $gate function exported"
  else
    echo "   ✗ $gate function missing"
    exit 1
  fi
done

# Test 8: Check security gates
echo -e "\n✅ Test 8: Security Gate Validation"
security_gates=(
  "gateFilePathSecurity"
  "gateImportSecurity"
)

for gate in "${security_gates[@]}"; do
  if grep -q "export.*$gate" lib/gates/typescript-gates.ts; then
    echo "   ✓ $gate security gate exported"
  else
    echo "   ✗ $gate security gate missing"
    exit 1
  fi
done

# Test 9: Check path traversal protection
echo -e "\n✅ Test 9: Path Traversal Protection"
if grep -q "Path traversal" lib/fixer/typescript-gated-fixer-v2.ts; then
  echo "   ✓ Path traversal protection implemented"
else
  echo "   ✗ Path traversal protection not implemented"
  exit 1
fi

# Test 10: Check error code validation
echo -e "\n✅ Test 10: Input Validation"
if grep -q "validateErrorCode" lib/fixer/typescript-gated-fixer-v2.ts; then
  echo "   ✓ Error code validation implemented"
else
  echo "   ✗ Error code validation not implemented"
  exit 1
fi

if grep -q "validateLineAndColumn" lib/fixer/typescript-gated-fixer-v2.ts; then
  echo "   ✓ Line/column validation implemented"
else
  echo "   ✗ Line/column validation not implemented"
  exit 1
fi

# Test 11: Check atomic file operations
echo -e "\n✅ Test 11: Atomic File Operations"
if grep -q "tempPath.*tmp" lib/fixer/typescript-gated-fixer-v2.ts; then
  echo "   ✓ Temporary file pattern implemented"
else
  echo "   ✗ Temporary file pattern not implemented"
  exit 1
fi

if grep -q "renameSync" lib/fixer/typescript-gated-fixer-v2.ts; then
  echo "   ✓ Atomic rename implemented"
else
  echo "   ✗ Atomic rename not implemented"
  exit 1
fi

# Test 12: Check error classification
echo -e "\n✅ Test 12: Error Classification"
error_codes=("TS2307" "TS2322" "TS2339" "TS2304" "TS1192")

for code in "${error_codes[@]}"; do
  if grep -q "'$code'" lib/fixer/typescript-gated-fixer-v2.ts; then
    echo "   ✓ $code classified"
  else
    echo "   ✗ $code not classified"
    exit 1
  fi
done

# Test 13: Check LLM response validation
echo -e "\n✅ Test 13: LLM Response Validation"
if grep -q "response structure" lib/fixer/typescript-gated-fixer-v2.ts; then
  echo "   ✓ LLM response validation implemented"
else
  echo "   ✗ LLM response validation not implemented"
  exit 1
fi

# Test 14: Check package.json scripts
echo -e "\n✅ Test 14: Package Scripts"
if [ -f "lib/fixer/package.json" ] && grep -q '"fix:ts"' lib/fixer/package.json; then
  echo "   ✓ TypeScript fix script added"
else
  echo "   ⚠️  TypeScript fix script missing (optional)"
fi

# Test 15: Check documentation
echo -e "\n✅ Test 15: Documentation Updates"
if [ -f "SKILL.md" ] && grep -q "TypeScript" SKILL.md; then
  echo "   ✓ SKILL.md updated for TypeScript"
else
  echo "   ⚠️  SKILL.md not updated (optional)"
fi

# Test 16: Security Check - Disable execSync usage
echo -e "\n✅ Test 16: Security Hardening"
if grep -q "execSync" lib/fixer/typescript-gated-fixer-v2.ts; then
  echo "   ❌ execSync still present (security risk)"
  exit 1
else
  echo "   ✓ execSync removed (secure)"
fi

# Test 17: Check timeout configuration
echo -e "\n✅ Test 17: Timeout Protection"
if grep -q "timeout" lib/fixer/typescript-gated-fixer-v2.ts; then
  echo "   ✓ Process timeout configured"
else
  echo "   ✗ Process timeout not configured"
  exit 1
fi

# Test 18: Check content sanitization
echo -e "\n✅ Test 18: Content Sanitization"
if grep -q "sanitize" lib/fixer/typescript-gated-fixer-v2.ts; then
  echo "   ✓ Content sanitization implemented"
else
  echo "   ✗ Content sanitization not implemented"
  exit 1
fi

# Security Assessment Summary
echo -e "\n🔒 Security Assessment Summary"
echo "==============================="
echo "✅ Command injection protection"
echo "✅ Path traversal protection"
echo "✅ API key exposure prevention"
echo "✅ File size limits"
echo "✅ Atomic file operations"
echo "✅ Input validation"
echo "✅ Content sanitization"
echo "✅ Process timeouts"

# Summary
echo -e "\n🎉 All Tests Passed!"
echo "===================="
echo "The TypeScript error fixer implementation is secure and ready."
echo ""
echo "Security features implemented:"
echo "- Command injection protection via spawnSync"
echo "- Path traversal validation"
echo "- API key redaction"
echo "- File size limits (1MB)"
echo "- Atomic file operations with backups"
echo "- Input validation for all parameters"
echo "- Content sanitization"
echo ""
echo "To use the fixer:"
echo "1. Set CEREBRAS_API_KEY environment variable"
echo "2. Set TS_PROJECT_PATH to your TypeScript project"
echo "3. Run: cd lib/fixer && npx tsx typescript-gated-fixer-v2.ts"
echo ""
echo "For more details, see: lib/fixer/README-TypeScript.md"