# Workflow Codification Priority Features - Pseudocode

**Version:** 1.0.0
**Status:** DRAFT
**Created:** 2025-11-16
**Companion to:** SPECIFICATION.md

---

## Table of Contents

1. [Feature 1: Skill Health Score](#feature-1-skill-health-score)
2. [Feature 2: Self-Healing Skills](#feature-2-self-healing-skills)
3. [Feature 3: Regression Testing](#feature-3-regression-testing)
4. [Feature 4: AI Pattern Recommender](#feature-4-ai-pattern-recommender)
5. [Feature 5: Skill Composition](#feature-5-skill-composition)
6. [Feature 6: Execution Tracing](#feature-6-execution-tracing)

---

## Feature 1: Skill Health Score

### Algorithm 1.1: Calculate Health Score

```python
def calculate_skill_health(skill_name: str) -> HealthScore:
    """
    Calculate composite health score for a skill.

    Returns: HealthScore object with overall score and component breakdown
    """

    # Step 1: Calculate reliability score (35% weight)
    reliability_score = calculate_reliability_score(skill_name)

    # Step 2: Calculate performance score (20% weight)
    performance_score = calculate_performance_score(skill_name)

    # Step 3: Calculate edge case score (20% weight)
    edge_case_score = calculate_edge_case_score(skill_name)

    # Step 4: Calculate documentation score (10% weight)
    documentation_score = calculate_documentation_score(skill_name)

    # Step 5: Calculate test coverage score (15% weight)
    test_coverage_score = get_test_coverage(skill_name)

    # Step 6: Weighted average
    overall_score = (
        reliability_score * 0.35 +
        performance_score * 0.20 +
        edge_case_score * 0.20 +
        documentation_score * 0.10 +
        test_coverage_score * 0.15
    )

    # Step 7: Determine health level
    health_level = classify_health_level(overall_score)

    return HealthScore(
        overall=round(overall_score),
        reliability=reliability_score,
        performance=performance_score,
        edge_cases=edge_case_score,
        documentation=documentation_score,
        test_coverage=test_coverage_score,
        level=health_level
    )


def calculate_reliability_score(skill_name: str) -> float:
    """
    Calculate reliability based on success rate of last 100 executions.

    Returns: Score 0-100
    """

    # Query last 100 executions
    executions = db.query("""
        SELECT status
        FROM skill_executions
        WHERE skill_id = ?
        ORDER BY execution_started_at DESC
        LIMIT 100
    """, [skill_name])

    if len(executions) == 0:
        return 0  # No execution history

    # Count successes
    success_count = sum(1 for e in executions if e.status == 'success')

    # Calculate percentage
    reliability_score = (success_count / len(executions)) * 100

    return reliability_score


def calculate_performance_score(skill_name: str) -> float:
    """
    Calculate performance score vs baseline.

    Returns: Score 0-100
    """

    # Get baseline execution time
    baseline = db.query_one("""
        SELECT baseline_execution_time_seconds
        FROM skill_metadata
        WHERE skill_name = ?
    """, [skill_name])

    if baseline is None:
        return 100  # No baseline, assume OK

    # Get average recent execution time
    avg_duration = db.query_one("""
        SELECT AVG(execution_duration_seconds)
        FROM skill_executions
        WHERE skill_id = ?
          AND execution_started_at > NOW() - INTERVAL '30 days'
    """, [skill_name])

    if avg_duration is None:
        return 100  # No recent executions

    # Calculate score
    if avg_duration <= baseline:
        return 100  # Faster than baseline
    elif avg_duration <= baseline * 1.2:
        return 90   # Within 20% of baseline
    elif avg_duration <= baseline * 1.5:
        return 75   # Within 50% of baseline
    elif avg_duration <= baseline * 2.0:
        return 50   # 2x slower
    else:
        return 25   # >2x slower


def calculate_edge_case_score(skill_name: str) -> float:
    """
    Calculate edge case score (inverse of edge case rate).

    Returns: Score 0-100
    """

    # Get total executions and edge case count
    stats = db.query_one("""
        SELECT
            COUNT(*) as total,
            COUNT(*) FILTER (WHERE edge_case_detected = TRUE) as edge_cases
        FROM skill_executions
        WHERE skill_id = ?
          AND execution_started_at > NOW() - INTERVAL '30 days'
    """, [skill_name])

    if stats.total == 0:
        return 100  # No executions, assume OK

    # Calculate edge case rate
    edge_case_rate = stats.edge_cases / stats.total

    # Invert (lower edge case rate = higher score)
    edge_case_score = (1 - edge_case_rate) * 100

    return edge_case_score


def calculate_documentation_score(skill_name: str) -> float:
    """
    Check documentation completeness.

    Returns: Score 0-100
    """

    metadata = load_skill_metadata(skill_name)

    score = 0

    # Check SKILL.md exists (40 points)
    if file_exists(f".claude/skills/{skill_name}/SKILL.md"):
        score += 40

    # Check metadata.json completeness (30 points)
    if metadata.get('documentation_complete'):
        score += 30

    # Check edge-cases.json exists (30 points)
    if file_exists(f".claude/skills/{skill_name}/edge-cases.json"):
        score += 30

    return min(score, 100)


def classify_health_level(score: float) -> str:
    """
    Classify health level based on score.
    """
    if score >= 90:
        return "excellent"
    elif score >= 75:
        return "good"
    elif score >= 60:
        return "fair"
    else:
        return "poor"
```

### Algorithm 1.2: Update Health Score After Execution

```python
def update_health_score_after_execution(execution_id: str):
    """
    Trigger health score recalculation after skill execution.
    """

    # Get skill name from execution
    execution = db.get_execution(execution_id)
    skill_name = execution.skill_id

    # Check cache (avoid recalculating too frequently)
    cache_key = f"health_score:{skill_name}"
    cached_score = cache.get(cache_key)

    if cached_score and cache.age(cache_key) < 300:  # 5 minutes
        return  # Use cached score

    # Recalculate score
    new_score = calculate_skill_health(skill_name)

    # Store in database
    db.execute("""
        INSERT INTO skill_health_history (skill_name, overall_score, component_scores, calculated_at)
        VALUES (?, ?, ?, NOW())
    """, [skill_name, new_score.overall, json.dumps(new_score.components)])

    # Update cache
    cache.set(cache_key, new_score, ttl=300)

    # Check for score drop alert
    check_score_degradation_alert(skill_name, new_score)


def check_score_degradation_alert(skill_name: str, new_score: HealthScore):
    """
    Alert if health score dropped significantly.
    """

    # Get previous score from 24 hours ago
    previous_score = db.query_one("""
        SELECT overall_score
        FROM skill_health_history
        WHERE skill_name = ?
          AND calculated_at > NOW() - INTERVAL '24 hours'
        ORDER BY calculated_at ASC
        LIMIT 1
    """, [skill_name])

    if previous_score is None:
        return  # No baseline

    # Calculate drop
    score_drop = previous_score - new_score.overall

    # Alert if dropped >10 points
    if score_drop > 10:
        send_alert(
            type="health_score_degradation",
            skill_name=skill_name,
            previous_score=previous_score,
            new_score=new_score.overall,
            drop=score_drop
        )
```

---

## Feature 2: Self-Healing Skills

### Algorithm 2.1: Retry Wrapper Execution

```python
def execute_skill_with_retry(skill_name: str, params: dict, retry_config: RetryConfig) -> ExecutionResult:
    """
    Execute skill with automatic retry on transient errors.

    Args:
        skill_name: Name of skill to execute
        params: Input parameters
        retry_config: Retry configuration (max_retries, backoff_strategy, retriable_errors)

    Returns: ExecutionResult with final status
    """

    attempt = 1
    circuit_breaker = get_circuit_breaker(skill_name)

    while attempt <= retry_config.max_retries:

        # Check circuit breaker
        if circuit_breaker.is_open():
            log(f"Circuit breaker OPEN for {skill_name}, skipping execution")
            return ExecutionResult(
                status="failed",
                exit_code=-1,
                error_message="Circuit breaker open (too many failures)"
            )

        # Log attempt
        log(f"Executing {skill_name}, attempt {attempt}/{retry_config.max_retries}")

        # Execute skill
        start_time = time.now()
        result = execute_skill_direct(skill_name, params)
        duration = time.now() - start_time

        # Record attempt
        record_execution_attempt(skill_name, attempt, result, duration)

        # Success - return immediately
        if result.exit_code == 0:
            log(f"✅ Success on attempt {attempt}")

            # Close circuit breaker on success
            if circuit_breaker.is_half_open():
                circuit_breaker.close()

            return result

        # Failure - check if retriable
        if not is_retriable_error(result.exit_code, retry_config.retriable_errors):
            log(f"❌ Non-retriable error (exit {result.exit_code}), aborting")
            circuit_breaker.record_failure()
            return result

        # Transient error - retry with backoff
        if attempt < retry_config.max_retries:
            backoff_delay = calculate_backoff_delay(
                attempt=attempt,
                strategy=retry_config.backoff_strategy,
                base_delay=retry_config.base_delay_seconds
            )

            log(f"⚠️ Retriable error, retrying in {backoff_delay}s...")
            time.sleep(backoff_delay)

            attempt += 1
        else:
            # Max retries exhausted
            log(f"❌ Failed after {retry_config.max_retries} attempts")
            circuit_breaker.record_failure()
            return result

    # Should never reach here
    return result


def is_retriable_error(exit_code: int, retriable_errors: list) -> bool:
    """
    Check if error code is retriable.

    Retriable errors:
    - 124: Timeout
    - 7: Connection refused
    - 110: Connection timeout
    - 503: Service unavailable

    Non-retriable errors:
    - 1: Validation error
    - 2: Precondition failure
    - 127: Command not found
    """

    if exit_code in retriable_errors:
        return True

    # Default retriable codes
    default_retriable = [124, 7, 110, 503]

    if exit_code in default_retriable:
        return True

    # Default non-retriable codes
    default_non_retriable = [1, 2, 127]

    if exit_code in default_non_retriable:
        return False

    # Unknown error - assume non-retriable (safe default)
    return False


def calculate_backoff_delay(attempt: int, strategy: str, base_delay: float) -> float:
    """
    Calculate backoff delay based on strategy.

    Strategies:
    - exponential: base_delay * (2 ** (attempt - 1))
    - linear: base_delay * attempt
    - constant: base_delay
    """

    if strategy == "exponential":
        return base_delay * (2 ** (attempt - 1))

    elif strategy == "linear":
        return base_delay * attempt

    elif strategy == "constant":
        return base_delay

    else:
        # Default to exponential
        return base_delay * (2 ** (attempt - 1))


class CircuitBreaker:
    """
    Circuit breaker pattern for skill execution.

    States:
    - CLOSED: Normal operation, errors tracked
    - OPEN: Too many failures, block all executions
    - HALF_OPEN: Cooldown period, allow 1 retry attempt
    """

    def __init__(self, skill_name: str):
        self.skill_name = skill_name
        self.state = self.load_state()
        self.failure_threshold = 5
        self.cooldown_seconds = 300  # 5 minutes

    def is_open(self) -> bool:
        """Check if circuit is open (blocking executions)."""

        if self.state.status == "OPEN":
            # Check if cooldown period has passed
            if time.now() - self.state.opened_at > self.cooldown_seconds:
                # Enter half-open state
                self.state.status = "HALF_OPEN"
                self.save_state()
                return False

            return True

        return False

    def is_half_open(self) -> bool:
        return self.state.status == "HALF_OPEN"

    def record_failure(self):
        """Record execution failure."""

        self.state.consecutive_failures += 1

        # Open circuit if threshold exceeded
        if self.state.consecutive_failures >= self.failure_threshold:
            self.state.status = "OPEN"
            self.state.opened_at = time.now()
            log(f"🚨 Circuit breaker OPENED for {self.skill_name} after {self.failure_threshold} failures")

        self.save_state()

    def close(self):
        """Close circuit after successful execution."""

        if self.state.status == "HALF_OPEN":
            log(f"✅ Circuit breaker CLOSED for {self.skill_name}")

        self.state.status = "CLOSED"
        self.state.consecutive_failures = 0
        self.save_state()
```

---

## Feature 3: Regression Testing

### Algorithm 3.1: Generate Test Suite from History

```python
def generate_regression_test_suite(skill_name: str, lookback_days: int = 90) -> TestSuite:
    """
    Generate regression test suite from historical successful executions.

    Args:
        skill_name: Skill to generate tests for
        lookback_days: Historical window (default: 90 days)

    Returns: TestSuite with ~50 test cases
    """

    # Step 1: Fetch successful executions
    successful_executions = db.query("""
        SELECT
            input_parameters,
            stdout,
            execution_duration_seconds,
            team_invoked_by
        FROM skill_executions
        WHERE skill_id = ?
          AND status = 'success'
          AND execution_started_at > NOW() - INTERVAL ? days
        ORDER BY execution_started_at DESC
    """, [skill_name, lookback_days])

    if len(successful_executions) == 0:
        raise ValueError(f"No successful executions found for {skill_name}")

    # Step 2: Deduplicate by input parameters (avoid redundant tests)
    unique_executions = deduplicate_by_input(successful_executions)

    # Step 3: Stratified sampling (ensure diversity)
    sampled_executions = stratified_sample(
        executions=unique_executions,
        sample_size=50,
        strata_key='team_invoked_by'
    )

    # Step 4: Generate test cases
    test_cases = []

    for idx, execution in enumerate(sampled_executions):
        test_case = create_test_case(
            test_id=f"{skill_name}-reg-{idx+1}",
            execution=execution,
            skill_name=skill_name
        )

        test_cases.append(test_case)

    # Step 5: Prioritize test cases
    prioritized_tests = prioritize_test_cases(test_cases)

    # Step 6: Create test suite
    test_suite = TestSuite(
        skill_name=skill_name,
        test_cases=prioritized_tests,
        generated_at=time.now(),
        lookback_days=lookback_days,
        total_tests=len(prioritized_tests)
    )

    # Step 7: Save test suite
    save_test_suite(test_suite)

    return test_suite


def deduplicate_by_input(executions: list) -> list:
    """
    Remove duplicate executions with identical input parameters.
    """

    seen_inputs = set()
    unique_executions = []

    for execution in executions:
        # Hash input parameters
        input_hash = hash_json(execution.input_parameters)

        if input_hash not in seen_inputs:
            seen_inputs.add(input_hash)
            unique_executions.append(execution)

    return unique_executions


def stratified_sample(executions: list, sample_size: int, strata_key: str) -> list:
    """
    Sample executions ensuring representation across strata (e.g., teams).
    """

    # Group by strata
    strata_groups = {}
    for execution in executions:
        strata_value = execution[strata_key]

        if strata_value not in strata_groups:
            strata_groups[strata_value] = []

        strata_groups[strata_value].append(execution)

    # Calculate samples per stratum (proportional allocation)
    total_executions = len(executions)
    sampled_executions = []

    for strata_value, group_executions in strata_groups.items():
        # Proportional sample size
        proportion = len(group_executions) / total_executions
        stratum_sample_size = max(1, round(sample_size * proportion))

        # Random sample from stratum
        stratum_sample = random.sample(group_executions, min(stratum_sample_size, len(group_executions)))

        sampled_executions.extend(stratum_sample)

    # If we have too many, randomly trim
    if len(sampled_executions) > sample_size:
        sampled_executions = random.sample(sampled_executions, sample_size)

    return sampled_executions


def create_test_case(test_id: str, execution: Execution, skill_name: str) -> TestCase:
    """
    Create test case from execution record.
    """

    # Sanitize input parameters (remove credentials)
    sanitized_params = sanitize_sensitive_data(execution.input_parameters)

    # Extract expected output pattern (not exact match, due to timestamps)
    output_pattern = extract_output_pattern(execution.stdout)

    return TestCase(
        test_id=test_id,
        skill_name=skill_name,
        input_parameters=sanitized_params,
        expected_exit_code=0,
        expected_output_pattern=output_pattern,
        expected_duration_max_seconds=execution.execution_duration_seconds * 1.5,  # Allow 50% tolerance
        tags=classify_test_tags(execution),
        priority=calculate_test_priority(execution)
    )


def prioritize_test_cases(test_cases: list) -> list:
    """
    Prioritize test cases by importance.

    Priority levels:
    - P0 (Critical): Most frequent input patterns, covers 80% of usage
    - P1 (Important): Edge cases, less frequent but important
    - P2 (Nice-to-have): Performance tests, rare scenarios
    """

    # Sort by priority (P0 first, then P1, then P2)
    sorted_tests = sorted(test_cases, key=lambda t: t.priority)

    return sorted_tests
```

### Algorithm 3.2: Execute Regression Test Suite

```python
def execute_regression_test_suite(skill_name: str, new_skill_version: str) -> TestResults:
    """
    Execute regression test suite against new skill version.

    Args:
        skill_name: Skill to test
        new_skill_version: New version to validate

    Returns: TestResults with pass/fail status
    """

    # Step 1: Load test suite
    test_suite = load_test_suite(skill_name)

    if test_suite is None:
        raise ValueError(f"No test suite found for {skill_name}")

    # Step 2: Prepare test environment
    test_env = setup_test_environment(skill_name, new_skill_version)

    # Step 3: Execute tests (parallel execution)
    test_results = []

    with ThreadPoolExecutor(max_workers=10) as executor:
        futures = []

        for test_case in test_suite.test_cases:
            future = executor.submit(execute_test_case, test_case, test_env)
            futures.append(future)

        for future in as_completed(futures):
            result = future.result()
            test_results.append(result)

    # Step 4: Calculate pass rate
    total_tests = len(test_results)
    passed_tests = sum(1 for r in test_results if r.status == 'passed')
    pass_rate = (passed_tests / total_tests) * 100

    # Step 5: Determine overall status
    if pass_rate >= 95:
        overall_status = "passed"
    elif pass_rate >= 80:
        overall_status = "partial"
    else:
        overall_status = "failed"

    # Step 6: Cleanup test environment
    cleanup_test_environment(test_env)

    # Step 7: Create results summary
    results_summary = TestResults(
        skill_name=skill_name,
        skill_version=new_skill_version,
        total_tests=total_tests,
        passed_tests=passed_tests,
        failed_tests=total_tests - passed_tests,
        pass_rate=pass_rate,
        overall_status=overall_status,
        test_details=test_results,
        executed_at=time.now()
    )

    # Step 8: Save results
    save_test_results(results_summary)

    return results_summary


def execute_test_case(test_case: TestCase, test_env: TestEnvironment) -> TestResult:
    """
    Execute single test case.
    """

    start_time = time.now()

    try:
        # Execute skill with test inputs
        result = execute_skill_in_environment(
            skill_path=test_env.skill_path,
            params=test_case.input_parameters,
            timeout=test_case.expected_duration_max_seconds
        )

        duration = time.now() - start_time

        # Validate exit code
        if result.exit_code != test_case.expected_exit_code:
            return TestResult(
                test_id=test_case.test_id,
                status="failed",
                failure_reason=f"Exit code mismatch: expected {test_case.expected_exit_code}, got {result.exit_code}",
                duration=duration
            )

        # Validate output pattern
        if not matches_pattern(result.stdout, test_case.expected_output_pattern):
            return TestResult(
                test_id=test_case.test_id,
                status="failed",
                failure_reason=f"Output mismatch: expected pattern '{test_case.expected_output_pattern}'",
                duration=duration
            )

        # Validate duration
        if duration > test_case.expected_duration_max_seconds:
            return TestResult(
                test_id=test_case.test_id,
                status="failed",
                failure_reason=f"Timeout: expected <{test_case.expected_duration_max_seconds}s, took {duration}s",
                duration=duration
            )

        # Test passed
        return TestResult(
            test_id=test_case.test_id,
            status="passed",
            duration=duration
        )

    except Exception as e:
        return TestResult(
            test_id=test_case.test_id,
            status="error",
            failure_reason=f"Exception: {str(e)}",
            duration=time.now() - start_time
        )
```

---

## Feature 4: AI Pattern Recommender

### Algorithm 4.1: Analyze User Workflows

```python
def analyze_user_workflows_for_recommendations(user_id: str) -> list[Recommendation]:
    """
    Analyze user's recent workflows and suggest automation opportunities.

    Args:
        user_id: User to analyze

    Returns: List of recommendations ordered by strength
    """

    # Step 1: Fetch user's manual agent spawns (last 30 days)
    manual_workflows = db.query("""
        SELECT
            workflow_steps,
            COUNT(*) as occurrence_count,
            AVG(execution_time_seconds) as avg_duration,
            MAX(created_at) as last_occurrence
        FROM user_workflow_history
        WHERE user_id = ?
          AND created_at > NOW() - INTERVAL '30 days'
          AND workflow_type = 'manual_agent_spawn'
        GROUP BY workflow_steps
        HAVING COUNT(*) >= 3
    """, [user_id])

    # Step 2: Filter out already codified patterns
    novel_workflows = filter_not_codified(manual_workflows)

    # Step 3: Calculate recommendation strength for each pattern
    recommendations = []

    for workflow in novel_workflows:
        recommendation = create_recommendation(
            workflow=workflow,
            user_id=user_id
        )

        recommendations.append(recommendation)

    # Step 4: Check for similar existing skills
    recommendations_with_alternatives = []

    for rec in recommendations:
        similar_skills = find_similar_skills(rec.workflow_steps)
        rec.similar_skills = similar_skills
        recommendations_with_alternatives.append(rec)

    # Step 5: Sort by recommendation strength
    sorted_recommendations = sorted(
        recommendations_with_alternatives,
        key=lambda r: r.strength_score,
        reverse=True
    )

    return sorted_recommendations


def create_recommendation(workflow: dict, user_id: str) -> Recommendation:
    """
    Create recommendation for a workflow pattern.
    """

    # Calculate projected monthly savings
    monthly_occurrences = (workflow.occurrence_count / 30) * 30  # Normalize to monthly
    cost_per_manual_spawn = 0.75  # AI agent cost
    cost_per_skill_execution = 0.02  # Script execution cost
    monthly_savings = monthly_occurrences * (cost_per_manual_spawn - cost_per_skill_execution)

    # Calculate determinism score
    determinism_score = calculate_determinism(workflow.workflow_steps)

    # Calculate similarity to existing skills
    similarity_to_existing = calculate_max_similarity_to_catalog(workflow.workflow_steps)

    # Calculate recommendation strength
    strength_score = (
        (workflow.occurrence_count / 10) * 0.40 +    # Frequency weight
        similarity_to_existing * 0.30 +              # Reusability weight
        (monthly_savings / 10) * 0.20 +              # Value weight
        determinism_score * 0.10                     # Codify-ability weight
    )

    # Classify strength
    if strength_score >= 0.75:
        strength_level = "high"
    elif strength_score >= 0.50:
        strength_level = "medium"
    else:
        strength_level = "low"

    return Recommendation(
        user_id=user_id,
        workflow_steps=workflow.workflow_steps,
        occurrence_count=workflow.occurrence_count,
        projected_monthly_savings=monthly_savings,
        strength_score=strength_score,
        strength_level=strength_level,
        determinism_score=determinism_score,
        last_occurrence=workflow.last_occurrence,
        created_at=time.now()
    )


def calculate_determinism(workflow_steps: list) -> float:
    """
    Calculate determinism score for workflow.

    Deterministic workflows:
    - No user input prompts
    - No random number generation
    - No timestamps in logic
    - Idempotent operations

    Returns: Score 0.0-1.0
    """

    score = 1.0

    # Check for non-deterministic patterns
    non_deterministic_keywords = ['random', 'uuid', 'timestamp', 'read -p', 'input(']

    workflow_text = json.dumps(workflow_steps).lower()

    for keyword in non_deterministic_keywords:
        if keyword in workflow_text:
            score -= 0.2  # Penalty for non-determinism

    # Ensure score stays in range
    return max(0.0, min(1.0, score))


def find_similar_skills(workflow_steps: list) -> list[SimilarSkill]:
    """
    Find existing skills similar to the workflow.
    """

    # Get all existing skills
    existing_skills = db.query("""
        SELECT skill_name, workflow_steps
        FROM workflow_patterns
        WHERE status = 'deployed'
    """)

    similar_skills = []

    for skill in existing_skills:
        # Calculate Jaccard similarity
        similarity = calculate_jaccard_similarity(workflow_steps, skill.workflow_steps)

        if similarity >= 0.60:  # 60% similarity threshold
            similar_skills.append(SimilarSkill(
                skill_name=skill.skill_name,
                similarity_score=similarity
            ))

    # Sort by similarity (most similar first)
    similar_skills.sort(key=lambda s: s.similarity_score, reverse=True)

    return similar_skills


def calculate_jaccard_similarity(workflow_a: list, workflow_b: list) -> float:
    """
    Calculate Jaccard similarity between two workflows.

    Jaccard = |A ∩ B| / |A ∪ B|
    """

    set_a = set(workflow_a)
    set_b = set(workflow_b)

    intersection = len(set_a & set_b)
    union = len(set_a | set_b)

    if union == 0:
        return 0.0

    return intersection / union
```

---

## Feature 5: Skill Composition

### Algorithm 5.1: Detect Composition Patterns

```python
def detect_composition_patterns() -> list[CompositePattern]:
    """
    Analyze skill execution logs to detect frequently chained sequences.

    Returns: List of composite patterns that should be codified
    """

    # Step 1: Fetch sequential skill executions (within 5-minute windows)
    skill_sequences = db.query("""
        WITH skill_sequences AS (
            SELECT
                team_invoked_by,
                array_agg(skill_id ORDER BY execution_started_at) as skill_chain,
                COUNT(*) as sequence_length
            FROM skill_executions
            WHERE execution_started_at > NOW() - INTERVAL '30 days'
            GROUP BY team_invoked_by, DATE_TRUNC('minute', execution_started_at)
            HAVING COUNT(*) >= 2
        )
        SELECT
            skill_chain,
            COUNT(*) as occurrence_count,
            AVG(sequence_length) as avg_chain_length
        FROM skill_sequences
        GROUP BY skill_chain
        HAVING COUNT(*) >= 5
        ORDER BY COUNT(*) DESC
    """)

    # Step 2: Create composite pattern candidates
    composite_patterns = []

    for sequence in skill_sequences:
        pattern = create_composite_pattern(sequence)
        composite_patterns.append(pattern)

    # Step 3: Analyze parallelization opportunities
    for pattern in composite_patterns:
        pattern.parallel_groups = analyze_parallelization(pattern.steps)

    return composite_patterns


def create_composite_pattern(sequence: dict) -> CompositePattern:
    """
    Create composite pattern from skill sequence.
    """

    # Extract skill names
    skill_chain = sequence.skill_chain

    # Generate composite name
    composite_name = generate_composite_name(skill_chain)

    # Create steps
    steps = []
    for idx, skill_name in enumerate(skill_chain):
        step = CompositeStep(
            name=f"step-{idx+1}",
            skill=skill_name,
            execution_mode="sequential",
            on_error="stop"
        )
        steps.append(step)

    return CompositePattern(
        composite_name=composite_name,
        description=f"Composite workflow: {' → '.join(skill_chain)}",
        steps=steps,
        occurrence_count=sequence.occurrence_count,
        detected_at=time.now()
    )


def analyze_parallelization(steps: list[CompositeStep]) -> list[list[str]]:
    """
    Analyze steps to identify parallelization opportunities.

    Uses dependency analysis to group independent steps.

    Returns: List of parallel groups (each group can run concurrently)
    """

    # Build dependency graph
    dependency_graph = {}

    for step in steps:
        # Check if step has dependencies (based on data contracts)
        dependencies = identify_step_dependencies(step, steps)
        dependency_graph[step.name] = dependencies

    # Topological sort to determine execution order
    parallel_groups = []
    executed = set()

    while len(executed) < len(steps):
        # Find steps with no pending dependencies
        ready_steps = []

        for step in steps:
            if step.name in executed:
                continue

            dependencies = dependency_graph[step.name]

            if all(dep in executed for dep in dependencies):
                ready_steps.append(step.name)

        if len(ready_steps) == 0:
            raise ValueError("Circular dependency detected")

        # Add ready steps as parallel group
        parallel_groups.append(ready_steps)

        # Mark as executed
        executed.update(ready_steps)

    return parallel_groups


def identify_step_dependencies(step: CompositeStep, all_steps: list[CompositeStep]) -> list[str]:
    """
    Identify which previous steps this step depends on.

    Dependencies detected via:
    - Data contracts (step output matches step input)
    - Explicit depends_on declarations
    - Order in sequence (conservative: assume sequential dependency)
    """

    dependencies = []

    # Check explicit dependencies
    if hasattr(step, 'depends_on') and step.depends_on:
        dependencies.extend(step.depends_on)

    # Check data contract dependencies
    step_metadata = load_skill_metadata(step.skill)

    for prev_step in all_steps:
        if prev_step.name == step.name:
            break  # Only check previous steps

        prev_metadata = load_skill_metadata(prev_step.skill)

        # Check if step input matches previous step output
        if has_data_contract_dependency(step_metadata, prev_metadata):
            dependencies.append(prev_step.name)

    return list(set(dependencies))  # Remove duplicates
```

### Algorithm 5.2: Execute Composite Skill

```python
def execute_composite_skill(composite_name: str, params: dict) -> CompositeExecutionResult:
    """
    Execute composite skill with parallel optimization.

    Args:
        composite_name: Name of composite skill
        params: Input parameters

    Returns: CompositeExecutionResult with step-by-step results
    """

    # Step 1: Load composite definition
    composite = load_composite_definition(composite_name)

    # Step 2: Initialize execution context
    execution_context = ExecutionContext(
        composite_name=composite_name,
        params=params,
        workspace_dir=create_temp_workspace(),
        started_at=time.now()
    )

    # Step 3: Execute parallel groups sequentially
    all_step_results = []

    for group_idx, parallel_group in enumerate(composite.parallel_groups):

        log(f"Executing parallel group {group_idx+1}/{len(composite.parallel_groups)}")

        # Execute steps in parallel within group
        group_results = execute_parallel_group(
            parallel_group=parallel_group,
            composite=composite,
            execution_context=execution_context
        )

        all_step_results.extend(group_results)

        # Check for failures
        failed_steps = [r for r in group_results if r.status == 'failed']

        if len(failed_steps) > 0 and composite.error_handling == 'stop_on_error':
            log(f"❌ Step failed in group {group_idx+1}, aborting workflow")

            return CompositeExecutionResult(
                composite_name=composite_name,
                status="failed",
                step_results=all_step_results,
                completed_at=time.now()
            )

    # Step 4: Cleanup workspace
    cleanup_workspace(execution_context.workspace_dir)

    # Step 5: Create result summary
    result = CompositeExecutionResult(
        composite_name=composite_name,
        status="success",
        step_results=all_step_results,
        completed_at=time.now()
    )

    return result


def execute_parallel_group(parallel_group: list[str], composite: CompositePattern, execution_context: ExecutionContext) -> list[StepResult]:
    """
    Execute steps in parallel group concurrently.
    """

    step_results = []

    with ThreadPoolExecutor(max_workers=len(parallel_group)) as executor:
        futures = {}

        for step_name in parallel_group:
            # Find step definition
            step = next(s for s in composite.steps if s.name == step_name)

            # Submit for parallel execution
            future = executor.submit(
                execute_composite_step,
                step=step,
                execution_context=execution_context
            )

            futures[future] = step_name

        # Collect results
        for future in as_completed(futures):
            step_name = futures[future]
            result = future.result()
            step_results.append(result)

    return step_results


def execute_composite_step(step: CompositeStep, execution_context: ExecutionContext) -> StepResult:
    """
    Execute single step within composite workflow.
    """

    log(f"  Executing {step.name} ({step.skill})...")

    start_time = time.now()

    # Execute skill
    result = execute_skill_direct(
        skill_name=step.skill,
        params=execution_context.params,
        workspace_dir=execution_context.workspace_dir
    )

    duration = time.now() - start_time

    # Create step result
    step_result = StepResult(
        step_name=step.name,
        skill=step.skill,
        status="success" if result.exit_code == 0 else "failed",
        exit_code=result.exit_code,
        duration=duration,
        output=result.stdout,
        error=result.stderr
    )

    log(f"  {'✅' if step_result.status == 'success' else '❌'} {step.name} completed in {duration}s")

    return step_result
```

---

## Feature 6: Execution Tracing

### Algorithm 6.1: Create Execution Trace

```python
def create_execution_trace(skill_name: str, params: dict) -> Trace:
    """
    Initialize execution trace with correlation ID.

    Args:
        skill_name: Skill being executed
        params: Input parameters

    Returns: Trace object with unique ID
    """

    # Generate correlation ID
    trace_id = f"exec-{generate_short_uuid()}-{int(time.now())}"

    # Create trace record
    trace = Trace(
        trace_id=trace_id,
        skill_name=skill_name,
        started_at=time.now(),
        status="running",
        steps=[],
        metadata={
            "team": get_current_team(),
            "user": get_current_user(),
            "input_params_hash": hash_json(params)
        }
    )

    # Store in database (async)
    db.insert_async("execution_traces", trace.to_dict())

    # Store in context (for propagation)
    set_trace_context(trace_id)

    return trace


def record_trace_step(trace_id: str, step_name: str, step_data: dict):
    """
    Record step execution within trace.
    """

    step = TraceStep(
        step_number=get_next_step_number(trace_id),
        step_name=step_name,
        started_at=time.now(),
        status="running",
        **step_data
    )

    # Append step to trace
    db.execute("""
        UPDATE execution_traces
        SET steps = steps || ?::jsonb
        WHERE trace_id = ?
    """, [json.dumps(step.to_dict()), trace_id])


def complete_trace_step(trace_id: str, step_number: int, result: dict):
    """
    Mark step as complete with result.
    """

    db.execute("""
        UPDATE execution_traces
        SET steps[?] = jsonb_set(
            steps[?],
            '{completed_at}',
            ?::jsonb
        ),
        steps[?] = jsonb_set(
            steps[?],
            '{status}',
            ?::jsonb
        ),
        steps[?] = jsonb_set(
            steps[?],
            '{exit_code}',
            ?::jsonb
        )
        WHERE trace_id = ?
    """, [
        step_number, step_number, json.dumps(time.now()),
        step_number, step_number, json.dumps(result.get('status', 'success')),
        step_number, step_number, json.dumps(result.get('exit_code', 0)),
        trace_id
    ])


def finalize_trace(trace_id: str, final_status: str):
    """
    Mark trace as complete.
    """

    db.execute("""
        UPDATE execution_traces
        SET
            completed_at = ?,
            status = ?,
            total_duration_ms = EXTRACT(EPOCH FROM (? - started_at)) * 1000
        WHERE trace_id = ?
    """, [time.now(), final_status, time.now(), trace_id])
```

### Algorithm 6.2: Trace Visualization and Search

```python
def get_trace_timeline(trace_id: str) -> TraceTimeline:
    """
    Generate timeline visualization for trace.

    Returns: TraceTimeline with step durations and visual representation
    """

    # Fetch trace
    trace = db.query_one("""
        SELECT * FROM execution_traces
        WHERE trace_id = ?
    """, [trace_id])

    if trace is None:
        raise ValueError(f"Trace not found: {trace_id}")

    # Calculate step metrics
    steps_with_metrics = []

    for step in trace.steps:
        duration_ms = calculate_duration_ms(step.started_at, step.completed_at)

        step_metric = StepMetric(
            step_name=step.step_name,
            status=step.status,
            duration_ms=duration_ms,
            percent_of_total=(duration_ms / trace.total_duration_ms) * 100
        )

        steps_with_metrics.append(step_metric)

    # Create timeline
    timeline = TraceTimeline(
        trace_id=trace_id,
        total_duration_ms=trace.total_duration_ms,
        steps=steps_with_metrics,
        visual=generate_ascii_timeline(steps_with_metrics)
    )

    return timeline


def generate_ascii_timeline(steps: list[StepMetric]) -> str:
    """
    Generate ASCII art timeline.

    Example:
    ├─ [00:00.000] START
    ├─ [00:00.125] ✅ fetch-data (125ms, 5%)
    ├─ [00:02.000] ✅ transform-data (1,875ms, 75%)
    └─ [00:02.500] ❌ upload-to-s3 (500ms, 20%)
    """

    lines = ["├─ [00:00.000] START"]

    elapsed_ms = 0

    for step in steps:
        elapsed_ms += step.duration_ms

        # Format timestamp
        timestamp = format_timestamp_ms(elapsed_ms)

        # Status icon
        icon = "✅" if step.status == "success" else "❌"

        # Format line
        line = f"├─ [{timestamp}] {icon} {step.step_name} ({step.duration_ms}ms, {step.percent_of_total:.0f}%)"

        lines.append(line)

    # Change last line to └─
    lines[-1] = lines[-1].replace("├─", "└─")

    return "\n".join(lines)


def search_traces(filters: TraceSearchFilters) -> list[Trace]:
    """
    Search traces with filters.

    Filters:
    - trace_id (exact match)
    - skill_name
    - status (success, failed, running)
    - time_range (start_date, end_date)
    - team
    - user
    """

    query = """
        SELECT * FROM execution_traces
        WHERE 1=1
    """

    params = []

    if filters.trace_id:
        query += " AND trace_id = ?"
        params.append(filters.trace_id)

    if filters.skill_name:
        query += " AND skill_name = ?"
        params.append(filters.skill_name)

    if filters.status:
        query += " AND status = ?"
        params.append(filters.status)

    if filters.start_date:
        query += " AND started_at >= ?"
        params.append(filters.start_date)

    if filters.end_date:
        query += " AND started_at <= ?"
        params.append(filters.end_date)

    if filters.team:
        query += " AND metadata->>'team' = ?"
        params.append(filters.team)

    query += " ORDER BY started_at DESC LIMIT ?"
    params.append(filters.limit or 100)

    traces = db.query(query, params)

    return traces
```

---

## Appendix: Common Utilities

### Utility: Hash JSON

```python
def hash_json(obj: dict) -> str:
    """
    Generate stable hash for JSON object.
    """
    import hashlib
    import json

    # Serialize with sorted keys (deterministic)
    json_str = json.dumps(obj, sort_keys=True)

    # SHA256 hash
    hash_obj = hashlib.sha256(json_str.encode('utf-8'))

    return hash_obj.hexdigest()
```

### Utility: Generate Short UUID

```python
def generate_short_uuid() -> str:
    """
    Generate short UUID (8 characters).
    """
    import uuid

    full_uuid = str(uuid.uuid4())

    # Take first 8 characters
    return full_uuid[:8]
```

### Utility: Format Timestamp

```python
def format_timestamp_ms(milliseconds: int) -> str:
    """
    Format milliseconds as MM:SS.mmm

    Example: 125000ms → "02:05.000"
    """

    total_seconds = milliseconds / 1000
    minutes = int(total_seconds // 60)
    seconds = int(total_seconds % 60)
    ms = int(milliseconds % 1000)

    return f"{minutes:02d}:{seconds:02d}.{ms:03d}"
```

---

**Document Status:** DRAFT - Ready for Implementation
**Next Steps:** Create architecture diagrams
**Author:** System Architect
**Date:** 2025-11-16
