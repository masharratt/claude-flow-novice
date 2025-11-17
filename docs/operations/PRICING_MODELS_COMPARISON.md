# Cloud Pricing Models - Deep Dive Analysis

**Document Purpose:** Technical comparison of pricing models, cost drivers, and total cost of ownership (TCO) calculations

**Date:** January 2025

---

## Part 1: Pricing Model Types & Characteristics

### 1.1 Per-Second Serverless (Fargate, Cloud Run, Container Apps)

**How it Works:**
- Billing starts when container begins downloading image (Docker pull)
- Charged per vCPU-second and GB-second of memory allocated
- Minimum 1-minute billing increment (rounded up)
- Stops immediately when container terminates

**Cost Formula:**
```
Monthly Cost = (vCPU × Runtime Hours × 3600 seconds × vCPU Rate)
             + (Memory GB × Runtime Hours × 3600 seconds × Memory Rate)
             + (Egress GB × Egress Rate)
             + (Request Count × Request Rate)
```

**Example Calculation (Fargate, US East):**
- Container: 2 vCPU, 4 GB memory
- Monthly usage: 100 hours (total execution time)
- Egress: 50 GB
- Requests: 50,000

```
vCPU cost = 2 × 100 × 3600 × $0.00000899 = $6.48
Memory cost = 4 × 100 × 3600 × $0.0000009889 = $1.42
Egress cost = 50 × $0.09 = $4.50
Request cost = 0 (included)
Total = $12.40/month
```

**Advantages:**
- Only pay for actual runtime (no idle charges)
- Scales to zero automatically
- No cluster management overhead
- Perfect for bursty workloads

**Disadvantages:**
- Per-second billing increases with constant load
- Higher per-hour rates vs. reserved instances
- Cold starts can impact latency
- Complex cost tracking (multiple dimensions)

**Best For:** Startups, variable workloads, development/testing, event-driven applications

---

### 1.2 Instance-Based (Compute Instances, Droplets, EC2)

**How it Works:**
- Fixed hourly rate for compute instance type
- Running continuously regardless of actual workload
- Charged minimum 1 hour (sometimes partial in some regions)
- Owner responsible for resource allocation

**Cost Formula:**
```
Monthly Cost = (Instance Count × Hours/Month × Hourly Rate)
             + Storage costs
             + Egress costs
             + Data transfer costs
```

**Example Calculation (AWS EC2 t3.medium in US East):**
- Instance type: t3.medium (2 vCPU, 4 GB memory)
- Quantity: 2 instances
- Uptime: 730 hours/month (always-on)
- EBS storage: 100 GB general purpose
- Egress: 50 GB

```
Compute cost = 2 × 730 × $0.0416 = $60.74
Storage cost = 100 GB × $0.10/month = $10
Egress cost = 50 × $0.09 = $4.50
Elastic IP (if used) = $0.005 × 730 = $3.65
Total = $78.89/month
```

**Advantages:**
- Predictable, fixed monthly cost
- No "surprise" charges from scaling
- Better per-hour rates for always-on workloads
- Simple billing model

**Disadvantages:**
- Continuous charges even when idle
- Requires upfront capacity planning
- Over-provisioning = wasted money
- Under-provisioning = performance issues

**Best For:** Always-on services, web servers, databases, consistent workloads

---

### 1.3 Cluster-Based Kubernetes (EKS, GKE, AKS, DOKS)

**How it Works:**
- Fixed cluster management fee (except Azure Free, DigitalOcean)
- Node/instance costs (EC2, GCE, Azure VMs, Droplets)
- Flexible resource allocation within cluster
- Can mix on-demand and spot instances

**Cost Formula:**
```
Monthly Cost = Cluster Fee
             + (Node Count × Node Hourly Rate × Hours)
             + (Storage: PVC GB × Storage Rate)
             + (Load Balancer costs)
             + (Egress costs)
             + (Monitoring/Logging)
```

**Example Calculation (AWS EKS, 3-node cluster, US East):**
- Cluster fee: $0.10/hour = $73/month
- 3 × t3.large nodes (2 vCPU, 8 GB): $0.0832 × 730 = $60.74/node = $182.22
- EBS volumes (30 GB): 30 × $0.10 = $3/month
- Load balancer: $0.0225 × 730 = $16.43 + data processing
- Egress: 100 GB × $0.09 = $9

```
Total = $73 + $182.22 + $3 + $16.43 + $9 = $283.65/month
```

**Advantages:**
- Orchestration and scheduling built-in
- Portable across cloud providers
- Efficient bin-packing of containers
- Advanced networking capabilities

**Disadvantages:**
- Mandatory cluster fee even when unused
- Higher baseline cost than serverless
- Complexity in operations and maintenance
- Overkill for simple deployments

**Best For:** Complex multi-tenant deployments, microservices architectures, advanced networking, Kubernetes-specific tooling

---

### 1.4 Managed Kubernetes Autopilot (GKE Autopilot, Azure Container Apps)

**How it Works:**
- Cloud provider manages nodes automatically
- Pay per vCPU/memory actually requested by pods
- Combines Kubernetes with serverless billing model
- No manual node management

**Cost Formula:**
```
Monthly Cost = Per-Pod Billing (vCPU-seconds + Memory-seconds)
             + Per-Request charges
             + Storage/Egress
             + No explicit cluster fee
```

**Example Calculation (GKE Autopilot, US region):**
- 2 pods, each 1 vCPU + 2 GB memory
- Average uptime: 100 hours/month
- 50,000 requests/month
- Egress: 50 GB

```
Pod 1 vCPU = 1 × 100 × 3600 × $0.000024 = $8.64
Pod 1 Memory = 2 × 100 × 3600 × $0.0000025 = $1.80
Pod 2 (same) = $8.64 + $1.80 = $10.44
Requests = $0 (first 2M free)
Egress = 50 × $0.12 = $6
Total = $37.52/month (no cluster fee!)
```

**Advantages:**
- No cluster management fee
- Pay for actual requested resources (not allocated)
- Automatic scaling and node provisioning
- Serverless Kubernetes hybrid approach

**Disadvantages:**
- Slightly higher per-vCPU cost vs. manual nodes
- Limited control over node types
- Vendor lock-in (GCP/Azure specific)
- Still requires Kubernetes knowledge

**Best For:** Teams wanting Kubernetes without operations overhead, variable workload microservices

---

## Part 2: Cost Comparison Matrices

### 2.1 Compute Cost Comparison (Always-Running, US Region)

**Scenario:** 2 vCPU, 4 GB memory, continuously running

| Provider | Service | Monthly Cost | Annual | Cost/vCPU-hr | Notes |
|----------|---------|--------------|--------|--------------|-------|
| AWS | Fargate (100% uptime) | $190 | $2280 | $0.013 | If always running |
| AWS | EC2 t3.medium reserved | $30 | $360 | $0.0021 | 1-year commitment |
| AWS | EC2 t3.medium on-demand | $61 | $732 | $0.0416 | No commitment |
| GCP | Cloud Run (100% uptime) | $155 | $1860 | $0.011 | If always running |
| GCP | GCE n1-standard-2 reserved | $35 | $420 | $0.0024 | 1-year |
| GCP | GCE n1-standard-2 on-demand | $61 | $732 | $0.0416 | No commitment |
| Azure | Container Apps (100%) | $48 | $576 | $0.0033 | Consumption plan |
| Azure | VM (Standard_B2s) reserved | $32 | $384 | $0.0022 | 1-year |
| Azure | VM (Standard_B2s) on-demand | $65 | $780 | $0.0446 | No commitment |
| DO | Droplet (4GB) on-demand | $20 | $240 | $0.0137 | Simple fixed pricing |

**Key Insight:** Reserved instances 50-70% cheaper than on-demand; serverless costs same as on-demand if running 100% of time

---

### 2.2 Total Cost of Ownership (TCO) - Medium Scale (One Region)

**Assumptions:**
- Infrastructure: 4 vCPU, 8 GB memory average
- Uptime: 50% of month (typical SaaS)
- Egress: 500 GB/month
- Requests: 5 million/month (if applicable)
- Monitoring: CloudWatch/GCP Monitoring
- Load balancer: Required

#### Scenario A: Always-On Small App

| Cost Component | AWS Fargate | AWS EC2 | GCP Cloud Run | GCP GCE | Azure ACI | DO |
|---|---|---|---|---|---|---|
| Compute | $152 | $61 | $272 | $61 | $48 | $63 |
| Cluster/Management | $0 | $0 | $0 | $0 | $0 | $0 |
| Load Balancer | $165 | $165 | $180 | $180 | $234 | $10 |
| Egress | $45 | $45 | $60 | $60 | $43.50 | Included |
| Monitoring | $40 | $40 | $30 | $30 | $30 | $50 |
| Total | **$402** | **$311** | **$542** | **$331** | **$355.50** | **$123** |
| Recommendation | Skip (expensive) | Good balance | Avoid | Best | Avoid | **Winner** |

#### Scenario B: High-Volume Intermittent Workload (10% uptime = 73 hrs/mo)

| Cost Component | AWS Fargate | GCP Cloud Run | Azure Container Apps |
|---|---|---|---|
| Compute (50% Spot discount) | $76 | $136 | $24 |
| Load Balancer | $165 | $180 | $234 |
| Egress | $45 | $60 | $43.50 |
| Monitoring | $20 | $20 | $15 |
| **Total** | **$306** | **$396** | **$316.50** |
| Recommendation | Acceptable | Expensive | **Best** |

#### Scenario C: Kubernetes Cluster (3 nodes, medium load)

| Cost Component | AWS EKS | GCP GKE | Azure AKS | DO DOKS |
|---|---|---|---|---|
| Cluster Fee | $73 | $73 | $72 | $0 |
| 3 × Medium Nodes | $183 | $180 | $200 | $189 |
| Storage (30 GB) | $3 | $3 | $3 | $0 |
| Load Balancer | $165 | $180 | $234 | $10 |
| Egress | $45 | $60 | $43.50 | Included |
| Monitoring | $50 | $40 | $40 | $50 |
| **Total** | **$519** | **$536** | **$592.50** | **$249** |
| Recommendation | Acceptable | Similar | Expensive | **Winner** |

---

### 2.3 Annual Cost Comparison (Commitment Tier Discounts)

**Scenario:** Medium business, 4 vCPU + 8 GB always-on

| Strategy | Year 1 Cost | Year 2 Cost | 3-Year Cost | Savings vs. On-Demand |
|----------|-----------|-----------|-----------|------|
| On-Demand (baseline) | $5,040 | $5,040 | $15,120 | 0% |
| AWS Savings Plan (1-yr) | $3,024 | $5,040 | $13,104 | 13% over 3yr |
| AWS Savings Plan (3-yr) | $2,016 | $2,016 | $6,048 | **60% total** |
| GCP Committed (1-yr) | $3,780 | $5,040 | $13,860 | 8% over 3yr |
| GCP Committed (3-yr) | $3,024 | $3,024 | $9,072 | **40% total** |
| Azure Reserved (1-yr) | $3,528 | $5,040 | $13,608 | 10% over 3yr |
| Azure Reserved (3-yr) | $2,772 | $2,772 | $8,316 | **45% total** |

**Key Insight:** 3-year commitments provide best savings; breakeven occurs in 6-12 months for committed vs. on-demand

---

## Part 3: Hidden Costs Analysis

### 3.1 Load Balancer Total Cost of Ownership

**AWS Application Load Balancer Example:**

```
Monthly Cost Breakdown:

1. Hourly charge:
   $0.0225/hour × 730 hours = $16.43

2. LCU (Load Balancer Capacity Unit) - per metric:
   • New connections: 25 LCUs per 1000 connections
   • Active connections: 1 LCU per 1000 connections
   • Processed bytes: 1 LCU per 1 GB

   Example: 10K req/sec, 10 KB avg payload
   = 600K req/min = 10K connections/sec
   = 25 × 10 = 250 LCUs per minute
   = 250 × 60 × 24 × 30 = 10.8M LCUs/month
   = 10.8M / 1K × $5.60 = $60,480 (massive!)

3. Data processing (if applicable):
   500 GB egress × $0.01 = $5

Reality: Typical ALB with moderate traffic = $150-500/month
High-traffic ALB = $1,000+/month
```

**Comparison:**
- AWS ALB: $165-500+/month
- GCP GCLB: $180-500+/month
- Azure LB: $234+/month
- DigitalOcean LB: $10/month (fixed, data included)

**Cost Optimization:** DigitalOcean offers best value; AWS/GCP expensive at scale

---

### 3.2 Data Egress Analysis

**How Egress Scales:**

```
Small site (50GB/month):
AWS: $4.50, GCP: $6, Azure: $4.35 → Negligible

Medium site (500GB/month):
AWS: $45, GCP: $60, Azure: $43.50 → Noticeable

Large site (5TB/month):
AWS: $450, GCP: $600, Azure: $435 → Significant

Enterprise (50TB/month):
AWS: $3,600 (tiered pricing applied), GCP: $6,000, Azure: $4,350
AWS: $0.085/GB × 50TB = $4,250 (after 10TB tier)
```

**Regional Data Transfer Premium:**

```
Intra-region: Free
Inter-region (same continent): $0.01/GB
Inter-region (different continent): $0.02-0.03/GB

Example: 1 TB month US→EU
AWS: 1000 × $0.02 = $20
GCP: Similar
Azure: Similar

Multi-region app (4 regions, 100GB inter-region):
100 GB × $0.02 × 3 hops = $6 (minimum)
High-traffic = $100-300/month
```

**Optimization:** Minimize inter-region traffic with CDNs, caching, regional endpoints

---

### 3.3 Monitoring Cost Escalation

**CloudWatch Cost Progression:**

```
Typical log volume growth:

Small app (10 containers):
- 100MB logs/day = 3 GB/month
- Cost: $1.50 (ingestion) + $0.09 (storage) ≈ $2/month

Medium app (100 containers):
- 1 GB logs/day = 30 GB/month
- Cost: $15 (ingestion) + $0.90 (storage) ≈ $16/month

Large app (1000 containers):
- 10 GB logs/day = 300 GB/month
- Cost: $150 (ingestion) + $9 (storage) ≈ $159/month

Enterprise (10,000 containers):
- 100 GB logs/day = 3 TB/month
- Cost: $1,500 (ingestion) + $90 (storage) ≈ $1,590/month
```

**Cost Reduction Strategies:**

1. **Log Sampling:** Send 10% of logs = 90% cost reduction
2. **Log Filtering:** Exclude debug/info level = 70% cost reduction
3. **Retention Policy:** 7-day instead of 30-day = 75% cost reduction
4. **Log Aggregation:** Use open-source ELK instead = 60-80% savings
5. **Structured Logging:** Smaller payloads = 20-30% savings

**Example:** Typical 300GB/month logs
- Standard CloudWatch: $159/month
- With sampling (10%) + filtering: $16/month
- Savings: 90%
```

---

## Part 4: Break-Even Analysis

### When Does Serverless Cost Less Than Instances?

**Formula:**
```
Serverless breakeven = Instance Monthly Cost / Serverless Hourly Cost
```

**Examples (2 vCPU, 4 GB memory):**

AWS:
- EC2 on-demand: $61/month = ~$0.084/hour
- Fargate: $0.0000090/vCPU-sec = $0.0324/hour for 2 vCPU
- Breakeven: $61 / $0.0324 = 1,883 hours ≈ 63 days (too high for breakeven)
- Actually: At 50% uptime (365 hrs), Fargate costs ~$119/month

GCP:
- GCE on-demand: $61/month
- Cloud Run: $0.000024/vCPU-sec = $0.0864/hour for 2 vCPU
- At 50% uptime: Cloud Run costs ~$315/month
- Serverless more expensive for constant load

Azure:
- VM on-demand: $65/month
- Container Apps: $0.000012/vCPU-sec = $0.0864/hour
- At 50% uptime: Container Apps costs ~$315/month

**Key Finding:** Serverless best when:
- Usage < 40% of uptime (part-time workloads)
- Highly variable load (minutes to hours)
- Batch/event-driven jobs
- Development/testing (minimal uptime)

Instance-based better when:
- Usage > 60% of uptime (always-on services)
- Predictable, steady load
- Committed workloads (1-3 years)
- Cost-sensitive baseline services

---

### When Does Kubernetes Cluster Make Sense?

**Cluster baseline cost (AWS EKS, smallest viable):**
- Cluster fee: $73/month
- 2 × t3.small nodes: $60/month
- Total: $133/month minimum

**Breakeven:** Cluster is worthwhile when:
- Managing 10+ microservices (bin-packing savings)
- Multiple teams (namespace isolation)
- Advanced networking required (service mesh)
- Multi-cloud portability needed

**Alternative:** Container Apps or Cloud Run cheaper for:
- Simple deployments (1-5 services)
- Small teams
- No Kubernetes expertise
- Cost-sensitive projects

---

## Part 5: Regional Price Variations (2025)

### Compute Price Index by Region (Baseline = 100)

| Region | AWS | GCP | Azure | Best Price |
|--------|-----|-----|-------|-----------|
| US East (N.VA) | 100 | 100 | 100 | Baseline |
| US West (OR) | 90 | 100 | 105 | AWS |
| Europe (Ireland) | 110 | 115 | 115 | Similar |
| Europe (Frankfurt) | 115 | 115 | 115 | Similar |
| AP (Singapore) | 130 | 140 | 135 | AWS |
| AP (Tokyo) | 145 | 150 | 140 | Azure |
| AP (Sydney) | 125 | 130 | 125 | AWS/Azure |
| SA (São Paulo) | 155 | 160 | 150 | Azure |

**Strategy:** Use US East for non-latency-critical workloads (20-60% savings)

---

## Part 6: Cost Forecasting Model

### Predict Monthly Cost Growth

**Formula:**
```
Monthly Cost = Base Cost + (Growth Rate × Months) + Seasonal Variation

Example:
Month 1: $100 (base)
Growth: 10% mo
Month 6: $100 × 1.10^5 = $161
Month 12: $100 × 1.10^11 = $259
Year 2: $100 × 1.10^23 = $670
```

**Apply to container costs:**

```
Baseline: 2 containers, $50/month

Scenario 1: Startup (50% monthly growth)
Month 1: $50
Month 3: $113
Month 6: $259
Month 12: $1,305

Scenario 2: Mature (10% monthly growth)
Month 1: $50
Month 3: $61
Month 6: $89
Month 12: $155

Scenario 3: Enterprise (3% monthly growth)
Month 1: $50
Month 3: $53
Month 6: $60
Month 12: $71
```

**Implication:** Early-stage startups should use serverless (scales with demand); mature companies use reserved instances (predictable costs)

---

## Part 7: Cost Optimization Decision Matrix

```
START
├─ Usage Pattern?
│  ├─ Constant 24/7 (>80% uptime)
│  │  ├─ Budget Available? → 3-year reserved instances (-55% cost)
│  │  └─ Limited Budget? → 1-year reserved (-30% cost)
│  │
│  ├─ Variable (20-80% uptime)
│  │  ├─ Predictable pattern? → Scheduled instances
│  │  └─ Random pattern? → Serverless auto-scale
│  │
│  └─ Sporadic (<20% uptime)
│     └─ Use Serverless (Fargate/Cloud Run)
│
├─ Complexity Level?
│  ├─ Simple (1-5 services)
│  │  └─ Use: Serverless containers or single instance
│  ├─ Medium (5-20 services)
│  │  └─ Use: Docker + managed container service
│  └─ Complex (20+ services)
│     └─ Use: Kubernetes (cluster overhead justified)
│
└─ Cost Constraint?
   ├─ Tight (<$200/mo)
   │  └─ Use: Cloud Run, Container Apps (free tier)
   ├─ Moderate ($200-1000/mo)
   │  └─ Use: DigitalOcean or Fargate
   └─ Enterprise ($1000+/mo)
      └─ Use: AWS or GCP multi-region
```

---

## Conclusion: TCO Best Practices

1. **Start Serverless:** Fastest to market, lowest initial cost
2. **Monitor Actual Usage:** Adjust as you scale
3. **Commit When Predictable:** 3-year reserved instances provide 50%+ savings
4. **Optimize at Scale:** Logging, egress, load balancer costs dominate budget
5. **Multi-Cloud Arbitrage:** Use different providers for different workloads
6. **Automate Cost Management:** Use tools for real-time cost tracking
7. **Review Quarterly:** Pricing changes and optimization opportunities emerge

---

**Document Version:** 1.0
**Research Date:** January 2025
**Confidence Score:** 0.85
**Next Update:** April 2025
