"""
Additional tests for utility methods to reach 100% coverage
"""

import pytest
from unittest.mock import MagicMock, patch
from datetime import datetime

from src.workflow_codification.health.calculator import HealthScoreCalculator
from src.workflow_codification.health.monitor import HealthMonitor


def test_calculator_get_health_trend():
    """Test health trend retrieval"""
    with patch('psycopg2.connect') as mock_connect:
        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_connect.return_value = mock_conn
        mock_conn.cursor.return_value.__enter__.return_value = mock_cursor
        
        # Mock historical data
        mock_cursor.fetchall.return_value = [
            (85, 'good', datetime(2025, 1, 10, 10, 0, 0)),
            (90, 'excellent', datetime(2025, 1, 11, 10, 0, 0)),
            (87, 'good', datetime(2025, 1, 12, 10, 0, 0))
        ]
        
        calc = HealthScoreCalculator.__new__(HealthScoreCalculator)
        calc.db_config = {}
        
        trend = calc.get_health_trend("test-skill", days=7)
        
        assert len(trend) == 3
        assert trend[0]["overall_score"] == 85
        assert trend[1]["overall_score"] == 90


def test_calculator_invalidate_cache():
    """Test cache invalidation"""
    with patch('src.workflow_codification.health.calculator.ComponentScoreCalculator'):
        with patch('src.workflow_codification.health.calculator.HealthScoreCache') as MockCache:
            mock_cache = MockCache.return_value
            
            calc = HealthScoreCalculator({})
            calc.invalidate_cache("test-skill")
            
            mock_cache.invalidate.assert_called_once_with("test-skill")


def test_calculator_context_manager():
    """Test calculator as context manager"""
    with patch('src.workflow_codification.health.calculator.ComponentScoreCalculator'):
        with patch('src.workflow_codification.health.calculator.HealthScoreCache'):
            with HealthScoreCalculator({}) as calc:
                assert calc is not None


def test_component_calculator_context_manager():
    """Test component calculator as context manager"""
    with patch('psycopg2.connect') as mock_connect:
        mock_conn = MagicMock()
        mock_connect.return_value = mock_conn
        
        from src.workflow_codification.health.component_scores import ComponentScoreCalculator
        
        with ComponentScoreCalculator({}) as calc:
            assert calc is not None
        
        mock_conn.close.assert_called_once()


def test_monitor_check_skill_now():
    """Test on-demand skill health check"""
    with patch('src.workflow_codification.health.monitor.HealthScoreCalculator') as MockCalc:
        mock_calc = MockCalc.return_value
        
        mock_health = MagicMock()
        mock_health.skill_name = "test-skill"
        mock_health.overall_score = 85
        mock_health.health_level = "good"
        mock_health.reliability_score = 90.0
        mock_health.performance_score = 80.0
        mock_health.edge_case_score = 85.0
        mock_health.documentation_score = 75.0
        mock_health.test_coverage_score = 85.0
        mock_health.calculated_at = datetime.utcnow()
        
        mock_calc.calculate_skill_health.return_value = mock_health
        
        monitor = HealthMonitor({})
        result = monitor.check_skill_now("test-skill")
        
        assert result["skill_name"] == "test-skill"
        assert result["overall_score"] == 85
        assert result["health_level"] == "good"
        assert "components" in result


def test_monitor_get_system_health_summary():
    """Test system-wide health summary"""
    with patch('src.workflow_codification.health.monitor.HealthScoreCalculator') as MockCalc:
        mock_calc = MockCalc.return_value
        
        monitor = HealthMonitor.__new__(HealthMonitor)
        monitor.calculator = mock_calc
        
        with patch.object(monitor, '_get_active_skills', return_value=["skill-1", "skill-2"]):
            # Mock health scores
            mock_health_1 = MagicMock(overall_score=90, health_level="excellent")
            mock_health_2 = MagicMock(overall_score=75, health_level="good")
            
            mock_calc.calculate_skill_health.side_effect = [mock_health_1, mock_health_2]
            
            summary = monitor.get_system_health_summary()
            
            assert summary["total_skills"] == 2
            assert summary["average_score"] == 82.5
            assert summary["health_distribution"]["excellent"] == 1
            assert summary["health_distribution"]["good"] == 1


def test_monitor_context_manager():
    """Test monitor as context manager"""
    with patch('src.workflow_codification.health.monitor.HealthScoreCalculator'):
        with HealthMonitor({}, check_interval=1) as monitor:
            assert monitor is not None
            assert not monitor.running  # Should be stopped after exit
