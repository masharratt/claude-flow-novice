# Blocking Coordination Secret Configuration

## Overview

### What is BLOCKING_COORDINATION_SECRET

`BLOCKING_COORDINATION_SECRET` is a cryptographic shared secret used by the CFN Loop blocking coordination system to prevent ACK spoofing attacks in distributed agent environments. It enables HMAC-based message authentication for coordination acknowledgment messages across multiple coordinator instances.

**Purpose**: Ensures that only authorized coordinators can acknowledge blocking operations, preventing malicious agents from forging completion signals.

**Type**: 256-bit (32-byte) random secret encoded as 64-character hexadecimal string

**Scope**: Shared across all blocking coordinator instances within the same deployment environment (production, staging, development)

### Why It's Required

The blocking coordination system introduced in **Sprint 1.1** uses a distributed acknowledgment protocol where multiple agents coordinate work through Redis pub/sub messaging. Without cryptographic authentication, the system is vulnerable to:

1. **ACK Spoofing**: Malicious agents publishing fake acknowledgments to bypass blocking coordination
2. **Replay Attacks**: Reusing captured ACK messages to manipulate coordinator state
3. **Unauthorized Coordination**: External processes interfering with agent workflow

The HMAC-based verification using `BLOCKING_COORDINATION_SECRET` prevents these attacks by ensuring:

- Only coordinators with the shared secret can generate valid ACK signatures
- Each ACK is cryptographically bound to the specific message payload (agent ID, timestamp, operation)
- Tampered ACKs are detected and rejected

**Implementation Reference**: `src/cfn-loop/blocking-coordination.ts` (lines 148-152)

```typescript
this.hmacSecret = config.hmacSecret || process.env.BLOCKING_COORDINATION_SECRET;

if (!this.hmacSecret) {
  throw new Error(
    'BLOCKING_COORDINATION_SECRET environment variable required for ACK verification. ' +
    'Generate with: openssl rand -hex 32'
  );
}
```

### Security Implications

**Shared Secret Model**: All blocking coordinators in the same environment MUST share the identical secret. This creates specific security considerations:

1. **Compromise Impact**: If the secret is compromised, all coordinators in that environment are affected
2. **Secret Distribution**: The secret must be securely distributed to all coordinator instances
3. **Rotation Complexity**: Rotating the secret requires coordinated updates across all instances
4. **Environment Isolation**: Production and staging environments MUST use different secrets

**Threat Model Protection**:

- **PREVENTS**: ACK spoofing, message tampering, unauthorized coordination
- **DOES NOT PREVENT**: Redis access attacks (use Redis AUTH), network eavesdropping (use TLS), secret theft from environment

**Security Level**: HMAC-SHA256 provides cryptographic integrity verification (prevents forgery/tampering), NOT encryption (messages are still visible in Redis)

## Secret Generation

### Generate 32-Byte Random Secret

Use `openssl` to generate a cryptographically secure random secret:

```bash
# Generate 32-byte (256-bit) random secret as hex string
openssl rand -hex 32

# Example output (64 hex characters):
a3f7e9b2c1d8f4a6e2b9c7d3f8a4e1b6c9d2f7a3e8b1c4d6f9a2e7b3c8d1f4a6
```

**Validation**: The output should be exactly 64 hexadecimal characters (0-9, a-f)

**Alternative Methods**:

```bash
# Using Node.js crypto module
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Using /dev/urandom (Linux/macOS)
head -c 32 /dev/urandom | xxd -p -c 64

# Using Python
python3 -c "import secrets; print(secrets.token_hex(32))"
```

### Secret Strength Requirements

**Minimum Requirements**:
- **Length**: 32 bytes (256 bits) minimum
- **Entropy**: Cryptographically random (NOT derived from passwords or predictable sources)
- **Format**: Hexadecimal string (64 characters: 0-9, a-f)

**DO NOT USE**:
- ❌ Short passwords ("password123")
- ❌ Dictionary words ("supersecret")
- ❌ Predictable patterns ("00000000...")
- ❌ Hashed usernames/timestamps
- ❌ Reused secrets from other systems

**RECOMMENDED**:
- ✅ `openssl rand -hex 32` output
- ✅ Hardware security module (HSM) generated keys
- ✅ Secrets management system (Vault, AWS Secrets Manager)

## Secret Distribution

### Distribution Methods

All blocking coordinators in the same environment need the SAME secret. Choose a distribution method based on your security requirements:

#### 1. HashiCorp Vault (Recommended for Production)

```bash
# Store secret in Vault
vault kv put secret/claude-flow/blocking-coordination \
  secret="$(openssl rand -hex 32)"

# Retrieve secret in application
export BLOCKING_COORDINATION_SECRET="$(vault kv get -field=secret secret/claude-flow/blocking-coordination)"

# Systemd integration
[Service]
ExecStartPre=/usr/local/bin/vault-secret-loader.sh
EnvironmentFile=/run/secrets/blocking-coordination.env
```

**Advantages**:
- Centralized secret management
- Audit logging of secret access
- Automatic rotation support
- Fine-grained access control

**Setup**: See [HashiCorp Vault Integration Guide](https://www.vaultproject.io/docs/platform/k8s)

#### 2. AWS Secrets Manager (Cloud Deployments)

```bash
# Create secret in AWS Secrets Manager
aws secretsmanager create-secret \
  --name claude-flow/blocking-coordination-secret \
  --secret-string "$(openssl rand -hex 32)"

# Retrieve secret in application startup
export BLOCKING_COORDINATION_SECRET=$(aws secretsmanager get-secret-value \
  --secret-id claude-flow/blocking-coordination-secret \
  --query SecretString \
  --output text)

# IAM policy for EC2 instance role
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": ["secretsmanager:GetSecretValue"],
    "Resource": "arn:aws:secretsmanager:us-east-1:ACCOUNT:secret:claude-flow/blocking-coordination-secret-*"
  }]
}
```

**Advantages**:
- Native AWS integration
- Automatic rotation scheduling
- Cross-region replication
- VPC endpoint support (no internet access needed)

**Cost**: ~$0.40/month per secret + API call costs

#### 3. Kubernetes Secrets (Container Deployments)

```bash
# Create Kubernetes secret
kubectl create secret generic blocking-coordination-secret \
  --from-literal=secret="$(openssl rand -hex 32)"

# Reference in pod definition
apiVersion: v1
kind: Pod
spec:
  containers:
  - name: cfn-coordinator
    env:
    - name: BLOCKING_COORDINATION_SECRET
      valueFrom:
        secretKeyRef:
          name: blocking-coordination-secret
          key: secret
```

**Advantages**:
- Native Kubernetes integration
- Namespace isolation
- RBAC-based access control

**Security Note**: Encrypt secrets at rest using KMS provider

#### 4. Manual Distribution (Development/Small Deployments)

```bash
# Generate secret once
SECRET=$(openssl rand -hex 32)

# Store in secure file (restricted permissions)
echo "BLOCKING_COORDINATION_SECRET=$SECRET" > /etc/claude-flow/secrets.env
chmod 600 /etc/claude-flow/secrets.env
chown root:root /etc/claude-flow/secrets.env

# Distribute to all coordinator servers via SCP
for host in coord1 coord2 coord3; do
  scp /etc/claude-flow/secrets.env $host:/etc/claude-flow/secrets.env
done
```

**Advantages**:
- Simple setup for small deployments
- No external dependencies

**Disadvantages**:
- Manual rotation process
- No audit trail
- Risk of secret exposure during transfer

### Security Best Practices for Distribution

1. **Encrypt in Transit**: Always use encrypted channels (TLS/SSH) for secret distribution
2. **Restrict Access**: Only coordinators need the secret (not all agents)
3. **Audit Logging**: Log all secret access and retrieval operations
4. **Temporary Exposure**: Never log secrets or display in console output
5. **Backup Encryption**: Encrypt backups containing secrets

**NEVER**:
- ❌ Commit secrets to git repositories
- ❌ Send secrets via unencrypted email
- ❌ Store secrets in Slack/chat systems
- ❌ Include secrets in error messages or logs
- ❌ Store secrets in browser localStorage or cookies

## Configuration by Deployment Method

### 4.1 Systemd (Production Linux Servers)

#### Service File Location
`/etc/systemd/system/cleanup-blocking-coordination.service`

#### Configuration Steps

**Step 1**: Create override directory for secret storage

```bash
sudo mkdir -p /etc/systemd/system/cleanup-blocking-coordination.service.d/
```

**Step 2**: Create override configuration file

```bash
sudo tee /etc/systemd/system/cleanup-blocking-coordination.service.d/override.conf <<EOF
[Service]
Environment="BLOCKING_COORDINATION_SECRET=$(openssl rand -hex 32)"
Environment="REDIS_PASSWORD=your_redis_password_here"
EOF
```

**Step 3**: Secure the override file

```bash
# Restrict permissions (root-only read)
sudo chmod 600 /etc/systemd/system/cleanup-blocking-coordination.service.d/override.conf
sudo chown root:root /etc/systemd/system/cleanup-blocking-coordination.service.d/override.conf
```

**Step 4**: Reload systemd and restart service

```bash
sudo systemctl daemon-reload
sudo systemctl restart cleanup-blocking-coordination.service
```

#### Alternative: Environment File Method

**Step 1**: Create environment file

```bash
sudo tee /etc/claude-flow/blocking-coordination.env <<EOF
BLOCKING_COORDINATION_SECRET=$(openssl rand -hex 32)
REDIS_PASSWORD=your_redis_password_here
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_DB=0
EOF
```

**Step 2**: Secure environment file

```bash
sudo chmod 600 /etc/claude-flow/blocking-coordination.env
sudo chown root:root /etc/claude-flow/blocking-coordination.env
```

**Step 3**: Reference in service file

Edit `/etc/systemd/system/cleanup-blocking-coordination.service`:

```ini
[Service]
EnvironmentFile=/etc/claude-flow/blocking-coordination.env
```

**Step 4**: Reload and restart

```bash
sudo systemctl daemon-reload
sudo systemctl restart cleanup-blocking-coordination.service
```

#### Verification

```bash
# Check service status
sudo systemctl status cleanup-blocking-coordination.service

# Verify environment variables (without exposing secrets)
sudo systemctl show cleanup-blocking-coordination.service --property=Environment | grep -o 'BLOCKING_COORDINATION_SECRET=[^ ]*' | sed 's/=.*/=***REDACTED***/'

# Test service execution
sudo systemctl start cleanup-blocking-coordination.service
sudo journalctl -u cleanup-blocking-coordination.service -n 50
```

### 4.2 Cron (Legacy Systems / Non-Systemd)

#### Cron File Location
`/etc/cron.d/cleanup-blocking-coordination`

#### Configuration Steps

**Step 1**: Create secure environment file

```bash
sudo mkdir -p /etc/claude-flow
sudo tee /etc/claude-flow/blocking-coordination.env <<EOF
BLOCKING_COORDINATION_SECRET=$(openssl rand -hex 32)
REDIS_PASSWORD=your_redis_password_here
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_DB=0
EOF
sudo chmod 600 /etc/claude-flow/blocking-coordination.env
sudo chown root:root /etc/claude-flow/blocking-coordination.env
```

**Step 2**: Edit cron file to source environment

```bash
sudo tee /etc/cron.d/cleanup-blocking-coordination <<'EOF'
# Cleanup stale blocking coordination state every 5 minutes

SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/sbin:/bin:/usr/sbin:/usr/bin

# Source environment file containing secrets
*/5 * * * * claude-flow source /etc/claude-flow/blocking-coordination.env && /usr/local/bin/cleanup-blocking-coordination.sh >> /home/claude-flow/.claude-flow/logs/blocking-cleanup.log 2>&1
EOF
```

**Step 3**: Secure cron file

```bash
sudo chmod 644 /etc/cron.d/cleanup-blocking-coordination
sudo chown root:root /etc/cron.d/cleanup-blocking-coordination
```

#### Alternative: Inline Environment Variables (Less Secure)

**WARNING**: This method exposes secrets to `ps` command output. Use only for development.

```bash
sudo tee /etc/cron.d/cleanup-blocking-coordination <<EOF
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/sbin:/bin:/usr/sbin:/usr/bin

# Inline secrets (DEVELOPMENT ONLY)
BLOCKING_COORDINATION_SECRET=$(openssl rand -hex 32)
REDIS_PASSWORD=your_redis_password_here
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_DB=0

# Run cleanup every 5 minutes
*/5 * * * * claude-flow /usr/local/bin/cleanup-blocking-coordination.sh >> /home/claude-flow/.claude-flow/logs/blocking-cleanup.log 2>&1
EOF
```

#### Verification

```bash
# Check cron file syntax
sudo crontab -u claude-flow -l 2>/dev/null || cat /etc/cron.d/cleanup-blocking-coordination

# Monitor cron execution
sudo tail -f /var/log/syslog | grep cleanup-blocking-coordination  # Debian/Ubuntu
sudo tail -f /var/log/cron | grep cleanup-blocking-coordination    # RHEL/CentOS

# Check application logs
tail -f /home/claude-flow/.claude-flow/logs/blocking-cleanup.log

# Manual test execution
sudo -u claude-flow bash -c 'source /etc/claude-flow/blocking-coordination.env && /usr/local/bin/cleanup-blocking-coordination.sh --dry-run'
```

### 4.3 Node.js Direct Execution

#### Development Environment

**Method 1**: Export in shell session

```bash
# Generate and export secret (session-scoped)
export BLOCKING_COORDINATION_SECRET=$(openssl rand -hex 32)
export REDIS_PASSWORD=your_redis_password_here

# Run Node.js application
node src/cfn-loop/cfn-loop-orchestrator.js
```

**Method 2**: Use `.env` file with dotenv

**Step 1**: Create `.env` file (add to `.gitignore`)

```bash
# Generate .env file
cat > .env <<EOF
BLOCKING_COORDINATION_SECRET=$(openssl rand -hex 32)
REDIS_PASSWORD=your_redis_password_here
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_DB=0
EOF

# Secure permissions
chmod 600 .env
```

**Step 2**: Add to `.gitignore`

```bash
echo ".env" >> .gitignore
git add .gitignore
git commit -m "Add .env to gitignore"
```

**Step 3**: Load in Node.js application

```javascript
// Load dotenv at application entry point
require('dotenv').config();

// Access secret
const secret = process.env.BLOCKING_COORDINATION_SECRET;
if (!secret) {
  throw new Error('BLOCKING_COORDINATION_SECRET not configured');
}
```

**Method 3**: Inline environment variable

```bash
# Set environment variable for single command
BLOCKING_COORDINATION_SECRET=$(openssl rand -hex 32) node src/cfn-loop/cfn-loop-orchestrator.js
```

#### Production Environment

**Method 1**: System-wide environment file

```bash
# Create system environment file
sudo tee /etc/environment.d/50-claude-flow.conf <<EOF
BLOCKING_COORDINATION_SECRET=$(openssl rand -hex 32)
EOF

sudo chmod 644 /etc/environment.d/50-claude-flow.conf

# Restart session or reload environment
source /etc/environment.d/50-claude-flow.conf
```

**Method 2**: User profile configuration

```bash
# Add to ~/.bashrc or ~/.profile
echo "export BLOCKING_COORDINATION_SECRET=$(openssl rand -hex 32)" >> ~/.bashrc
source ~/.bashrc
```

**Method 3**: Process manager (PM2)

```bash
# Create PM2 ecosystem file
cat > ecosystem.config.js <<EOF
module.exports = {
  apps: [{
    name: 'cfn-loop-orchestrator',
    script: 'src/cfn-loop/cfn-loop-orchestrator.js',
    env: {
      BLOCKING_COORDINATION_SECRET: '$(openssl rand -hex 32)',
      REDIS_PASSWORD: 'your_redis_password_here',
      NODE_ENV: 'production'
    }
  }]
};
EOF

# Start with PM2
pm2 start ecosystem.config.js
```

#### Verification

```bash
# Check environment variable is set (without exposing value)
node -e "console.log(process.env.BLOCKING_COORDINATION_SECRET ? 'Secret is set' : 'Secret is MISSING')"

# Verify secret format (64 hex characters)
node -e "const s = process.env.BLOCKING_COORDINATION_SECRET; console.log(s && /^[0-9a-f]{64}$/i.test(s) ? 'Valid format' : 'Invalid format')"

# Test coordinator initialization
node -e "
const { BlockingCoordination } = require('./src/cfn-loop/blocking-coordination');
try {
  const coord = new BlockingCoordination({ hmacSecret: process.env.BLOCKING_COORDINATION_SECRET });
  console.log('✅ Coordinator initialized successfully');
} catch (err) {
  console.error('❌ Initialization failed:', err.message);
}
"
```

### 4.4 Docker Container Deployment

#### Method 1: Environment Variable at Runtime

```bash
# Generate secret
SECRET=$(openssl rand -hex 32)

# Run container with environment variable
docker run -d \
  --name cfn-coordinator \
  -e BLOCKING_COORDINATION_SECRET="$SECRET" \
  -e REDIS_HOST=redis \
  -e REDIS_PASSWORD=your_redis_password \
  claude-flow-novice:latest
```

#### Method 2: Docker Compose with Environment File

**Step 1**: Create `.env` file for Docker Compose

```bash
cat > .env.production <<EOF
BLOCKING_COORDINATION_SECRET=$(openssl rand -hex 32)
REDIS_PASSWORD=$(openssl rand -hex 16)
EOF

chmod 600 .env.production
```

**Step 2**: Reference in `docker-compose.yml`

```yaml
version: '3.8'

services:
  cfn-coordinator:
    image: claude-flow-novice:latest
    env_file:
      - .env.production
    environment:
      - REDIS_HOST=redis
      - NODE_ENV=production
    depends_on:
      - redis
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    command: redis-server --requirepass ${REDIS_PASSWORD}
    volumes:
      - redis-data:/data
    restart: unless-stopped

volumes:
  redis-data:
```

**Step 3**: Deploy with Docker Compose

```bash
docker-compose --env-file .env.production up -d
```

#### Method 3: Docker Secrets (Docker Swarm)

**Step 1**: Create Docker secret

```bash
# Generate and create secret
openssl rand -hex 32 | docker secret create blocking_coordination_secret -
```

**Step 2**: Reference in `docker-compose.yml` (Swarm mode)

```yaml
version: '3.8'

services:
  cfn-coordinator:
    image: claude-flow-novice:latest
    secrets:
      - blocking_coordination_secret
    environment:
      - BLOCKING_COORDINATION_SECRET_FILE=/run/secrets/blocking_coordination_secret
    deploy:
      replicas: 3
      restart_policy:
        condition: on-failure

secrets:
  blocking_coordination_secret:
    external: true
```

**Step 3**: Update application to read from file

```javascript
// src/cfn-loop/blocking-coordination.ts
const fs = require('fs');

const secretFile = process.env.BLOCKING_COORDINATION_SECRET_FILE;
const hmacSecret = secretFile && fs.existsSync(secretFile)
  ? fs.readFileSync(secretFile, 'utf8').trim()
  : process.env.BLOCKING_COORDINATION_SECRET;

if (!hmacSecret) {
  throw new Error('BLOCKING_COORDINATION_SECRET or BLOCKING_COORDINATION_SECRET_FILE required');
}
```

#### Method 4: Dockerfile Build Argument (NOT Recommended for Production)

```dockerfile
# Dockerfile
FROM node:18-alpine

# Build argument (only use for development)
ARG BLOCKING_COORDINATION_SECRET

# Set as environment variable
ENV BLOCKING_COORDINATION_SECRET=${BLOCKING_COORDINATION_SECRET}

COPY . /app
WORKDIR /app
RUN npm install --production

CMD ["node", "src/cfn-loop/cfn-loop-orchestrator.js"]
```

**Build and run**:

```bash
# Build with secret (NOT recommended - secret stored in image layer)
docker build --build-arg BLOCKING_COORDINATION_SECRET=$(openssl rand -hex 32) -t cfn-coordinator .

# Run container
docker run -d cfn-coordinator
```

**WARNING**: This method embeds the secret in the Docker image layer history. ONLY use for development/testing.

#### Verification

```bash
# Check container environment (without exposing secrets)
docker exec cfn-coordinator sh -c 'echo ${BLOCKING_COORDINATION_SECRET:+Secret is set}'

# View container logs for initialization errors
docker logs cfn-coordinator | grep -i "blocking_coordination"

# Test coordinator health
docker exec cfn-coordinator node -e "
const { BlockingCoordination } = require('./src/cfn-loop/blocking-coordination');
const coord = new BlockingCoordination({ hmacSecret: process.env.BLOCKING_COORDINATION_SECRET });
console.log('✅ Coordinator healthy');
"
```

#### Kubernetes Deployment

**Step 1**: Create Kubernetes secret

```bash
kubectl create secret generic blocking-coordination-secret \
  --from-literal=secret=$(openssl rand -hex 32) \
  --namespace=claude-flow
```

**Step 2**: Reference in deployment manifest

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: cfn-coordinator
  namespace: claude-flow
spec:
  replicas: 3
  selector:
    matchLabels:
      app: cfn-coordinator
  template:
    metadata:
      labels:
        app: cfn-coordinator
    spec:
      containers:
      - name: coordinator
        image: claude-flow-novice:latest
        env:
        - name: BLOCKING_COORDINATION_SECRET
          valueFrom:
            secretKeyRef:
              name: blocking-coordination-secret
              key: secret
        - name: REDIS_HOST
          value: redis-service
        - name: NODE_ENV
          value: production
        ports:
        - containerPort: 3000
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
```

**Step 3**: Apply deployment

```bash
kubectl apply -f deployment.yaml
```

**Verification**:

```bash
# Check pods are running
kubectl get pods -n claude-flow

# Check secret is mounted correctly
kubectl exec -n claude-flow cfn-coordinator-xxxx -- sh -c 'echo ${BLOCKING_COORDINATION_SECRET:+Secret is set}'

# View pod logs
kubectl logs -n claude-flow -l app=cfn-coordinator --tail=50
```

## Verification

### Environment Variable Validation

**Check secret is set** (without exposing value):

```bash
# Bash
echo ${BLOCKING_COORDINATION_SECRET:+Secret is configured}

# Node.js
node -e "console.log(process.env.BLOCKING_COORDINATION_SECRET ? '✅ Secret is set' : '❌ Secret is MISSING')"

# Python
python3 -c "import os; print('✅ Secret is set' if os.getenv('BLOCKING_COORDINATION_SECRET') else '❌ Secret is MISSING')"
```

**Validate secret format** (64 hex characters):

```bash
# Bash
if [[ "$BLOCKING_COORDINATION_SECRET" =~ ^[0-9a-fA-F]{64}$ ]]; then
  echo "✅ Valid format (64 hex characters)"
else
  echo "❌ Invalid format (expected 64 hex characters)"
fi

# Node.js
node -e "
const s = process.env.BLOCKING_COORDINATION_SECRET;
const valid = s && /^[0-9a-f]{64}$/i.test(s);
console.log(valid ? '✅ Valid format' : '❌ Invalid format');
console.log('Length:', s?.length || 0, '(expected: 64)');
"
```

### Application Integration Testing

**Test coordinator initialization**:

```javascript
// test-coordinator-init.js
const { BlockingCoordination } = require('./src/cfn-loop/blocking-coordination');

try {
  const coordinator = new BlockingCoordination({
    hmacSecret: process.env.BLOCKING_COORDINATION_SECRET,
    redisConfig: {
      host: process.env.REDIS_HOST || '127.0.0.1',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD
    }
  });

  console.log('✅ Coordinator initialized successfully');
  console.log('   HMAC secret configured:', coordinator.hmacSecret ? 'Yes (redacted)' : 'No');
  process.exit(0);
} catch (error) {
  console.error('❌ Coordinator initialization failed:', error.message);
  process.exit(1);
}
```

**Run test**:

```bash
node test-coordinator-init.js
```

### Error Messages Reference

**Missing secret**:

```
Error: BLOCKING_COORDINATION_SECRET environment variable required for ACK verification.
Generate with: openssl rand -hex 32
```

**Action**: Set the environment variable before starting the application

**Invalid secret format**:

```
Error: BLOCKING_COORDINATION_SECRET must be 64 hexadecimal characters (32 bytes)
Current length: XX characters
```

**Action**: Regenerate secret using `openssl rand -hex 32`

**Secret mismatch** (between coordinators):

```
Warning: ACK verification failed - HMAC signature mismatch
Agent: agent-123
Expected coordinator: coordinator-1
Possible causes: Secret mismatch between coordinators
```

**Action**: Verify all coordinators use identical secret

### Troubleshooting Secret Issues

#### Issue: Environment variable not propagating to child processes

**Symptoms**: Parent process has secret, but spawned processes do not

**Solution**: Explicitly export variable before spawning

```bash
# Incorrect (not exported)
BLOCKING_COORDINATION_SECRET=xxx node app.js

# Correct (exported)
export BLOCKING_COORDINATION_SECRET=xxx
node app.js
```

#### Issue: Secret visible in process list

**Symptoms**: `ps aux` shows secret in command arguments

**Solution**: Use environment file instead of inline arguments

```bash
# Vulnerable (visible in ps output)
node app.js --secret=$BLOCKING_COORDINATION_SECRET

# Secure (environment variable)
export BLOCKING_COORDINATION_SECRET=xxx
node app.js
```

#### Issue: Secret not persisting across reboots

**Symptoms**: Works until server restart

**Solution**: Use systemd override, environment file, or secrets manager

```bash
# Systemd override (persists across reboots)
sudo systemctl edit cleanup-blocking-coordination.service

# Add:
[Service]
Environment="BLOCKING_COORDINATION_SECRET=xxx"
```

#### Issue: Docker container secret not set

**Symptoms**: Container logs show missing secret error

**Solution**: Verify environment variable is passed correctly

```bash
# Check container environment
docker inspect cfn-coordinator | jq '.[0].Config.Env'

# Check running container
docker exec cfn-coordinator env | grep BLOCKING_COORDINATION_SECRET
```

## Secret Rotation

### Rotation Strategy

Rotating the `BLOCKING_COORDINATION_SECRET` requires coordinated updates across all coordinator instances to prevent ACK verification failures during transition.

### Zero-Downtime Rotation Procedure

#### Phase 1: Dual-Secret Support (Application Update)

**Step 1**: Update application to support multiple secrets

```typescript
// src/cfn-loop/blocking-coordination.ts
class BlockingCoordination {
  private hmacSecrets: Map<number, string>;

  constructor(config: BlockingCoordinationConfig) {
    // Support multiple versioned secrets
    this.hmacSecrets = new Map([
      [1, process.env.BLOCKING_COORDINATION_SECRET_V1],
      [2, process.env.BLOCKING_COORDINATION_SECRET_V2]  // New secret
    ].filter(([_, secret]) => secret));

    if (this.hmacSecrets.size === 0) {
      throw new Error('At least one BLOCKING_COORDINATION_SECRET required');
    }

    // Use latest version for signing
    this.currentVersion = Math.max(...this.hmacSecrets.keys());
    this.hmacSecret = this.hmacSecrets.get(this.currentVersion);
  }

  private generateAckSignature(payload: string, version?: number): string {
    const secret = version
      ? this.hmacSecrets.get(version)
      : this.hmacSecret;

    return createHmac('sha256', secret)
      .update(payload)
      .digest('hex');
  }

  private verifyAckSignature(payload: string, signature: string, version: number): boolean {
    // Try all known secret versions
    for (const [ver, secret] of this.hmacSecrets.entries()) {
      const expected = createHmac('sha256', secret)
        .update(payload)
        .digest('hex');

      if (timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
        return true;
      }
    }

    return false;
  }
}
```

**Step 2**: Deploy updated code to all coordinators

```bash
# Deploy without changing secrets yet
git pull
npm install
pm2 restart all
```

#### Phase 2: Add New Secret (Environment Update)

**Step 3**: Generate new secret

```bash
NEW_SECRET=$(openssl rand -hex 32)
echo "New secret: $NEW_SECRET"
```

**Step 4**: Add new secret to all coordinators (keep old secret)

```bash
# Systemd
sudo tee -a /etc/systemd/system/cleanup-blocking-coordination.service.d/override.conf <<EOF
Environment="BLOCKING_COORDINATION_SECRET_V2=$NEW_SECRET"
EOF

sudo systemctl daemon-reload
sudo systemctl restart cleanup-blocking-coordination.service
```

**Step 5**: Verify dual-secret operation

```bash
# Check both secrets are set
sudo systemctl show cleanup-blocking-coordination.service --property=Environment | grep BLOCKING_COORDINATION_SECRET

# Monitor logs for ACK verification success
sudo journalctl -u cleanup-blocking-coordination.service -f | grep "ACK verified"
```

#### Phase 3: Remove Old Secret (Cleanup)

**Step 6**: Wait for all coordinators to use new secret (monitor metrics)

```bash
# Monitor ACK signature versions in Redis
redis-cli --scan --pattern "blocking:ack:*" | while read key; do
  redis-cli hget "$key" signature_version
done | sort | uniq -c
```

**Step 7**: Remove old secret once v1 count is zero

```bash
# Systemd
sudo vim /etc/systemd/system/cleanup-blocking-coordination.service.d/override.conf
# Remove: Environment="BLOCKING_COORDINATION_SECRET_V1=..."

sudo systemctl daemon-reload
sudo systemctl restart cleanup-blocking-coordination.service
```

**Step 8**: Update application to remove dual-secret support (optional)

```typescript
// Revert to single secret after rotation complete
this.hmacSecret = process.env.BLOCKING_COORDINATION_SECRET;
```

### Rotation Frequency Recommendations

**Production**: Rotate every 90 days (quarterly)

**Staging**: Rotate every 30 days (monthly)

**Development**: Rotate on demand (security incident response)

**Triggers for immediate rotation**:
- Secret exposure suspected (logs, error messages, commits)
- Security audit finding
- Employee offboarding with secret access
- Compliance requirement (PCI-DSS, HIPAA)

### Verification After Rotation

**Check all coordinators use new secret**:

```bash
# Systemd
for host in coord1 coord2 coord3; do
  echo "=== $host ==="
  ssh $host "sudo systemctl show cleanup-blocking-coordination.service --property=Environment | grep -o 'BLOCKING_COORDINATION_SECRET=[^ ]*' | sed 's/=.*/=***REDACTED***/'"
done
```

**Test ACK verification**:

```javascript
// test-ack-rotation.js
const { BlockingCoordination } = require('./src/cfn-loop/blocking-coordination');

const coordinator = new BlockingCoordination({
  hmacSecret: process.env.BLOCKING_COORDINATION_SECRET
});

const testPayload = JSON.stringify({
  agentId: 'test-agent',
  timestamp: Date.now(),
  operation: 'test'
});

const signature = coordinator.generateAckSignature(testPayload);
console.log('✅ ACK signature generated successfully');

const isValid = coordinator.verifyAckSignature(testPayload, signature);
console.log(isValid ? '✅ ACK verification successful' : '❌ ACK verification FAILED');
```

**Monitor error rates**:

```bash
# Check for ACK verification failures after rotation
sudo journalctl -u cleanup-blocking-coordination.service --since "1 hour ago" | grep -i "verification failed"
```

## Security Best Practices

### Least Privilege Principle

**Coordinator-Only Access**: Only blocking coordinator processes need the secret

```bash
# File permissions for systemd override
sudo chmod 600 /etc/systemd/system/cleanup-blocking-coordination.service.d/override.conf
sudo chown root:root /etc/systemd/system/cleanup-blocking-coordination.service.d/override.conf

# Process-level isolation
# Run coordinator as dedicated service user (not root)
[Service]
User=claude-flow
Group=claude-flow
```

**Access Control List**:
- ✅ Coordinator processes (read-only)
- ✅ Deployment automation (write for rotation)
- ✅ Security team (audit/rotation)
- ❌ Application logs
- ❌ Monitoring systems
- ❌ Development environments (use separate secret)

### Secret Expiration Policies

**Time-Based Rotation**:

```bash
# Automated rotation with cron (every 90 days)
0 0 1 */3 * /usr/local/bin/rotate-blocking-secret.sh
```

**Event-Based Rotation**:
- Security incident detected
- Employee offboarding
- Audit finding
- Compliance requirement

**Rotation Tracking**:

```bash
# Store rotation history in audit log
cat > /var/log/claude-flow/secret-rotation.log <<EOF
$(date -Iseconds) - Secret rotated (version 2 -> 3) by automation
EOF
```

### Audit Logging Requirements

**Log Secret Access** (NOT the secret value):

```javascript
// src/cfn-loop/blocking-coordination.ts
const auditLogger = require('./audit-logger');

constructor(config) {
  if (process.env.BLOCKING_COORDINATION_SECRET) {
    auditLogger.info({
      event: 'secret_loaded',
      source: 'environment_variable',
      timestamp: new Date().toISOString(),
      process: process.pid
    });
  }
}
```

**Log ACK Verification Events**:

```javascript
private verifyAckSignature(payload, signature) {
  const isValid = /* verification logic */;

  auditLogger.info({
    event: 'ack_verification',
    result: isValid ? 'success' : 'failure',
    agentId: JSON.parse(payload).agentId,
    timestamp: new Date().toISOString()
  });

  return isValid;
}
```

**Log Rotation Events**:

```bash
# /usr/local/bin/rotate-blocking-secret.sh
logger -t blocking-secret-rotation "Secret rotation initiated by $(whoami)"
# ... rotation logic ...
logger -t blocking-secret-rotation "Secret rotation completed successfully"
```

### Production vs Staging Secrets

**Environment Isolation**: NEVER share secrets between environments

```bash
# Production secret (stored in Vault/Secrets Manager)
PROD_SECRET=$(vault kv get -field=secret secret/prod/blocking-coordination)

# Staging secret (different from production)
STAGING_SECRET=$(vault kv get -field=secret secret/staging/blocking-coordination)

# Development secret (generated locally, never deployed)
DEV_SECRET=$(openssl rand -hex 32)
```

**Secret Naming Convention**:

```
secret/prod/blocking-coordination-secret
secret/staging/blocking-coordination-secret
secret/dev/blocking-coordination-secret
```

**Environment Detection**:

```javascript
// Auto-select secret based on NODE_ENV
const secretKey = {
  production: 'secret/prod/blocking-coordination-secret',
  staging: 'secret/staging/blocking-coordination-secret',
  development: 'secret/dev/blocking-coordination-secret'
}[process.env.NODE_ENV || 'development'];
```

### Secrets in Backups

**Encrypt Backups**:

```bash
# Backup with encryption
tar czf - /etc/claude-flow/ | gpg --encrypt --recipient backup@example.com > backup.tar.gz.gpg

# Restore
gpg --decrypt backup.tar.gz.gpg | tar xzf -
```

**Exclude Secrets from General Backups**:

```bash
# /etc/backup.d/exclude.conf
/etc/claude-flow/blocking-coordination.env
/etc/systemd/system/*.service.d/override.conf
```

**Backup Retention Policy**:
- Encrypted backups: 90 days retention
- After secret rotation: Delete old backups (contain old secret)

### Never Commit Secrets to Git

**Pre-Commit Hook**:

```bash
#!/bin/bash
# .git/hooks/pre-commit

# Check for potential secret patterns
if git diff --cached | grep -E 'BLOCKING_COORDINATION_SECRET.*=.*[0-9a-f]{64}'; then
  echo "❌ ERROR: Potential secret detected in commit!"
  echo "Remove secret before committing"
  exit 1
fi
```

**Git History Scanning**:

```bash
# Scan git history for exposed secrets (use git-secrets or truffleHog)
docker run -v $(pwd):/repo trufflesecurity/trufflehog:latest filesystem /repo

# If secret found, rewrite history (DESTRUCTIVE)
git filter-branch --force --index-filter \
  "git rm --cached --ignore-unmatch .env" \
  --prune-empty --tag-name-filter cat -- --all
```

**.gitignore Protection**:

```bash
# Add to .gitignore
echo ".env" >> .gitignore
echo ".env.*" >> .gitignore
echo "**/override.conf" >> .gitignore
echo "**/*secret*.env" >> .gitignore
```

### Secret Storage Comparison

| Method | Security | Ease of Use | Rotation | Audit Trail | Cost |
|--------|----------|-------------|----------|-------------|------|
| **HashiCorp Vault** | ★★★★★ | ★★★☆☆ | ★★★★★ | ★★★★★ | Free (OSS) |
| **AWS Secrets Manager** | ★★★★★ | ★★★★☆ | ★★★★★ | ★★★★★ | $0.40/month |
| **Kubernetes Secrets** | ★★★★☆ | ★★★★★ | ★★★☆☆ | ★★★☆☆ | Free |
| **Environment File** | ★★★☆☆ | ★★★★★ | ★★☆☆☆ | ★☆☆☆☆ | Free |
| **Systemd Override** | ★★★★☆ | ★★★★☆ | ★★☆☆☆ | ★★☆☆☆ | Free |
| **Inline Environment** | ★★☆☆☆ | ★★★★★ | ★★☆☆☆ | ★☆☆☆☆ | Free |

**Recommendation by Environment**:

- **Production**: HashiCorp Vault or AWS Secrets Manager
- **Staging**: Kubernetes Secrets or Systemd Override
- **Development**: Environment File (`.env`)
- **CI/CD**: GitHub Secrets or GitLab CI Variables

## Integration Points

### Systemd Service Configuration

See complete systemd deployment guide: [infrastructure/systemd/README.md](../../infrastructure/systemd/README.md)

**Security Configuration Section**: Add after "Installation" section in systemd README

### Cron Job Configuration

See complete cron deployment guide: [infrastructure/cron/README.md](../../infrastructure/cron/README.md)

**Security Configuration Section**: Add after "Configuration" section in cron README

### Related Documentation

- **ACK Spoofing Prevention**: Sprint 1.1 security implementation
- **Redis Authentication**: `readme/logs-cli-redis.md`
- **Security Audit**: `reports/validation/SECURITY_AUDIT_ITERATION_2_REPORT.md`
- **Blocking Coordination**: `src/cfn-loop/blocking-coordination.ts`

## Compliance Considerations

### PCI-DSS Requirements

**Requirement 8.2.3**: Strong cryptographic secrets (32 bytes minimum)

✅ **Compliance**: `openssl rand -hex 32` generates 256-bit random secrets

**Requirement 8.2.4**: Secrets must be changed every 90 days

✅ **Compliance**: Implement automated rotation (see Secret Rotation section)

**Requirement 8.2.5**: Secrets must be encrypted in storage

✅ **Compliance**: Use HashiCorp Vault or AWS Secrets Manager with encryption at rest

### HIPAA Security Rule

**§164.312(a)(2)(iv)**: Encryption and Decryption

✅ **Compliance**: Secrets stored in encrypted secrets managers (Vault, AWS Secrets Manager)

**§164.308(a)(4)**: Access Controls

✅ **Compliance**: Least privilege access (coordinator-only), audit logging

### SOC 2 Type II

**CC6.1**: Logical access controls

✅ **Compliance**: Role-based access (systemd user isolation, file permissions)

**CC6.2**: Transmission security

✅ **Compliance**: TLS for secret distribution (Vault API, AWS Secrets Manager)

**CC6.7**: Encryption

✅ **Compliance**: Secrets encrypted at rest and in transit

## Quick Reference

### Generate Secret

```bash
openssl rand -hex 32
```

### Systemd Configuration

```bash
sudo systemctl edit cleanup-blocking-coordination.service
# Add: Environment="BLOCKING_COORDINATION_SECRET=xxx"
sudo systemctl daemon-reload
sudo systemctl restart cleanup-blocking-coordination.service
```

### Cron Configuration

```bash
echo "source /etc/claude-flow/blocking-coordination.env && /usr/local/bin/cleanup-blocking-coordination.sh" > /etc/cron.d/cleanup-blocking-coordination
```

### Node.js Configuration

```bash
export BLOCKING_COORDINATION_SECRET=$(openssl rand -hex 32)
node src/cfn-loop/cfn-loop-orchestrator.js
```

### Docker Configuration

```bash
docker run -e BLOCKING_COORDINATION_SECRET=$(openssl rand -hex 32) claude-flow-novice:latest
```

### Verification

```bash
echo ${BLOCKING_COORDINATION_SECRET:+Secret is set}
```

### Test Application

```bash
node -e "const {BlockingCoordination} = require('./src/cfn-loop/blocking-coordination'); new BlockingCoordination({hmacSecret: process.env.BLOCKING_COORDINATION_SECRET}); console.log('✅ Success')"
```

## Support

**Issues**: Report secret-related issues to security team (do NOT include secret values in bug reports)

**Documentation Updates**: Submit PRs to `docs/deployment/blocking-coordination-secrets.md`

**Security Incidents**: Email security@example.com for immediate secret rotation

---

**Document Version**: 1.0.0
**Last Updated**: 2025-10-10
**Sprint**: 3.2 Loop 3 Iteration 2
**Related Issue**: REC-002 HMAC Secret Documentation
