# SEO Pipeline Skill (Mega-Skill)

**Version:** 1.0.0
**Purpose:** SEO optimization and web content acquisition
**Status:** Production
**Consolidates:** cfn-seo, firecrawl-integration
**Confidence:** 9.0/10 (direct code import coupling)

---

## Overview

This mega-skill provides complete SEO capabilities:
- **SEO** - SERP optimization, CTR analysis, schema markup, pre-publication audits
- **Firecrawl** - Web scraping, competitor analysis, SERP data gathering

---

## Directory Structure

```
seo-pipeline/
├── SKILL.md
├── lib/
│   ├── seo/              # From cfn-seo
│   └── firecrawl/        # From firecrawl-integration
└── cli/
```

---

## Migration Paths

| Old Path | New Path |
|----------|----------|
| cfn-seo/ | seo-pipeline/lib/seo/ |
| firecrawl-integration/ | seo-pipeline/lib/firecrawl/ |

---

## Version History

### 1.0.0 (2025-12-02)
- Consolidated SEO + Firecrawl into unified content pipeline

