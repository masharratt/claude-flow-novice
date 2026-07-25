# OpenML Datasets for RuVector + MDAP Integration
**Research Focus**: Business use cases with rich feature sets suitable for vector embeddings, GNN self-learning, and micro-task decomposition

**Research Date**: 2025-11-30
**Target Applications**: Predictive maintenance, credit/risk scoring, customer churn, demand forecasting, quality control

---

## Executive Summary

This research identifies 8 high-value OpenML datasets suitable for demonstrating RuVector (vector database with GNN self-learning) + MDAP (micro-task decomposition) capabilities. Datasets were selected based on:

- Rich feature sets (10-50+ features) suitable for embedding
- Complex pattern recognition requirements
- Proven difficulty in AutoML benchmarks
- Clear business value propositions
- Opportunities for sequential/temporal learning

**Key Finding**: Credit scoring, customer churn, and fraud detection datasets offer the strongest immediate business value with feature complexity that benefits from GNN-enhanced retrieval.

---

## Dataset Portfolio

### 1. Credit Card Fraud Detection
**OpenML ID**: 1597
**URL**: https://www.openml.org/d/1597

**Dataset Characteristics**:
- **Instances**: 284,807 transactions
- **Features**: 30 (V1-V28 PCA components + Time + Amount)
- **Target**: Binary classification (fraud/legitimate)
- **Class Distribution**: Highly imbalanced (0.172% fraud)
- **Source**: Worldline & ULB Machine Learning Group
- **Time Period**: 2-day transaction window (Sept 2013)

**Business Application**:
- Real-time fraud detection in payment processing
- Transaction risk scoring
- Pattern-based anomaly detection
- Financial crime prevention

**RuVector + MDAP Fit**:
- **Vector Embedding Strength**: 28 PCA features already optimized for dimensionality, ideal for vector search
- **GNN Learning Opportunity**: Temporal patterns (Time feature) + transaction sequences enable graph-based fraud ring detection
- **MDAP Decomposition**: Break down into micro-tasks:
  - High-value transaction screening (Amount > threshold)
  - Temporal pattern analysis (transaction velocity)
  - Anomaly cluster detection (PCA space outliers)
  - Sequential behavior modeling
- **Self-Learning Value**: New fraud patterns emerge continuously; GNN can learn from misclassifications and adapt embeddings
- **Retrieval Augmentation**: Similar historical fraud cases inform real-time decisions

**Complexity Factors**:
- Extreme class imbalance requires sophisticated sampling
- PCA features obscure direct interpretability
- Temporal dependencies across transactions
- Evolving fraud tactics (concept drift)

**Expected Performance Gains**:
- RuVector similarity search can rapidly identify transactions similar to known fraud
- GNN can detect subtle relational patterns invisible to traditional ML
- MDAP can isolate hard cases for specialist models

---

### 2. Credit Approval
**OpenML ID**: 29
**URL**: https://www.openml.org/d/29

**Dataset Characteristics**:
- **Instances**: ~690 credit applications
- **Features**: 15 mixed (categorical + numerical)
- **Target**: Binary (approved/rejected)
- **Domain**: Consumer credit decisions
- **Source**: UCI Machine Learning Repository

**Business Application**:
- Consumer loan approval automation
- Credit risk assessment
- Fair lending compliance monitoring
- Application processing optimization

**RuVector + MDAP Fit**:
- **Vector Embedding Strength**: Mixed feature types (demographics, financial history, employment) create rich semantic space
- **GNN Learning Opportunity**: Applicant similarity networks; learn from borderline cases
- **MDAP Decomposition**:
  - Income verification sub-task
  - Credit history analysis
  - Debt-to-income ratio assessment
  - Employment stability check
- **Self-Learning Value**: Feedback loop from loan performance improves approval criteria
- **Retrieval Augmentation**: Find similar past applicants to inform marginal decisions

**Complexity Factors**:
- Feature interactions (income + debt, employment + stability)
- Regulatory fairness constraints
- Interpretability requirements for denials

**Expected Performance Gains**:
- Consistent decision-making across similar applicants
- Reduced human review overhead for clear cases
- Better handling of novel applicant profiles

---

### 3. Telco Customer Churn
**OpenML ID**: 42178
**URL**: https://www.openml.org/d/42178

**Dataset Characteristics**:
- **Instances**: ~7,000 customers
- **Features**: ~20 (services, contract, demographics, billing)
- **Target**: Binary (churned/retained)
- **Domain**: Telecommunications
- **Source**: IBM Sample Data Sets

**Feature Categories**:
- Demographics: gender, age range, partners, dependents
- Services: phone, multiple lines, internet, security, backup, protection, tech support, streaming
- Account: tenure, contract type, payment method, paperless billing, monthly charges, total charges
- Target: Churn within last month

**Business Application**:
- Proactive customer retention programs
- Service bundle optimization
- Pricing strategy refinement
- Customer lifetime value prediction

**RuVector + MDAP Fit**:
- **Vector Embedding Strength**: Service adoption patterns create distinct customer segments
- **GNN Learning Opportunity**: Customer cohort graphs; learn churn contagion patterns
- **MDAP Decomposition**:
  - High-risk customer identification
  - Service satisfaction analysis
  - Contract expiration prediction
  - Price sensitivity modeling
- **Self-Learning Value**: Monthly churn data provides continuous feedback; GNN adapts to seasonal patterns
- **Retrieval Augmentation**: Identify retention strategies that worked for similar customers

**Complexity Factors**:
- Class imbalance (typically 20-30% churn rate)
- Feature interactions (contract type + services)
- Time-dependent patterns (tenure, seasonality)
- Multiple churn reasons (price, service, competition)

**Expected Performance Gains**:
- Earlier churn warning signals (3-6 months advance)
- Personalized retention offers based on similar customer responses
- Reduced false positives in churn prediction

**Industry Impact**:
- Telecom average churn rate: 30%+ annually
- Retention cost: 5-25x cheaper than acquisition
- High ROI for even modest accuracy improvements

---

### 4. Adult Census Income
**OpenML ID**: 1590
**URL**: https://www.openml.org/d/1590

**Dataset Characteristics**:
- **Instances**: 48,842 census records
- **Features**: 14 (13 after removing redundant education/education-num)
- **Target**: Binary (income >50K or <=50K)
- **Class Distribution**: ~75% <=50K, ~25% >50K
- **Source**: 1994 US Census (UCI Repository)
- **Authors**: Ronny Kohavi, Barry Becker

**Feature Details**:
- **Numerical**: age, fnlwgt (demographic weight), education-num, capital-gain, capital-loss, hours-per-week
- **Categorical**: workclass, education, marital-status, occupation, relationship, race, sex, native-country

**Business Application**:
- Credit risk modeling (income estimation)
- Insurance premium pricing
- Marketing segment targeting
- Economic mobility research
- Fair lending compliance

**RuVector + MDAP Fit**:
- **Vector Embedding Strength**: Rich socioeconomic features create nuanced similarity space
- **GNN Learning Opportunity**: Demographic cluster patterns; occupation-education-income relationships
- **MDAP Decomposition**:
  - Education-income correlation analysis
  - Work hours vs income prediction
  - Capital gains pattern detection
  - Occupation risk profiling
- **Self-Learning Value**: GNN can learn non-linear interactions (e.g., education + occupation + hours)
- **Retrieval Augmentation**: Find similar demographic profiles for income estimation

**Complexity Factors**:
- Feature interactions (education x occupation x hours)
- Demographic proxy variables (fnlwgt interpretation)
- Fairness constraints (race, sex must not bias predictions)
- Class imbalance (75/25 split)

**Expected Performance Gains**:
- Better handling of rare occupation + education combinations
- Improved fairness through similar-case retrieval
- Reduced bias in underrepresented demographic segments

**Benchmark Context**:
- Classic ML benchmark dataset
- Well-studied baseline performance
- Enables direct comparison with traditional methods

---

### 5. Bank Marketing
**OpenML ID**: 1461
**URL**: https://www.openml.org/d/1461

**Dataset Characteristics**:
- **Instances**: ~45,000 phone call contacts
- **Features**: ~20 (client data, campaign data, economic indicators)
- **Target**: Binary (term deposit subscription yes/no)
- **Domain**: Direct marketing campaigns
- **Source**: Portuguese banking institution
- **Context**: Phone-based marketing; multiple contacts per client

**Feature Categories** (typical):
- Client: age, job, marital status, education, credit default, housing loan, personal loan
- Campaign: contact type, month, day of week, duration, number of contacts
- Economic: employment variation rate, consumer price index, consumer confidence index
- Previous: outcome of previous campaign, days since last contact

**Business Application**:
- Campaign response prediction
- Customer targeting optimization
- Marketing budget allocation
- Contact frequency optimization
- Product-customer matching

**RuVector + MDAP Fit**:
- **Vector Embedding Strength**: Mix of demographic, behavioral, and economic features
- **GNN Learning Opportunity**: Client interaction history graphs; campaign response patterns
- **MDAP Decomposition**:
  - High-propensity client identification
  - Optimal contact timing prediction
  - Economic indicator influence analysis
  - Contact frequency optimization
- **Self-Learning Value**: Campaign outcomes feed back into next campaign strategy
- **Retrieval Augmentation**: Find similar clients who responded positively to tailor approach

**Complexity Factors**:
- Severe class imbalance (typically <10% positive responses)
- Multiple contacts complicate attribution
- Economic context variables (time-dependent)
- Call duration endogeneity (longer calls for interested clients)

**Expected Performance Gains**:
- Reduced wasted contact attempts (cost savings)
- Higher conversion rates through better targeting
- Optimal timing strategies per client segment

**Campaign Economics**:
- Cost per contact: $5-$20
- Conversion value: $500-$2000 (term deposit)
- ROI highly sensitive to targeting accuracy

---

### 6. Phoneme Classification
**OpenML ID**: 1489
**URL**: https://www.openml.org/d/1489

**Dataset Characteristics**:
- **Instances**: ~5,000+ phoneme observations
- **Features**: ~10+ spectral/acoustic features
- **Target**: Multi-class phoneme categories
- **Domain**: Speech recognition/audio processing
- **Source**: ROARS database (cochlear spectra)

**Feature Type**: Acoustic parameters simulating auditory nerve frequency response

**Business Application**:
- Voice authentication systems
- Speech-to-text quality control
- Call center audio transcription
- Voice assistant training
- Accent/dialect detection

**RuVector + MDAP Fit**:
- **Vector Embedding Strength**: Spectral features naturally suited to vector similarity (audio fingerprinting)
- **GNN Learning Opportunity**: Phoneme transition graphs; context-dependent pronunciation
- **MDAP Decomposition**:
  - Vowel vs consonant classification
  - Voiced vs unvoiced detection
  - Accent variant clustering
  - Noise-robust feature extraction
- **Self-Learning Value**: New accents and pronunciation variants continuously improve model
- **Retrieval Augmentation**: Find similar acoustic patterns for ambiguous phonemes

**Complexity Factors**:
- High-dimensional spectral data (voluminous observations)
- Context dependency (phoneme influenced by neighbors)
- Speaker variability (accents, voice characteristics)
- Temporal sequence matters (not i.i.d.)

**Expected Performance Gains**:
- Improved recognition of rare phoneme combinations
- Better handling of accented speech
- Reduced errors in noisy environments

**Practical Value**:
- Call center transcription accuracy directly impacts customer service metrics
- Voice authentication false rejection costs customer friction
- Speech-to-text errors compound in downstream NLP tasks

---

### 7. Cylinder Bands
**OpenML ID**: 6332
**URL**: https://www.openml.org/d/6332

**Dataset Characteristics**:
- **Instances**: ~500-1000 printing press runs
- **Features**: ~40 process parameters
- **Target**: Binary (band/no-band defect)
- **Domain**: Manufacturing quality control
- **Context**: Rotogravure printing press cylinder bands

**Feature Types** (typical in manufacturing):
- Process settings: temperature, pressure, speed, viscosity
- Material properties: ink type, substrate, cylinder characteristics
- Environmental: humidity, ambient temperature
- Operational: operator ID, shift, maintenance status

**Business Application**:
- Predictive quality control
- Process optimization
- Defect root cause analysis
- Preventive maintenance scheduling
- Yield improvement

**RuVector + MDAP Fit**:
- **Vector Embedding Strength**: High-dimensional process parameter space benefits from similarity search
- **GNN Learning Opportunity**: Process parameter interaction graphs; multi-factor defect causation
- **MDAP Decomposition**:
  - Critical parameter identification (temperature, pressure)
  - Material compatibility checks
  - Operator performance analysis
  - Maintenance correlation detection
- **Self-Learning Value**: Production runs provide continuous feedback; GNN learns complex parameter interactions
- **Retrieval Augmentation**: Find similar past runs to predict quality outcome

**Complexity Factors**:
- High feature dimensionality (~40 parameters)
- Non-linear process interactions
- Class imbalance (defects are rare)
- Categorical + continuous feature mix
- Domain knowledge needed for feature engineering

**Expected Performance Gains**:
- Early defect detection (real-time process adjustment)
- Reduced scrap/rework costs
- Optimized process parameters per product type
- Root cause identification speed

**Manufacturing Economics**:
- Defect rate: 2-10% typical
- Scrap cost: $100-$10,000 per incident
- Downtime cost: $1,000-$50,000 per hour
- High ROI for quality prediction

---

### 8. Credit Risk Dataset
**OpenML ID**: 43454
**URL**: https://www.openml.org/d/43454

**Dataset Characteristics**:
- **Instances**: Varies by version (typically 1,000-10,000)
- **Features**: ~20-30 (credit history, financials, demographics)
- **Target**: Binary or multi-class risk levels
- **Domain**: Consumer/commercial lending
- **Context**: Loan default prediction

**Feature Categories** (typical):
- Credit history: payment history, delinquencies, credit score, accounts
- Financials: income, debt-to-income ratio, assets, liabilities
- Loan details: amount, term, purpose, collateral
- Demographics: age, employment, marital status, dependents

**Business Application**:
- Loan approval automation
- Interest rate pricing (risk-based)
- Portfolio risk management
- Regulatory capital requirements (Basel III)
- Collection prioritization

**RuVector + MDAP Fit**:
- **Vector Embedding Strength**: Multi-faceted risk profile creates rich similarity space
- **GNN Learning Opportunity**: Borrower network graphs; co-borrower risk, guarantor analysis
- **MDAP Decomposition**:
  - Credit history deep-dive
  - Income verification and stability
  - Debt burden assessment
  - Collateral valuation
  - Behavioral scoring (payment patterns)
- **Self-Learning Value**: Loan performance data (default/payoff) provides ground truth for continuous learning
- **Retrieval Augmentation**: Find similar borrowers to estimate default probability

**Complexity Factors**:
- Class imbalance (defaults 2-10% typically)
- Regulatory compliance (Fair Lending Act, ECOA)
- Interpretability requirements (adverse action notices)
- Temporal dynamics (economic cycles, employment trends)
- Missing data (incomplete credit histories)

**Expected Performance Gains**:
- Improved default prediction (lower charge-offs)
- Better pricing accuracy (risk-adjusted rates)
- Reduced false positives (more approvals for creditworthy borrowers)
- Faster underwriting (automated decisions for clear cases)

**Financial Impact**:
- 1% improvement in default prediction = millions in reduced losses for large lenders
- Reduced manual review costs: $50-$200 per application
- Regulatory penalties for discrimination: $millions

---

## Cross-Cutting Themes

### Why These Datasets Suit RuVector + MDAP

**1. Feature Richness**
- All datasets have 10-50+ features creating high-dimensional embedding spaces
- Mixed data types (categorical + numerical) challenge traditional similarity metrics
- RuVector's vector search excels in high-dimensional spaces

**2. Pattern Complexity**
- Non-linear feature interactions (e.g., education x occupation x hours)
- Temporal dependencies (churn, fraud, marketing campaigns)
- GNN's graph structure can model these relationships explicitly

**3. Class Imbalance**
- Fraud (0.17%), Churn (20-30%), Defects (2-10%)
- Retrieval-augmented approach helps with rare positive cases
- MDAP can isolate hard cases for specialized handling

**4. Sequential/Temporal Opportunities**
- Credit card transactions over time
- Customer lifecycle stages (churn)
- Campaign contact sequences (marketing)
- GNN naturally models sequential patterns as graphs

**5. Business-Critical Accuracy**
- False positives/negatives have real costs (fraud losses, customer friction, wasted marketing spend)
- Marginal accuracy improvements justify advanced techniques
- Interpretability matters (regulatory, customer trust)

### MDAP Decomposition Patterns Observed

**Common Micro-Task Categories**:
1. **Threshold-Based Splits**: High-value transactions, high-risk customers, critical parameters
2. **Feature Subset Analysis**: Demographic screening, financial validation, service usage patterns
3. **Temporal Stages**: Short-term vs long-term predictions, campaign phases, lifecycle stages
4. **Risk Stratification**: Low/medium/high risk buckets with specialized models
5. **Domain-Specific Rules**: Regulatory checks, business logic validation, expert heuristics

### GNN Self-Learning Opportunities

**Graph Construction Strategies**:
- **Similarity Graphs**: Connect similar transactions, customers, or cases
- **Temporal Graphs**: Link sequential events (time-ordered transactions, customer journey stages)
- **Relational Graphs**: Borrower-guarantor, household members, co-purchasers
- **Feature Interaction Graphs**: Model which features influence each other

**Learning Mechanisms**:
- **Node Classification**: Predict fraud/churn/default on customer/transaction nodes
- **Edge Prediction**: Predict relationships (will this customer churn like similar neighbors?)
- **Graph Embedding**: Learn low-dimensional representations preserving graph structure
- **Attention Mechanisms**: Learn which neighbors/features matter most

---

## Benchmark Performance Context

### OpenML-CC18 Baseline
- These datasets are part of or similar to the OpenML-CC18 benchmark (72 curated classification datasets)
- AutoML baseline accuracies available for comparison
- Documented performance: H2O (binary), AutoKeras (multiclass), AutoSklearn (overall)

### Expected RuVector + MDAP Gains
- **Fraud Detection**: 5-10% improvement in precision at same recall (fewer false alerts)
- **Churn Prediction**: 3-7% improvement in F1 score (better balance of precision/recall)
- **Credit Risk**: 2-5% reduction in default rate for same approval volume
- **Quality Control**: 10-20% reduction in defect detection latency

### Validation Strategy
- Split data chronologically (not random) to test temporal generalization
- Use production-relevant metrics: cost-weighted F1, expected value, ROI
- Compare against AutoML baselines from OpenML benchmarks
- Ablation studies: RuVector only, MDAP only, combined

---

## Implementation Priorities

### Phase 1: Quick Wins (Weeks 1-4)
**Dataset**: Credit Card Fraud (ID 1597)
- **Rationale**: Clear business value, well-studied baseline, extreme imbalance challenges MDAP
- **RuVector Use**: Similarity search for fraud cases in 28D PCA space
- **MDAP Use**: High-value transaction priority queue, temporal pattern micro-tasks
- **Success Metric**: Precision@100 (top 100 alerts contain X% of fraud)

### Phase 2: Customer Analytics (Weeks 5-8)
**Dataset**: Telco Churn (ID 42178)
- **Rationale**: Service feature richness, business-critical retention, temporal patterns
- **RuVector Use**: Customer similarity for retention strategy recommendation
- **MDAP Use**: Risk stratification (high/medium/low), service-specific churn models
- **Success Metric**: Churn prediction 3 months in advance with 80%+ precision

### Phase 3: Credit & Risk (Weeks 9-12)
**Datasets**: Credit Approval (ID 29) + Credit Risk (ID 43454)
- **Rationale**: Regulatory importance, interpretability requirements, GNN network effects
- **RuVector Use**: Similar applicant retrieval for borderline cases
- **MDAP Use**: Multi-stage underwriting (income, history, debt, employment)
- **Success Metric**: 5% reduction in default rate or 10% increase in approvals at same risk

### Phase 4: Advanced Applications (Weeks 13+)
**Datasets**: Bank Marketing (ID 1461), Cylinder Bands (ID 6332)
- **Rationale**: Complex optimization (marketing ROI, manufacturing yield)
- **RuVector Use**: Campaign response prediction, process parameter optimization
- **MDAP Use**: Economic indicator sub-models, multi-parameter quality gates
- **Success Metric**: 20% improvement in marketing ROI, 15% defect reduction

---

## Data Access & Setup

### OpenML Python API
```python
from sklearn.datasets import fetch_openml

# Example: Credit Card Fraud
fraud_data = fetch_openml(data_id=1597, as_frame=True, parser='auto')
X, y = fraud_data.data, fraud_data.target

# Example: Telco Churn
churn_data = fetch_openml(data_id=42178, as_frame=True, parser='auto')

# Example: Credit Approval
credit_data = fetch_openml(data_id=29, as_frame=True, parser='auto')
```

### Preprocessing Considerations
- **Handle Missing Values**: Different strategies per dataset (median, mode, model-based imputation)
- **Encode Categoricals**: One-hot, target encoding, or embeddings for high-cardinality
- **Scale Numericals**: StandardScaler for distance-based methods, MinMaxScaler for neural nets
- **Temporal Splits**: Use date/time features to create realistic train/test splits
- **Class Imbalance**: SMOTE, class weights, or focal loss depending on severity

---

## Risk Mitigation

### Data Quality Issues
- **Missing Values**: Credit datasets often have 5-20% missingness
- **Outliers**: Income, transaction amounts can have extreme outliers
- **Label Noise**: Fraud/churn labels may have errors (late-arriving information)
- **Mitigation**: Robust preprocessing, outlier detection, label smoothing

### Computational Complexity
- **High Dimensionality**: 30-50 features x 50,000-300,000 instances
- **Graph Construction**: Building similarity graphs is O(n²) naively
- **Mitigation**: Approximate nearest neighbors (FAISS, Annoy), sparse graphs, batching

### Business Constraints
- **Interpretability**: Credit, insurance require explainable decisions
- **Fairness**: Demographics must not cause disparate impact
- **Latency**: Fraud detection needs <100ms response time
- **Mitigation**: SHAP values for RuVector retrievals, fairness-aware MDAP splits, optimized vector indexing

---

## Expected Outcomes

### Technical Contributions
1. **Benchmark Results**: Published performance on OpenML datasets vs AutoML baselines
2. **RuVector Validation**: Demonstrates GNN-enhanced retrieval in production-like scenarios
3. **MDAP Effectiveness**: Shows micro-task decomposition improves complex pattern tasks
4. **Open Source Artifacts**: Reproducible notebooks, pre-trained embeddings, evaluation scripts

### Business Value Demonstrations
1. **Fraud Detection ROI**: X% reduction in fraud losses, Y% fewer false alerts
2. **Churn Prevention**: Z% more customers retained, $W cost savings vs acquisition
3. **Credit Underwriting**: A% more loans approved at same risk level, B% faster decisions
4. **Quality Control**: C% fewer defects, D% reduction in scrap/rework costs

### Research Insights
1. **When GNN Helps**: Identify dataset characteristics where graph learning adds value
2. **MDAP Decomposition Strategies**: Document effective task splitting heuristics
3. **Embedding Quality**: Measure retrieval relevance vs traditional similarity metrics
4. **Scalability Limits**: Define problem sizes where approach remains practical

---

## References & Sources

### OpenML Platform
- [OpenML-CC18 Benchmark Suite](https://www.openml.org/s/99) - 72 curated classification datasets
- [OpenML Benchmarking Documentation](https://docs.openml.org/benchmark/) - Suite creation and usage
- [AutoML Benchmark Framework](https://github.com/openml/automlbenchmark) - Baseline comparison tool

### Dataset Sources
- [Credit Card Fraud Detection](https://www.openml.org/d/1597) - Worldline & ULB Machine Learning Group
- [Telco Customer Churn](https://www.openml.org/d/42178) - IBM Sample Data Sets
- [Credit Approval Dataset](https://www.openml.org/d/29) - UCI Machine Learning Repository
- [Adult Census Income](https://www.openml.org/d/1590) - 1994 US Census Bureau
- [Bank Marketing](https://www.openml.org/d/1461) - Portuguese Banking Institution
- [Phoneme Classification](https://www.openml.org/d/1489) - ROARS Database
- [Cylinder Bands](https://www.openml.org/d/6332) - Manufacturing Quality Control
- [Credit Risk Dataset](https://www.openml.org/d/43454) - OpenML Community

### Academic References
- [OpenML Benchmarking Suites Paper](https://arxiv.org/abs/1708.03731) - Bischl et al., 2021
- [AutoML Evaluation Study](https://pmc.ncbi.nlm.nih.gov/articles/PMC12095557/) - Ferreira et al., 2024
- [Credit Risk with Graph ML](https://pubsonline.informs.org/doi/10.1287/ijds.2022.00018) - INFORMS Journal
- [Customer Churn Prediction Review](https://www.mdpi.com/2504-4990/7/3/105) - MDPI 2024

### Industry Resources
- [Kaggle Credit Card Fraud](https://www.kaggle.com/datasets/mlg-ulb/creditcardfraud) - Additional analysis
- [UCI Adult Dataset](https://archive.ics.uci.edu/dataset/2/adult) - Original source
- [Predictive Maintenance Datasets](https://github.com/kokikwbt/predictive-maintenance) - Curated list
- [Industrial ML Datasets](https://github.com/nicolasj92/industrial-ml-datasets) - Manufacturing focus

---

## Next Steps

1. **Data Acquisition**: Download all 8 datasets via OpenML API, verify integrity
2. **Baseline Establishment**: Run AutoML benchmarks (H2O, AutoSklearn) for comparison
3. **RuVector Integration**: Build vector indices, test similarity search quality
4. **MDAP Design**: Document decomposition strategies per dataset
5. **Evaluation Framework**: Define metrics, splits, fairness constraints
6. **Documentation**: Create reproducible notebooks with all results

**Target Milestone**: Phase 1 (Fraud Detection) complete within 4 weeks with published benchmark results.
