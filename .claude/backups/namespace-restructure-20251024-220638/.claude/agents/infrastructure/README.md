# Infrastructure

DevOps, deployment, and infrastructure management agents.

## Active Agents (1)

**DevOps:**
- `devops-engineer.md` - Infrastructure automation, CI/CD, deployment

## Purpose

Infrastructure agents handle:
- CI/CD pipeline setup
- Deployment automation
- Infrastructure as Code (IaC)
- Container orchestration
- Monitoring and logging
- Performance optimization
- Security hardening

## Responsibilities

**Build & Deploy:**
- Configure build pipelines
- Automate deployments
- Manage environments
- Handle rollbacks

**Infrastructure:**
- Provision resources
- Configure networking
- Manage secrets
- Set up monitoring

**Operations:**
- Monitor performance
- Debug production issues
- Optimize costs
- Ensure reliability

## Usage Pattern

**Pipeline Setup:**
```bash
npx claude-flow-novice agent-spawn devops-engineer \
  --task-id "cicd-setup" \
  --prompt "Set up CI/CD pipeline for Node.js application"
```

**Deployment:**
```bash
npx claude-flow-novice agent-spawn devops-engineer \
  --task-id "deploy-prod" \
  --prompt "Deploy application to production"
```

**Infrastructure:**
```bash
npx claude-flow-novice agent-spawn devops-engineer \
  --task-id "infra-setup" \
  --prompt "Set up Kubernetes cluster with monitoring"
```

## Tools & Technologies

Infrastructure agents work with:
- Docker & Kubernetes
- GitHub Actions, GitLab CI
- Terraform, CloudFormation
- AWS, Azure, GCP
- Monitoring: Prometheus, Grafana
- Logging: ELK, Splunk

## Best Practices

Infrastructure agents follow:
- Infrastructure as Code
- Immutable deployments
- Zero-downtime releases
- Automated testing
- Security hardening
- Cost optimization

## Deliverables

Infrastructure agents create:
- CI/CD pipeline configurations
- Infrastructure code (Terraform, etc.)
- Deployment scripts
- Monitoring dashboards
- Runbooks and documentation
- Security configurations

## Collaboration

Works with:
- **Developers:** Understand deployment needs
- **Security:** Implement security controls
- **Planners:** Design infrastructure architecture
- **Testers:** Set up test environments
