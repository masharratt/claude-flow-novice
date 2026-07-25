#!/usr/bin/env python3
"""
Execution Tracing Test Suite (Python)
Sprint 1.3 - TDD Protocol

Tests all tracing operations with 100% coverage target
"""

import sys
import os
import time
import unittest
from datetime import datetime

# Add src to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../../..', 'src'))

from workflow_codification.tracing.tracer import ExecutionTracer
from workflow_codification.tracing.trace_recorder import TraceRecorder
from workflow_codification.tracing.trace_storage import TraceStorage
from workflow_codification.tracing.trace_query import TraceQuery


class TestTraceCreation(unittest.TestCase):
    """Test Group 1: Trace Creation & Context Management"""

    def setUp(self):
        """Setup for each test"""
        self.tracer = ExecutionTracer()

    def test_trace_creation_with_uuid(self):
        """Test trace_id generation with valid UUID format"""
        import re

        trace_id = self.tracer.start_trace("test-skill", execution_id="exec-001")

        # UUID format validation
        uuid_pattern = r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        self.assertRegex(trace_id, uuid_pattern, "trace_id should be valid UUID")

    def test_initial_status_running(self):
        """Test initial status is 'running'"""
        self.tracer.start_trace("test-skill")
        trace = self.tracer.get_current_trace()

        self.assertEqual(trace['status'], 'running')

    def test_skill_name_storage(self):
        """Test skill_name is stored correctly"""
        self.tracer.start_trace("docker-build")
        trace = self.tracer.get_current_trace()

        self.assertEqual(trace['skill_name'], 'docker-build')

    def test_steps_array_initialized(self):
        """Test steps array is initialized"""
        self.tracer.start_trace("test-skill")
        trace = self.tracer.get_current_trace()

        self.assertIsInstance(trace['steps'], list)
        self.assertEqual(len(trace['steps']), 0)

    def test_execution_correlation(self):
        """Test execution_id to trace_id correlation in Redis"""
        trace_id = self.tracer.start_trace("test-skill", execution_id="exec-002")

        # Retrieve from Redis
        retrieved = self.tracer.get_trace_id(execution_id="exec-002")
        self.assertEqual(retrieved, trace_id)

    def test_metadata_storage(self):
        """Test metadata storage in trace"""
        metadata = {"user_id": "user-123", "environment": "test"}
        self.tracer.start_trace("test-skill", metadata=metadata)
        trace = self.tracer.get_current_trace()

        self.assertEqual(trace['metadata'], metadata)


class TestStepRecording(unittest.TestCase):
    """Test Group 2: Step Recording"""

    def setUp(self):
        """Setup for each test"""
        self.tracer = ExecutionTracer()
        self.tracer.start_trace("test-skill")
        self.recorder = TraceRecorder(self.tracer)

    def test_step_timing(self):
        """Test step recording with timing"""
        self.recorder.start_step("validate-input")
        time.sleep(0.1)  # 100ms
        step = self.recorder.end_step("validate-input", status="success")

        # Duration should be approximately 100ms
        self.assertGreater(step['duration_ms'], 90)
        self.assertLess(step['duration_ms'], 150)
        self.assertEqual(step['status'], 'success')

    def test_step_order(self):
        """Test steps appended in correct order"""
        self.recorder.record_step("step1", 10)
        self.recorder.record_step("step2", 20)
        self.recorder.record_step("step3", 30)

        trace = self.tracer.get_current_trace()
        step_names = [step['name'] for step in trace['steps']]
        self.assertEqual(step_names, ['step1', 'step2', 'step3'])

    def test_error_context(self):
        """Test error context captured in failed steps"""
        error_msg = "Invalid input format"
        self.recorder.record_step("validate-input", 15, status="failed", error_message=error_msg)

        trace = self.tracer.get_current_trace()
        step = trace['steps'][0]
        self.assertEqual(step.get('error_message'), error_msg)
        self.assertEqual(step['status'], 'failed')

    def test_step_validation(self):
        """Test ValueError raised if end_step called without start_step"""
        with self.assertRaises(ValueError) as context:
            self.recorder.end_step("non-existent-step")

        self.assertIn("was not started", str(context.exception))


class TestTraceFinalization(unittest.TestCase):
    """Test Group 3: Trace Finalization & Storage"""

    @classmethod
    def setUpClass(cls):
        """Setup database connection for all tests"""
        cls.db_config = {
            'host': 'localhost',
            'port': 5432,
            'database': 'cfn_workflow_test',
            'user': 'postgres'
        }

        # Create test database
        import psycopg2
        conn = psycopg2.connect(host='localhost', port=5432, database='postgres', user='postgres')
        conn.autocommit = True
        with conn.cursor() as cur:
            cur.execute("DROP DATABASE IF EXISTS cfn_workflow_test")
            cur.execute("CREATE DATABASE cfn_workflow_test")
        conn.close()

        # Run migration
        import subprocess
        migration_file = os.path.join(os.path.dirname(__file__), '../../../src/workflow_codification/migrations/006_execution_traces.sql')
        subprocess.run([
            'psql', '-h', 'localhost', '-U', 'postgres', '-d', 'cfn_workflow_test',
            '-f', migration_file
        ], check=True, capture_output=True)

    def setUp(self):
        """Setup for each test"""
        self.tracer = ExecutionTracer()
        self.storage = TraceStorage(self.db_config)

    def tearDown(self):
        """Cleanup after each test"""
        self.storage.close()

    def test_trace_finalization(self):
        """Test trace finalization with duration calculation"""
        self.tracer.start_trace("test-skill")
        recorder = TraceRecorder(self.tracer)

        recorder.record_step("step1", 100)
        recorder.record_step("step2", 200)
        recorder.record_step("step3", 150)

        trace = self.tracer.get_current_trace()
        result = self.storage.finalize_trace(trace, "success")

        expected_duration = 100 + 200 + 150
        self.assertEqual(result['total_duration_ms'], expected_duration)
        self.assertEqual(result['status'], 'success')

    def test_postgresql_storage(self):
        """Test trace stored in PostgreSQL"""
        trace_id = self.tracer.start_trace("test-skill")
        recorder = TraceRecorder(self.tracer)
        recorder.record_step("step1", 100)

        trace = self.tracer.get_current_trace()
        self.storage.finalize_trace(trace, "success")

        # Retrieve from database
        retrieved = self.storage.get_trace(trace_id)
        self.assertIsNotNone(retrieved)
        self.assertEqual(retrieved['trace_id'], trace_id)
        self.assertEqual(retrieved['skill_name'], 'test-skill')

    def test_error_extraction(self):
        """Test error message extracted from failed steps"""
        trace_id = self.tracer.start_trace("test-skill")
        recorder = TraceRecorder(self.tracer)

        error_msg = "Connection timeout"
        recorder.record_step("connect-db", 50, status="failed", error_message=error_msg)

        trace = self.tracer.get_current_trace()
        self.storage.finalize_trace(trace, "failed")

        # Verify error message stored
        retrieved = self.storage.get_trace(trace_id)
        self.assertEqual(retrieved['error_message'], error_msg)

    def test_jsonb_steps(self):
        """Test JSONB steps stored and retrieved correctly"""
        trace_id = self.tracer.start_trace("test-skill")
        recorder = TraceRecorder(self.tracer)

        recorder.record_step("step1", 100, status="success")
        recorder.record_step("step2", 200, status="success")

        trace = self.tracer.get_current_trace()
        self.storage.finalize_trace(trace, "success")

        # Verify steps retrieved correctly
        retrieved = self.storage.get_trace(trace_id)
        self.assertEqual(len(retrieved['steps']), 2)
        self.assertEqual(retrieved['steps'][0]['name'], 'step1')
        self.assertEqual(retrieved['steps'][1]['name'], 'step2')


class TestTraceQuery(unittest.TestCase):
    """Test Group 4: Trace Query API"""

    @classmethod
    def setUpClass(cls):
        """Setup database connection for all tests"""
        cls.db_config = {
            'host': 'localhost',
            'port': 5432,
            'database': 'cfn_workflow_test',
            'user': 'postgres'
        }

    def setUp(self):
        """Setup for each test"""
        self.storage = TraceStorage(self.db_config)
        self.query = TraceQuery(self.db_config)

    def tearDown(self):
        """Cleanup after each test"""
        self.storage.close()

    def test_query_by_skill(self):
        """Test query traces by skill_name"""
        # Create traces for different skills
        for i in range(3):
            tracer = ExecutionTracer()
            tracer.start_trace("skill-A")
            recorder = TraceRecorder(tracer)
            recorder.record_step("step1", 100)
            trace = tracer.get_current_trace()
            self.storage.finalize_trace(trace, "success")

        for i in range(2):
            tracer = ExecutionTracer()
            tracer.start_trace("skill-B")
            recorder = TraceRecorder(tracer)
            recorder.record_step("step1", 100)
            trace = tracer.get_current_trace()
            self.storage.finalize_trace(trace, "success")

        # Query by skill
        results = self.query.query_by_skill("skill-A")
        self.assertEqual(len(results), 3)

        # Verify all results are skill-A
        for result in results:
            self.assertEqual(result['skill_name'], 'skill-A')

    def test_query_pagination(self):
        """Test query pagination limit"""
        # Create 10 traces
        for i in range(10):
            tracer = ExecutionTracer()
            tracer.start_trace("test-skill")
            recorder = TraceRecorder(tracer)
            recorder.record_step("step1", 100)
            trace = tracer.get_current_trace()
            self.storage.finalize_trace(trace, "success")

        # Query with limit=5
        results = self.query.query_by_skill("test-skill", limit=5)
        self.assertEqual(len(results), 5)

    def test_similar_failures(self):
        """Test find similar failures with Jaccard similarity"""
        error_messages = [
            "Connection timeout to database server",
            "Database server connection timeout error",
            "Network error connecting to API",
            "Timeout waiting for database response"
        ]

        for error_msg in error_messages:
            tracer = ExecutionTracer()
            tracer.start_trace("test-skill")
            recorder = TraceRecorder(tracer)
            recorder.record_step("step1", 100, status="failed", error_message=error_msg)
            trace = tracer.get_current_trace()
            self.storage.finalize_trace(trace, "failed")

        # Find similar failures
        results = self.query.find_similar_failures("timeout database connection")

        # Should find at least 2 similar failures (30% threshold)
        self.assertGreaterEqual(len(results), 2)

        # Verify similarity scores exist
        for result in results:
            self.assertIn('similarity_score', result)
            self.assertGreater(result['similarity_score'], 0.3)


class TestIntegration(unittest.TestCase):
    """Test Group 5: Integration & Full Workflow"""

    @classmethod
    def setUpClass(cls):
        """Setup database connection for all tests"""
        cls.db_config = {
            'host': 'localhost',
            'port': 5432,
            'database': 'cfn_workflow_test',
            'user': 'postgres'
        }

    def test_full_workflow(self):
        """Test full tracing workflow integration"""
        # Step 1: Start trace
        tracer = ExecutionTracer()
        trace_id = tracer.start_trace("integration-test", execution_id="exec-999",
                                      metadata={"env": "test"})

        # Step 2: Record steps
        recorder = TraceRecorder(tracer)
        recorder.record_step("load-config", 50, status="success")
        recorder.record_step("validate-input", 75, status="success")
        recorder.record_step("process-data", 200, status="success")

        # Step 3: Finalize
        storage = TraceStorage(self.db_config)
        trace = tracer.get_current_trace()
        result = storage.finalize_trace(trace, "success")

        # Step 4: Query
        query = TraceQuery(self.db_config)
        results = query.query_by_skill("integration-test")

        # Verify
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]['trace_id'], trace_id)

        expected_duration = 50 + 75 + 200
        self.assertEqual(results[0]['total_duration_ms'], expected_duration)

        storage.close()


if __name__ == '__main__':
    # Run tests with verbose output
    unittest.main(verbosity=2)
