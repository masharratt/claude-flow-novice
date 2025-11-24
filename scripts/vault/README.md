# Vault Integration Scripts

Quick reference for HashiCorp Vault integration scripts.

## Scripts Overview

| Script | Purpose | Usage |
|--------|---------|-------|
| `init-vault.sh` | Initialize Vault and create root token | `./scripts/vault/init-vault.sh` |
| `setup-secrets-engine.sh` | Configure KV v2 and Transit engines | `./scripts/vault/setup-secrets-engine.sh` |
| `create-policies.sh` | Create team isolation policies | `./scripts/vault/create-policies.sh` |
| `secrets-fetch.sh` | Fetch secrets from Vault | `./scripts/vault/secrets-fetch.sh --path secret/api-keys/anthropic` |
| `secrets-rotate.sh` | Rotate secrets and encryption keys | `./scripts/vault/secrets-rotate.sh --type api-key --path secret/api-keys/anthropic` |

## Quick Start

```bash
# 1. Start Vault container
docker-compose -f docker-compose.vault.yml up -d

# 2. Initialize Vault
./scripts/vault/init-vault.sh

# 3. Setup secrets engines
./scripts/vault/setup-secrets-engine.sh

# 4. Create policies
./scripts/vault/create-policies.sh

# 5. Export credentials
export VAULT_ADDR=http://localhost:8200
export VAULT_TOKEN=$(cat .vault-token)

# 6. Fetch a secret
./scripts/vault/secrets-fetch.sh --path secret/api-keys/anthropic --format env
```

## Common Operations

### Create a Secret

```bash
vault kv put secret/api-keys/new-provider \
  key="your-api-key" \
  provider="provider-name" \
  tier="production" \
  rotation_days=90
```

### Read a Secret

```bash
# Full secret
vault kv get secret/api-keys/anthropic

# Specific field
vault kv get -field=key secret/api-keys/anthropic

# JSON format
vault kv get -format=json secret/api-keys/anthropic
```

### Rotate a Secret

```bash
# API key
./scripts/vault/secrets-rotate.sh --type api-key --path secret/api-keys/anthropic

# Database password
./scripts/vault/secrets-rotate.sh --type database --path secret/database/postgres

# Transit key
./scripts/vault/secrets-rotate.sh --type transit --path transit/keys/cfn-encryption-key

# Dry run
./scripts/vault/secrets-rotate.sh --type api-key --path secret/api-keys/zai --dry-run
```

### Encrypt/Decrypt Data

```bash
# Encrypt
echo -n "sensitive-data" | base64 -w 0 | \
  vault write -field=ciphertext transit/encrypt/cfn-encryption-key plaintext=-

# Decrypt
vault write -field=plaintext transit/decrypt/cfn-encryption-key \
  ciphertext="vault:v1:..." | base64 -d
```

### Token Management

```bash
# Create token with policy
vault token create -policy=cfn-backend-team -ttl=8h

# Renew token
vault token renew

# Revoke token
vault token revoke <token>
```

## Environment Variables

```bash
# Vault server address
export VAULT_ADDR=http://localhost:8200

# Vault authentication token
export VAULT_TOKEN=$(cat .vault-token)

# Vault namespace (Enterprise only)
export VAULT_NAMESPACE=

# TLS configuration (production)
export VAULT_CACERT=/path/to/ca.crt
export VAULT_CLIENT_CERT=/path/to/client.crt
export VAULT_CLIENT_KEY=/path/to/client.key
```

## Team Policies

| Policy | Access | Use Case |
|--------|--------|----------|
| `cfn-admin` | Full access | SRE team, platform admins |
| `cfn-backend-team` | Database + API keys | Backend developers |
| `cfn-frontend-team` | Public API keys | Frontend developers |
| `cfn-devops-team` | Infrastructure secrets | DevOps engineers |
| `cfn-cicd` | Deployment credentials | CI/CD pipelines |
| `cfn-readonly` | Audit only | Security team |
| `cfn-agent` | Limited runtime | CFN agents |

## Troubleshooting

### Vault Sealed

```bash
vault status
# If sealed, unseal with 3 of 5 keys
vault operator unseal <key1>
vault operator unseal <key2>
vault operator unseal <key3>
```

### Authentication Failed

```bash
# Verify token
vault token lookup

# Renew token
vault token renew

# Create new token
vault token create -policy=cfn-agent
```

### Permission Denied

```bash
# Check token capabilities
vault token capabilities secret/data/api-keys/anthropic

# View policy
vault policy read cfn-backend-team
```

## Testing

```bash
# Run integration tests
bash ./tests/security/test-vault-integration.sh

# Expected: 18/18 tests passing (100%)
```

## Documentation

- **Complete Guide:** `docs/VAULT_INTEGRATION_GUIDE.md`
- **Implementation Summary:** `docs/PHASE_6_3_VAULT_IMPLEMENTATION_SUMMARY.md`
- **Docker Compose:** `docker-compose.vault.yml`

## Support

- Official Vault Docs: https://developer.hashicorp.com/vault/docs
- Vault API: https://developer.hashicorp.com/vault/api-docs
- Internal: DevOps team via Slack #vault-support
