---
description: "Generate product page with rich schema markup (5-step pipeline)"
argument-hint: "<product name> [--brand=BRAND] [--category=CATEGORY]"
allowed-tools: ["Task", "TodoWrite", "Read", "Write", "Bash"]
---

# SEO Product Page Generator

Execute 5-step SEO pipeline for product pages (focus on schema markup and technical SEO).

**Product**: $ARGUMENTS

## Product Page Pipeline (5 Steps)

```
STEP 1: Keyword Research (product-specific)
   ↓
STEP 5: Product Copywriting (400-800 words)
   ↓
STEP 6: Technical SEO + Schema
   ↓
STEP 7: Validation (3 validators)
   ↓
STEP 8: Publishing Prep (rich schema)
```

## Execution

```javascript
Task("cfn-seo-coordinator", `
  SEO PRODUCT PAGE GENERATION

  Product Name: ${product}
  Content Type: product
  Brand: ${brand}
  Category: ${category}
  Word Count: 400-800
  Mode: STANDARD

  Success Criteria:
  - [ ] Product schema markup (name, price, rating, reviews)
  - [ ] Breadcrumb schema
  - [ ] High-quality product images (3-5)
  - [ ] Key features/benefits (bullet points)
  - [ ] Technical specifications
  - [ ] Customer reviews section
  - [ ] Related products (internal links)
  - [ ] Clear CTA (Add to Cart / Learn More)
  - [ ] Validation consensus ≥0.95

  Invoke:
  ./.claude/skills/seo-orchestration/orchestrate-seo.sh \\
    --task-id "seo-product-$(date +%s)" \\
    --target-keyword "${product}" \\
    --content-type "product" \\
    --brand "${brand}" \\
    --category "${category}" \\
    --word-count 400-800
`, "cfn-seo-coordinator")
```

## Product Page Specific Requirements

**Product Schema (Required):**
```json
{
  "@type": "Product",
  "name": "Product Name",
  "description": "...",
  "image": ["url1", "url2"],
  "sku": "SKU123",
  "brand": {"@type": "Brand", "name": "Brand"},
  "offers": {
    "@type": "Offer",
    "price": "99.99",
    "priceCurrency": "USD",
    "availability": "InStock"
  },
  "aggregateRating": {
    "@type": "AggregateRating",
    "ratingValue": "4.5",
    "reviewCount": "87"
  }
}
```

**Content Structure:**
- Product title (H1 with keyword)
- Brief description (2-3 sentences)
- Key features (5-7 bullet points)
- Detailed description (300-500 words)
- Technical specs (table format)
- Customer reviews (structured data)
- FAQ section (3-5 questions)

## Usage

```bash
# Basic
/seo-product "digital voice recorder for families"

# With brand and category
/seo-product "memory preservation kit" --brand=ourstories --category=electronics
```
