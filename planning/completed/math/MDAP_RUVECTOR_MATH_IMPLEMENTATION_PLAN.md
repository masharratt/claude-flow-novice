# MDAP + RuVector Math Competition Implementation Plan

**Target:** AIMO Progress Prize 3 ($2.2M)
**Timeline:** 10 weeks to competition-ready
**Status:** Ready for Phase 1

---

## Executive Summary

Build a competition math proving ground using MDAP (Micro-task Decomposition and Aggregation Pattern) powered by RuVector's self-learning vector database. The core innovation is **multi-space embeddings with technique-first retrieval and step-level decomposition**—fundamentally different from standard RAG approaches that treat math problems as text.

**Key Differentiators:**
- Step-level retrieval (not whole problems)
- Technique similarity ranking (not topic similarity)
- Active learning from execution outcomes
- Cross-domain transfer detection via GNN
- Formal verification confidence calibration

---

## 1. Core Architecture: Multi-Space Embedding Strategy

### 1.1 Why Standard Embeddings Fail for Math

Standard text embeddings fail catastrophically for mathematical content:

| Problem | Example | Impact |
|---------|---------|--------|
| **Notation variance** | `1/n` vs `\frac{1}{n}` vs `n^{-1}` | Same expression → distant embeddings |
| **Surface ≠ solution** | Two quadratic equations, one needs substitution, one needs completing the square | Similar text → useless retrieval |
| **Different surface, same technique** | Pigeonhole in combinatorics vs number theory | Different text → missed transfer |

**Core insight:** What makes two math problems "similar" for solving purposes is the TECHNIQUE required, not the TOPIC or surface form.

### 1.2 Composite Vector Structure (736 dimensions)

| Component | Dims | Encoder | Purpose |
|-----------|------|---------|---------|
| **TEXT_EMB** | 256d | Fine-tuned MathBERT | Natural language understanding |
| **MATH_AST_EMB** | 256d | Tree-LSTM on expression AST | Structural pattern matching |
| **TECHNIQUE_EMB** | 128d | TransE on technique graph | Solution approach identification |
| **DIFFICULTY_EMB** | 64d | Multi-head classifier | Computational/conceptual/prerequisite |
| **STEP_POSITION_EMB** | 32d | Positional encoding | Step location (0=first, 1=answer) |

**Total:** 736d composite vector per problem/step entry

### 1.3 The Critical Insight: Technique vs Topic Similarity

**Same topic, different technique (NOT useful for retrieval):**
- Problem A: Number theory, uses Fermat's Little Theorem
- Problem B: Number theory, uses Chinese Remainder Theorem
- Surface similarity: HIGH | Technique similarity: LOW | Retrieval value: LOW

**Different topic, same technique (HIGHLY useful for retrieval):**
- Problem A: Combinatorics problem using pigeonhole principle
- Problem B: Number theory problem using pigeonhole principle
- Surface similarity: LOW | Technique similarity: HIGH | Retrieval value: HIGH

**Conclusion:** Weight technique similarity > topic similarity in all retrieval rankings.

---

## 2. Step-Level Decomposition Architecture

### 2.1 Solution as Step Sequence

Each solved problem is stored not as a monolithic blob, but as a **sequence of discrete steps**:

```
Problem → [Step₁, Step₂, Step₃, ..., Stepₙ]
```

Each step contains:

| Field | Type | Description |
|-------|------|-------------|
| `step_type` | enum | insight \| technique \| computation |
| `technique_used` | string | Tag from technique taxonomy |
| `prerequisite_steps` | int[] | DAG dependencies |
| `difficulty_modifier` | float | How hard is THIS step (0-1) |
| `natural_language` | string | Human-readable description |
| `math_expressions` | LaTeX[] | Mathematical content |
| `embedding` | float[736] | Composite vector |

### 2.2 Step-Level vs Problem-Level Retrieval

| Query Level | Use Case | Returns |
|-------------|----------|---------|
| **Problem-level** | "What kind of problem is this?" | Top-10 similar whole problems |
| **Step-level** | "How do I execute this specific micro-task?" | Similar steps from various solutions |

**MDAP integration:** When MDAP decomposes a new problem into steps, we query RuVector for each step individually—finding guidance for "extract coefficient from generating function" rather than "solve this AIME problem."

### 2.3 Example Step Decomposition

**AIME 2020 Problem 5:** *How many positive integers n < 1000 have the property that the sum of the digits of n is divisible by 5?*

| Step | Type | Technique | Description |
|------|------|-----------|-------------|
| 1 | insight | problem_classification | Recognize as digit-sum counting problem |
| 2 | technique | generating_functions | Set up generating function for digit choices |
| 3 | computation | polynomial_expansion | Form (1+x+x²+...+x⁹)³ |
| 4 | technique | roots_of_unity_filter | Apply roots of unity filter for mod 5 |
| 5 | computation | coefficient_extraction | Extract coefficient sum |
| 6 | computation | simplification | Compute final answer: 200 |

Each step has its own 736d embedding and can be retrieved independently.

---

## 3. Technique Taxonomy Graph

### 3.1 Hierarchical Ontology

**Level 1 - Broad Categories (5):**

```
├── Algebraic
├── Combinatorial
├── Geometric
├── Number-Theoretic
└── Analytical
```

**Level 2 - Specific Areas (20+):**

```
├── Algebraic
│   ├── Polynomial manipulation
│   ├── Inequalities
│   ├── Functional equations
│   └── Sequences and series
├── Combinatorial
│   ├── Counting principles
│   ├── Graph theory
│   ├── Extremal combinatorics
│   └── Probabilistic method
├── Geometric
│   ├── Synthetic geometry
│   ├── Coordinate geometry
│   ├── Trigonometry
│   └── Transformations
├── Number-Theoretic
│   ├── Divisibility
│   ├── Modular arithmetic
│   ├── Diophantine equations
│   └── Arithmetic functions
└── Analytical
    ├── Limits and continuity
    ├── Calculus techniques
    └── Optimization
```

**Level 3 - Atomic Techniques (50+):**

| Category | Techniques |
|----------|------------|
| **Inequalities** | AM-GM, Cauchy-Schwarz, Jensen, Rearrangement, Schur, SOS, Smoothing, Muirhead |
| **Counting** | PIE, Stars-and-bars, Bijection, Generating functions, Recursion, Burnside |
| **Number Theory** | Fermat's Little Theorem, CRT, Lifting the exponent, Legendre symbol, Hensel |
| **Geometry** | Power of a point, Radical axis, Homothety, Inversion, Barycentric coords |

### 3.2 Technique Relationships

Stored in RuVector as graph edges:

| Relation | Example | Meaning |
|----------|---------|---------|
| **SUBSUMES** | AM-GM → Weighted AM-GM | General technique includes specific |
| **CO_OCCURS** | Generating functions ↔ Recurrences | Often used together |
| **SUBSTITUTABLE** | AM-GM ↔ Cauchy-Schwarz | Often interchangeable |
| **DIFFICULTY_MOD** | Inversion → +0.3 difficulty | Technique makes problems harder |
| **PREREQUISITE** | Modular arithmetic → Fermat's Little | Must understand first |

### 3.3 GNN Learning on Technique Graph

RuVector's GNN learns:
1. **Technique embeddings** via TransE/RotatE on relationship graph
2. **Co-occurrence patterns** from successful solution chains
3. **Substitutability** from problems solved multiple ways
4. **Difficulty calibration** from success/failure rates

---

## 4. LaTeX/Mathematical Expression Embedding

### 4.1 The AST Approach

| Approach | Method | Quality | Why |
|----------|--------|---------|-----|
| **A: Text** | Treat LaTeX as text tokens | Poor | `\frac{1}{n}` and `1/n` are distant |
| **B: Vision** | Render to image, use CNN | Poor | Loses structure, expensive |
| **C: AST** | Parse to tree, embed structure | Best | Captures mathematical meaning |

**We use Approach C.**

### 4.2 AST Processing Pipeline

```
LaTeX Input: "\frac{x^2 + 2x + 1}{x + 1}"
     ↓
[1. Normalize] → Standardize notation
     ↓
[2. Parse] → sympy.parsing.latex / mathpix
     ↓
[3. Canonicalize] → Expression tree
     ↓
        Div
       /   \
     Add   Add
    / | \   |  \
   x² 2x 1  x   1
     ↓
[4. Encode] → Tree-LSTM / GNN
     ↓
[5. Output] → 256d embedding
```

### 4.3 Equivalence Recognition

The AST approach enables recognition of mathematical equivalences:

| Expression A | Expression B | Text Similarity | AST Similarity |
|--------------|--------------|-----------------|----------------|
| `x^2 + 2x + 1` | `(x+1)^2` | Low (0.3) | High (0.95) |
| `sin²(x) + cos²(x)` | `1` | Low (0.1) | High (0.90)* |
| `n!/(k!(n-k)!)` | `\binom{n}{k}` | Low (0.2) | High (0.98) |

*With algebraic simplification in canonicalization step

---

## 5. Data Ingestion Pipeline

### 5.1 Processing Stages

For each problem in the corpus:

```
┌─────────────────────────────────────────────────────────────┐
│  1. PARSE                                                    │
│     Extract: problem_text, solution_text, latex_expressions │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  2. CLASSIFY (LLM batch job)                                │
│     Extract: primary_technique, secondary_techniques,        │
│              difficulty_level, topic_tags                    │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  3. DECOMPOSE                                                │
│     Split solution into steps via:                          │
│     - Heuristics: "therefore", "thus", "we get"             │
│     - LLM verification of step boundaries                   │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  4. AST GENERATION                                          │
│     Convert all LaTeX → canonical expression trees          │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  5. EMBED                                                    │
│     Run through all encoders → 736d composite vector        │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  6. INDEX                                                    │
│     Insert into RuVector with full metadata                 │
└─────────────────────────────────────────────────────────────┘
```

### 5.2 Processing Estimates

| Dataset | Problems | Steps (est.) | Time (10 workers) | Storage |
|---------|----------|--------------|-------------------|---------|
| NuminaMath-CoT | 860,000 | ~4.3M | ~3 days | ~50 GB |
| AoPS-Instruct | 600,000 | ~3M | ~2 days | ~35 GB |
| MATH | 12,500 | ~62K | ~2 hours | ~750 MB |
| Omni-MATH | 4,428 | ~22K | ~45 min | ~250 MB |
| miniF2F | 488 | ~2.4K | ~10 min | ~30 MB |
| **Total** | **~1.5M** | **~7.5M** | **~6 days** | **~90 GB** |

### 5.3 Incremental Update Strategy

| Event | Action |
|-------|--------|
| New problem added | Queue for processing, add to index |
| Technique taxonomy updated | Re-embed technique components only |
| GNN weights updated | Continuous (every 1000 queries) |
| Full re-index | Monthly maintenance window |

---

## 6. Query Strategies for MDAP

### 6.1 Query Types

| Query Type | Purpose | Embedding Weights | Returns |
|------------|---------|-------------------|---------|
| **CLASSIFICATION** | What kind of problem? | TEXT: 0.6, MATH: 0.3, TECH: 0.1 | Top-10 problems with topic/technique distribution |
| **TECHNIQUE_SUGGEST** | What techniques might work? | MATH: 0.5, TECH: 0.4, TEXT: 0.1 | Problems with diverse techniques on similar structure |
| **STEP_GUIDANCE** | How to execute this step? | TECH: 0.5, TEXT: 0.3, STEP_POS: 0.2 | Similar steps from solved problems |
| **STUCK_RECOVERY** | What else could I try? | MATH: 0.6, TECH: -0.3 (negative) | Problems solved by DIFFERENT techniques |
| **VERIFICATION** | Is answer likely correct? | MATH: 0.8, DIFF: 0.2 | Problems with similar structure to check answer form |

### 6.2 Query Flow During Problem Solving

```
┌─────────────────────────────────────────────────────────────┐
│ NEW PROBLEM ARRIVES                                         │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 1. CLASSIFICATION Query                                     │
│    → Understand problem type                                │
│    → Get topic/technique distribution                       │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 2. TECHNIQUE_SUGGEST Query                                  │
│    → Retrieve examples of promising techniques              │
│    → Select primary approach                                │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 3. MDAP Decomposition                                       │
│    → Break into micro-tasks (steps)                         │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 4. For each step: STEP_GUIDANCE Query                       │
│    → Get hints for executing this micro-task                │
│    → If stuck: STUCK_RECOVERY Query                         │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 5. After solution: VERIFICATION Query                       │
│    → Sanity check answer form                               │
│    → Compare with similar problem answers                   │
└─────────────────────────────────────────────────────────────┘
```

---

## 7. GNN Self-Learning from Execution

### 7.1 Learning Signals

| Signal | Trigger | GNN Update |
|--------|---------|------------|
| **POSITIVE** | Retrieved problem/step led to successful solution | Strengthen edge weight by +0.1 |
| **NEGATIVE** | Retrieved problem/step led to dead-end | Weaken edge weight by -0.05 |
| **TRANSFER** | Technique from different domain worked | Create new cross-domain edge |
| **NOVELTY** | New technique discovered for problem type | Add to technique taxonomy |

### 7.2 Feedback Collection

```javascript
// After each MDAP execution
const feedback = {
  problem_id: "aime_2020_p5",
  retrieved_ids: ["numinamath_12345", "aops_67890"],
  outcome: "success" | "failure" | "partial",
  successful_techniques: ["generating_functions", "roots_of_unity"],
  failed_techniques: ["casework"],
  time_to_solve: 45000,  // ms
  confidence: 0.85
};

await ruvector.submitFeedback(feedback);
```

### 7.3 Expected Learning Trajectory

| Week | GNN State | Observable Behavior |
|------|-----------|---------------------|
| 1-2 | Baseline (embedding similarity only) | Retrieves topically similar problems |
| 3-4 | Learning begins | Starts weighting technique similarity higher |
| 5-6 | Pattern emergence | Co-occurrence patterns visible in retrieval |
| 7-8 | Cross-domain transfer | Suggests techniques from other domains |
| 9-10 | Mature | Personalized retrieval based on execution history |

---

## 8. Formal Verification Integration

### 8.1 miniF2F Bridge

The 488 miniF2F problems have **both** natural language and formal representations:

| Problem | Natural Language | Lean 4 |
|---------|------------------|--------|
| AMC 2019 P12 | "Find the sum..." | `theorem amc_2019_p12 : ...` |

This creates a **translation training set**.

### 8.2 Auto-Formalization Pipeline

```
┌─────────────────────────────────────────────────────────────┐
│ 1. Generate natural language solution via MDAP              │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 2. Attempt translation to Lean 4 tactics                    │
│    - Use fine-tuned model on miniF2F pairs                 │
│    - Map NL steps → tactic sequences                       │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 3. Run Lean type checker                                    │
└─────────────────────────────────────────────────────────────┘
                            ↓
           ┌───────────────┴───────────────┐
           ↓                               ↓
   ┌───────────────┐               ┌───────────────┐
   │ VERIFIED ✓    │               │ FAILED ✗      │
   │ High conf.    │               │ Flag review   │
   │ Add to train  │               │ Don't reject  │
   └───────────────┘               └───────────────┘
```

### 8.3 Confidence Calibration

| Formalization Rate | Confidence Adjustment |
|--------------------|-----------------------|
| >80% verified | Solution confidence +20% |
| 50-80% verified | No adjustment |
| <50% verified | Solution confidence -10% |
| 0% verified | Manual review required |

**Target trajectory:** 30% auto-formalizable initially → 60%+ after 8 weeks

---

## 9. Progressive Difficulty Training

### 9.1 Difficulty Ladder

| Level | Dataset | Difficulty | Problems | Purpose |
|-------|---------|------------|----------|---------|
| 0 | GSM8K | Grade school | 8,500 | Baseline reasoning |
| 1 | MATH L1-2 | Early competition | ~4,000 | Foundation |
| 2 | MATH L3-4 | Mid competition | ~5,000 | Technique application |
| 3 | MATH L5 | Hard competition | ~3,500 | Complex techniques |
| 4 | AIME | National olympiad | ~600 | Multi-step insight |
| 5 | Omni-MATH | International | 4,428 | Olympiad standard |
| 6 | IMO | World-class | ~500 | Elite difficulty |

### 9.2 Curriculum Strategy

1. **Embed all levels** in same vector space
2. **Evaluate progressively** starting from Level 0
3. **Learn difficulty scaling** - how techniques change at higher levels
4. **Transfer learning** - what Level 3 patterns predict Level 5 success

### 9.3 Difficulty Embedding Details

The 64d DIFFICULTY_EMB captures multiple dimensions:

| Dimension | Range | Meaning |
|-----------|-------|---------|
| Computational (16d) | 0-1 | Raw calculation complexity |
| Conceptual (16d) | 0-1 | Insight/creativity required |
| Prerequisite (16d) | 0-1 | Background knowledge depth |
| Trick-factor (16d) | 0-1 | Non-obvious key step |

---

## 10. Implementation Timeline

### Phase 1: Foundation (Weeks 1-2)

| Task | Owner | Deliverable |
|------|-------|-------------|
| RuVector Node.js integration | Backend | Working connection + CRUD |
| LaTeX → AST parser | ML Eng | sympy-based converter |
| Technique taxonomy v1 | Domain Expert | 50+ techniques, 3 levels |
| Base embedding encoders | ML Eng | MathBERT fine-tune, Tree-LSTM |
| MATH dataset ingestion | Data Eng | 12.5K problems indexed |

**Gate:** Query 10 MATH problems, get sensible technique suggestions

### Phase 2: Scale Ingestion (Weeks 3-4)

| Task | Owner | Deliverable |
|------|-------|-------------|
| Parallel processing infra | DevOps | 10-worker queue system |
| LLM technique classification | ML Eng | Batch job for 1.5M problems |
| Step decomposition pipeline | ML Eng | Heuristics + LLM hybrid |
| NuminaMath ingestion | Data Eng | 860K problems indexed |
| AoPS-Instruct ingestion | Data Eng | 600K problems indexed |

**Gate:** Full corpus queryable, <100ms p95 latency

### Phase 3: MDAP Integration (Weeks 5-6)

| Task | Owner | Deliverable |
|------|-------|-------------|
| Query strategy implementation | Backend | 5 query types working |
| MDAP → RuVector hooks | Integration | Seamless decomposition |
| Step-level retrieval | Backend | Per-step guidance working |
| Feedback collection | Backend | Execution outcomes captured |

**Gate:** MDAP uses RuVector for all retrievals, feedback flowing

### Phase 4: GNN Learning (Weeks 7-8)

| Task | Owner | Deliverable |
|------|-------|-------------|
| GNN training pipeline | ML Eng | Continuous learning from feedback |
| Technique relationship learning | ML Eng | Co-occurrence detection |
| Cross-domain transfer | ML Eng | Different-domain suggestions |
| Confidence calibration | ML Eng | Calibrated uncertainty estimates |

**Gate:** Measurable retrieval improvement from learning

### Phase 5: Formal Verification (Week 9)

| Task | Owner | Deliverable |
|------|-------|-------------|
| miniF2F integration | Backend | 488 problems with formal proofs |
| NL → Lean translation | ML Eng | Fine-tuned translation model |
| Auto-formalization pipeline | Integration | End-to-end verification |
| Confidence integration | Backend | Formal verification boosts scores |

**Gate:** 30%+ solutions auto-formalizable

### Phase 6: Competition Prep (Week 10)

| Task | Owner | Deliverable |
|------|-------|-------------|
| AIMO3-specific tuning | ML Eng | Held-out AIMO-style evaluation |
| Submission pipeline | DevOps | Kaggle-compatible output |
| Performance benchmarks | QA | Full accuracy/latency report |
| Documentation | All | Complete system docs |

**Gate:** Ready for AIMO3 submission

---

## 11. Success Metrics

### 11.1 Embedding Quality

| Metric | Definition | Target |
|--------|------------|--------|
| **Technique precision@5** | % of top-5 retrieved using same technique | >80% |
| **Cross-problem transfer** | % of successful cross-domain retrievals | >30% |
| **AST equivalence** | % of equivalent expressions recognized | >90% |
| **Step alignment** | % of retrieved steps at correct position | >70% |

### 11.2 MDAP Performance

| Metric | Baseline (no RuVector) | Target (with RuVector) |
|--------|------------------------|------------------------|
| MATH L5 accuracy | 40% | 70% |
| AIME accuracy | 20% | 50% |
| IMO accuracy | 5% | 25% |
| Avg. solution time | 120s | 60s |
| Step retrieval helpfulness | N/A | >60% helpful |

### 11.3 Competition Targets

| Competition | Current Best (Open-Source) | Our Target |
|-------------|---------------------------|------------|
| AIMO1 | 29/50 (Numina) | N/A (closed) |
| AIMO2 | 34/50 (NemoSkills) | N/A (closed) |
| AIMO3 | TBD | **40+/50** (top 10%) |

---

## 12. Risk Mitigation

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| **LaTeX parsing failures** | Medium | Medium | Fallback to text embedding for unparseable |
| **Technique classification noise** | High | Low | Human review of taxonomy, iterative refinement |
| **GNN overfitting** | Medium | High | Hold out AIMO-style problems entirely from training |
| **Formal verification too hard** | High | Low | Treat as bonus signal, not requirement |
| **Scale performance issues** | Low | High | RuVector HNSW handles 500M+ vectors |
| **Embedding drift** | Medium | Medium | Monthly re-indexing, version tracking |

---

## 13. Competitive Advantages

### Why This Approach Wins

1. **Step-level retrieval**
   - Everyone else retrieves whole problems
   - We retrieve specific solution steps
   - 5-10x more precise guidance

2. **Technique-first ranking**
   - Standard RAG uses topic similarity
   - We use technique similarity
   - Surfaces actually useful examples

3. **Active learning**
   - Static systems don't improve
   - We learn from every execution
   - System gets smarter with use

4. **Cross-domain transfer**
   - GNN detects technique applicability
   - Suggests pigeonhole for number theory from combinatorics example
   - Novel connection discovery

5. **Formal verification bootstrap**
   - No one else calibrates confidence this way
   - 488 provably correct examples
   - Builds trust in uncertain solutions

---

## Appendix A: Technique Taxonomy (Selected)

### Algebraic Techniques

| Technique | Difficulty | Common Co-occurrence |
|-----------|------------|---------------------|
| AM-GM Inequality | 0.4 | Optimization, Constraints |
| Cauchy-Schwarz | 0.5 | Sums, Products |
| Jensen's Inequality | 0.6 | Convexity, Averages |
| Polynomial Roots | 0.5 | Vieta's, Factoring |
| Functional Equations | 0.7 | Substitution, Induction |

### Combinatorial Techniques

| Technique | Difficulty | Common Co-occurrence |
|-----------|------------|---------------------|
| PIE (Inclusion-Exclusion) | 0.4 | Counting, Sets |
| Generating Functions | 0.6 | Recurrences, Sequences |
| Bijective Proof | 0.5 | Counting, Structures |
| Pigeonhole Principle | 0.4 | Existence, Bounds |
| Burnside's Lemma | 0.7 | Symmetry, Groups |

### Number-Theoretic Techniques

| Technique | Difficulty | Common Co-occurrence |
|-----------|------------|---------------------|
| Modular Arithmetic | 0.3 | Divisibility, Cycles |
| Fermat's Little Theorem | 0.5 | Primes, Powers |
| Chinese Remainder | 0.5 | Systems, Coprimality |
| Lifting the Exponent | 0.6 | p-adic, Divisibility |
| Quadratic Residues | 0.6 | Legendre, Solvability |

---

## Appendix B: Example Problem Processing

**Input:** NuminaMath problem #12345

```
Problem: Find all positive integers n such that n² + 1 divides n! + 1.

Solution: We claim n = 1, 2, 3 are the only solutions...
[full solution text]
```

**Step 1: Parse**
```json
{
  "problem_text": "Find all positive integers n such that n² + 1 divides n! + 1.",
  "solution_text": "We claim n = 1, 2, 3 are the only solutions...",
  "latex_expressions": ["n^2 + 1", "n! + 1", "n^2 + 1 | n! + 1"]
}
```

**Step 2: Classify**
```json
{
  "primary_technique": "divisibility_analysis",
  "secondary_techniques": ["small_cases", "bounding"],
  "topic": "number_theory",
  "difficulty": 0.65
}
```

**Step 3: Decompose**
```json
{
  "steps": [
    {"type": "insight", "text": "Check small cases first", "technique": "small_cases"},
    {"type": "technique", "text": "For large n, analyze n² + 1 mod p for prime p ≤ n", "technique": "modular_analysis"},
    {"type": "computation", "text": "Show n² + 1 has prime factor > n for n ≥ 4", "technique": "prime_bounds"},
    {"type": "technique", "text": "Conclude n! + 1 not divisible by such prime", "technique": "factorial_divisibility"},
    {"type": "computation", "text": "Verify n = 1, 2, 3 work", "technique": "verification"}
  ]
}
```

**Step 4: AST Generation**
```
Expression: n² + 1
AST: Add(Pow(Symbol('n'), 2), 1)
Canonical: ('add', ('pow', 'n', 2), 1)
```

**Step 5: Embed**
```
TEXT_EMB: [0.12, -0.34, ..., 0.56]  (256d)
MATH_AST_EMB: [0.78, 0.23, ..., -0.12]  (256d)
TECHNIQUE_EMB: [0.45, -0.67, ..., 0.89]  (128d)
DIFFICULTY_EMB: [0.65, 0.70, 0.55, 0.60]  (64d)
STEP_POS_EMB: [0.0, 0.25, 0.5, 0.75, 1.0]  (32d per step)
```

**Step 6: Index**
```javascript
await ruvector.insert({
  collection: 'math_problems',
  id: 'numinamath_12345',
  embedding: compositeVector,  // 736d
  metadata: {
    source: 'numinamath',
    topic: 'number_theory',
    primary_technique: 'divisibility_analysis',
    difficulty: 0.65,
    step_count: 5
  }
});

// Also insert each step separately
for (const step of steps) {
  await ruvector.insert({
    collection: 'math_steps',
    id: `numinamath_12345_step_${step.index}`,
    embedding: stepVector,
    metadata: {
      problem_id: 'numinamath_12345',
      step_index: step.index,
      step_type: step.type,
      technique: step.technique
    }
  });
}
```

---

## Appendix C: RuVector Schema

### Collections

```javascript
// Problems collection
{
  name: 'math_problems',
  dimension: 736,
  metric: 'cosine',
  metadata_schema: {
    source: 'string',           // numinamath, aops, math, etc.
    topic: 'string',            // number_theory, combinatorics, etc.
    primary_technique: 'string',
    secondary_techniques: 'string[]',
    difficulty: 'float',
    step_count: 'int',
    has_formal: 'boolean',
    created_at: 'timestamp'
  }
}

// Steps collection
{
  name: 'math_steps',
  dimension: 736,
  metric: 'cosine',
  metadata_schema: {
    problem_id: 'string',
    step_index: 'int',
    step_type: 'string',        // insight, technique, computation
    technique: 'string',
    position: 'float',          // 0.0 = first, 1.0 = last
    created_at: 'timestamp'
  }
}

// Techniques graph
{
  name: 'technique_graph',
  type: 'graph',
  node_schema: {
    name: 'string',
    level: 'int',               // 1, 2, or 3
    parent: 'string',
    difficulty_base: 'float'
  },
  edge_schema: {
    relation: 'string',         // SUBSUMES, CO_OCCURS, etc.
    weight: 'float'
  }
}
```

---

*Implementation Plan v1.0*
*Target: AIMO Progress Prize 3 ($2.2M)*
*Generated: 2024-11-29*
*Status: Ready for Phase 1*
