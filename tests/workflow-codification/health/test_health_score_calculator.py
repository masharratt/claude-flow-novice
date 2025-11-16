"""
Comprehensive test suite for Health Score Calculator
TDD Protocol: Write tests first, then implement

Test Coverage:
- Component score calculations (reliability, performance, edge cases, documentation, test coverage)
- Weighted overall score calculation
- Health level determination
- Cache integration
- PostgreSQL history storage
- Background monitoring service
- Alert system
"""

import pytest
import psycopg2
import json
import os
import time
from datetime import datetime, timedelta
from unittest.mock import Mock, patch, MagicMock
from decimal import Decimal

# Import the modules we're going to implement
from src.workflow_codification.health.component_scores import ComponentScoreCalculator
from src.workflow_codification.health.calculator import HealthScoreCalculator
from src.workflow_codification.health.models import HealthScore
from src.workflow_codification.health.monitor import HealthMonitor


# ============================================================
# FIXTURES
# ============================================================

@pytest.fixture
def db_config():
    """Database configuration for testing"""
    return {
        'host': os.getenv('DB_HOST', 'localhost'),
        'port': int(os.getenv('DB_PORT', 5432)),
        'database': os.getenv('DB_NAME', 'cfn_test'),
        'user': os.getenv('DB_USER', 'postgres'),
        'password': os.getenv('DB_PASSWORD', 'postgres')
    }


@pytest.fixture
def mock_db_connection():
    """Mock database connection"""
    conn = MagicMock()
    cursor = MagicMock()
    conn.cursor.return_value.__enter__.return_value = cursor
    return conn, cursor


@pytest.fixture
def component_calculator(mock_db_connection):
    """Component score calculator with mocked DB"""
    conn, cursor = mock_db_connection
    calc = ComponentScoreCalculator.__new__(ComponentScoreCalculator)
    calc.conn = conn
    return calc, cursor


@pytest.fixture
def health_calculator(db_config):
    """Health score calculator"""
    return HealthScoreCalculator(db_config)


@pytest.fixture
def health_monitor(db_config):
    """Health monitor service"""
    return HealthMonitor(db_config, check_interval=1)  # 1 second for testing


@pytest.fixture
def sample_skill_path(tmp_path):
    """Create temporary skill directory structure"""
    skill_path = tmp_path / ".claude" / "skills" / "test-skill"
    skill_path.mkdir(parents=True)

    # Create SKILL.md
    (skill_path / "SKILL.md").write_text("# Test Skill")

    # Create README.md
    (skill_path / "README.md").write_text("# README")

    # Create examples directory
    (skill_path / "examples").mkdir()

    # Create metadata.json with test coverage
    metadata = {"test_coverage": 85.5}
    (skill_path / "metadata.json").write_text(json.dumps(metadata))

    return str(skill_path)


# ============================================================
# TEST: ComponentScoreCalculator - Reliability Score
# ============================================================

def test_calculate_reliability_score_perfect(component_calculator):
    """Test reliability score calculation with 100% success rate"""
    calc, cursor = component_calculator

    # Mock: 100 executions, all successful
    cursor.fetchone.return_value = (100, 100)

    score = calc.calculate_reliability_score("test-skill")

    assert score == 100.0
    cursor.execute.assert_called_once()
    assert "skill_executions" in cursor.execute.call_args[0][0]


def test_calculate_reliability_score_partial(component_calculator):
    """Test reliability score with 90% success rate"""
    calc, cursor = component_calculator

    # Mock: 100 executions, 90 successful
    cursor.fetchone.return_value = (90, 100)

    score = calc.calculate_reliability_score("test-skill")

    assert score == 90.0


def test_calculate_reliability_score_no_executions(component_calculator):
    """Test reliability score with no executions"""
    calc, cursor = component_calculator

    # Mock: No executions
    cursor.fetchone.return_value = (0, 0)

    score = calc.calculate_reliability_score("test-skill")

    assert score == 0.0


def test_calculate_reliability_score_null_result(component_calculator):
    """Test reliability score with null database result"""
    calc, cursor = component_calculator

    # Mock: Database returns None
    cursor.fetchone.return_value = None

    score = calc.calculate_reliability_score("test-skill")

    assert score == 0.0


# ============================================================
# TEST: ComponentScoreCalculator - Performance Score
# ============================================================

def test_calculate_performance_score_faster_than_baseline(component_calculator):
    """Test performance score when recent is faster than baseline"""
    calc, cursor = component_calculator

    # Mock: Baseline 10s, recent 5s (2x faster)
    cursor.fetchone.side_effect = [
        (Decimal('10.0'),),  # baseline
        (Decimal('5.0'),)    # recent average
    ]

    score = calc.calculate_performance_score("test-skill")

    # Should be capped at 100 even though ratio is 200
    assert score == 100.0


def test_calculate_performance_score_slower_than_baseline(component_calculator):
    """Test performance score when recent is slower than baseline"""
    calc, cursor = component_calculator

    # Mock: Baseline 10s, recent 20s (2x slower)
    cursor.fetchone.side_effect = [
        (Decimal('10.0'),),  # baseline
        (Decimal('20.0'),)   # recent average
    ]

    score = calc.calculate_performance_score("test-skill")

    # Ratio: (10/20) * 100 = 50
    assert score == 50.0


def test_calculate_performance_score_no_baseline(component_calculator):
    """Test performance score with no baseline data"""
    calc, cursor = component_calculator

    # Mock: No baseline data
    cursor.fetchone.side_effect = [
        (None,),  # baseline
        (Decimal('10.0'),)
    ]

    score = calc.calculate_performance_score("test-skill")

    # Should return perfect score when no baseline
    assert score == 100.0


def test_calculate_performance_score_no_recent_data(component_calculator):
    """Test performance score with no recent execution data"""
    calc, cursor = component_calculator

    # Mock: Baseline exists but no recent data
    cursor.fetchone.side_effect = [
        (Decimal('10.0'),),  # baseline
        (None,)  # no recent
    ]

    score = calc.calculate_performance_score("test-skill")

    assert score == 100.0


# ============================================================
# TEST: ComponentScoreCalculator - Edge Case Score
# ============================================================

def test_calculate_edge_case_score_no_edge_cases(component_calculator):
    """Test edge case score with no edge cases"""
    calc, cursor = component_calculator

    # Mock: 100 executions, 0 edge cases
    cursor.fetchone.side_effect = [
        (100,),  # total executions
        (0,)     # edge cases
    ]

    score = calc.calculate_edge_case_score("test-skill")

    assert score == 100.0


def test_calculate_edge_case_score_with_edge_cases(component_calculator):
    """Test edge case score with 10% edge case rate"""
    calc, cursor = component_calculator

    # Mock: 100 executions, 10 edge cases
    cursor.fetchone.side_effect = [
        (100,),  # total executions
        (10,)    # edge cases
    ]

    score = calc.calculate_edge_case_score("test-skill")

    # Edge case rate: 10/100 * 100 = 10%
    # Score: 100 - 10 = 90
    assert score == 90.0


def test_calculate_edge_case_score_no_executions(component_calculator):
    """Test edge case score with no executions"""
    calc, cursor = component_calculator

    # Mock: No executions
    cursor.fetchone.side_effect = [
        (0,),  # total executions
        (0,)   # edge cases
    ]

    score = calc.calculate_edge_case_score("test-skill")

    # Should return perfect score when no executions
    assert score == 100.0


def test_calculate_edge_case_score_high_rate(component_calculator):
    """Test edge case score with >100% edge case rate (edge case)"""
    calc, cursor = component_calculator

    # Mock: 100 executions, 150 edge cases (multiple per execution)
    cursor.fetchone.side_effect = [
        (100,),  # total executions
        (150,)   # edge cases
    ]

    score = calc.calculate_edge_case_score("test-skill")

    # Should not go below 0
    assert score == 0.0


# ============================================================
# TEST: ComponentScoreCalculator - Documentation Score
# ============================================================

def test_calculate_documentation_score_all_files(sample_skill_path):
    """Test documentation score with all required files"""
    calc = ComponentScoreCalculator.__new__(ComponentScoreCalculator)

    with patch('os.path.exists') as mock_exists:
        # All files exist
        mock_exists.return_value = True

        score = calc.calculate_documentation_score("test-skill")

        # All 4 checks pass: SKILL.md, README.md, examples/, metadata.json
        assert score == 100.0


def test_calculate_documentation_score_partial_files(sample_skill_path):
    """Test documentation score with 2/4 files"""
    calc = ComponentScoreCalculator.__new__(ComponentScoreCalculator)

    with patch('os.path.exists') as mock_exists:
        # Only 2 files exist
        mock_exists.side_effect = [True, True, False, False]

        score = calc.calculate_documentation_score("test-skill")

        # 2/4 checks pass = 50%
        assert score == 50.0


def test_calculate_documentation_score_no_files(sample_skill_path):
    """Test documentation score with no files"""
    calc = ComponentScoreCalculator.__new__(ComponentScoreCalculator)

    with patch('os.path.exists') as mock_exists:
        # No files exist
        mock_exists.return_value = False

        score = calc.calculate_documentation_score("test-skill")

        assert score == 0.0


# ============================================================
# TEST: ComponentScoreCalculator - Test Coverage Score
# ============================================================

def test_calculate_test_coverage_score_from_metadata(tmp_path):
    """Test coverage score reading from metadata.json"""
    calc = ComponentScoreCalculator.__new__(ComponentScoreCalculator)

    # Create metadata file
    skill_path = tmp_path / ".claude" / "skills" / "test-skill"
    skill_path.mkdir(parents=True)
    metadata = {"test_coverage": 85.5}
    (skill_path / "metadata.json").write_text(json.dumps(metadata))

    with patch('os.path.exists', return_value=True):
        with patch('builtins.open', create=True) as mock_open:
            mock_open.return_value.__enter__.return_value.read.return_value = json.dumps(metadata)

            score = calc.calculate_test_coverage_score("test-skill")

            assert score == 85.5


def test_calculate_test_coverage_score_no_metadata(tmp_path):
    """Test coverage score with no metadata.json"""
    calc = ComponentScoreCalculator.__new__(ComponentScoreCalculator)

    with patch('os.path.exists', return_value=False):
        score = calc.calculate_test_coverage_score("test-skill")

        assert score == 0.0


def test_calculate_test_coverage_score_invalid_json(tmp_path):
    """Test coverage score with invalid JSON in metadata"""
    calc = ComponentScoreCalculator.__new__(ComponentScoreCalculator)

    with patch('os.path.exists', return_value=True):
        with patch('builtins.open', side_effect=json.JSONDecodeError("error", "", 0)):
            score = calc.calculate_test_coverage_score("test-skill")

            assert score == 0.0


# ============================================================
# TEST: HealthScoreCalculator - Overall Score & Health Level
# ============================================================

def test_calculate_overall_score_weighted():
    """Test weighted overall score calculation"""
    with patch('src.workflow_codification.health.calculator.ComponentScoreCalculator') as MockCalc:
        with patch('src.workflow_codification.health.calculator.HealthScoreCache'):
            mock_calc_instance = MockCalc.return_value

            # Set component scores
            mock_calc_instance.calculate_reliability_score.return_value = 90.0  # 35% weight
            mock_calc_instance.calculate_performance_score.return_value = 80.0  # 20% weight
            mock_calc_instance.calculate_edge_case_score.return_value = 70.0   # 20% weight
            mock_calc_instance.calculate_documentation_score.return_value = 100.0  # 10% weight
            mock_calc_instance.calculate_test_coverage_score.return_value = 85.0  # 15% weight

            calc = HealthScoreCalculator({})

            with patch.object(calc, '_store_in_history'):
                result = calc.calculate_skill_health("test-skill", use_cache=False)

            # Calculate expected: (90*0.35 + 80*0.20 + 70*0.20 + 100*0.10 + 85*0.15)
            # = 31.5 + 16 + 14 + 10 + 12.75 = 84.25 → rounds to 84
            assert result.overall_score == 84


def test_health_level_excellent():
    """Test health level determination: excellent (90-100)"""
    calc = HealthScoreCalculator.__new__(HealthScoreCalculator)

    assert calc._determine_health_level(100) == "excellent"
    assert calc._determine_health_level(95) == "excellent"
    assert calc._determine_health_level(90) == "excellent"


def test_health_level_good():
    """Test health level determination: good (75-89)"""
    calc = HealthScoreCalculator.__new__(HealthScoreCalculator)

    assert calc._determine_health_level(89) == "good"
    assert calc._determine_health_level(80) == "good"
    assert calc._determine_health_level(75) == "good"


def test_health_level_fair():
    """Test health level determination: fair (60-74)"""
    calc = HealthScoreCalculator.__new__(HealthScoreCalculator)

    assert calc._determine_health_level(74) == "fair"
    assert calc._determine_health_level(65) == "fair"
    assert calc._determine_health_level(60) == "fair"


def test_health_level_poor():
    """Test health level determination: poor (<60)"""
    calc = HealthScoreCalculator.__new__(HealthScoreCalculator)

    assert calc._determine_health_level(59) == "poor"
    assert calc._determine_health_level(30) == "poor"
    assert calc._determine_health_level(0) == "poor"


# ============================================================
# TEST: HealthScoreCalculator - Cache Integration
# ============================================================

def test_cache_hit_returns_cached_value():
    """Test that cache hit returns cached value without recalculation"""
    with patch('src.workflow_codification.health.calculator.ComponentScoreCalculator'):
        with patch('src.workflow_codification.health.calculator.HealthScoreCache') as MockCache:
            mock_cache = MockCache.return_value

            # Mock cached value
            cached_data = {
                "skill_name": "test-skill",
                "overall_score": 85,
                "reliability_score": 90.0,
                "performance_score": 80.0,
                "edge_case_score": 80.0,
                "documentation_score": 75.0,
                "test_coverage_score": 85.0,
                "health_level": "good",
                "calculated_at": datetime.utcnow().isoformat()
            }
            mock_cache.get.return_value = cached_data

            calc = HealthScoreCalculator({})
            result = calc.calculate_skill_health("test-skill", use_cache=True)

            # Should return cached value
            assert result.overall_score == 85
            # Component calculator should NOT be called
            assert not calc.component_calculator.calculate_reliability_score.called


def test_cache_miss_triggers_calculation():
    """Test that cache miss triggers calculation and caches result"""
    with patch('src.workflow_codification.health.calculator.ComponentScoreCalculator') as MockCalc:
        with patch('src.workflow_codification.health.calculator.HealthScoreCache') as MockCache:
            mock_cache = MockCache.return_value
            mock_cache.get.return_value = None  # Cache miss

            mock_calc_instance = MockCalc.return_value
            mock_calc_instance.calculate_reliability_score.return_value = 90.0
            mock_calc_instance.calculate_performance_score.return_value = 80.0
            mock_calc_instance.calculate_edge_case_score.return_value = 80.0
            mock_calc_instance.calculate_documentation_score.return_value = 75.0
            mock_calc_instance.calculate_test_coverage_score.return_value = 85.0

            calc = HealthScoreCalculator({})

            with patch.object(calc, '_store_in_history'):
                result = calc.calculate_skill_health("test-skill", use_cache=True)

            # Should calculate
            assert result.overall_score > 0
            # Should cache the result
            mock_cache.set.assert_called_once()


def test_use_cache_false_skips_cache():
    """Test that use_cache=False skips cache lookup"""
    with patch('src.workflow_codification.health.calculator.ComponentScoreCalculator') as MockCalc:
        with patch('src.workflow_codification.health.calculator.HealthScoreCache') as MockCache:
            mock_cache = MockCache.return_value

            mock_calc_instance = MockCalc.return_value
            mock_calc_instance.calculate_reliability_score.return_value = 90.0
            mock_calc_instance.calculate_performance_score.return_value = 80.0
            mock_calc_instance.calculate_edge_case_score.return_value = 80.0
            mock_calc_instance.calculate_documentation_score.return_value = 75.0
            mock_calc_instance.calculate_test_coverage_score.return_value = 85.0

            calc = HealthScoreCalculator({})

            with patch.object(calc, '_store_in_history'):
                result = calc.calculate_skill_health("test-skill", use_cache=False)

            # Should NOT call cache.get
            mock_cache.get.assert_not_called()
            # Should still cache the result
            mock_cache.set.assert_called_once()


# ============================================================
# TEST: HealthScoreCalculator - PostgreSQL History Storage
# ============================================================

def test_store_in_history_inserts_record():
    """Test that health scores are stored in PostgreSQL history"""
    with patch('psycopg2.connect') as mock_connect:
        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_connect.return_value = mock_conn
        mock_conn.cursor.return_value.__enter__.return_value = mock_cursor

        calc = HealthScoreCalculator.__new__(HealthScoreCalculator)
        calc.db_config = {}

        health_score = HealthScore(
            skill_name="test-skill",
            overall_score=85,
            reliability_score=90.0,
            performance_score=80.0,
            edge_case_score=80.0,
            documentation_score=75.0,
            test_coverage_score=85.0,
            health_level="good"
        )

        calc._store_in_history(health_score)

        # Should execute INSERT statement
        mock_cursor.execute.assert_called_once()
        sql = mock_cursor.execute.call_args[0][0]
        assert "INSERT INTO skill_health_history" in sql

        # Should commit
        mock_conn.commit.assert_called_once()


# ============================================================
# TEST: HealthScore Model
# ============================================================

def test_health_score_model_creation():
    """Test HealthScore model creation"""
    score = HealthScore(
        skill_name="test-skill",
        overall_score=85,
        reliability_score=90.0,
        performance_score=80.0,
        edge_case_score=80.0,
        documentation_score=75.0,
        test_coverage_score=85.0,
        health_level="good"
    )

    assert score.skill_name == "test-skill"
    assert score.overall_score == 85
    assert score.health_level == "good"
    assert isinstance(score.calculated_at, datetime)


def test_health_score_to_dict():
    """Test HealthScore serialization to dict"""
    score = HealthScore(
        skill_name="test-skill",
        overall_score=85,
        reliability_score=90.0,
        performance_score=80.0,
        edge_case_score=80.0,
        documentation_score=75.0,
        test_coverage_score=85.0,
        health_level="good"
    )

    data = score.to_dict()

    assert data["skill_name"] == "test-skill"
    assert data["overall_score"] == 85
    assert data["health_level"] == "good"
    assert "calculated_at" in data
    assert isinstance(data["calculated_at"], str)  # ISO format


def test_health_score_from_dict():
    """Test HealthScore deserialization from dict"""
    data = {
        "skill_name": "test-skill",
        "overall_score": 85,
        "reliability_score": 90.0,
        "performance_score": 80.0,
        "edge_case_score": 80.0,
        "documentation_score": 75.0,
        "test_coverage_score": 85.0,
        "health_level": "good",
        "calculated_at": "2025-01-15T10:30:00"
    }

    score = HealthScore.from_dict(data)

    assert score.skill_name == "test-skill"
    assert score.overall_score == 85
    assert isinstance(score.calculated_at, datetime)


# ============================================================
# TEST: HealthMonitor - Background Service
# ============================================================

def test_monitor_get_active_skills():
    """Test getting list of active skills"""
    with patch('src.workflow_codification.health.monitor.HealthScoreCalculator'):
        monitor = HealthMonitor.__new__(HealthMonitor)
        monitor.calculator = MagicMock()

        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        monitor.calculator.component_calculator.conn = mock_conn
        mock_conn.cursor.return_value.__enter__.return_value = mock_cursor

        # Mock active skills
        mock_cursor.fetchall.return_value = [
            ("skill-1",),
            ("skill-2",),
            ("skill-3",)
        ]

        skills = monitor._get_active_skills()

        assert len(skills) == 3
        assert "skill-1" in skills
        assert "skill-2" in skills


def test_monitor_check_for_drop_detects_significant_drop():
    """Test detection of >10 point health drop"""
    with patch('src.workflow_codification.health.monitor.HealthScoreCalculator'):
        monitor = HealthMonitor.__new__(HealthMonitor)
        monitor.calculator = MagicMock()

        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        monitor.calculator.component_calculator.conn = mock_conn
        mock_conn.cursor.return_value.__enter__.return_value = mock_cursor

        # Mock: Previous score was 90, current is 75 (drop of 15)
        mock_cursor.fetchone.return_value = (90,)

        with patch.object(monitor, '_send_alert') as mock_alert:
            monitor._check_for_drop("test-skill", 75)

            # Should send alert
            mock_alert.assert_called_once_with("test-skill", 90, 75, 15)


def test_monitor_check_for_drop_ignores_small_drop():
    """Test ignoring <10 point health drop"""
    with patch('src.workflow_codification.health.monitor.HealthScoreCalculator'):
        monitor = HealthMonitor.__new__(HealthMonitor)
        monitor.calculator = MagicMock()

        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        monitor.calculator.component_calculator.conn = mock_conn
        mock_conn.cursor.return_value.__enter__.return_value = mock_cursor

        # Mock: Previous score was 85, current is 80 (drop of 5)
        mock_cursor.fetchone.return_value = (85,)

        with patch.object(monitor, '_send_alert') as mock_alert:
            monitor._check_for_drop("test-skill", 80)

            # Should NOT send alert
            mock_alert.assert_not_called()


def test_monitor_check_for_drop_no_previous_score():
    """Test behavior when no previous score exists"""
    with patch('src.workflow_codification.health.monitor.HealthScoreCalculator'):
        monitor = HealthMonitor.__new__(HealthMonitor)
        monitor.calculator = MagicMock()

        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        monitor.calculator.component_calculator.conn = mock_conn
        mock_conn.cursor.return_value.__enter__.return_value = mock_cursor

        # Mock: No previous score
        mock_cursor.fetchone.return_value = None

        with patch.object(monitor, '_send_alert') as mock_alert:
            monitor._check_for_drop("test-skill", 80)

            # Should NOT send alert
            mock_alert.assert_not_called()


def test_monitor_send_alert_output():
    """Test alert sending (prints warning)"""
    monitor = HealthMonitor.__new__(HealthMonitor)

    with patch('builtins.print') as mock_print:
        monitor._send_alert("test-skill", 90, 75, 15)

        # Should print alert
        mock_print.assert_called_once()
        alert_message = mock_print.call_args[0][0]
        assert "ALERT" in alert_message
        assert "test-skill" in alert_message
        assert "15" in alert_message


def test_monitor_start_stop():
    """Test monitor start/stop lifecycle"""
    with patch('src.workflow_codification.health.monitor.HealthScoreCalculator'):
        monitor = HealthMonitor({}, check_interval=0.1)

        with patch.object(monitor, '_check_all_skills') as mock_check:
            with patch('time.sleep', side_effect=lambda x: monitor.stop()):
                # Start should set running=True and begin loop
                monitor.start()

                # Should have checked skills at least once
                assert mock_check.called
                # Should have stopped
                assert not monitor.running


# ============================================================
# TEST: Integration Tests
# ============================================================

def test_end_to_end_health_calculation_flow():
    """Test complete flow from calculation to caching to storage"""
    with patch('src.workflow_codification.health.calculator.ComponentScoreCalculator') as MockCalc:
        with patch('src.workflow_codification.health.calculator.HealthScoreCache') as MockCache:
            with patch('psycopg2.connect') as mock_connect:
                # Setup mocks
                mock_calc_instance = MockCalc.return_value
                mock_calc_instance.calculate_reliability_score.return_value = 90.0
                mock_calc_instance.calculate_performance_score.return_value = 85.0
                mock_calc_instance.calculate_edge_case_score.return_value = 80.0
                mock_calc_instance.calculate_documentation_score.return_value = 100.0
                mock_calc_instance.calculate_test_coverage_score.return_value = 90.0

                mock_cache = MockCache.return_value
                mock_cache.get.return_value = None  # Cache miss

                mock_conn = MagicMock()
                mock_cursor = MagicMock()
                mock_connect.return_value = mock_conn
                mock_conn.cursor.return_value.__enter__.return_value = mock_cursor

                # Execute calculation
                calc = HealthScoreCalculator({})
                result = calc.calculate_skill_health("test-skill", use_cache=False)

                # Verify result
                assert result.overall_score > 0
                assert result.health_level in ["excellent", "good", "fair", "poor"]

                # Verify cache was updated
                mock_cache.set.assert_called_once()

                # Verify PostgreSQL was updated
                assert mock_cursor.execute.called


# ============================================================
# TEST: Edge Cases & Error Handling
# ============================================================

def test_component_calculator_handles_database_errors():
    """Test graceful handling of database errors"""
    calc = ComponentScoreCalculator.__new__(ComponentScoreCalculator)
    mock_conn = MagicMock()
    mock_conn.cursor.side_effect = psycopg2.Error("Database error")
    calc.conn = mock_conn

    # Should not crash, should return default value or raise gracefully
    with pytest.raises(psycopg2.Error):
        calc.calculate_reliability_score("test-skill")


def test_health_calculator_handles_component_calculation_errors():
    """Test handling of component calculation errors"""
    with patch('src.workflow_codification.health.calculator.ComponentScoreCalculator') as MockCalc:
        with patch('src.workflow_codification.health.calculator.HealthScoreCache'):
            mock_calc_instance = MockCalc.return_value
            mock_calc_instance.calculate_reliability_score.side_effect = Exception("Error")

            calc = HealthScoreCalculator({})

            # Should raise or handle gracefully
            with pytest.raises(Exception):
                calc.calculate_skill_health("test-skill", use_cache=False)


def test_monitor_handles_skill_check_errors():
    """Test monitor continues on individual skill errors"""
    with patch('src.workflow_codification.health.monitor.HealthScoreCalculator'):
        monitor = HealthMonitor.__new__(HealthMonitor)
        monitor.calculator = MagicMock()
        monitor.running = False

        with patch.object(monitor, '_get_active_skills', return_value=["skill-1", "skill-2"]):
            # First skill raises error, second succeeds
            monitor.calculator.calculate_skill_health.side_effect = [
                Exception("Error"),
                MagicMock(overall_score=85)
            ]

            with patch.object(monitor, '_check_for_drop'):
                with patch('builtins.print'):
                    # Should not crash, should continue to next skill
                    monitor._check_all_skills()

                    # Should have attempted both skills
                    assert monitor.calculator.calculate_skill_health.call_count == 2
