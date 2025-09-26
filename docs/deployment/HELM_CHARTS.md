# Helm Charts - Claude Flow Novice

## Overview

Production-ready Helm charts for deploying Claude Flow Novice with comprehensive configuration options, security policies, and multi-environment support.

## Table of Contents
1. [Chart Structure](#chart-structure)
2. [Values Configuration](#values-configuration)
3. [Templates](#templates)
4. [Multi-Environment Deployment](#multi-environment-deployment)
5. [Security & RBAC](#security--rbac)
6. [Monitoring Integration](#monitoring-integration)
7. [Backup & Restore](#backup--restore)

---

## Chart Structure

```
helm/claude-flow-novice/
├── Chart.yaml                 # Chart metadata
├── values.yaml               # Default values
├── values-production.yaml    # Production overrides
├── values-staging.yaml       # Staging overrides
├── values-development.yaml   # Development overrides
├── templates/
│   ├── deployment.yaml       # Main application deployment
│   ├── service.yaml          # Service definition
│   ├── ingress.yaml          # Ingress configuration
│   ├── configmap.yaml        # Configuration
│   ├── secret.yaml           # Secrets
│   ├── serviceaccount.yaml   # Service account
│   ├── rbac.yaml             # RBAC policies
│   ├── hpa.yaml              # Horizontal Pod Autoscaler
│   ├── pdb.yaml              # Pod Disruption Budget
│   ├── networkpolicy.yaml    # Network policies
│   ├── monitoring/
│   │   ├── servicemonitor.yaml # Prometheus ServiceMonitor
│   │   ├── prometheusrule.yaml # Alert rules
│   │   └── grafana-dashboard.yaml # Grafana dashboard
│   ├── database/
│   │   ├── postgres.yaml     # PostgreSQL deployment
│   │   ├── redis.yaml        # Redis deployment
│   │   └── migrations.yaml   # Database migrations job
│   └── _helpers.tpl          # Template helpers
├── charts/                   # Subchart dependencies
├── crds/                     # Custom Resource Definitions
└── tests/                    # Helm tests
    ├── test-connection.yaml
    └── test-api.yaml
```

### Chart.yaml

```yaml
# helm/claude-flow-novice/Chart.yaml
apiVersion: v2
name: claude-flow-novice
description: A Helm chart for Claude Flow Novice - AI agent orchestration platform
type: application
version: 1.0.0
appVersion: "1.0.0"
home: https://github.com/masharratt/claude-flow-novice
sources:
  - https://github.com/masharratt/claude-flow-novice
maintainers:
  - name: Claude Flow Team
    email: team@claude-flow.dev
keywords:
  - ai
  - claude
  - agents
  - orchestration
  - automation

dependencies:
  - name: postgresql
    version: 12.12.10
    repository: https://charts.bitnami.com/bitnami
    condition: postgresql.enabled
  - name: redis
    version: 18.1.5
    repository: https://charts.bitnami.com/bitnami
    condition: redis.enabled
  - name: prometheus
    version: 25.6.0
    repository: https://prometheus-community.github.io/helm-charts
    condition: monitoring.prometheus.enabled
  - name: grafana
    version: 7.0.3
    repository: https://grafana.github.io/helm-charts
    condition: monitoring.grafana.enabled

annotations:
  category: Application
  licenses: MIT