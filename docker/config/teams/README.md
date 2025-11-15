# Team Configuration Files

This directory contains team configuration templates for CFN Docker infrastructure.

## Available Teams

| Team | Config File | Memory | CPU | Max Agents | Disk | Purpose |
|------|-------------|--------|-----|------------|------|---------|
| SEO | `seo.yaml` | 12GB | 4 | 5 | 50GB | Content generation, keyword optimization |
| Marketing | `marketing.yaml` | 10GB | 3 | 4 | 40GB | Email campaigns, analytics |
| Frontend | `frontend.yaml` | 12GB | 4 | 5 | 50GB | React/TypeScript development, UI testing |
| Backend | `backend.yaml` | 16GB | 5 | 6 | 100GB | API development, database operations |
| DevOps | `devops.yaml` | 12GB | 4 | 4 | 75GB | Infrastructure, CI/CD, deployments |
| QA | `qa.yaml` | 10GB | 3 | 4 | 50GB | Testing, load testing, security scanning |
| C-Suite | `csuite.yaml` | 8GB | 2 | 3 | 30GB | Executive analytics, reporting |

**Total Resources:** 80GB memory, 25 CPU cores, 31 max agents, 395GB disk

## Usage

### Provisioning a Team

```bash
./docker/scripts/provision-team.sh \
  --config docker/config/teams/seo.yaml \
  --create-workspace \
  --create-network \
  --spawn-redis \
  --spawn-coordinator
```

### Deprovisioning a Team

```bash
./docker/scripts/deprovision-team.sh --team seo
```

### Validating Configuration

```bash
# Check YAML syntax
yamllint docker/config/teams/seo.yaml

# Validate against schema
./docker/scripts/validate-team-config.sh docker/config/teams/seo.yaml
```

## Configuration Schema

```yaml
team:
  id: string                    # Unique identifier (lowercase, no spaces)
  name: string                  # Human-readable name
  description: string           # Team purpose

  workspace:
    path: string                # Absolute workspace path
    disk_quota: string          # Disk quota (e.g., "50GB")

  resources:
    memory: string              # Memory budget (e.g., "12GB")
    cpu_cores: integer          # CPU core allocation
    max_agents: integer         # Maximum concurrent agents

  allowed_skills:
    - string                    # List of allowed skill directories

  network:
    subnet_id: integer          # Subnet ID (1-7)
    coordinator_ip: string      # Team coordinator IP (172.18.0.11-17)
```

## Network Allocation

| Subnet ID | CIDR | Team | Coordinator IP |
|-----------|------|------|----------------|
| 1 | 172.18.1.0/24 | Frontend | 172.18.0.11 |
| 2 | 172.18.2.0/24 | Backend | 172.18.0.12 |
| 3 | 172.18.3.0/24 | DevOps | 172.18.0.13 |
| 4 | 172.18.4.0/24 | QA | 172.18.0.14 |
| 5 | 172.18.5.0/24 | SEO | 172.18.0.15 |
| 6 | 172.18.6.0/24 | Marketing | 172.18.0.16 |
| 7 | 172.18.7.0/24 | C-Suite | 172.18.0.17 |

## Adding a New Team

1. Copy an existing config file
2. Update team ID, name, description
3. Allocate unique subnet_id (8+)
4. Allocate unique coordinator_ip (172.18.0.18+)
5. Define allowed_skills based on team needs
6. Adjust resource budgets as needed
7. Update total resource calculations in docs

## Related Documentation

- [Team Provisioning Guide](../docs/SPARC/CFN_DOCKER_TEAM_PROVISIONING_GUIDE.md)
- [Organizational Architecture](../docs/SPARC/CFN_DOCKER_ORGANIZATIONAL_ARCHITECTURE.md)
- [Requirements Specification](../docs/SPARC/CFN_DOCKER_INFRASTRUCTURE_REQUIREMENTS_SPEC.md)
