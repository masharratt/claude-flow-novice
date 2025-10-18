# Agent Navigation Guide

**Start here** to explore 607 specialized AI agents organized hierarchically.

## 🗺️ Quick Navigation Map

```
agents/
│
├── 📖 Documentation
│   ├── QUICK_REFERENCE.md ............... Fast category lookup
│   ├── FULL_STRUCTURE.md ................ Complete hierarchy
│   ├── CATEGORIZATION_SUMMARY.md ........ Detailed breakdown
│   └── IMPORTED_AGENTS_README.md ........ Integration guide
│
├── 💻 Development & Engineering (155)
│   ├── backend/ (56) .................... APIs, server-side
│   ├── integration/ (33) ................ Third-party APIs
│   ├── devops/ (24) ..................... CI/CD, Docker, K8s
│   ├── testing/ (17) .................... QA, test automation
│   ├── frontend/ (10) ................... React, Angular, Vue
│   ├── database/ (10) ................... SQL, NoSQL
│   ├── architecture/ (3) ................ System design
│   └── mobile/ (2) ...................... iOS, Android
│
├── 🏭 Industry-Specific (224)
│   ├── other/ (217) ..................... Real estate, energy, etc.
│   ├── entertainment/ (5) ............... Media, gaming
│   ├── healthcare/ (1) .................. Medical systems
│   └── finance/ (1) ..................... Banking, fintech
│
├── 🤖 AI/ML & Automation (62)
│   ├── machine-learning/ (55) ........... Classification, regression
│   ├── automation/ (5) .................. Workflow automation
│   ├── deep-learning/ (1) ............... Neural networks
│   └── computer-vision/ (1) ............. Image processing
│
├── 📊 Business & Operations (61)
│   ├── strategy/ (21) ................... Business planning
│   ├── leadership/ (21) ................. Management
│   ├── growth/ (6) ...................... Scaling
│   ├── revenue/ (6) ..................... Sales, monetization
│   ├── customer/ (4) .................... CRM, support
│   └── operations/ (3) .................. Process optimization
│
├── 📈 Data & Analytics (34)
│   ├── business-intelligence/ (18) ...... Dashboards, reporting
│   ├── forecasting/ (10) ................ Time-series, predictions
│   ├── analytics/ (4) ................... Statistical analysis
│   └── data-engineering/ (2) ............ ETL/ELT pipelines
│
├── 👤 Personal & Professional (32)
│   ├── career/ (16) ..................... Job search, interviews
│   ├── communication/ (9) ............... Presentations, feedback
│   ├── leadership/ (3) .................. Coaching, mentoring
│   ├── wellness/ (3) .................... Work-life balance
│   └── productivity/ (1) ................ Time management
│
├── 🔒 Security & Compliance (28)
│   ├── cybersecurity/ (15) .............. Threat analysis
│   ├── compliance/ (11) ................. Regulatory, auditing
│   └── privacy/ (2) ..................... GDPR, data protection
│
└── 💳 Payment & Financial (11)
    ├── payment-gateways/ (6) ............ Stripe, PayPal, Square
    ├── bnpl/ (2) ........................ Buy-now-pay-later
    ├── cryptocurrency/ (2) .............. Blockchain, Web3
    └── billing/ (1) ..................... Invoicing, subscriptions
```

## 🎯 Usage Scenarios

### Scenario 1: "I need a backend API developer"
```bash
cd agents/development-engineering/backend/
cat INDEX.md
# → Choose from 56 backend specialists
```

### Scenario 2: "Find payment integration agents"
```bash
cd agents/payment-financial/payment-gateways/
ls
# → stripe-payment-integration-agent.md
# → paypal-integration-agent.md
# → square-integration-agent.md
```

### Scenario 3: "I want machine learning expertise"
```bash
cd agents/ai-ml-automation/machine-learning/
cat INDEX.md
# → 55 ML specialists available
```

### Scenario 4: "Need security compliance help"
```bash
cd agents/security-compliance/compliance/
ls
# → gdpr, hipaa, sox, pci specialists
```

## 🔍 Search Strategies

### Browse by Category
```bash
# Top-down exploration
ls agents/                              # Main categories
ls agents/development-engineering/      # Subcategories
ls agents/development-engineering/backend/  # Agent files
```

### Search by Name
```bash
# Find specific technology
find agents -name "*react*"
find agents -name "*kubernetes*"
find agents -name "*stripe*"
```

### Search by Keyword
```bash
# Search agent descriptions
grep -r "machine learning" agents/ai-ml-automation/
grep -r "payment" agents/payment-financial/
grep -r "security" agents/security-compliance/
```

### Search All Content
```bash
# Full-text search
grep -r "your keyword" agents/
```

## 📚 Index Files

Every category and subcategory has an INDEX.md:

```bash
# Main category index
cat agents/development-engineering/INDEX.md
# → Lists all 8 subcategories with counts

# Subcategory index
cat agents/development-engineering/backend/INDEX.md
# → Lists all 56 backend agents alphabetically
```

## 💡 Tips for Efficiency

1. **Start Broad**: Begin with main category → drill down to subcategory
2. **Use INDEX.md**: Every folder has one - it's your table of contents
3. **Search When You Know**: If you know what you want, use `find` or `grep`
4. **Check QUICK_REFERENCE.md**: Fast category overview
5. **Compare**: Native `.claude/agents/` (93) for workflows, `agents/` (607) for expertise

## 🚀 Next Steps

```bash
# 1. Browse available categories
cat agents/QUICK_REFERENCE.md

# 2. Explore your domain
cat agents/development-engineering/INDEX.md

# 3. Find your agent
cat agents/development-engineering/backend/backend-api-code-writer-agent.md

# 4. Use it!
# → Copy agent content or reference by path
```

---

**Questions?** See [IMPORTED_AGENTS_README.md](IMPORTED_AGENTS_README.md) for complete guide.
