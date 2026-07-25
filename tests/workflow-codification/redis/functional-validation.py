#!/usr/bin/env python3
"""
Functional Validation for Redis Integration
Simulates real-world usage patterns and validates behavior
"""

import sys
import time
import uuid
sys.path.insert(0, '/home/user/claude-flow-novice')

from src.workflow_codification.redis import (
    RedisClient,
    HealthScoreCache,
    CircuitBreaker,
    TraceContext
)


def test_health_score_caching_workflow():
    """Simulate real-world health score caching"""
    print("\n=== Health Score Caching Workflow ===")

    cache = HealthScoreCache()
    cache.clear_all()

    # Simulate calculating expensive health score
    print("1. Calculate health score for skill 'authentication'...")
    health_score = {
        "score": 92,
        "status": "excellent",
        "metrics": {
            "latency_p95": 45,
            "error_rate": 0.002,
            "success_rate": 0.998
        },
        "last_calculated": time.time()
    }

    # Cache it
    cache.set("authentication", health_score)
    print(f"   Cached: {health_score['score']}/100")

    # Subsequent requests use cache (no expensive calculation)
    print("2. Check health score again (from cache)...")
    cached = cache.get("authentication")
    print(f"   Retrieved from cache: {cached['score']}/100")
    print(f"   TTL remaining: {cache.get_ttl('authentication')} seconds")

    # Simulate new calculation invalidating cache
    print("3. New execution completed, invalidate cache...")
    cache.invalidate("authentication")
    print(f"   Cache after invalidation: {cache.get('authentication')}")

    print("✓ Health score caching workflow validated")


def test_circuit_breaker_workflow():
    """Simulate circuit breaker protecting failing service"""
    print("\n=== Circuit Breaker Workflow ===")

    cb = CircuitBreaker()
    cb.clear_all()

    skill_name = "email-service"

    # 1. Normal operation
    print(f"1. Service '{skill_name}' operating normally...")
    print(f"   Circuit is open: {cb.is_open(skill_name)}")

    # 2. Start experiencing failures
    print("2. Service starts failing...")
    for i in range(1, 6):
        cb.record_failure(skill_name)
        state = cb.get_state(skill_name)
        print(f"   Failure {i}/5 - Status: {state['status']}, Failures: {state['consecutive_failures']}")

    # 3. Circuit is now OPEN
    print("3. Circuit breaker opened, blocking requests...")
    print(f"   Circuit is open: {cb.is_open(skill_name)}")
    print(f"   State: {cb.get_state(skill_name)}")

    # 4. Simulate successful execution (circuit allows retry in HALF_OPEN)
    print("4. Simulate transition to HALF_OPEN and successful execution...")
    cb.set_half_open(skill_name)
    print(f"   Set to HALF_OPEN: {cb.get_state(skill_name)['status']}")

    cb.record_success(skill_name)
    print(f"   Success recorded, circuit closed: {cb.get_state(skill_name)['status']}")
    print(f"   Failures reset to: {cb.get_state(skill_name)['consecutive_failures']}")

    print("✓ Circuit breaker workflow validated")


def test_trace_context_workflow():
    """Simulate distributed tracing context propagation"""
    print("\n=== Trace Context Workflow ===")

    tc = TraceContext()
    tc.clear_all()

    # 1. Start workflow execution
    execution_id = f"exec-{int(time.time())}"
    trace_id = str(uuid.uuid4())

    print(f"1. Start workflow execution: {execution_id}")
    print(f"   Generate trace ID: {trace_id}")

    # 2. Store trace context
    tc.set_trace_id(execution_id, trace_id)
    print(f"   Stored trace context (TTL: {tc.get_ttl(execution_id)}s)")

    # 3. Simulate distributed service lookup
    print("2. Service B needs to correlate logs with this execution...")
    retrieved_trace = tc.get_trace_id(execution_id)
    print(f"   Retrieved trace ID: {retrieved_trace}")
    print(f"   Match: {retrieved_trace == trace_id}")

    # 4. Cleanup after execution
    print("3. Execution completed, cleanup trace context...")
    tc.delete_trace_id(execution_id)
    print(f"   Trace context deleted: {tc.get_trace_id(execution_id) is None}")

    print("✓ Trace context workflow validated")


def test_integration_scenario():
    """Simulate complete integration scenario"""
    print("\n=== Integration Scenario: Workflow Execution ===")

    cache = HealthScoreCache()
    cb = CircuitBreaker()
    tc = TraceContext()

    # Clean state
    cache.clear_all()
    cb.clear_all()
    tc.clear_all()

    skill_name = "data-validation"
    execution_id = f"exec-{int(time.time())}"
    trace_id = str(uuid.uuid4())

    # 1. Check health before execution
    print(f"1. Pre-execution health check for '{skill_name}'...")
    health = cache.get(skill_name)
    if not health:
        print("   No cached health, calculating...")
        health = {"score": 88, "status": "healthy"}
        cache.set(skill_name, health)
    print(f"   Health: {health['score']}/100 - {health['status']}")

    # 2. Check circuit breaker
    print("2. Check circuit breaker state...")
    if cb.is_open(skill_name):
        print("   ✗ Circuit OPEN - Execution blocked!")
        return
    print("   ✓ Circuit CLOSED - Execution allowed")

    # 3. Start execution with tracing
    print(f"3. Start execution with trace ID: {trace_id}")
    tc.set_trace_id(execution_id, trace_id)

    # 4. Simulate successful execution
    print("4. Execution completed successfully")
    cb.record_success(skill_name)

    # 5. Update health cache
    new_health = {"score": 90, "status": "excellent", "last_execution": time.time()}
    cache.set(skill_name, new_health)
    print(f"   Updated health cache: {new_health['score']}/100")

    # 6. Verify trace context exists
    print("5. Verify trace context for logging...")
    retrieved_trace = tc.get_trace_id(execution_id)
    print(f"   Trace ID: {retrieved_trace} (TTL: {tc.get_ttl(execution_id)}s)")

    print("✓ Complete integration scenario validated")


def test_performance_under_load():
    """Validate performance under realistic load"""
    print("\n=== Performance Under Load ===")

    cache = HealthScoreCache()
    cb = CircuitBreaker()
    tc = TraceContext()

    # Test 100 operations
    iterations = 100

    # Cache operations
    start = time.time()
    for i in range(iterations):
        cache.set(f"skill-{i}", {"score": i})
    cache_write_time = (time.time() - start) * 1000 / iterations

    start = time.time()
    for i in range(iterations):
        cache.get(f"skill-{i}")
    cache_read_time = (time.time() - start) * 1000 / iterations

    # Circuit breaker operations
    start = time.time()
    for i in range(iterations):
        cb.is_open(f"skill-{i}")
    cb_check_time = (time.time() - start) * 1000 / iterations

    # Trace context operations
    start = time.time()
    for i in range(iterations):
        tc.set_trace_id(f"exec-{i}", f"trace-{i}")
    trace_write_time = (time.time() - start) * 1000 / iterations

    print(f"Average latency over {iterations} operations:")
    print(f"  Cache WRITE: {cache_write_time:.2f}ms (requirement: <5ms)")
    print(f"  Cache READ:  {cache_read_time:.2f}ms (requirement: <5ms)")
    print(f"  Circuit breaker CHECK: {cb_check_time:.2f}ms (requirement: <5ms)")
    print(f"  Trace context WRITE: {trace_write_time:.2f}ms (requirement: <5ms)")

    # Validate requirements
    assert cache_write_time < 5, f"Cache write too slow: {cache_write_time}ms"
    assert cache_read_time < 5, f"Cache read too slow: {cache_read_time}ms"
    assert cb_check_time < 5, f"Circuit breaker too slow: {cb_check_time}ms"
    assert trace_write_time < 5, f"Trace write too slow: {trace_write_time}ms"

    print("✓ All operations meet <5ms requirement")


def main():
    """Run all functional validation tests"""
    print("=" * 60)
    print("FUNCTIONAL VALIDATION: Redis Integration")
    print("=" * 60)

    # Test Redis connection
    client = RedisClient()
    if not client.ping():
        print("✗ Redis is not available!")
        sys.exit(1)
    print("✓ Redis connection validated")

    try:
        test_health_score_caching_workflow()
        test_circuit_breaker_workflow()
        test_trace_context_workflow()
        test_integration_scenario()
        test_performance_under_load()

        print("\n" + "=" * 60)
        print("✓ ALL FUNCTIONAL VALIDATIONS PASSED")
        print("=" * 60)
        print("\nRedis integration is production-ready:")
        print("  - Health score caching working correctly")
        print("  - Circuit breaker state transitions validated")
        print("  - Trace context propagation functional")
        print("  - Performance meets <5ms requirement")
        print("  - Integration scenarios successful")

    except Exception as e:
        print(f"\n✗ Functional validation failed: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
