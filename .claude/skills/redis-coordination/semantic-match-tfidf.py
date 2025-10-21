#!/usr/bin/env python3
"""
TF-IDF Semantic Agent Matcher

Purpose: Use semantic similarity (TF-IDF + cosine similarity) to match
         task descriptions to optimal agents.

Usage:
    ./semantic-match-tfidf.py "Build user dashboard" 0.5
    ./semantic-match-tfidf.py "Create auth system" --threshold 0.6 --json

Output:
    agent1,agent2,agent3  (default)
    {"agents": [...]}     (--json)
"""

import sys
import json
import argparse

try:
    from sklearn.feature_extraction.text import TfidfVectorizer
    from sklearn.metrics.pairwise import cosine_similarity
except ImportError:
    print("Error: scikit-learn not installed", file=sys.stderr)
    print("Install: pip install scikit-learn", file=sys.stderr)
    sys.exit(1)


# Agent Registry with Enhanced Semantic Descriptions
# Each description includes keywords, domains, and related concepts
AGENTS = {
    "react-frontend-engineer": (
        "React frontend UI components dashboard interface SPA web application "
        "user interface client-side JavaScript TypeScript hooks state management "
        "responsive design web pages forms interactive"
    ),
    "ui-designer": (
        "UI design user experience UX interface design visual design wireframes "
        "mockups prototypes accessibility usability user flows style guide branding"
    ),
    "backend-dev": (
        "API server backend endpoint REST GraphQL database business logic "
        "server-side Node.js Python Java authentication authorization data processing "
        "microservices integration middleware"
    ),
    "rust-developer": (
        "Rust systems programming memory safety concurrency performance "
        "low-level programming async tokio cargo ownership borrowing compiler "
        "systems language native speed"
    ),
    "rust-mvp-developer": (
        "Rust MVP prototype proof-of-concept quick implementation basic features "
        "simple rapid development starter code minimal viable product"
    ),
    "rust-enterprise-developer": (
        "Rust production enterprise advanced optimization performance critical "
        "production-grade scalable robust high-performance mission-critical"
    ),
    "mobile-dev": (
        "React Native mobile iOS Android app development cross-platform "
        "smartphone tablet native modules mobile UI touch gestures mobile UX "
        "app store deployment mobile navigation"
    ),
    "devops-engineer": (
        "infrastructure deployment Docker Kubernetes AWS cloud CI/CD pipeline "
        "automation orchestration containerization cloud infrastructure Terraform "
        "monitoring logging provisioning infrastructure-as-code"
    ),
    "security-specialist": (
        "security authentication encryption RBAC vulnerabilities penetration testing "
        "threat analysis security audit compliance access control authorization "
        "cybersecurity secure coding SSL/TLS security review"
    ),
    "system-architect": (
        "architecture system design component design API design database schema "
        "high-level design scalability patterns microservices architecture decisions "
        "technical leadership design patterns distributed systems"
    ),
    "tester": (
        "testing test unit-test integration-test TDD quality-assurance QA "
        "test-coverage Jest Mocha pytest test-strategy validation verification "
        "automated testing regression testing"
    ),
    "reviewer": (
        "code-review quality-assessment technical-debt code-analysis quality-metrics "
        "code-standards linting static-analysis best-practices code-quality "
        "peer-review refactoring suggestions"
    ),
    "researcher": (
        "research explore investigate analyze study evaluation comparison "
        "proof-of-concept feasibility analysis technical-research documentation "
        "exploration discovery learning experimentation"
    ),
    "coder": (
        "implementation feature-development bug-fix coding general-development "
        "problem-solving code-implementation feature-completion programming "
        "general-purpose development writing code"
    ),
    "perf-analyzer": (
        "performance optimization profiling benchmarking speed efficiency "
        "performance-tuning latency throughput resource-optimization "
        "scalability load-testing stress-testing performance-metrics"
    ),
    "accessibility-advocate": (
        "accessibility WCAG screen-readers keyboard-navigation ARIA semantic-HTML "
        "inclusive-design disability-access a11y accessibility-testing "
        "accessibility-compliance universal-design"
    ),
    "code-quality-validator": (
        "quality-validation architecture-compliance code-standards advanced-quality "
        "deep-analysis compliance-checking quality-gates code-metrics "
        "technical-excellence validation comprehensive-review"
    ),
    "performance-benchmarker": (
        "performance-benchmarking metrics analysis load-testing stress-testing "
        "profiling performance-monitoring benchmark-suite performance-validation "
        "throughput-testing latency-analysis"
    ),
    "product-owner": (
        "product strategy business decisions scope management priorities "
        "stakeholder requirements roadmap planning strategic-decisions "
        "product-vision business-value feature-prioritization"
    ),
}


def semantic_match(task: str, threshold: float = 0.5, top_n: int = None):
    """
    Match task description to agents using TF-IDF semantic similarity.

    Args:
        task: Task description string
        threshold: Minimum similarity score (0.0-1.0)
        top_n: Return top N matches (None = all above threshold)

    Returns:
        List of dicts: [{"agent": "name", "score": 0.85}, ...]
    """
    if not task or not task.strip():
        return []

    # Build corpus: agent descriptions + task
    corpus = list(AGENTS.values()) + [task]

    # Vectorize using TF-IDF
    vectorizer = TfidfVectorizer(
        lowercase=True,
        stop_words='english',
        ngram_range=(1, 2),  # Unigrams + bigrams
        max_df=0.85,  # Ignore very common terms
        min_df=1
    )

    try:
        tfidf = vectorizer.fit_transform(corpus)
    except ValueError as e:
        # Handle edge case: empty vocabulary
        print(f"Warning: {e}", file=sys.stderr)
        return []

    # Compute cosine similarity
    task_vector = tfidf[-1]  # Last item is the task
    agent_vectors = tfidf[:-1]  # All others are agents
    similarities = cosine_similarity(task_vector, agent_vectors)[0]

    # Build results
    results = []
    for agent_name, score in zip(AGENTS.keys(), similarities):
        if score >= threshold:
            results.append({
                "agent": agent_name,
                "score": float(score)
            })

    # Sort by score (descending)
    results.sort(key=lambda x: x["score"], reverse=True)

    # Limit to top N if specified
    if top_n is not None:
        results = results[:top_n]

    return results


def main():
    parser = argparse.ArgumentParser(
        description="Semantic agent matching using TF-IDF"
    )
    parser.add_argument(
        "task",
        nargs="?",
        default="",
        help="Task description to match against agents"
    )
    parser.add_argument(
        "-t", "--threshold",
        type=float,
        default=0.5,
        help="Minimum similarity threshold (0.0-1.0, default: 0.5)"
    )
    parser.add_argument(
        "-n", "--top-n",
        type=int,
        default=None,
        help="Return top N matches (default: all above threshold)"
    )
    parser.add_argument(
        "-j", "--json",
        action="store_true",
        help="Output as JSON instead of CSV"
    )
    parser.add_argument(
        "-v", "--verbose",
        action="store_true",
        help="Show scores for all matches"
    )

    args = parser.parse_args()

    # Get task from args or stdin
    task = args.task
    if not task and not sys.stdin.isatty():
        task = sys.stdin.read().strip()

    if not task:
        parser.print_help()
        sys.exit(1)

    # Perform matching
    matches = semantic_match(task, args.threshold, args.top_n)

    # Output results
    if args.json:
        # JSON output
        print(json.dumps({
            "task": task,
            "threshold": args.threshold,
            "matches": matches
        }, indent=2))
    elif args.verbose:
        # Verbose output with scores
        for match in matches:
            print(f"{match['agent']}: {match['score']:.3f}")
    else:
        # CSV output (agent names only)
        agent_names = [m["agent"] for m in matches]
        print(",".join(agent_names))


if __name__ == "__main__":
    main()
