# RuVector + MDAP Benchmark Quick Reference

## Top 7 Target Benchmarks

### 🏆 Tier 1 Priority (Strongest Fit)

**1. HotpotQA - Multi-Hop QA**
- URL: https://paperswithcode.com/sota/question-answering-on-hotpotqa
- Why: Multi-hop reasoning is core strength (GNN learns paths, MDAP decomposes hops)
- Gap: Current SOTA uses fixed graphs; RuVector learns dynamic retrieval graphs
- Target: Top-5 leaderboard position

**2. BEIR - Zero-Shot Retrieval**
- URL: https://paperswithcode.com/sota/zero-shot-text-search-on-beir
- Why: 18 diverse tasks validate decomposition generalization
- Gap: Dense retrievers underperform; re-rankers are expensive
- Target: Top-10 across 18 datasets

**3. RAGBench - Explainable RAG**
- URL: https://arxiv.org/abs/2407.11005
- Why: New benchmark (2024), explainability aligns with decomposition
- Gap: First comprehensive RAG benchmark, room for innovation
- Target: Competitive with finetuned RoBERTa baseline

---

### 💪 Tier 2 Priority (Strong Technical Fit)

**4. CoDEx - Knowledge Graph Completion**
- URL: https://paperswithcode.com/paper/codex-a-comprehensive-knowledge-graph
- Why: GNN native architecture for graph reasoning
- Gap: Hard negatives challenge existing embeddings
- Target: State-of-the-art (GNN advantage is clear)

**5. CodeXGLUE - Code Intelligence**
- URL: https://github.com/microsoft/CodeXGLUE
- Why: Decomposition mirrors code modularity, GNN captures program graphs
- Gap: Current methods use flat embeddings, miss structural reasoning
- Target: Top-10 on code search and summarization tasks

---

### 📊 Tier 3 Priority (Broad Validation)

**6. MTEB/MMTEB - Multi-Task Embeddings**
- URL: https://paperswithcode.com/paper/mteb-massive-text-embedding-benchmark
- Why: 500+ tasks validate multi-task transfer learning
- Gap: High compute cost for multilingual models
- Target: Competitive across 8 task categories

**7. MS MARCO - Passage Ranking**
- URL: https://paperswithcode.com/sota/passage-ranking-on-ms-marco
- Why: Real-world search queries, industry relevance
- Gap: Balancing retrieval efficiency and re-ranking accuracy
- Target: Top-10 on passage ranking task

---

## Key Competitive Advantages

| Feature | RuVector + MDAP | Current SOTA |
|---------|----------------|--------------|
| **Multi-hop Reasoning** | GNN learns dynamic paths | Fixed retrieval or flat embeddings |
| **Explainability** | Graph structure + decomposition steps | Black-box embeddings |
| **Efficiency** | Decomposition reduces compute | Re-rankers are expensive |
| **Transfer Learning** | Task-adaptive decomposition | Task-specific fine-tuning |
| **Graph Reasoning** | Self-learning GNN on entities | Manual graph construction |

---

## Implementation Roadmap

**Phase 1 (Months 1-3): Proof of Concept**
- Target: HotpotQA distractor setting
- Deliverable: Workshop paper, top-5 leaderboard

**Phase 2 (Months 4-6): Generalization**
- Target: BEIR + CoDEx
- Deliverable: Conference paper (ACL/EMNLP)

**Phase 3 (Months 7-12): Comprehensive Validation**
- Target: All 7 benchmarks
- Deliverable: NeurIPS/ICLR main track paper

---

## Novel Contributions for Publications

1. **Self-learning retrieval graphs** vs. fixed graphs (HotpotQA, CoDEx)
2. **Task-adaptive decomposition** for zero-shot transfer (BEIR, MTEB)
3. **Explainable multi-hop reasoning** with learned paths (RAGBench)
4. **Graph-structured code retrieval** with hierarchical decomposition (CodeXGLUE)
5. **Intent-aware search decomposition** for real-world queries (MS MARCO)

---

## Resource Estimates

- **Compute:** 4-8 A100 GPUs per benchmark (2-3 months training)
- **Storage:** 500GB for datasets + retrieval corpora
- **Team:** Research lead + ML engineer + research scientist
- **Timeline:** 12 months for all 7 benchmarks

---

## Success Metrics

**Quantitative:**
- Top-5: HotpotQA, CoDEx
- Top-10: BEIR, MS MARCO, CodeXGLUE
- Competitive (within 5% SOTA): MTEB, RAGBench

**Qualitative:**
- 1+ top-tier publication (NeurIPS/ICLR/ACL/EMNLP)
- 100+ citations within 2 years
- Open-source adoption and community impact

---

## Immediate Next Steps (Week 1-2)

1. Set up HotpotQA baseline (BM25 + dense bi-encoder)
2. Prototype RuVector retrieval on HotpotQA subset (1000 examples)
3. Implement MDAP decomposition for multi-hop questions
4. Run ablation: GNN vs. flat, MDAP vs. monolithic
5. Draft experiment plan for full HotpotQA evaluation

---

**Quick Links:**
- [Full Research Document](RUVECTOR_MDAP_BENCHMARK_RESEARCH.md)
- [Papers With Code](https://paperswithcode.com)
- [BEIR GitHub](https://github.com/UKPLab/beir)
- [MTEB GitHub](https://github.com/embeddings-benchmark/mteb)
- [HotpotQA GitHub](https://github.com/hotpotqa/hotpot)
