# Cloud Container Pricing - Quick Reference (January 2025)

## One-Page Comparison

### Serverless Container (Pay-per-Second)

| Provider | Service | CPU/vCPU-sec | Memory/GiB-sec | Request Fee | Auto-Scale to Zero | Free Tier Value |
|----------|---------|--------------|-----------------|-------------|-------------------|-----------------|
| AWS | Fargate | $0.0000090 | $0.00000099 | Included | Yes | None ($38/mo) |
| Google | Cloud Run | $0.000024 | $0.0000025 | $0.40/M | Yes | **$4.32/mo** |
| Azure | Container Apps | $0.000012 | $0.00000015 | $0.40/M | Yes | **$1.80/mo** |

**Best for:** Startups, variable workloads, cost optimization
**Winner:** Google Cloud Run (aggressive free tier)

---

### Managed Kubernetes (Cluster-Based)

| Provider | Service | Monthly Cluster Fee | Billing Model | Enterprise Tier | Best Feature |
|----------|---------|---------------------|----------------|-----------------|--------------|
| AWS | EKS | $72 | Hourly (14mo std, then $432) | No | Widest integrations |
| Google | GKE | $72 | Hourly (with free tier credit) | +$0.00822/vCPU/hr | Free tier covers cost |
| Azure | AKS | $0-432 | Tiered (Free/Standard/Premium) | Premium ($432) | Free tier available |
| DigitalOcean | DOKS | $0 | Per-droplet (fixed) | N/A | Simplest pricing |

**Best for:** Complex deployments, multi-tenant, custom networking
**Winner:** DigitalOcean (no cluster fee, predictable)

---

### Compute Cost Examples (Always-On, Monthly)

**2 vCPU + 4 GB Memory:**
| Provider | Service | Monthly Cost | Notes |
|----------|---------|--------------|-------|
| AWS | Fargate | $82 | $26.39 (vCPU) + $11.72 (mem) + others |
| Google | Cloud Run | $155 | $70.36 (vCPU) + $29.32 (mem) |
| Azure | Container Apps | $37-48 | Consumption plan varies by region |
| DO | Kubernetes | $63-73 | 1 × 8GB droplet + cluster |

---

### Load Balancer Costs (Monthly)

| Provider | Service | Base Cost | Data Processing | Total (typical) |
|----------|---------|-----------|-----------------|-----------------|
| AWS | ALB | ~$16 | $0.008-0.012/GB | $165+ with traffic |
| Google | GCLB | ~$18 | $0.008-0.012/GB | $180+ with traffic |
| Azure | Std LB | $234 | Rule-based | $234+ |
| DO | LB | $10 | Included | **$10** |

**Alert:** Data processing often exceeds hourly charges; 10TB egress = $80-120 additional

---

### Data Egress Costs (Per GB to Internet)

| Provider | Rate | Free/Month | Notes |
|----------|------|-----------|-------|
| AWS | $0.09 | 100 GB | 10-50 TB: $0.085 |
| Google | $0.12 (Tier 1) | None | $0.11 (1-10TB), $0.08 (10+TB) |
| Azure | $0.087 | 100 GB | $0.083 (10-40TB) |
| DO | Included | 2000 GiB/node | Pay $0.01/GB overage |

**Example:** 500 GB/month = $45 (AWS) vs $60 (GCP) vs $43.50 (Azure)

---

### Monitoring & Logging Costs

| Provider | Logs Ingestion | Logs Storage | Metrics | Free Value |
|----------|-----------------|--------------|---------|------------|
| AWS CloudWatch | $0.50/GB | $0.03/GB/mo | $0.30/metric | $2.50/mo |
| GCP Cloud Logging | $0.50/GB | $0.01/GB/mo | $0.2580/MiB | $25/mo (50GB) |
| Azure Monitor | $2.99+/GB | Included (31d) | Included | Varies |
| DO | 3rd party | 3rd party | 3rd party | $0 |

---

## Scenario Cost Summary (Monthly)

### Scenario 1: Small Project (1 app, 2 vCPU, 4 GB, 50 GB egress, 100 requests/mo)

| Provider | Compute | LB | Egress | Monitor | Total |
|----------|---------|-----|--------|---------|-------|
| **Cloud Run** | Free* | N/A | Free | $5 | **~$5** |
| **Container Apps** | Free* | N/A | Free | $3 | **~$3** |
| Fargate | $38 | $165 | $4.50 | $10 | $217.50 |
| EKS | $72+ | $165 | $4.50 | $15 | $256.50+ |

*Within free tier | **Best:** Azure Container Apps

---

### Scenario 2: Medium Business (2 apps, 4 vCPU, 8 GB, 500 GB egress, 5K requests/mo)

| Provider | Compute | LB | Egress | Monitor | Total |
|----------|---------|-----|--------|---------|-------|
| **Fargate (ECS)** | $152 | $170 | $45 | $40 | **$407** |
| **GKE** | $300 | $185 | $60 | $30 | **$575** |
| **AKS** | $300 | $234 | $43.50 | $30 | **$607.50** |
| DOKS (4 nodes) | $252 | $10 | Incl | $50 | **$312** |

**Best:** DigitalOcean (simplest, lowest cost for this scale)

---

### Scenario 3: Enterprise (Multi-region, 3 × [8 vCPU, 16 GB], 15 TB egress/mo)

| Provider | Clusters | Compute | LB | Egress | Database | Monitor | Total |
|----------|----------|---------|-----|--------|----------|---------|--------|
| **AWS** | $216 | $2700 | $645 | $1350 | $2400 | $150 | **$7,461** |
| **GCP** | $216 | $2700 | $330 | $1800 | $2100 | $100 | **$7,246** |
| **Azure** | $216 | $2700 | $702 | $1305 | $2400 | $200 | **$7,523** |
| DO (single region) | N/A | $1200 | $10 | Incl | $300 | $100 | **$1,610** |

**Note:** DO not viable for multi-region; AWS/GCP competitive for enterprise

---

## Decision Trees

### Which Service Should I Use?

```
START
├─ Need Kubernetes features?
│  ├─ YES → GKE or EKS?
│  │  ├─ Cost sensitive? → GKE ($72/mo cluster)
│  │  └─ Feature rich? → EKS
│  └─ NO → Serverless?
│     ├─ YES → Google Cloud Run or Azure Container Apps
│     └─ NO → EC2/Compute instances
```

### Cost Optimization Path

```
START
├─ Workload constant 24/7?
│  ├─ YES → Reserved instances (25-50% savings)
│  └─ NO → Serverless auto-scale to zero
├─ Have strict SLA requirement?
│  ├─ YES → Managed Kubernetes + HA
│  └─ NO → Simple containers
├─ Multi-region needed?
│  ├─ YES → AWS/GCP infrastructure
│  └─ NO → Any provider or DigitalOcean
└─ Complex networking?
   ├─ YES → AWS (most mature)
   └─ NO → GCP (better pricing)
```

---

## Pricing Tiers Explained

### Always-On Compute (Hourly Billing)

**Good for:** Constant workloads with consistent demand
**Providers:** EC2, GCE, Azure VMs, DigitalOcean Droplets

- AWS EC2: $0.01-0.20/hour (varies by type)
- GCP Compute: $0.01-0.15/hour
- Azure VM: $0.01-0.20/hour
- DO Droplet: $0.00744-0.357/hour

**Savings:** Reserved instances 25-50%, Spot/Preemptible 70%

---

### Per-Second Compute (Serverless Billing)

**Good for:** Bursty workloads, variable demand, scales to zero

- AWS Fargate: $0.0000090/vCPU-second
- Google Cloud Run: $0.000024/vCPU-second
- Azure Container Apps: $0.000012/vCPU-second

**Break-even:** CloudRun cost = always-on at ~3-5 hours/day usage

---

### Per-Request Compute (Function Billing)

**Good for:** Infrequent, short-duration tasks
**Providers:** AWS Lambda, Google Cloud Functions, Azure Functions

- AWS Lambda: $0.20/1M requests + $0.0000167/vCPU-second
- GCP Functions: $0.40/1M requests + compute
- Azure Functions: $0.20/1M requests + compute

---

## Regional Price Variations

**Cheapest Regions (US):**
- AWS: US East (N.VA), US West (Oregon) - baseline
- GCP: US multi-region - baseline
- Azure: East US - baseline
- DO: New York 1, San Francisco 2

**Most Expensive (Asia-Pacific):**
- Tokyo: +30-50% premium
- Singapore: +25-35% premium
- Sydney: +20-30% premium

**Recommendation:** Use cheapest region unless latency-critical

---

## Hidden Costs Checklist

- [ ] Load balancer data processing (often biggest surprise)
- [ ] Cross-region data transfer ($0.02/GB typically)
- [ ] Logging/monitoring at scale (can exceed compute costs)
- [ ] Reserved IPs if using static IPs ($0.005-0.03/hr each)
- [ ] NAT Gateway egress ($0.045/GB for AWS)
- [ ] Managed databases (often 2-3x more than self-managed)
- [ ] Backup/snapshots ($0.05-0.10/GB/month)
- [ ] Managed Kubernetes cluster fee (mandatory $72+)
- [ ] Premium support (15-25% of infrastructure costs)

---

## Cost Reduction Quick Wins

1. **Serverless instead of always-on:** 40-60% savings for variable workloads
2. **Spot/Preemptible instances:** 70% savings (with interrupt tolerance)
3. **Reserved instances/Commitments:** 25-50% savings (1-3 year lock-in)
4. **Right-size resources:** 20-30% savings by matching actual usage
5. **Log sampling:** 50-70% savings on logging costs
6. **Collocate resources:** Reduce cross-region transfer
7. **Use dedicated load balancer:** DigitalOcean $10 vs AWS $165
8. **Cache aggressively:** Reduce database queries, egress
9. **Delete unused resources:** Orphaned disks, snapshots, IPs
10. **Negotiate volume discounts:** Enterprise programs available

---

## Commitment Tier Savings

| Provider | 1-Year | 3-Year | Minimum | Best For |
|----------|--------|--------|---------|----------|
| AWS Savings Plans | 20-40% | 40-60% | $0.01/hour | Fargate, EC2 blended |
| GCP Committed | 20-25% | 30-40% | Varies | GCE, GKE |
| Azure Reserved | 30% | 30-50% | Varies | VMs, databases |
| Azure Commit | 30% | 30-55% | 100GB/day | Log Analytics, Cache |

**ROI:** 6-12 months typical for committed workloads

---

## When Each Provider Wins

| Scenario | Winner | Reason |
|----------|--------|--------|
| Tiny startup | Cloud Run | Free tier covers months of usage |
| Variable workload | Cloud Run | Best serverless pricing |
| Fixed workload | DigitalOcean | Simplest, lowest cost |
| Kubernetes required | GKE | $72 cluster fee, good pricing |
| Multi-region HA | AWS | Best infrastructure and options |
| Microsoft ecosystem | Azure | Native Windows, AD integration |
| Cost sensitive | GCP | Aggressive pricing cuts |
| Feature rich | AWS | Most services and options |

---

## Pricing as of January 2025

**Note:** Prices subject to change; verify with official calculators:
- AWS: calculator.aws/
- GCP: cloud.google.com/products/calculator
- Azure: azure.microsoft.com/pricing/calculator/
- DO: digitalocean.com/pricing/calculator

---

**Document Version:** 1.0
**Last Updated:** January 13, 2025
**Confidence Score:** 0.88
**Next Review:** April 2025
