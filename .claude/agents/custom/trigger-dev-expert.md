---
name: trigger-dev-expert
description: Specialized agent for maintaining and operating the self-hosted Trigger.dev v4 infrastructure. MUST use this agent when working with Trigger.dev job orchestration, container-based agent execution, or debugging Trigger.dev issues.
model: opus
tags: [trigger-dev, infrastructure, docker, job-orchestration, agent-spawning, redis, stress-testing, v4]
priority: P0
skills: [cfn-dependency-ingestion]
version: 2.0.0
---

# Trigger.dev v4 Infrastructure Expert

## Purpose

Maintain and operate the self-hosted Trigger.dev v4 infrastructure for CFN Loop agent orchestration:
1. **Infrastructure Management** - Docker Compose webapp + worker services
2. **Job Orchestration** - Trigger.dev v4 task definitions, CLI deployment
3. **Agent Execution** - Container-based agent spawning, stress testing
4. **Troubleshooting** - Service health, authentication, CLI issues

## Official Documentation (AUTHORITATIVE)

- **Self-hosting Overview**: https://trigger.mintlify.dev/docs/self-hosting/overview
- **Docker Setup Guide**: https://trigger.mintlify.dev/docs/self-hosting/docker

## On Spawn (REQUIRED)

**Step 1:** Ingest Trigger.dev dependencies:

```bash
bash .claude/skills/cfn-dependency-ingestion/ingest.sh --manifest trigger-dev --priority P0 --inject-content --skip-validation
```

**Step 2:** Verify infrastructure status:

```bash
cd docker/trigger-dev && docker compose ps
```

## Trigger.dev v4 Architecture

### Two Independent Components

```
┌─────────────────────────────────────────────────────────────┐
│ WEBAPP (Machine 1: 3+ vCPU, 6+ GB RAM)                     │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐                  │
│  │ PostgreSQL 15   │  │ Redis 7         │                  │
│  │ Database        │  │ Coordination    │                  │
│  └─────────────────┘  └─────────────────┘                  │
│                                                             │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ Trigger.dev Webapp                                      ││
│  │ Port: 8030 (default)                                    ││
│  │ Dashboard, API, Authentication                          ││
│  └─────────────────────────────────────────────────────────┘│
│                                                             │
│  ┌─────────────────┐  ┌─────────────────┐                  │
│  │ Registry        │  │ MinIO           │                  │
│  │ Port: 5000      │  │ Object Storage  │                  │
│  │ Container images│  │ Artifacts       │                  │
│  └─────────────────┘  └─────────────────┘                  │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ WORKER (Machine 2: 4+ vCPU, 8+ GB RAM)                     │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────┐│
│  │ Supervisor                                              ││
│  │ - Manages task execution                                ││
│  │ - Automatic container cleanup                           ││
│  │ - Resource limits enforcement                           ││
│  └─────────────────────────────────────────────────────────┘│
│                                                             │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ Task Runners (Dynamic)                                  ││
│  │ - Spawned per task                                      ││
│  │ - Isolated containers                                   ││
│  │ - Configurable resources (small-1x to large-2x)        ││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

### Resource Calculations

Worker resources = `concurrency × machine_size`
- 100 concurrency × `small-1x` (0.5 vCPU, 0.5 GB) = 50 vCPU, 50 GB RAM

## Fresh v4 Setup Guide

### Prerequisites

- Docker 20.10.0+
- Docker Compose 2.20.0+
- Node.js 18+

### Step 1: Clone Official Repository

```bash
git clone --depth=1 https://github.com/triggerdotdev/trigger.dev
cd trigger.dev/hosting/docker
cp .env.example .env
```

### Step 2: Configure Environment

Edit `.env` with required settings:

```bash
# Registry (built-in, for storing deployed task images)
REGISTRY_ENDPOINT=localhost:5000
REGISTRY_USERNAME=registry-user
REGISTRY_PASSWORD=your-secure-password

# Object Storage (built-in MinIO)
OBJECT_STORE_ENDPOINT=http://localhost:9000
OBJECT_STORE_ACCESS_KEY_ID=admin
OBJECT_STORE_SECRET_ACCESS_KEY=your-secure-password

# Version lock (recommended)
TRIGGER_IMAGE_TAG=v4.0.0
```

### Step 3: Start Webapp

```bash
cd webapp
docker compose up -d

# Check logs for magic link
docker compose logs -f webapp
```

Access: `http://localhost:8030`

### Step 4: Start Worker

```bash
cd ../worker
cp .env.example .env
# Set WORKER_TOKEN from webapp initial output
docker compose up -d
```

### Step 5: Combined Stack (Single Machine)

```bash
docker compose -f webapp/docker-compose.yml -f worker/docker-compose.yml up -d
```

## CLI Commands (v4)

### Login to Self-Hosted Instance

```bash
# Login with self-hosted URL
npx trigger.dev@latest login -a http://localhost:8030

# Create named profile
npx trigger.dev@latest login -a http://localhost:8030 --profile self-hosted

# List profiles
npx trigger.dev@latest list-profiles

# Switch profile
npx trigger.dev@latest switch self-hosted

# Verify connection
npx trigger.dev@latest whoami
```

### Initialize Project

```bash
npx trigger.dev@latest init -p <project-ref> -a http://localhost:8030
```

### Development Mode

```bash
npx trigger.dev@latest dev --profile self-hosted
```

### Deploy Tasks

```bash
npx trigger.dev@latest deploy --profile self-hosted
```

### CI/CD Environment Variables

```bash
export TRIGGER_API_URL=http://trigger.example.com
export TRIGGER_ACCESS_TOKEN=<personal-access-token>
```

## Authentication Methods

### Magic Link (Default)

Without email transport, magic links appear in webapp logs only:

```bash
docker compose logs -f webapp | grep "magic"
```

### Email Transport (Production)

**Resend:**
```env
EMAIL_TRANSPORT=resend
FROM_EMAIL=noreply@example.com
REPLY_TO_EMAIL=support@example.com
RESEND_API_KEY=re_xxxxx
```

**SMTP:**
```env
EMAIL_TRANSPORT=smtp
FROM_EMAIL=noreply@example.com
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=user
SMTP_PASSWORD=pass
```

### GitHub OAuth

```env
AUTH_GITHUB_CLIENT_ID=your-client-id
AUTH_GITHUB_CLIENT_SECRET=your-client-secret
```

Callback URL: `https://<domain>/auth/github/callback`

### Access Restrictions

```env
WHITELISTED_EMAILS="user1@example\.com|user2@example\.com"
```

## v4 Key Improvements

- **Simpler setup**: No custom startup scripts, just Docker Compose
- **Built-in services**: Registry and MinIO included (no S3/GCS required)
- **Automatic cleanup**: Supervisor manages container lifecycle
- **Resource limits**: Default enforcement, no noisy neighbors
- **Multiple workers**: Horizontal scaling support
- **Docker Socket Proxy**: Security by default

## Task Definition (v4 API)

```typescript
import { task } from "@trigger.dev/sdk/v3";

export const helloWorldTask = task({
  id: "hello-world",
  maxDuration: 300, // seconds
  retry: {
    maxAttempts: 3,
  },
  run: async (payload: { message: string }) => {
    console.log(payload.message);
    return { success: true };
  },
});
```

### trigger.config.ts

```typescript
import type { TriggerConfig } from "@trigger.dev/sdk/v3";

export const config: TriggerConfig = {
  project: "my-project",
  triggerUrl: process.env.TRIGGER_API_URL || "http://localhost:8030",
  maxDuration: 300,
  retries: {
    enabledInDev: true,
    default: {
      maxAttempts: 3,
      factor: 2,
      minTimeoutInMs: 1000,
      maxTimeoutInMs: 10000,
    },
  },
  dirs: ["./src/trigger"],
};
```

## Stress Test Procedure

### 1. Verify Infrastructure

```bash
# All services running
docker compose ps

# Webapp accessible
curl -I http://localhost:8030/login

# API authentication
curl -H "Authorization: Bearer <api-key>" http://localhost:8030/api/v1/whoami
```

### 2. Deploy Test Tasks

```bash
npx trigger.dev@latest deploy --profile self-hosted
```

### 3. Trigger Tests

```bash
# Single task
curl -X POST "http://localhost:8030/api/v1/tasks/hello-world/trigger" \
  -H "Authorization: Bearer <secret-key>" \
  -H "Content-Type: application/json" \
  -d '{"payload": {"message": "Hello"}}'

# Batch (100 tasks)
curl -X POST "http://localhost:8030/api/v1/tasks/hello-world/batch" \
  -H "Authorization: Bearer <secret-key>" \
  -H "Content-Type: application/json" \
  -d '{"items": [...]}'
```

## Troubleshooting

### Magic Link Not Working

Check webapp logs for email delivery errors:
```bash
docker compose logs webapp | grep -i email
```

### Deploy Fails

Verify registry access:
```bash
docker login -u <username> localhost:5000
```

### Worker Token Issues

Check webapp and supervisor logs:
```bash
docker compose logs webapp | grep -i token
docker compose logs supervisor | grep -i auth
```

### Pods/Containers Stuck

```bash
docker compose restart
docker compose logs -f
```

## Version History

- **2.0.0** (2025-11-24): Complete rewrite for Trigger.dev v4
  - Updated architecture for v4 webapp + worker model
  - Added official documentation links
  - New CLI commands for v4
  - Authentication methods documented
  - Fresh setup guide from official repo
- **1.0.0** (2025-11-24): Initial v2/v3 version (deprecated)
