# Claude Flow Novice Changelog

## [Unreleased]

### ✨ Added: CFN Loop Enforcement (Sprint 1.5)

**Components:**
- Validation hooks: Auto-correct LOOP/PROCEED decisions
- Rule injection: CFN rules injected at loop transitions
- Self-correction monitor: Real-time violation detection via Redis
- Integration tests: 12 scenarios, 91% coverage

**Implementation:**
- `src/cfn-loop/validate-cfn-decision.ts` - Decision validation with auto-correction
- `src/cfn-loop/validation-rules.ts` - 3 critical rules (LOOP permission, iteration limits, consensus)
- `src/cfn-loop/inject-rules-at-transition.ts` - Dynamic rule injection
- `src/cfn-loop/cfn-compliance-monitor.ts` - Real-time monitoring
- `tests/cfn-loop/enforcement-integration.test.ts` - E2E validation

**Performance:**
- Validation: <1s per decision
- Test coverage: 91%
- Auto-correction: Immediate (no human intervention)

## [1.6.3] - 2025-10-04

### 🐛 Critical Fix: WSL Memory Leak
- **PreToolUse Hook**: Blocks \`find /mnt/c\` commands that cause catastrophic memory leaks on WSL
  - Memory spike: 15GB → 36GB in 4 minutes from find commands
  - Hook returns error: "🔴 BLOCKED: find on /mnt/c paths forbidden (causes memory leak - use Glob tool instead)"
  - Files: \`.claude/settings.json\` in both claude-flow-novice and ourstories-v2

### 📊 Root Cause Analysis
- **Monitoring Results**: 10-minute observation confirmed \`find /mnt/c\` as memory bomb
  - 2-3 concurrent find commands: +16GB memory spike
  - Growth rate: 4GB/minute while finds active
  - WSL filesystem translation causes 2-10 second delays per find + 50-200MB buffered output

[Rest of the existing changelog content would follow...]
