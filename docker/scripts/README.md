# CFN Docker Scripts

Automation scripts for CFN Docker infrastructure management.

## Available Scripts

### Network Management

#### `create-networks.sh`
Create all 8 CFN Docker networks (1 coordination + 7 team networks).

```bash
# Create all networks
./docker/scripts/create-networks.sh

# Dry run (show what would be created)
./docker/scripts/create-networks.sh --dry-run
```

**Networks Created:**
- `cfn-coordination` (172.18.0.0/24) - Main + Team Coordinators
- `team-frontend` (172.18.1.0/24)
- `team-backend` (172.18.2.0/24)
- `team-devops` (172.18.3.0/24)
- `team-qa` (172.18.4.0/24)
- `team-seo` (172.18.5.0/24)
- `team-marketing` (172.18.6.0/24)
- `team-csuite` (172.18.7.0/24)

---

### Team Provisioning

#### `provision-team.sh`
Provision a complete team environment (workspace, network, Redis, coordinator).

```bash
# Full provisioning (all steps)
./docker/scripts/provision-team.sh \
  --config docker/config/teams/seo.yaml \
  --create-workspace \
  --create-network \
  --spawn-redis \
  --spawn-coordinator

# Dry run
./docker/scripts/provision-team.sh \
  --config docker/config/teams/seo.yaml \
  --create-workspace \
  --dry-run

# Partial provisioning (workspace + network only)
./docker/scripts/provision-team.sh \
  --config docker/config/teams/frontend.yaml \
  --create-workspace \
  --create-network
```

**Options:**
- `--config FILE` - Team configuration file (required)
- `--create-workspace` - Create workspace directory with skills
- `--create-network` - Create Docker network
- `--spawn-redis` - Spawn team Redis instance
- `--spawn-coordinator` - Spawn team coordinator
- `--skip-validation` - Skip config validation
- `--dry-run` - Show what would be done

**Provisions:**
1. Workspace directory (`/workspace/{team_id}`)
2. Allowed skills copied to workspace
3. Docker network (`team-{team_id}`)
4. Team Redis instance
5. PostgreSQL team registration
6. Team coordinator container
7. Firewall rules for isolation

---

#### `deprovision-team.sh`
Deprovision a team environment (stop containers, cleanup resources).

```bash
# Minimal deprovision (preserve workspace)
./docker/scripts/deprovision-team.sh --team seo

# Archive workspace before cleanup
./docker/scripts/deprovision-team.sh \
  --team seo \
  --archive-workspace

# Full cleanup (remove everything)
./docker/scripts/deprovision-team.sh \
  --team seo \
  --remove-workspace \
  --remove-network \
  --remove-firewall \
  --force

# Dry run
./docker/scripts/deprovision-team.sh --team seo --dry-run
```

**Options:**
- `--team ID` - Team ID to deprovision (required)
- `--archive-workspace` - Archive workspace to /tmp
- `--remove-workspace` - Delete workspace (DESTRUCTIVE)
- `--remove-network` - Remove Docker network
- `--remove-firewall` - Remove firewall rules
- `--dry-run` - Show what would be done
- `--force` - Skip confirmation prompt

**Removes:**
1. Team coordinator container
2. All team agent containers
3. Team Redis instance
4. Database team record (marks inactive)
5. Workspace (if --remove-workspace)
6. Docker network (if --remove-network)
7. Firewall rules (if --remove-firewall)

---

### Validation

#### `validate-team-config.sh`
Validate a team configuration file against schema.

```bash
# Validate configuration
./docker/scripts/validate-team-config.sh docker/config/teams/seo.yaml
```

**Checks:**
- Required fields present
- Team ID format (lowercase alphanumeric)
- Subnet ID range (1-254)
- Coordinator IP in correct network
- Resource format (memory, CPU, agents)
- Skills configuration

**Exit Codes:**
- `0` - Validation passed
- `1` - Validation failed (errors found)

---

## Typical Workflows

### Initial Setup

```bash
# 1. Create all networks
./docker/scripts/create-networks.sh

# 2. Provision first team (SEO)
./docker/scripts/provision-team.sh \
  --config docker/config/teams/seo.yaml \
  --create-workspace \
  --create-network \
  --spawn-redis \
  --spawn-coordinator

# 3. Verify
docker ps | grep seo
docker logs cfn-docker-team-coordinator-seo
```

### Adding a New Team

```bash
# 1. Create team config
cp docker/config/teams/seo.yaml docker/config/teams/newteam.yaml
# Edit newteam.yaml

# 2. Validate config
./docker/scripts/validate-team-config.sh docker/config/teams/newteam.yaml

# 3. Provision team
./docker/scripts/provision-team.sh \
  --config docker/config/teams/newteam.yaml \
  --create-workspace \
  --create-network \
  --spawn-redis \
  --spawn-coordinator
```

### Removing a Team

```bash
# 1. Dry run to see what will be removed
./docker/scripts/deprovision-team.sh --team oldteam --dry-run

# 2. Deprovision (preserve workspace)
./docker/scripts/deprovision-team.sh --team oldteam

# 3. Verify
docker ps | grep oldteam  # Should be empty
```

---

## Requirements

### System Requirements
- Docker Engine 20.10+
- Bash 4.0+
- `yq` (for YAML parsing)
- `sudo` access (for workspace creation, firewall rules)

### Install yq

```bash
# macOS
brew install yq

# Linux
sudo wget -qO /usr/local/bin/yq https://github.com/mikefarah/yq/releases/latest/download/yq_linux_amd64
sudo chmod +x /usr/local/bin/yq
```

---

## Troubleshooting

### Script fails with "yq not found"
**Solution:** Install yq (see Requirements above)

### Workspace creation fails with permission error
**Solution:** Script needs sudo access for `/workspace/` directory

```bash
# Grant temporary sudo access
sudo -v
```

### Network already exists error
**Solution:** This is expected if network was created previously. Script will skip it.

### Coordinator won't start - image not found
**Solution:** Build coordinator image first (Phase 1 implementation)

```bash
# This will be implemented in Phase 1
docker build -f docker/Dockerfile.coordinator -t cfn-docker-team-coordinator:latest .
```

---

## Related Documentation

- [Team Provisioning Guide](../docs/SPARC/CFN_DOCKER_TEAM_PROVISIONING_GUIDE.md)
- [Organizational Architecture](../docs/SPARC/CFN_DOCKER_ORGANIZATIONAL_ARCHITECTURE.md)
- [Team Configuration Templates](../config/teams/)
