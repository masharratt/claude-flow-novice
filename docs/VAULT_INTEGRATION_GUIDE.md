# HashiCorp Vault Integration Guide

**Part of:** IMPL-001 Security Hardening - Stream 1
**Version:** 1.0.0
**Status:** Implementation Complete

## Overview

This guide covers the complete integration of HashiCorp Vault for secrets management in the CFN platform. Vault provides centralized, secure storage and management of sensitive data including API keys, database credentials, certificates, and encryption keys.

## Table of Contents

- [Quick Start](#quick-start)
- [Architecture](#architecture)
- [Installation](#installation)
- [Configuration](#configuration)
- [Team Policies](#team-policies)
- [Secret Management](#secret-management)
- [Rotation Strategies](#rotation-strategies)
- [Production Deployment](#production-deployment)
- [Troubleshooting](#troubleshooting)
- [Security Best Practices](#security-best-practices)

## Quick Start

### 1. Start Vault (Development Mode)

```bash
# Start Vault container
docker-compose -f docker-compose.vault.yml up -d

# Wait for Vault to be ready
docker logs cfn-vault

# Initialize Vault
./scripts/vault/init-vault.sh
```

### 2. Setup Secrets Engines

```bash
# Configure KV v2 and Transit engines
./scripts/vault/setup-secrets-engine.sh
```

### 3. Create Policies

```bash
# Create team isolation policies
./scripts/vault/create-policies.sh
```

### 4. Fetch Secrets

```bash
# Export Vault environment
export VAULT_ADDR=http://localhost:8200
export VAULT_TOKEN=$(cat .vault-token)

# Fetch API keys
./scripts/vault/secrets-fetch.sh --path secret/api-keys/anthropic --format env
```

## Architecture

### Components

```
┌─────────────────────────────────────────────────────────────┐
│                     CFN Platform                             │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   Agents     │  │   Backend    │  │   CI/CD      │      │
│  │  (Limited)   │  │  (Database)  │  │ (Deploy)     │      │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘      │
│         │                  │                  │               │
│         └──────────────────┼──────────────────┘              │
│                            │                                  │
│                    ┌───────▼────────┐                        │
│                    │  Vault Client  │                        │
│                    └───────┬────────┘                        │
└────────────────────────────┼─────────────────────────────────┘
                             │
                    ┌────────▼─────────┐
                    │  HashiCorp Vault │
                    ├──────────────────┤
                    │  - KV v2 Engine  │
                    │  - Transit Engine│
                    │  - Policies      │
                    │  - Audit Log     │
                    └──────────────────┘
```

### Secret Storage Layout

```
secret/
├── api-keys/
│   ├── anthropic     (API key, tier, rotation config)
│   ├── openai        (API key, tier, rotation config)
│   └── zai           (API key, tier, rotation config)
│
├── database/
│   ├── postgres      (username, password, host, port)
│   └── redis         (password, host, port, TLS config)
│
├── auth/
│   └── jwt           (secret, algorithm, expiry)
│
├── webhooks/
│   └── github        (webhook secret)
│
└── certs/
    └── tls           (cert, key, CA)

transit/
├── keys/
│   ├── cfn-encryption-key    (AES-256-GCM96)
│   ├── cfn-api-token-key     (AES-256-GCM96)
│   └── cfn-jwt-signing-key   (ECDSA-P256)
```

## Installation

### Prerequisites

- Docker and Docker Compose
- Bash 4.0+
- curl, jq, openssl
- Network access to port 8200

### Development Mode (Default)

Development mode uses in-memory storage and is **NOT** suitable for production.

```bash
# Start Vault in dev mode
docker-compose -f docker-compose.vault.yml up -d

# Vault will be available at http://localhost:8200
# Root token: dev-root-token (configurable via VAULT_ROOT_TOKEN env var)
```

### Production Mode

For production deployment, you need:

1. **Persistent Storage Backend** (Raft/Consul/etcd)
2. **TLS Certificates**
3. **Auto-Unseal** (Cloud KMS)
4. **High Availability** (3+ nodes)
5. **Audit Logging**

See [Production Deployment](#production-deployment) for details.

## Configuration

### Environment Variables

```bash
# Vault server address
VAULT_ADDR=http://localhost:8200

# Vault token (root or policy-scoped)
VAULT_TOKEN=$(cat .vault-token)

# Vault namespace (Enterprise only)
VAULT_NAMESPACE=

# TLS configuration (production)
VAULT_CACERT=/path/to/ca.crt
VAULT_CLIENT_CERT=/path/to/client.crt
VAULT_CLIENT_KEY=/path/to/client.key
```

### Docker Compose Configuration

```yaml
# docker-compose.vault.yml
services:
  vault:
    image: hashicorp/vault:1.15
    ports:
      - "8200:8200"
    environment:
      VAULT_DEV_ROOT_TOKEN_ID: "${VAULT_ROOT_TOKEN:-dev-root-token}"
      VAULT_ADDR: "http://0.0.0.0:8200"
    cap_add:
      - IPC_LOCK
```

### Application Integration

```typescript
// src/services/vault-client.ts
import * as vault from 'node-vault';

export class VaultClient {
  private client: vault.client;

  constructor() {
    this.client = vault({
      apiVersion: 'v1',
      endpoint: process.env.VAULT_ADDR || 'http://localhost:8200',
      token: process.env.VAULT_TOKEN
    });
  }

  async getSecret(path: string): Promise<any> {
    const result = await this.client.read(`secret/data/${path}`);
    return result.data.data;
  }

  async encrypt(plaintext: string): Promise<string> {
    const encoded = Buffer.from(plaintext).toString('base64');
    const result = await this.client.write('transit/encrypt/cfn-encryption-key', {
      plaintext: encoded
    });
    return result.data.ciphertext;
  }

  async decrypt(ciphertext: string): Promise<string> {
    const result = await this.client.write('transit/decrypt/cfn-encryption-key', {
      ciphertext
    });
    const decoded = Buffer.from(result.data.plaintext, 'base64').toString('utf-8');
    return decoded;
  }
}
```

## Team Policies

### Policy Overview

| Policy | Access Level | Use Case |
|--------|-------------|----------|
| `cfn-admin` | Full access | SRE team, platform admins |
| `cfn-backend-team` | Database + API keys | Backend developers |
| `cfn-frontend-team` | Public API keys only | Frontend developers |
| `cfn-devops-team` | Infrastructure secrets | DevOps engineers |
| `cfn-cicd` | Deployment credentials | CI/CD pipelines |
| `cfn-readonly` | Audit and monitoring | Security team, auditors |
| `cfn-agent` | Limited runtime access | CFN agent containers |

### Policy Examples

#### Backend Team Policy

```hcl
# Read database credentials
path "secret/data/database/*" {
  capabilities = ["read", "list"]
}

# Read API keys
path "secret/data/api-keys/*" {
  capabilities = ["read"]
}

# Use transit encryption
path "transit/encrypt/cfn-encryption-key" {
  capabilities = ["update"]
}
```

#### Agent Policy

```hcl
# Read API keys for agent operations
path "secret/data/api-keys/*" {
  capabilities = ["read"]
}

# Sign JWTs
path "transit/sign/cfn-jwt-signing-key" {
  capabilities = ["update"]
}
```

### Using Policies

```bash
# Create a token with specific policy
vault token create -policy=cfn-backend-team -ttl=8h

# List policies
vault policy list

# Read policy definition
vault policy read cfn-backend-team

# Test policy access
VAULT_TOKEN=$(cat .vault-token-backend) vault kv get secret/database/postgres
```

## Secret Management

### Creating Secrets

```bash
# Create API key
vault kv put secret/api-keys/anthropic \
  key="sk-ant-..." \
  provider="anthropic" \
  tier="production" \
  rotation_days=90

# Create database credentials
vault kv put secret/database/postgres \
  username="cfn_user" \
  password="secure-password" \
  host="postgres" \
  port=5432 \
  database="cfn_loop"
```

### Reading Secrets

```bash
# Read entire secret
vault kv get secret/api-keys/anthropic

# Read specific field
vault kv get -field=key secret/api-keys/anthropic

# Read as JSON
vault kv get -format=json secret/api-keys/anthropic

# Using helper script
./scripts/vault/secrets-fetch.sh --path secret/api-keys/anthropic --format env
```

### Updating Secrets

```bash
# Update specific field (preserves other fields)
vault kv patch secret/api-keys/anthropic key="new-key"

# Replace entire secret
vault kv put secret/api-keys/anthropic \
  key="new-key" \
  provider="anthropic" \
  tier="production"
```

### Deleting Secrets

```bash
# Delete latest version (recoverable)
vault kv delete secret/api-keys/test-key

# Delete specific version
vault kv delete -versions=2,3 secret/api-keys/test-key

# Permanently destroy version
vault kv destroy -versions=1 secret/api-keys/test-key

# Permanently destroy all versions
vault kv metadata delete secret/api-keys/test-key
```

### Secret Versioning

```bash
# List all versions
vault kv metadata get secret/api-keys/anthropic

# Read specific version
vault kv get -version=2 secret/api-keys/anthropic

# Undelete a version
vault kv undelete -versions=3 secret/api-keys/anthropic
```

## Rotation Strategies

### Automated Rotation

```bash
# Rotate API key (auto-generates new value)
./scripts/vault/secrets-rotate.sh --type api-key --path secret/api-keys/anthropic

# Rotate database password
./scripts/vault/secrets-rotate.sh --type database --path secret/database/postgres

# Rotate transit encryption key
./scripts/vault/secrets-rotate.sh --type transit --path transit/keys/cfn-encryption-key

# Dry run to preview changes
./scripts/vault/secrets-rotate.sh --type api-key --path secret/api-keys/zai --dry-run
```

### Rotation Schedule

| Secret Type | Rotation Interval | Automated |
|------------|------------------|-----------|
| API Keys | 90 days | Yes |
| Database Passwords | 30 days | Yes |
| JWT Secrets | 90 days | Yes |
| TLS Certificates | 30 days before expiry | Manual |
| Transit Keys | 180 days | Yes |
| Webhook Secrets | 180 days | Yes |

### Cron Jobs

```bash
# Add to crontab for automated rotation
# Rotate API keys monthly
0 0 1 * * /path/to/scripts/vault/secrets-rotate.sh --type api-key --path secret/api-keys/anthropic

# Rotate database passwords weekly
0 2 * * 0 /path/to/scripts/vault/secrets-rotate.sh --type database --path secret/database/postgres

# Rotate transit keys quarterly
0 0 1 */3 * /path/to/scripts/vault/secrets-rotate.sh --type transit --path transit/keys/cfn-encryption-key
```

## Production Deployment

### Storage Backend Configuration

Replace dev mode with persistent storage:

```hcl
# config/vault/vault.hcl
storage "raft" {
  path = "/vault/data"
  node_id = "vault-1"

  retry_join {
    leader_api_addr = "https://vault-1:8200"
  }

  retry_join {
    leader_api_addr = "https://vault-2:8200"
  }
}

listener "tcp" {
  address = "0.0.0.0:8200"
  tls_cert_file = "/vault/certs/vault.crt"
  tls_key_file = "/vault/certs/vault.key"
}

seal "awskms" {
  region = "us-east-1"
  kms_key_id = "arn:aws:kms:us-east-1:123456789012:key/12345678-1234-1234-1234-123456789012"
}

api_addr = "https://vault-1.example.com:8200"
cluster_addr = "https://vault-1.example.com:8201"
```

### High Availability

```yaml
# docker-compose.vault-ha.yml
services:
  vault-1:
    image: hashicorp/vault:1.15
    volumes:
      - vault-data-1:/vault/data
      - ./config/vault:/vault/config:ro
    command: server -config=/vault/config/vault.hcl

  vault-2:
    image: hashicorp/vault:1.15
    volumes:
      - vault-data-2:/vault/data
      - ./config/vault:/vault/config:ro
    command: server -config=/vault/config/vault.hcl

  vault-3:
    image: hashicorp/vault:1.15
    volumes:
      - vault-data-3:/vault/data
      - ./config/vault:/vault/config:ro
    command: server -config=/vault/config/vault.hcl
```

### TLS Configuration

```bash
# Generate TLS certificates
openssl req -x509 -newkey rsa:4096 -nodes \
  -keyout vault.key \
  -out vault.crt \
  -days 365 \
  -subj "/CN=vault.example.com"

# Update Docker Compose
volumes:
  - ./certs/vault.crt:/vault/certs/vault.crt:ro
  - ./certs/vault.key:/vault/certs/vault.key:ro
```

### Auto-Unseal

```hcl
# AWS KMS
seal "awskms" {
  region = "us-east-1"
  kms_key_id = "arn:aws:kms:..."
}

# Azure Key Vault
seal "azurekeyvault" {
  tenant_id = "..."
  client_id = "..."
  client_secret = "..."
  vault_name = "..."
  key_name = "..."
}

# GCP Cloud KMS
seal "gcpckms" {
  project = "my-project"
  region = "us-east1"
  key_ring = "vault"
  crypto_key = "vault-key"
}
```

### Backup Strategy

```bash
# Backup Vault data (Raft storage)
vault operator raft snapshot save vault-backup.snap

# Restore from backup
vault operator raft snapshot restore vault-backup.snap

# Automated backup script
#!/bin/bash
BACKUP_DIR="/backups/vault"
DATE=$(date +%Y%m%d-%H%M%S)
vault operator raft snapshot save "$BACKUP_DIR/vault-$DATE.snap"

# Retention: keep last 30 days
find "$BACKUP_DIR" -name "vault-*.snap" -mtime +30 -delete
```

## Troubleshooting

### Common Issues

#### Vault Sealed

```bash
# Check status
vault status

# Unseal Vault (requires 3 of 5 keys)
vault operator unseal <key1>
vault operator unseal <key2>
vault operator unseal <key3>
```

#### Authentication Failed

```bash
# Verify token is valid
vault token lookup

# Renew token
vault token renew

# Create new token
vault token create -policy=cfn-agent
```

#### Permission Denied

```bash
# Check token capabilities
vault token capabilities secret/data/api-keys/anthropic

# Test policy
vault policy read cfn-backend-team

# Create new token with correct policy
vault token create -policy=cfn-backend-team
```

#### Connection Refused

```bash
# Check Vault is running
docker ps | grep vault

# Check logs
docker logs cfn-vault

# Verify network
curl http://localhost:8200/v1/sys/health
```

### Debug Mode

```bash
# Enable debug logging
export VAULT_LOG_LEVEL=debug

# Run with verbose output
vault kv get -format=json secret/api-keys/anthropic | jq .
```

### Audit Logs

```bash
# View audit logs
docker exec cfn-vault cat /vault/audit/audit.log | jq .

# Filter by operation
docker exec cfn-vault cat /vault/audit/audit.log | jq 'select(.request.operation=="read")'

# Filter by path
docker exec cfn-vault cat /vault/audit/audit.log | jq 'select(.request.path | contains("api-keys"))'
```

## Security Best Practices

### 1. Token Management

- **Never commit tokens to git** - Add `.vault-token*` to `.gitignore`
- **Use short-lived tokens** - Set appropriate TTL (1h-24h)
- **Enable token renewal** - For long-running processes
- **Revoke unused tokens** - Regular cleanup

```bash
# Create short-lived token
vault token create -policy=cfn-agent -ttl=1h

# Revoke token
vault token revoke <token>

# Revoke all tokens for a policy
vault token revoke -mode=path auth/token/create/cfn-agent
```

### 2. Secret Access

- **Principle of least privilege** - Grant minimal required access
- **Audit secret access** - Enable and monitor audit logs
- **Rotate secrets regularly** - Follow rotation schedule
- **Encrypt sensitive data** - Use transit engine for additional encryption

### 3. Network Security

- **TLS everywhere** - Use TLS in production
- **Restrict network access** - Firewall rules, VPC isolation
- **Service mesh** - mTLS for service-to-service communication

### 4. Monitoring

```bash
# Monitor Vault health
curl http://localhost:8200/v1/sys/health

# Monitor metrics (requires telemetry)
curl http://localhost:8200/v1/sys/metrics

# Set up alerts for:
# - Vault seal status
# - Failed authentication attempts
# - Unusual access patterns
# - Token expiration
```

### 5. Disaster Recovery

- **Regular backups** - Automated snapshots (daily)
- **Test restore procedures** - Monthly DR drills
- **Geographic redundancy** - Multi-region deployment
- **Documented recovery plan** - Clear runbook

## Additional Resources

- **Official Vault Documentation**: https://developer.hashicorp.com/vault/docs
- **Vault API Reference**: https://developer.hashicorp.com/vault/api-docs
- **Security Hardening Guide**: https://developer.hashicorp.com/vault/tutorials/operations/production-hardening
- **High Availability Guide**: https://developer.hashicorp.com/vault/docs/concepts/ha

## Support

For issues or questions:

1. Check [Troubleshooting](#troubleshooting) section
2. Review audit logs for errors
3. Consult official Vault documentation
4. Contact DevOps team

---

**Version History:**

- 1.0.0 (2025-11-24): Initial implementation with KV v2, Transit, and team policies
