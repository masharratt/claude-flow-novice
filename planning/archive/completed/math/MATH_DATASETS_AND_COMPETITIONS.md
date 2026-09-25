# Math Datasets & Competitions for MDAP + RuVector

Research compilation for seeding a competition math proving ground.

---

## Active Kaggle Competitions

### AIMO Progress Prize 3 (CURRENT - $2.2M Prize)

**URL:** [AI Mathematical Olympiad - Progress Prize 3](https://www.kaggle.com/competitions/ai-mathematical-olympiad-progress-prize-3)

| Attribute | Value |
|-----------|-------|
| **Prize Pool** | $2,207,152 + $110,000 extra prizes |
| **Problems** | 110 original problems (zero contamination risk) |
| **Difficulty** | National Olympiad → IMO level |
| **Topics** | Algebra, Combinatorics, Geometry, Number Theory |
| **Hardware** | H100 GPUs available; up to 128 H100s for select participants |
| **Status** | Active |

**Key Features:**
- 5-digit answers (vs. 3 in AIMO1/2) - makes guessing impossible
- All problems are original - no data contamination
- Extra prizes: Longest Leader, Best Write-up, MathCorpus Prize

**Why RuVector Fits:**
- Pattern match against 860K+ NuminaMath problems
- Learn which techniques work for which problem shapes
- Retrieve similar solved problems for each decomposed step

---

### Previous AIMO Results (Context)

| Competition | Winner | Score | Prize |
|-------------|--------|-------|-------|
| AIMO1 (July 2024) | Team Numina | 29/50 | $131,072 |
| AIMO2 (2025) | NemoSkills (Nvidia) | 34/50 | ~$500K |
| AIMO3 | Active | TBD | $2.2M |

**Gap to close:** Commercial models (OpenAI) solved 47/50 AIMO2 problems; open-source best was 34/50.

---

## Major Training Datasets

### Tier 1: Competition-Level (Best for RuVector Seeding)

#### 1. NuminaMath-CoT
**URL:** [project-numina/aimo-progress-prize](https://github.com/project-numina/aimo-progress-prize)

| Attribute | Value |
|-----------|-------|
| **Size** | ~860,000 problem-solution pairs |
| **Sources** | Chinese high school → IMO Olympiad |
| **Format** | Chain-of-Thought reasoning |
| **Quality** | Won AIMO1 |

**RuVector Application:**
- Embed all 860K problems with technique tags
- GNN learns problem-type → technique mappings
- Query similar problems during decomposition

#### 2. Omni-MATH (Olympiad-Level Benchmark)
**URL:** [Omni-MATH](https://omni-math.github.io/)

| Attribute | Value |
|-----------|-------|
| **Size** | 4,428 competition-level problems |
| **Categories** | 33+ sub-domains |
| **Difficulty** | 10 distinct levels |
| **Focus** | Olympiad-level only |

**RuVector Application:**
- Difficulty-stratified retrieval
- Sub-domain clustering for specialized technique learning

#### 3. AoPS-Instruct
**URL:** [DSL-Lab/aops](https://github.com/DSL-Lab/aops)

| Attribute | Value |
|-----------|-------|
| **Size** | 600,000+ QA pairs |
| **Source** | Art of Problem Solving forum |
| **Quality** | Community-driven solutions |
| **Bonus** | LiveAoPSBench - evolving contamination-resistant benchmark |

**RuVector Application:**
- Rich solution discussions reveal multiple approaches
- Learn which approaches community prefers

#### 4. MATH Dataset (Hendrycks)
**URL:** [hendrycks/competition_math](https://huggingface.co/datasets/hendrycks/competition_math)

| Attribute | Value |
|-----------|-------|
| **Size** | 12,500 problems |
| **Sources** | AMC 10, AMC 12, AIME |
| **Format** | Step-by-step LaTeX solutions |
| **Answer Format** | \boxed{} tagged |

**RuVector Application:**
- Clean, structured format ideal for embedding
- Step-by-step solutions enable micro-task learning

---

### Tier 2: Supplementary Datasets

#### 5. GSM8K (Grade School Math)
**URL:** [openai/gsm8k](https://github.com/openai/grade-school-math)

| Attribute | Value |
|-----------|-------|
| **Size** | 8,500 problems |
| **Level** | Grade school |
| **Purpose** | Baseline reasoning |

**RuVector Application:** Foundation-level patterns; error library seeding

#### 6. AIME Problem Set 1983-2024
**URL:** [Kaggle: AIME 1983-2024](https://www.kaggle.com/datasets/hemishveeraboina/aime-problem-set-1983-2024)

| Attribute | Value |
|-----------|-------|
| **Size** | 40+ years of AIME |
| **Format** | Structured |
| **Quality** | Official problems |

**RuVector Application:** Historical pattern analysis; technique evolution tracking

#### 7. MathOdyssey
**URL:** [Nature: MathOdyssey](https://www.nature.com/articles/s41597-025-05283-3)

| Attribute | Value |
|-----------|-------|
| **Size** | 387 expert-generated problems |
| **Levels** | High school → University → Olympiad |
| **Quality** | Detailed solutions, categorized |

**RuVector Application:** Multi-level difficulty calibration

---

### Tier 3: Formal Theorem Proving Benchmarks

#### 8. miniF2F
**URL:** [openai/miniF2F](https://github.com/openai/miniF2F)

| Attribute | Value |
|-----------|-------|
| **Size** | 488 problems (244 validation, 244 test) |
| **Sources** | AIME, AMC, IMO |
| **Formal Systems** | Lean, Metamath, Isabelle, HOL Light |
| **Focus** | Cross-system formal proofs |

**RuVector Application:**
- Formal verification of generated proofs
- Learn which proof tactics apply to which problems

#### 9. ProofNet
**URL:** [zhangir-azerbayev/ProofNet](https://github.com/zhangir-azerbayev/proofnet)

| Attribute | Value |
|-----------|-------|
| **Size** | 371 problems |
| **Level** | Undergraduate |
| **Topics** | Analysis, Linear Algebra, Abstract Algebra, Topology |
| **Format** | Lean 3 + Natural language |

**RuVector Application:** Undergraduate-level proof patterns

#### 10. PUTNAMBENCH
**URL:** [trishullab/PutnamBench](https://github.com/trishullab/PutnamBench)

| Attribute | Value |
|-----------|-------|
| **Size** | 522 problems (1938-2023) |
| **Source** | Putnam Competition |
| **Formal Systems** | Lean 4, Isabelle, Coq |
| **Quality** | Manually constructed, debugged |

**RuVector Application:**
- Highest difficulty undergraduate competition
- Functional variations combat contamination

---

## Kaggle Datasets (Direct Download)

| Dataset | URL | Size | Best For |
|---------|-----|------|----------|
| **Math problems IMO** | [Kaggle](https://www.kaggle.com/datasets/artemgoncarov/math-problems-imo) | IMO problems | Olympiad patterns |
| **AIME+IMO with answers** | [Kaggle](https://www.kaggle.com/datasets/dolbokostya/math-problems-with-answers-aime-imo) | AIME + IMO | LLM evaluation |
| **AoPS Olympiad** | [Kaggle](https://www.kaggle.com/datasets/imbishal7/math-olympiad-problems-and-solutions-aops) | AoPS scraped | Rich solutions |
| **AMIO parsed AoPS** | [Kaggle](https://www.kaggle.com/datasets/alexryzhkov/amio-parsed-art-of-problem-solving-website) | April 2024 | Latest data |
| **olympiad-bench IMO** | [HuggingFace](https://huggingface.co/datasets/brando/olympiad-bench-imo-math-boxed-825-v2-21-08-2024) | 825 IMO | Boxed format |
| **IMO-geometry** | [HuggingFace](https://huggingface.co/datasets/theblackcat102/IMO-geometry) | 100 geometry | Geometry focus |

---

## Open Problems (Unproven Theorems)

### Millennium Prize Problems ($1M each)

| Problem | Status | Difficulty |
|---------|--------|------------|
| Riemann Hypothesis | Open | Extreme |
| P vs NP | Open | Extreme |
| Navier-Stokes | Open | Extreme |
| Hodge Conjecture | Open | Extreme |
| Yang-Mills | Open | Extreme |
| Birch and Swinnerton-Dyer | Open | Extreme |
| Poincaré Conjecture | **Solved (2006)** | - |

**Source:** [Clay Mathematics Institute](https://www.claymath.org/millennium-problems/)

### Famous Unsolved Problems

| Problem | Prize | Status |
|---------|-------|--------|
| **Collatz Conjecture** | $120M JPY (~$1M USD) | Open - "Mathematics may not be ready" (Erdős) |
| **Goldbach Conjecture** | Various | Open |
| **Twin Prime Conjecture** | - | Open |
| **ABC Conjecture** | - | Claimed (controversial) |

**Source:** [Wikipedia: Unsolved Problems](https://en.wikipedia.org/wiki/List_of_unsolved_problems_in_mathematics)

### RuVector Application for Open Problems:
- Embed all known partial results
- Track proof attempt patterns
- Learn which techniques have been tried
- Suggest novel combinations

---

## Recent Breakthroughs (Not in Training Data)

### 2024 Major Proofs

| Theorem | Date | Significance |
|---------|------|--------------|
| **Geometric Langlands Conjecture** | May 2024 | 800+ pages, 30 years work, "crowning achievement" |
| **Height Zero Conjecture** | Sept 2024 | Brauer's 1955 problem solved (Annals of Mathematics) |
| **New Pythagorean Proofs** | Oct 2024 | High schoolers found 10 new trigonometric proofs |
| **Sphere Packing Record** | 2024 | 75-year-old record broken for higher dimensions |
| **Busy Beaver BB(5)** | 2024 | Fifth value determined |

**Sources:**
- [Scientific American: 7 Coolest Math Discoveries 2024](https://www.scientificamerican.com/article/the-7-coolest-mathematical-discoveries-of-2024/)
- [Quanta: Year in Math 2024](https://www.quantamagazine.org/the-year-in-math-20241216/)

### 2025 Developments

| Discovery | Significance |
|-----------|--------------|
| **Milnor Conjecture counterexamples** | 50-year-old conjecture disproven |
| **n² + 1 sequence progress** | New abc conjecture estimates (Pasten) |

**Source:** [IFLScience: Cool Math 2025](https://www.iflscience.com/all-the-cool-math-of-2025-including-two-proofs-of-one-ancient-greek-theorem-77533)

### Why These Matter for RuVector:
- Problems solved AFTER most training data cutoffs
- Fresh ground truth for validation
- Novel proof techniques to learn

---

## Recommended Seeding Strategy

### Phase 1: Foundation (Week 1-2)
1. Download NuminaMath-CoT (860K problems)
2. Download MATH Dataset (12.5K structured)
3. Download AIME 1983-2024 (historical)
4. Create base embeddings with technique tags

### Phase 2: Competition Focus (Week 3-4)
1. Download Omni-MATH (4.4K Olympiad)
2. Download AoPS-Instruct (600K+ QA)
3. Index by difficulty level and topic
4. Build technique → problem-type graph

### Phase 3: Formal Verification (Week 5-6)
1. Integrate miniF2F (488 formal)
2. Integrate ProofNet (371 undergraduate)
3. Map natural language → formal proof patterns
4. Build proof tactic library

### Phase 4: AIMO3 Competition Entry (Week 7+)
1. Train on seeded database
2. Implement MDAP decomposition
3. Query RuVector for similar problems per step
4. Generate solutions with confidence scores
5. Submit to AIMO3 leaderboard

---

## Data Volume Summary

| Source | Problems | Quality | Format |
|--------|----------|---------|--------|
| NuminaMath-CoT | 860,000 | High | CoT |
| AoPS-Instruct | 600,000 | High | QA |
| MATH Dataset | 12,500 | Very High | Step-by-step |
| Omni-MATH | 4,428 | Olympic | Categorized |
| miniF2F | 488 | Formal | Multi-system |
| ProofNet | 371 | Formal | Lean |
| PUTNAMBENCH | 522 | Formal | Multi-system |
| GSM8K | 8,500 | Baseline | Word problems |
| **Total** | **~1.5M+** | | |

---

## Competition Timeline

| Event | Date | Prize |
|-------|------|-------|
| AIMO3 Active | Now | $2.2M |
| AIMO Grand Prize | Open | $5M (IMO gold equivalent) |

---

## Sources

### Datasets
- [NuminaMath / AIMO Prize](https://huggingface.co/blog/winning-aimo-progress-prize)
- [MATH Dataset](https://arxiv.org/abs/2103.03874)
- [Omni-MATH](https://omni-math.github.io/)
- [AoPS-Instruct](https://arxiv.org/html/2501.14275v1)
- [miniF2F](https://github.com/openai/miniF2F)
- [ProofNet](https://github.com/zhangir-azerbayev/proofnet)
- [PUTNAMBENCH](https://github.com/trishullab/PutnamBench)

### Competitions
- [AIMO Progress Prize 3](https://www.kaggle.com/competitions/ai-mathematical-olympiad-progress-prize-3)
- [AIMO Prize Official](https://aimoprize.com/)

### Open Problems
- [Millennium Prize Problems](https://www.claymath.org/millennium-problems/)
- [Unsolved Problems (Wikipedia)](https://en.wikipedia.org/wiki/List_of_unsolved_problems_in_mathematics)
- [MathWorld Unsolved](https://mathworld.wolfram.com/UnsolvedProblems.html)

### Recent Breakthroughs
- [Scientific American 2024](https://www.scientificamerican.com/article/the-7-coolest-mathematical-discoveries-of-2024/)
- [Quanta Magazine Year in Math](https://www.quantamagazine.org/the-year-in-math-20241216/)
- [ScienceDaily: Height Zero](https://www.sciencedaily.com/releases/2024/10/241009183553.htm)
- [ScienceDaily: Pythagorean Proofs](https://www.sciencedaily.com/releases/2024/10/241028132143.htm)

---

*Generated: 2024-11-29*
*Purpose: MDAP + RuVector Competition Math Proving Ground*
