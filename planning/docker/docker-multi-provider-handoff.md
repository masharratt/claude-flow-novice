# Automatic Project Detection for Docker Agent Images

## Executive Summary

This document defines an automatic project detection system that analyzes project files to select the optimal Docker image for CFN Loop agents. The system eliminates manual image selection while ensuring agents have the correct tooling for validation and fixes.

**Goal**: Automatically detect project type (Frontend/TypeScript, Backend/Rust, Backend/Python, etc.) and spawn agents with appropriate Docker images.

**Key Benefits**:
- ✅ Zero manual configuration (detects from project files)
- ✅ Multi-project support (monorepos, polyglot stacks)
- ✅ Validation-ready environments (tools pre-installed)
- ✅ Consistent image selection across workflows

---

## Detection Strategy

### 1. File-Based Detection (Primary)

**Priority Order** (first match wins):

```bash
# Detection algorithm (pseudo-code)
detect_project_type() {
    local WORKSPACE="$1"
    
    # 1. TypeScript/Frontend
    if [ -f "$WORKSPACE/tsconfig.json" ] || [ -f "$WORKSPACE/package.json" ]; then
        if grep -q "react\|vue\|angular" "$WORKSPACE/package.json" 2>/dev/null; then
            echo "frontend"  # TypeScript + React/Vue/Angular
            return
        fi
        if grep -q "next\|nuxt" "$WORKSPACE/package.json" 2>/dev/null; then
            echo "fullstack"  # Next.js/Nuxt (SSR frameworks)
            return
        fi
        echo "frontend"  # Default for TypeScript projects
        return
    fi
    
    # 2. Rust Backend
    if [ -f "$WORKSPACE/Cargo.toml" ]; then
        echo "backend-rust"
        return
    fi
    
    # 3. Python Backend
    if [ -f "$WORKSPACE/pyproject.toml" ] || [ -f "$WORKSPACE/setup.py" ] || [ -f "$WORKSPACE/requirements.txt" ]; then
        echo "backend-python"
        return
    fi
    
    # 4. Go Backend
    if [ -f "$WORKSPACE/go.mod" ]; then
        echo "backend-go"
        return
    fi
    
    # 5. Mobile (React Native)
    if [ -f "$WORKSPACE/app.json" ] && grep -q "expo\|react-native" "$WORKSPACE/package.json" 2>/dev/null; then
        echo "mobile"
        return
    fi
    
    # 6. Database (schema files)
    if ls "$WORKSPACE"/*.sql >/dev/null 2>&1 || [ -d "$WORKSPACE/migrations" ]; then
        echo "database"
        return
    fi
    
    # 7. DevOps (infrastructure)
    if [ -f "$WORKSPACE/Dockerfile" ] || [ -f "$WORKSPACE/docker-compose.yml" ] || [ -f "$WORKSPACE/terraform.tf" ]; then
        echo "devops"
        return
    fi
    
    # 8. Default fallback
    echo "base"
}
```

### 2. Monorepo Detection (Secondary)

For monorepos with multiple project types:

```bash
detect_monorepo() {
    local WORKSPACE="$1"
    
    # Check for monorepo markers
    if [ -f "$WORKSPACE/pnpm-workspace.yaml" ] || [ -f "$WORKSPACE/lerna.json" ] || [ -f "$WORKSPACE/nx.json" ]; then
        # Analyze each package
        for pkg in $(find "$WORKSPACE" -name "package.json" -not -path "*/node_modules/*"); do
            local PKG_TYPE=$(detect_project_type "$(dirname "$pkg")")
            echo "$PKG_TYPE:$(dirname "$pkg")"
        done
    else
        # Single project
        detect_project_type "$WORKSPACE"
    fi
}
```

### 3. Agent-Override Detection (Tertiary)

Agent frontmatter can override auto-detection:

```yaml
# .claude/agents/typescript-specialist.md
---
docker_image: frontend
override_detection: true  # Force frontend image even if project is polyglot
---
```

---

## Detection Logic Flow

```
User Request → Agent Spawn
    ↓
Check Agent Frontmatter
    ├─ docker_image specified? → Use specified image
    └─ No → Auto-detect from workspace
                ↓
        Analyze Project Files
            ├─ tsconfig.json → frontend
            ├─ Cargo.toml → backend-rust
            ├─ pyproject.toml → backend-python
            ├─ go.mod → backend-go
            ├─ app.json + react-native → mobile
            ├─ Dockerfile/terraform → devops
            └─ None match → base
                    ↓
            Spawn Container with Selected Image
                    ↓
            Validate Tools Available
                ├─ tsc --version (frontend)
                ├─ cargo --version (backend-rust)
                ├─ python --version (backend-python)
                └─ etc.
                    ↓
            Execute Agent Task
```

---

## Implementation

### Phase 1: Detection Script

**File**: `scripts/docker/detect-project-type.sh`

```bash
#!/bin/bash
# Automatic project type detection for Docker image selection

set -euo pipefail

WORKSPACE="${1:-.}"

# Validation
if [ ! -d "$WORKSPACE" ]; then
    echo "ERROR: Workspace '$WORKSPACE' does not exist" >&2
    exit 1
fi

# Detection functions
detect_frontend() {
    [ -f "$WORKSPACE/tsconfig.json" ] || [ -f "$WORKSPACE/package.json" ] && {
        if [ -f "$WORKSPACE/package.json" ]; then
            if grep -qE '"(react|vue|angular|svelte)"' "$WORKSPACE/package.json" 2>/dev/null; then
                echo "frontend"
                return 0
            fi
            if grep -qE '"(next|nuxt)"' "$WORKSPACE/package.json" 2>/dev/null; then
                echo "fullstack"
                return 0
            fi
        fi
        echo "frontend"
        return 0
    }
    return 1
}

detect_backend_rust() {
    [ -f "$WORKSPACE/Cargo.toml" ] && {
        echo "backend-rust"
        return 0
    }
    return 1
}

detect_backend_python() {
    [ -f "$WORKSPACE/pyproject.toml" ] || [ -f "$WORKSPACE/setup.py" ] || [ -f "$WORKSPACE/requirements.txt" ] && {
        echo "backend-python"
        return 0
    }
    return 1
}

detect_backend_go() {
    [ -f "$WORKSPACE/go.mod" ] && {
        echo "backend-go"
        return 0
    }
    return 1
}

detect_mobile() {
    [ -f "$WORKSPACE/app.json" ] && {
        grep -qE '"(expo|react-native)"' "$WORKSPACE/package.json" 2>/dev/null && {
            echo "mobile"
            return 0
        }
    }
    return 1
}

detect_database() {
    { ls "$WORKSPACE"/*.sql >/dev/null 2>&1 || [ -d "$WORKSPACE/migrations" ]; } && {
        echo "database"
        return 0
    }
    return 1
}

detect_devops() {
    [ -f "$WORKSPACE/Dockerfile" ] || [ -f "$WORKSPACE/docker-compose.yml" ] || [ -f "$WORKSPACE/terraform.tf" ] && {
        echo "devops"
        return 0
    }
    return 1
}

# Run detection (priority order)
detect_frontend && exit 0
detect_backend_rust && exit 0
detect_backend_python && exit 0
detect_backend_go && exit 0
detect_mobile && exit 0
detect_database && exit 0
detect_devops && exit 0

# Default fallback
echo "base"
exit 0
```

### Phase 2: CLI Integration

**File**: `src/cli/docker-image-selector.ts`

```typescript
import { execSync } from 'child_process';
import * as path from 'path';

interface ImageSelectionOptions {
  workspace: string;
  agentType?: string;
  agentFrontmatter?: Record<string, any>;
  override?: string;
}

export class DockerImageSelector {
  private static readonly IMAGE_PREFIX = 'claude-flow-novice-agent';
  
  /**
   * Select Docker image based on project detection and agent configuration
   */
  static selectImage(options: ImageSelectionOptions): string {
    const {
      workspace,
      agentType,
      agentFrontmatter,
      override
    } = options;
    
    // 1. Explicit override (highest priority)
    if (override) {
      return `${this.IMAGE_PREFIX}:${override}`;
    }
    
    // 2. Agent frontmatter declaration
    if (agentFrontmatter?.docker_image) {
      return `${this.IMAGE_PREFIX}:${agentFrontmatter.docker_image}`;
    }
    
    // 3. Auto-detect from workspace
    const detectedType = this.detectProjectType(workspace);
    return `${this.IMAGE_PREFIX}:${detectedType}`;
  }
  
  /**
   * Detect project type from workspace files
   */
  private static detectProjectType(workspace: string): string {
    try {
      const scriptPath = path.join(__dirname, '../../scripts/docker/detect-project-type.sh');
      const result = execSync(`bash "${scriptPath}" "${workspace}"`, {
        encoding: 'utf-8',
        timeout: 5000
      });
      
      return result.trim() || 'base';
    } catch (error) {
      console.warn(`Project detection failed, using base image: ${error}`);
      return 'base';
    }
  }
  
  /**
   * Validate image exists locally
   */
  static imageExists(imageName: string): boolean {
    try {
      execSync(`docker images -q "${imageName}"`, {
        encoding: 'utf-8',
        stdio: 'pipe'
      });
      return true;
    } catch {
      return false;
    }
  }
  
  /**
   * Get image metadata
   */
  static getImageMetadata(imageName: string): Record<string, string> {
    try {
      const metadata = execSync(
        `docker inspect "${imageName}" --format='{{json .Config.Labels}}'`,
        { encoding: 'utf-8' }
      );
      
      return JSON.parse(metadata);
    } catch {
      return {};
    }
  }
}
```

### Phase 3: Agent Spawn Integration

**File**: `src/cli/agent-spawner.ts` (updated)

```typescript
import { DockerImageSelector } from './docker-image-selector';

async function spawnAgent(agentType: string, options: SpawnOptions) {
  // Read agent frontmatter
  const agentFile = path.join('.claude', 'agents', `${agentType}.md`);
  const frontmatter = parseAgentFrontmatter(agentFile);
  
  // Select Docker image
  const imageName = DockerImageSelector.selectImage({
    workspace: options.workspace,
    agentType,
    agentFrontmatter: frontmatter,
    override: options.dockerImage  // CLI --docker-image flag
  });
  
  // Validate image exists
  if (!DockerImageSelector.imageExists(imageName)) {
    throw new Error(
      `Docker image '${imageName}' not found. ` +
      `Run 'docker build -f Dockerfile.agent-${imageName.split(':')[1]} .' to build it.`
    );
  }
  
  // Get image metadata for logging
  const metadata = DockerImageSelector.getImageMetadata(imageName);
  console.log(`✅ Using Docker image: ${imageName}`);
  console.log(`   Agent type: ${metadata.agent_type || 'unknown'}`);
  console.log(`   Tools: ${metadata.description || 'N/A'}`);
  
  // Spawn container with selected image
  const containerId = await spawnDockerContainer({
    image: imageName,
    workspace: options.workspace,
    agentId: `${agentType}-${Date.now()}`,
    environment: options.env
  });
  
  return containerId;
}
```

---

## Detection Test Suite

**File**: `tests/docker/test-project-detection.sh`

```bash
#!/bin/bash
set -euo pipefail

echo "🧪 Testing automatic project detection..."

# Test 1: Frontend (TypeScript + React)
mkdir -p /tmp/test-frontend
cat > /tmp/test-frontend/package.json << 'EOF'
{"dependencies": {"react": "^18.0.0"}}
