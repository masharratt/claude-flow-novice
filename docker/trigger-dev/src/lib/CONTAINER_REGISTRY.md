# Container Registry Module

**Location:** `docker/trigger-dev/src/lib/container-registry.ts`

Type-safe Docker image selection and registry management for CFN agent containers.

## Overview

The container registry module provides:

- **Agent type to image mapping** - Maps CFN agent specializations to Docker images
- **Registry URL resolution** - Reads from environment variables with sensible defaults
- **Image availability checking** - Queries registry API without pulling entire images
- **Image pulling** - Pre-pull images for performance optimization
- **Image validation** - Ensures image paths are properly formatted
- **Full logging** - All operations logged with `[container-registry]` prefix

## Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `CFN_REGISTRY_HOST` | `localhost:5000` | Registry hostname/address |
| `CFN_AGENT_IMAGE_PREFIX` | `cfn-agent` | Image name prefix |
| `CFN_REGISTRY_PROTOCOL` | `http` | Protocol (`http` or `https`) |
| `CFN_REGISTRY_INSECURE` | `true` | Skip TLS verification (for `https`) |

### Example Configuration

```bash
# Local development (default)
export CFN_REGISTRY_HOST=localhost:5000
export CFN_AGENT_IMAGE_PREFIX=cfn-agent
export CFN_REGISTRY_PROTOCOL=http

# Production (secure registry)
export CFN_REGISTRY_HOST=registry.example.com
export CFN_AGENT_IMAGE_PREFIX=myorg/cfn-agent
export CFN_REGISTRY_PROTOCOL=https
export CFN_REGISTRY_INSECURE=false
```

## Supported Agent Types

The module recognizes these agent types out of the box:

| Agent Type | Image Tag | Purpose |
|------------|-----------|---------|
| `typescript-specialist` | `typescript` | TypeScript/type system expert |
| `python-developer` | `python` | Python development specialist |
| `rust-developer` | `rust` | Rust systems programming specialist |
| `go-developer` | `go` | Go backend development specialist |
| `java-developer` | `java` | Java development specialist |
| `react-frontend-engineer` | `frontend` | Frontend/React specialist |
| `backend-developer` | `backend` | Backend development specialist |
| `docker-specialist` | `docker` | Docker/infrastructure specialist |
| `default` (unknown type) | `latest` | Fallback for unknown types |

## API Reference

### Image Selection

#### `getImageForAgentType(agentType: string): string`

Resolves an agent type to a full image path.

```typescript
import { getImageForAgentType } from './container-registry';

const image = getImageForAgentType('typescript-specialist');
// Returns: "localhost:5000/cfn-agent:typescript"
```

**Behavior:**
- If `agentType` exists in `AGENT_IMAGE_MAP`, uses mapped image tag
- If `agentType` not found, falls back to `cfn-agent:latest`
- Returns full path including registry host

#### `getImagesForAgentTypes(agentTypes: string[]): string[]`

Get all unique images for multiple agent types (deduplicates).

```typescript
const agents = ['typescript-specialist', 'backend-developer', 'typescript-specialist'];
const images = getImagesForAgentTypes(agents);
// Returns: ["localhost:5000/cfn-agent:typescript", "localhost:5000/cfn-agent:backend"]
```

### Registry Management

#### `getRegistryUrl(): string`

Get the full registry URL from configuration.

```typescript
const url = getRegistryUrl();
// Returns: "http://localhost:5000"
```

#### `getRegistrySummary(): string`

Get human-readable registry configuration summary for debugging.

```typescript
const summary = getRegistrySummary();
console.log(summary);
// Outputs configuration including host, protocol, prefix, supported agent types
```

### Image Availability

#### `isImageAvailable(image: string): Promise<ImageCheckResult>`

Check if an image exists in the registry without pulling.

```typescript
const result = await isImageAvailable('localhost:5000/cfn-agent:typescript');

if (result.available) {
  console.log(`Image is ready: ${result.image}`);
} else {
  console.log(`Image not found: ${result.error}`);
}
```

**Returns:**
```typescript
interface ImageCheckResult {
  image: string;              // Full image path checked
  available: boolean;         // Whether image exists
  registryHost: string;       // Registry that was checked
  error?: string;            // Error message if check failed
  statusCode?: number;       // HTTP status from registry
  checkedAt: Date;           // Timestamp of check
}
```

**Implementation:**
- Uses Docker Registry API v2 (HEAD request on manifest)
- Much faster than pulling entire image
- Handles network errors gracefully

#### `checkImagesAvailable(images: string[]): Promise<ImageCheckResult[]>`

Check multiple images in parallel.

```typescript
const images = [
  'localhost:5000/cfn-agent:typescript',
  'localhost:5000/cfn-agent:backend',
  'localhost:5000/cfn-agent:frontend'
];

const results = await checkImagesAvailable(images);
const allAvailable = results.every(r => r.available);
```

### Image Pulling

#### `pullImage(image: string, options?: PullOptions): Promise<ImagePullResult>`

Pull an image from the registry (or verify it exists locally).

```typescript
const result = await pullImage('localhost:5000/cfn-agent:typescript');

if (result.success) {
  console.log(`Pulled ${result.image} (${result.method})`);
  console.log(`Duration: ${result.duration}s`);
}
```

**Options:**
```typescript
interface PullOptions {
  force?: boolean;        // Force repull even if cached (default: false)
  timeout?: number;       // Pull timeout in milliseconds (default: 5 minutes)
}
```

**Returns:**
```typescript
interface ImagePullResult {
  image: string;          // Full image path
  success: boolean;       // Whether pull succeeded
  error?: string;        // Error message if failed
  duration?: number;     // Time taken (in seconds)
  method: 'local' | 'pull';  // 'local' = already cached, 'pull' = downloaded
  completedAt: Date;     // Completion timestamp
}
```

**Behavior:**
- Checks if image is locally available first (unless `force: true`)
- Returns `method: 'local'` if already cached
- Returns `method: 'pull'` if newly downloaded
- Useful for pre-warming caches before spawning agents

#### `pullImages(images: string[], options?: PullOptions): Promise<ImagePullResult[]>`

Pull multiple images in parallel.

```typescript
const images = getImagesForAgentTypes(['typescript-specialist', 'backend-developer']);
const results = await pullImages(images);
const allSuccess = results.every(r => r.success);
```

### Image Validation

#### `validateImagePath(image: string): { valid: boolean; errors: string[] }`

Validate image path format synchronously.

```typescript
const result = validateImagePath('localhost:5000/cfn-agent:typescript');

if (!result.valid) {
  console.error('Invalid image path:', result.errors);
}
```

**Checks:**
- Path is not empty
- Path includes a tag (`:` separator)
- Path contains only valid characters (alphanumeric, dots, colons, hyphens, slashes)

### Registry Validation

#### `validateRegistry(): Promise<{ valid: boolean; errors: string[] }>`

Verify registry configuration and connectivity at startup.

```typescript
// Usually called during application initialization
const validation = await validateRegistry();

if (!validation.valid) {
  console.error('Registry validation failed:', validation.errors);
  process.exit(1);
}
```

**Checks:**
- Registry is reachable
- Default image is available
- All agent type images are accessible

## Type Definitions

### RegistryConfig

Configuration for registry operations.

```typescript
interface RegistryConfig {
  host: string;              // "localhost:5000" or "docker.io"
  defaultImage: string;      // "cfn-agent:latest"
  imagePrefix?: string;      // "cfn-agent"
  protocol?: 'http' | 'https';
  insecure?: boolean;        // Skip TLS verification
}
```

### ImageCheckResult

Result of image availability check.

```typescript
interface ImageCheckResult {
  image: string;
  available: boolean;
  registryHost: string;
  error?: string;
  statusCode?: number;
  checkedAt: Date;
}
```

### ImagePullResult

Result of image pull operation.

```typescript
interface ImagePullResult {
  image: string;
  success: boolean;
  error?: string;
  duration?: number;
  method: 'local' | 'pull';
  completedAt: Date;
}
```

## Logging

All operations are logged with `[container-registry]` prefix:

```
[container-registry] Resolving image for agent type 'typescript-specialist': cfn-agent:typescript
[container-registry] Image already available locally: localhost:5000/cfn-agent:typescript
[container-registry] Checking availability of image: localhost:5000/cfn-agent:backend
[container-registry] ERROR: Image availability check failed for invalid:image: Failed to connect to registry
```

## Usage Examples

### Initialize Application

```typescript
import { validateRegistry, getRegistrySummary } from './container-registry';

async function startup() {
  // Show configuration
  console.log(getRegistrySummary());

  // Validate registry
  const validation = await validateRegistry();
  if (!validation.valid) {
    console.error('Registry misconfigured:', validation.errors);
    process.exit(1);
  }

  console.log('Registry ready');
}

startup().catch(console.error);
```

### Resolve Agent Images

```typescript
import { getImageForAgentType } from './container-registry';

function scheduleAgent(agentType: string) {
  const image = getImageForAgentType(agentType);
  console.log(`Spawning ${agentType} with image: ${image}`);
  // Pass to Docker API or container runner
}
```

### Pre-warm Image Cache

```typescript
import { getImagesForAgentTypes, pullImages } from './container-registry';

async function prepareAgents(agentTypes: string[]) {
  const images = getImagesForAgentTypes(agentTypes);

  console.log(`Pre-pulling ${images.length} images...`);
  const results = await pullImages(images);

  const successes = results.filter(r => r.success).length;
  console.log(`Ready: ${successes}/${results.length} images`);
}
```

### Check Image Availability Before Spawning

```typescript
import { getImageForAgentType, isImageAvailable } from './container-registry';

async function spawnAgentIfReady(agentType: string) {
  const image = getImageForAgentType(agentType);
  const check = await isImageAvailable(image);

  if (!check.available) {
    console.error(`Image not available: ${image}`);
    return false;
  }

  // Safe to spawn
  console.log(`Spawning ${agentType}...`);
  return true;
}
```

### Handle Multiple Agent Types with Fallback

```typescript
import { getImageForAgentType, validateImagePath } from './container-registry';

function resolveImage(agentType: string, fallbackImage?: string): string | null {
  const image = getImageForAgentType(agentType);
  const validation = validateImagePath(image);

  if (!validation.valid) {
    console.warn(`Invalid image for ${agentType}: ${validation.errors[0]}`);

    if (fallbackImage) {
      const fallbackValidation = validateImagePath(fallbackImage);
      if (fallbackValidation.valid) {
        console.log(`Using fallback: ${fallbackImage}`);
        return fallbackImage;
      }
    }

    return null;
  }

  return image;
}
```

## Performance Considerations

### Image Availability Checking

- **Registry API v2 manifest check** - ~100-200ms over network
- **Parallel checks** - Use `checkImagesAvailable()` for multiple images
- **No image download** - Only metadata check, not full image pull

### Image Pulling

- **Local cache check** - ~10-50ms for already cached images
- **Registry pull** - 1-5 seconds for typical agent images (100MB-500MB)
- **Parallel pulls** - Use `pullImages()` to parallelize

### Recommendation

Pre-pull images during container startup for predictable latency:

```typescript
async function startup() {
  const requiredAgents = ['typescript-specialist', 'backend-developer', 'react-frontend-engineer'];
  const images = getImagesForAgentTypes(requiredAgents);

  // Pre-warm cache (in parallel)
  await pullImages(images, { force: false });
}
```

## Integration with CFN Loop

### Container Spawning

Pass resolved image to container creation:

```typescript
import { getImageForAgentType } from './container-registry';
import Docker from 'dockerode';

async function spawnAgent(agentType: string, taskId: string) {
  const docker = new Docker();
  const image = getImageForAgentType(agentType);

  const container = await docker.createContainer({
    Image: image,
    name: `agent-${taskId}`,
    HostConfig: {
      Memory: 512 * 1024 * 1024,  // 512MB
      NetworkMode: 'cfn-network'
    }
  });

  await container.start();
}
```

### Coordinator Initialization

```typescript
import { validateRegistry, getImagesForAgentTypes, pullImages } from './container-registry';

async function initializeCoordinator(agentTypes: string[]) {
  // 1. Validate registry configuration
  const validation = await validateRegistry();
  if (!validation.valid) {
    throw new Error(`Registry invalid: ${validation.errors.join(', ')}`);
  }

  // 2. Pre-pull all required images
  const images = getImagesForAgentTypes(agentTypes);
  const results = await pullImages(images);

  const failed = results.filter(r => !r.success);
  if (failed.length > 0) {
    throw new Error(`Failed to pull ${failed.length} images`);
  }

  console.log(`✓ Registry ready with ${agentTypes.length} agent types`);
}
```

## Troubleshooting

### Image not found in registry

**Error:** `Image not found in registry: localhost:5000/cfn-agent:typescript`

**Possible causes:**
- Image not built yet
- Wrong registry host configured
- Wrong agent type name

**Solution:**
```bash
# Check registry contents
docker exec registry registry ls

# Build missing image
docker build -f Dockerfile.agent -t localhost:5000/cfn-agent:typescript .

# Push to registry
docker push localhost:5000/cfn-agent:typescript

# Verify
curl http://localhost:5000/v2/cfn-agent/manifests/typescript -I
```

### Registry connection failed

**Error:** `Failed to connect to registry: getaddrinfo ENOTFOUND localhost`

**Possible causes:**
- Registry container not running
- Wrong host in `CFN_REGISTRY_HOST`
- Network connectivity issue

**Solution:**
```bash
# Check registry is running
docker ps | grep registry

# Check registry port
docker port registry 5000

# Check network
docker network ls | grep cfn-network

# Test connectivity
curl http://localhost:5000/v2/
```

### Image validation failed

**Error:** `Image path validation failed for cfn-agent: Image path must include a tag`

**Solution:**
- Always include tag in image path: `cfn-agent:latest` not `cfn-agent`
- Use proper image reference: `host:port/image:tag`

## Thread Safety

The module is thread-safe for read operations (`getImageForAgentType`, `validateImagePath`).

Async operations (`isImageAvailable`, `pullImage`) are concurrent-safe and can be called in parallel.

## Testing

The module includes comprehensive validation:

```bash
# Check module exports
node -e "const m = require('./src/lib/container-registry.ts'); console.log(Object.keys(m))"

# Run basic tests
npm test -- src/lib/container-registry.ts
```

## See Also

- `docker/CLAUDE.md` - Docker infrastructure guide
- `docs/CFN_LOOP_ARCHITECTURE.md` - CFN Loop patterns
- Docker Registry API v2: https://docs.docker.com/registry/spec/api/
