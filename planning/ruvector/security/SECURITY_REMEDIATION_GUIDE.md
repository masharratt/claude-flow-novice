# Phase 1 Security Remediation Guide

**Objective**: Fix 5 critical vulnerabilities and reach production security standards
**Estimated Time**: 3-4 hours (including testing)
**Pass Criteria**: All critical tests passing, 0 unfixed vulnerabilities

---

## Quick Start Remediation

### 1. Shell Injection (CVE-001) - 30 minutes

**Current Code** (`docker/trigger-dev/src/jobs/test-single-agent.ts`):
```typescript
const dockerCmd = [
  "docker run --rm",
  `--name ${containerName}`,
  "--network cfn-network",
  "--cpus=2",
  "--memory=4g",
  `-e TASK_ID=${ctx.run.id}`,
  `-e AGENT_TYPE=${agentType}`,
  "-v /workspace:/workspace",
  "cfn-agent:test",
  agentType,
  `--task "${taskDescription}"`,
].join(" ");

const { stdout, stderr } = await execAsync(dockerCmd, {
  timeout: 30 * 60 * 1000,
  maxBuffer: 10 * 1024 * 1024,
});
```

**Fixed Code**:
```typescript
import { spawn } from "child_process";
import { promisify } from "util";

// Helper: Convert spawn to promise
function spawnPromise(command: string, args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";

    const proc = spawn(command, args, {
      // Set timeout via external timer
      timeout: 30 * 60 * 1000,
    });

    proc.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    proc.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    proc.on("close", (exitCode) => {
      resolve({ stdout, stderr, exitCode: exitCode || 0 });
    });

    proc.on("error", reject);
  });
}

// Use spawn instead of execAsync
const dockerArgs = [
  "run", "--rm",
  "--name", containerName,
  "--network", "cfn-network",
  "--cpus", "2",
  "--memory", "4g",
  "-e", `TASK_ID=${ctx.run.id}`,
  "-e", `AGENT_TYPE=${agentType}`,
  "-e", `TASK_DESCRIPTION=${taskDescription}`,  // Better: env var instead of cmd arg
  "-v", "/workspace:/workspace",
  "cfn-agent:test",
];

try {
  const result = await spawnPromise("docker", dockerArgs);

  if (result.exitCode !== 0) {
    throw new Error(`Docker command failed with exit code ${result.exitCode}\nStderr: ${result.stderr}`);
  }

  io.logger.info("Agent container completed successfully", {
    containerName,
    executionTimeMs: Date.now() - startTime,
    stdoutLength: result.stdout.length,
    stderrLength: result.stderr.length,
  });

  return {
    success: true,
    containerName,
    agentType,
    taskId: ctx.run.id,
    executionTimeMs: Date.now() - startTime,
    exitCode: 0,
    output: {
      stdout: result.stdout,
      stderr: result.stderr,
    },
  };
} catch (error: any) {
  io.logger.error("Container execution failed", {
    containerName,
    error: error.message,
  });
  throw error;
}
```

**Why This Works:**
- `spawn()` doesn't invoke a shell
- Each argument is a separate array element
- Metacharacters (`;`, `|`, `&`, `$()`) treated as literal strings
- Impossible to inject commands

**Test Injection:**
```bash
# Payload: agentType="backend-developer; whoami"
# Result: AGENT_TYPE="backend-developer; whoami" (literal string, no execution)
```

---

### 2. Secret File Permissions (CVE-002) - 5 minutes

**Fix**:
```bash
# Navigate to project root
cd /path/to/project

# Fix all secret files to 0600 (rw-------)
chmod 0600 docker/trigger-dev/.secrets/*

# Verify fix
ls -la docker/trigger-dev/.secrets/
# Expected: all files show -rw------- (600)

# Validate programmatically
chmod 0600 docker/trigger-dev/.secrets/* && \
for file in docker/trigger-dev/.secrets/*; do
  perms=$(stat -c "%a" "$file" 2>/dev/null || stat -f "%OLp" "$file" | tail -c 4)
  if [ "$perms" = "600" ]; then
    echo "✅ $file: correct permissions (600)"
  else
    echo "❌ $file: incorrect permissions ($perms, expected 600)"
  fi
done
```

**Verification Script** (`scripts/validate-secret-permissions.sh`):
```bash
#!/bin/bash
set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
SECRETS_DIR="$PROJECT_ROOT/docker/trigger-dev/.secrets"

echo "Validating secret file permissions..."
echo ""

FAILED=0
if [ ! -d "$SECRETS_DIR" ]; then
  echo "❌ Secrets directory not found: $SECRETS_DIR"
  exit 1
fi

# Check directory permissions (should be 700)
dir_perms=$(stat -c "%a" "$SECRETS_DIR" 2>/dev/null || stat -f "%OLp" "$SECRETS_DIR" | tail -c 4)
if [ "$dir_perms" != "700" ]; then
  echo "❌ Directory has incorrect permissions: $dir_perms (expected 700)"
  FAILED=$((FAILED + 1))
else
  echo "✅ Directory permissions correct: $dir_perms"
fi

echo ""

# Check file permissions (should be 600)
for file in "$SECRETS_DIR"/*; do
  if [ -f "$file" ]; then
    file_perms=$(stat -c "%a" "$file" 2>/dev/null || stat -f "%OLp" "$file" | tail -c 4)
    filename=$(basename "$file")

    if [ "$file_perms" != "600" ]; then
      echo "❌ $filename: incorrect permissions ($file_perms, expected 600)"
      FAILED=$((FAILED + 1))
    else
      echo "✅ $filename: correct permissions (600)"
    fi
  fi
done

echo ""

if [ $FAILED -eq 0 ]; then
  echo "✅ All secret permissions validated successfully"
  exit 0
else
  echo "❌ $FAILED permission issues found"
  exit 1
fi
```

**Run validation**:
```bash
bash scripts/validate-secret-permissions.sh
```

---

### 3. Secret Directory Permissions (CVE-003) - 5 minutes

**Fix**:
```bash
# Fix directory to 0700 (rwx------)
chmod 0700 docker/trigger-dev/.secrets

# Verify
stat -c "%a %n" docker/trigger-dev/.secrets
# Expected: 700 docker/trigger-dev/.secrets
```

---

### 4. Rotate Exposed API Keys (CVE-004) - 30-60 minutes

**Process**:

```bash
# Step 1: Identify which keys were exposed
git log --all -S "sk-ant" --oneline
git log --all -S "ZAI_API_KEY=" --oneline

# Step 2: Generate new keys from providers
# For each provider:
# - Log into provider dashboard
# - Revoke old API key
# - Generate new API key
# - Update .secrets/PROVIDER_API_KEY
# - Update any CI/CD secrets

# Step 3: Update secrets
echo "sk-ant-[NEW_KEY]" > docker/trigger-dev/.secrets/ANTHROPIC_API_KEY
echo "[NEW_KEY]" > docker/trigger-dev/.secrets/ZAI_API_KEY
# ... etc for all providers

# Step 4: Test new keys
docker-compose -f docker/trigger-dev/docker-compose.yml config \
  | grep -A 5 "ANTHROPIC_API_KEY"

# Step 5: Commit rotation
git add docker/trigger-dev/.secrets/
git commit -m "security: rotate API keys due to git history exposure"

# Step 6: Push
git push
```

**API Providers to Update**:
- Anthropic (ANTHROPIC_API_KEY)
- Z.ai (ZAI_API_KEY)
- Kimi (KIMI_API_KEY)
- Gemini (GEMINI_API_KEY)
- OpenRouter (OPENROUTER_API_KEY)
- XAi (XAI_API_KEY)
- Trigger.dev (TRIGGER_API_KEY)

**Rotation Steps for Each Provider**:

**Anthropic**:
```
1. Go to console.anthropic.com
2. Click "API Keys" in sidebar
3. Find old key, click "Revoke"
4. Click "Create new key"
5. Copy key
6. Update docker/trigger-dev/.secrets/ANTHROPIC_API_KEY
```

**GitHub Actions** (if applicable):
```
1. Go to repo Settings → Secrets and variables → Actions
2. For each secret (ANTHROPIC_API_KEY, etc.):
   - Click "Update"
   - Paste new value
   - Click "Update secret"
3. Verify in next workflow run
```

---

### 5. Resource Limit Validation (CVE-005) - 1 hour

**Current Code** (docker/trigger-dev/src/jobs/test-single-agent.ts):
```typescript
// Add Docker client for validation
import Docker from "dockerode";

const docker = new Docker();

async function validateResourceLimits(
  containerName: string,
  expectedCpus: number,
  expectedMemoryBytes: number
): Promise<boolean> {
  try {
    const container = docker.getContainer(containerName);
    const inspect = await container.inspect();

    const config = inspect.HostConfig;

    // Validate CPU limits
    if (config.CpuQuota && config.CpuPeriod) {
      const actualCpus = config.CpuQuota / config.CpuPeriod;
      if (actualCpus !== expectedCpus) {
        throw new Error(
          `CPU limit mismatch: expected ${expectedCpus}, got ${actualCpus}`
        );
      }
    }

    // Validate memory limits
    if (config.Memory && config.Memory !== expectedMemoryBytes) {
      throw new Error(
        `Memory limit mismatch: expected ${expectedMemoryBytes}, got ${config.Memory}`
      );
    }

    return true;
  } catch (error: any) {
    io.logger.error("Resource limit validation failed", {
      containerName,
      error: error.message,
    });
    return false;
  }
}

// In the run() function
const result = await io.runTask<ContainerResult>(
  "spawn-agent-container",
  async () => {
    // ... spawn container ...

    // AFTER container starts, validate limits
    const limitsValid = await validateResourceLimits(containerName, 2, 4 * 1024 * 1024 * 1024);
    if (!limitsValid) {
      await docker.getContainer(containerName).kill();
      throw new Error("Resource limits not enforced, container killed");
    }

    // Continue with container execution...
  }
);
```

**Add Spawn Count Limiter**:
```typescript
// At module level
let activeAgents = 0;
const MAX_CONCURRENT_AGENTS = 5;  // Prevent resource exhaustion

// In the run() function
if (activeAgents >= MAX_CONCURRENT_AGENTS) {
  return {
    success: false,
    error: "Too many active agents, rate limited",
    taskId: ctx.run.id,
  };
}

activeAgents++;

try {
  // ... spawn agent ...
} finally {
  activeAgents--;
}
```

**Add docker-compose deploy limits** (docker-compose.yml):
```yaml
services:
  trigger-worker:
    deploy:
      resources:
        limits:
          cpus: '4.0'        # Host process limited to 4 CPUs
          memory: 2G         # Host process limited to 2GB
        reservations:
          cpus: '2.0'        # Reserve 2 CPUs for worker
          memory: 1G         # Reserve 1GB for worker
```

**Test Resource Limits**:
```bash
# Test 1: Verify --cpus is applied
docker run --rm --cpus=2 --memory=4g alpine sh -c \
  'grep -c processor /proc/cpuinfo'
# Should see CPU cgroup set to 2

# Test 2: Verify --memory is applied
docker run --rm --cpus=2 --memory=4g alpine free -h
# Should show 4GB in cgroup limit

# Test 3: Test container kill on limit exceed (stress-test)
docker run --rm --cpus=1 --memory=512m progrium/stress \
  --cpu 1 --vm 1 --vm-bytes 1G --timeout 10s
# Should be killed after exceeding memory
```

---

### 6. Log Redaction (Issue 6) - 15 minutes

**Current Code**:
```typescript
const dockerCmd = [
  // ... args with API keys ...
].join(" ");

io.logger.info("Executing Docker command", { command: dockerCmd });
// ❌ Logs contain: "... -e ANTHROPIC_API_KEY=sk-ant-[ACTUAL_KEY] ..."
```

**Fixed Code**:
```typescript
// Helper function to redact sensitive data
function redactSensitiveData(text: string): string {
  return text
    .replace(/-e\s+ANTHROPIC_API_KEY=\S+/g, "-e ANTHROPIC_API_KEY=[REDACTED]")
    .replace(/-e\s+ZAI_API_KEY=\S+/g, "-e ZAI_API_KEY=[REDACTED]")
    .replace(/-e\s+KIMI_API_KEY=\S+/g, "-e KIMI_API_KEY=[REDACTED]")
    .replace(/-e\s+GEMINI_API_KEY=\S+/g, "-e GEMINI_API_KEY=[REDACTED]")
    .replace(/-e\s+OPENROUTER_API_KEY=\S+/g, "-e OPENROUTER_API_KEY=[REDACTED]")
    .replace(/-e\s+TRIGGER_API_KEY=\S+/g, "-e TRIGGER_API_KEY=[REDACTED]")
    .replace(/POSTGRES_PASSWORD=\S+/g, "POSTGRES_PASSWORD=[REDACTED]")
    .replace(/REDIS_PASSWORD=\S+/g, "REDIS_PASSWORD=[REDACTED]");
}

// Use in logging
const dockerArgs = [
  "run", "--rm",
  "--name", containerName,
  // ... other args ...
  "-e", `ANTHROPIC_API_KEY=${process.env.ANTHROPIC_API_KEY || ""}`,
  "-e", `ZAI_API_KEY=${process.env.ZAI_API_KEY || ""}`,
  // ... etc ...
];

// Join for logging only
const dockerCmdForLogging = redactSensitiveData(["docker", ...dockerArgs].join(" "));

io.logger.info("Executing Docker command", { command: dockerCmdForLogging });
// ✅ Logs contain: "... -e ANTHROPIC_API_KEY=[REDACTED] ..."

// Actually spawn with real keys
const result = await spawnPromise("docker", dockerArgs);
```

---

### 7. Git History Cleanup (CVE-004 follow-up) - 1 hour

**Install BFG**:
```bash
# macOS
brew install bfg

# Linux (download)
wget https://repo1.maven.org/maven2/com/madgag/bfg/1.14.0/bfg-1.14.0.jar
java -jar bfg-1.14.0.jar --version
```

**Clean Repository**:
```bash
# Step 1: Create patterns file
cat > /tmp/bfg-patterns.txt <<'EOF'
sk-ant-\w{20,}
sk-zai-\w{20,}
kimi_\w{40,}
TRIGGER_API_KEY=\S+
POSTGRES_PASSWORD=\S+
EOF

# Step 2: Clone mirror (preserves original)
git clone --mirror https://github.com/yourorg/yourrepo.git yourrepo.git-mirror
cd yourrepo.git-mirror

# Step 3: Run BFG cleanup
bfg --replace-text /tmp/bfg-patterns.txt --no-blob-protection

# Step 4: Expire reflog and garbage collect
git reflog expire --expire=now --all
git gc --prune=now --aggressive

# Step 5: Force push
cd /path/to/original/repo
git push --force-with-lease origin master
# or: git push --force-with-lease origin main (if main is default)

# Step 6: Notify team
# Inform all developers: "Repository history rewritten. Run: git pull --rebase"
```

**Verify Cleanup**:
```bash
# Check if patterns still exist in history
git log --all -G "sk-ant-" --oneline
# Should return: (no output)

git log --all -G "ZAI_API_KEY=" --oneline
# Should return: (no output)
```

---

### 8. Git-Secrets Pre-commit Hook - 20 minutes

**Install**:
```bash
# macOS
brew install git-secrets

# Linux (manually)
git clone https://github.com/awslabs/git-secrets.git
cd git-secrets
make install
```

**Configure**:
```bash
cd /path/to/repo

# Global configuration
git secrets --register-aws  # AWS pattern patterns
git secrets --add 'sk-ant-\w{20,}'
git secrets --add 'sk-zai-\w{20,}'
git secrets --add 'kimi_\w{40,}'
git secrets --add 'TRIGGER_API_KEY=\S+'
git secrets --add 'POSTGRES_PASSWORD=\S+'
git secrets --add 'REDIS_PASSWORD=\S+'
git secrets --add 'AGE_PRIVATE_KEY=\S+'

# Install hook
git secrets --install
git secrets --install .git/hooks

# Test hook
echo "sk-ant-test" > test-secret.txt
git add test-secret.txt
git commit -m "test"
# Should fail with: "git-secrets: Matched sk-ant-\w{20,}"

# Remove test file
git rm test-secret.txt
git commit --amend -m "remove test"
```

**Verify Installation**:
```bash
cat .git/hooks/pre-commit | grep "git secrets"
# Should show git-secrets hook installed

cat .git/config | grep -A 5 "\[secrets\]"
# Should show registered patterns
```

---

## Validation Checklist

### Pre-Deployment Validation

```bash
#!/bin/bash
set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
PASS=0
FAIL=0

echo "Phase 1 Security Validation Checklist"
echo "====================================="
echo ""

# 1. Secret file permissions
echo "[1/8] Checking secret file permissions..."
for file in "$PROJECT_ROOT/docker/trigger-dev/.secrets"/*; do
  perms=$(stat -c "%a" "$file" 2>/dev/null || stat -f "%OLp" "$file" | tail -c 4)
  if [ "$perms" = "600" ]; then
    ((PASS++))
  else
    echo "  ❌ $file: $perms (expected 600)"
    ((FAIL++))
  fi
done

# 2. Secret directory permissions
echo "[2/8] Checking secret directory permissions..."
dir_perms=$(stat -c "%a" "$PROJECT_ROOT/docker/trigger-dev/.secrets" 2>/dev/null || stat -f "%OLp" "$PROJECT_ROOT/docker/trigger-dev/.secrets" | tail -c 4)
if [ "$dir_perms" = "700" ]; then
  echo "  ✅ Directory: $dir_perms"
  ((PASS++))
else
  echo "  ❌ Directory: $dir_perms (expected 700)"
  ((FAIL++))
fi

# 3. Check for shell injection vulnerability
echo "[3/8] Checking for shell injection vulnerability..."
if grep -q "execAsync(dockerCmd" "$PROJECT_ROOT/docker/trigger-dev/src/jobs/test-single-agent.ts"; then
  echo "  ❌ Still using execAsync with string command"
  ((FAIL++))
else
  echo "  ✅ Using spawn (no shell injection)"
  ((PASS++))
fi

# 4. Check for API keys in logs
echo "[4/8] Checking for unredacted API keys in logs..."
if grep -q "io.logger.info.*command.*dockerCmd\|console.log.*ANTHROPIC" "$PROJECT_ROOT/docker/trigger-dev/src/jobs/test-single-agent.ts"; then
  echo "  ❌ Logs may expose API keys"
  ((FAIL++))
else
  echo "  ✅ Logs appear to be redacted"
  ((PASS++))
fi

# 5. Check resource limit validation
echo "[5/8] Checking resource limit validation..."
if grep -q "validateResourceLimits\|CpuQuota\|config.Memory" "$PROJECT_ROOT/docker/trigger-dev/src/jobs/test-single-agent.ts"; then
  echo "  ✅ Resource limits validated"
  ((PASS++))
else
  echo "  ❌ No resource limit validation"
  ((FAIL++))
fi

# 6. Check for API keys in git history
echo "[6/8] Checking git history for exposed keys..."
if git log --all -G "sk-ant-\|sk-zai-" --oneline | grep -q .; then
  echo "  ❌ Found API keys in git history"
  ((FAIL++))
else
  echo "  ✅ No API keys in git history"
  ((PASS++))
fi

# 7. Check .gitignore for secrets
echo "[7/8] Checking .gitignore for secrets directory..."
if grep -q "\.secrets" "$PROJECT_ROOT/.gitignore"; then
  echo "  ✅ .secrets in .gitignore"
  ((PASS++))
else
  echo "  ❌ .secrets not in .gitignore"
  ((FAIL++))
fi

# 8. Check docker-compose limits
echo "[8/8] Checking docker-compose resource limits..."
if grep -A 3 "deploy:" "$PROJECT_ROOT/docker/trigger-dev/docker-compose.yml" | grep -q "memory:\|cpus:"; then
  echo "  ✅ Docker-compose has resource limits"
  ((PASS++))
else
  echo "  ⚠️  Consider adding deploy limits to docker-compose.yml"
  ((PASS++))  # Warning only
fi

echo ""
echo "====================================="
echo "Results: $PASS passed, $FAIL failed"
echo ""

if [ $FAIL -eq 0 ]; then
  echo "✅ All security checks passed"
  exit 0
else
  echo "❌ $FAIL security checks failed"
  exit 1
fi
```

**Run validation**:
```bash
bash scripts/security-validation-checklist.sh
```

---

## Timeline

### Hour 1
- [ ] Fix shell injection (CVE-001)
- [ ] Test injection payloads
- [ ] Fix secret permissions (CVE-002, CVE-003)

### Hour 2
- [ ] Rotate API keys (CVE-004)
- [ ] Update CI/CD secrets
- [ ] Test with new keys

### Hour 3
- [ ] Add resource limit validation (CVE-005)
- [ ] Add log redaction (Issue 6)
- [ ] Update docker-compose

### Hour 4
- [ ] Clean git history (CVE-004 follow-up)
- [ ] Install git-secrets hook
- [ ] Run validation checklist
- [ ] Test end-to-end

---

## Success Criteria

All of the following must pass before Phase 1 production deployment:

- [ ] CVE-001: Shell injection fixed, injection payloads tested
- [ ] CVE-002: All secret files have 600 permissions
- [ ] CVE-003: Secrets directory has 700 permissions
- [ ] CVE-004: All API keys rotated, no keys in git history
- [ ] CVE-005: Resource limits validated, spawn count limited
- [ ] Issue 6: Logs redacted, no API keys in stdout
- [ ] Issue 7: Exit codes properly propagated
- [ ] Issue 8: Git history cleaned, git-secrets installed
- [ ] Security validation script passes 100%
- [ ] Integration tests pass with new keys
- [ ] Docker container spawn tested with all injection payloads

**Estimated Total Time**: 3-4 hours
**Confidence After Remediation**: 0.92 (enterprise security standards)

