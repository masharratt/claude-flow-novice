# CLI Mode Migration - ADJUSTED SCOPE

**Date:** November 22, 2025
**Status:** IMPLEMENTATION READY
**Scope:** Adjusted based on architecture requirements

---

## 🔄 **SCOPE ADJUSTMENTS COMPLETED**

### **✅ CHANGES MADE:**

#### **1. TypeScript Files - DO NOT TOUCH** ✅
- **Purpose:** TypeScript infrastructure is for Docker mode only
- **Files to preserve:** `src/orchestrator/orchestrate.ts`, `src/coordination/coordination-wrapper.ts`
- **CLI mode:** Uses CLI scripts and bash coordination instead

#### **2. Coordinator Agent Moved** ✅
- **From:** `.claude/agents/cfn-dev-team/coordinators/cfn-v3-coordinator.md`
- **To:** `.claude/cfn-extras/agents/cfn-v3-coordinator.md`
- **Reason:** Not needed for simplified CLI mode

#### **3. Instruction Injection Updated** ✅
- **File:** `src/cli/agent-prompt-builder.ts` (kept - used by CLI agent executor)
- **Updated:** CFN Loop protocol for CLI mode Main Chat coordination
- **New behavior:** CLI agents send Redis signals directly to Main Chat

#### **4. Custom Routing Investigation Complete** ✅
- **Finding:** `/switch-api` command handles Main Chat and Task() tool agent routing
- **CLI Agent Routing:** Similar behavior - CLI agents use provider/model flags or fallback
- **Fallback Behavior:** Default to Z.ai glm-4.6 if no provider/model specified by user
- **Integration:** Works with CLI agent spawning via environment variables

---

## 📋 **REVISED IMPLEMENTATION PLAN**

### **Phase 1: Core CLI Infrastructure Changes**

#### **1. CLI Command Simplification**
**File:** `.claude/commands/cfn-loop-cli.md`
- **Remove:** References to coordinator spawning
- **Add:** Direct agent spawning with provider flags
- **Add:** Main Chat BLPOP waiting instructions
- **Integrate:** With `/switch-api` for provider selection

#### **2. Agent Spawning Enhancement**
**Files:** CLI spawning scripts (existing)
- **Enhance:** Provider flag support (already working)
- **Add:** Environment variable injection for AI routing
- **Leverage:** `/switch-api` for provider configuration

#### **3. Main Chat Coordination Pattern**
**New Pattern:**
```bash
# Main Chat spawns CLI agents (with provider routing or fallback)
npx tsx src/cli/spawn-agent-cli.ts backend-dev --task-id TASK-123 --provider kimi
# OR (fallback to Z.ai glm-4.6 if no provider/model specified)
npx tsx src/cli/spawn-agent-cli.ts backend-dev --task-id TASK-123

# Main Chat waits for completion
timeout 120s redis-cli BLPOP "cfn:mainchat:signal:TASK-123" 130

# CLI agent sends completion signal (updated in prompt-builder.ts)
# Signal includes: agentId, taskId, status, provider, model, confidence
```

**Agent Routing Behavior:**
- **Main Chat + Task() tools:** Controlled by `/switch-api` command
- **CLI agents:** Similar routing via `--provider`/`--model` flags
- **Fallback:** Z.ai glm-4.6 if no provider/model specified
- **Environment:** PROVIDER and MODEL variables injected for agent use

### **Phase 2: Documentation & Testing**

#### **4. Update Documentation**
- **Remove:** References to TypeScript orchestration
- **Add:** CLI mode Main Chat coordination documentation
- **Update:** Architecture diagrams to reflect 2-layer pattern

#### **5. Update Tests**
- **File:** `tests/cli-mode/core/e2e/test-cfn-loop-cli-real-execution.sh`
- **Focus:** CLI agent spawning + Redis BLPOP coordination
- **Remove:** Complex coordination tests

---

## 🎯 **KEY ARCHITECTURE CHANGES**

### **FROM:** Complex 3-Layer (Removed)
```
Main Chat → CLI → cfn-v3-coordinator → Complex Orchestration → CLI Agents
                                   ↓
                           TypeScript coordination (Docker only)
```

### **TO:** Simplified 2-Layer (CLI Mode)
```
Main Chat → Direct CLI Agent Spawning + Redis BLPOP Waiting
         ↓
    CLI Agents send completion signals to Main Chat
```

### **Docker Mode:** Unchanged
```
Main Chat → CLI → cfn-v3-coordinator → TypeScript Orchestration → Docker Agents
```

---

## 🔧 **FILES TO CHANGE (REVISED LIST)**

### **Phase 1: Core Changes**
- ✅ `src/cli/agent-prompt-builder.ts` - CLI Redis completion protocol (DONE)
- ✅ `.claude/agents/cfn-dev-team/coordinators/cfn-v3-coordinator.md` - Moved to cfn-extras (DONE)
- 🔄 `.claude/commands/cfn-loop-cli.md` - Simplify to direct spawning

### **Phase 2: Provider Integration**
- 🔄 Leverage existing `/switch-api` command (INVESTIGATED - WORKS)
- 🔄 CLI spawning scripts - Already support provider flags (VALIDATED)

### **Phase 3: Testing & Documentation**
- 🔄 `tests/cli-mode/core/e2e/test-cfn-loop-cli-real-execution.sh` - Update for new pattern
- 🔄 Documentation files - Update architecture descriptions

### **Files NOT TO TOUCH:**
- ❌ `src/orchestrator/orchestrate.ts` - Docker mode only
- ❌ `src/coordination/coordination-wrapper.ts` - Docker mode only
- ❌ Any TypeScript orchestration files - Docker mode only

---

## 🚀 **IMPLEMENTATION PRIORITY**

### **Ready for Implementation:**
1. ✅ **Scope Adjusted** - TypeScript files preserved for Docker
2. ✅ **Coordinator Moved** - cfn-v3-coordinator moved to cfn-extras
3. ✅ **Instructions Updated** - CLI Redis protocol for Main Chat coordination
4. ✅ **Provider Routing** - `/switch-api` command investigated and working

### **Next Implementation Steps:**
1. **Update CLI command** - Remove coordinator references
2. **Update tests** - Focus on 2-layer coordination pattern
3. **Update documentation** - Reflect simplified architecture

---

## ✅ **READY FOR IMPLEMENTATION**

**Scope:** Adjusted and clarified ✅
**Files:** Moved and updated ✅
**Provider routing:** Integrated via existing `/switch-api` ✅
**Implementation plan:** Revised and ready ✅

**Awaiting further instructions to proceed with implementation.**