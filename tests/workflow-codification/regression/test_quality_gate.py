"""
Test suite for QualityGate module
Tests mode-specific pass rate thresholds and deployment recommendations
"""

import pytest
from src.workflow_codification.regression.quality_gate import QualityGate, Mode


class TestQualityGateThresholds:
    """Test quality gate threshold enforcement"""

    def test_standard_mode_pass(self):
        """Test standard mode passing threshold (≥95%)"""
        result = QualityGate.check_quality_gate(95.0, Mode.STANDARD)

        assert result["passes"] is True
        assert result["pass_rate"] == 95.0
        assert result["threshold"] == 95.0
        assert result["mode"] == "standard"
        assert result["recommendation"] == "DEPLOY"

    def test_standard_mode_fail(self):
        """Test standard mode failing threshold (<95%)"""
        result = QualityGate.check_quality_gate(94.9, Mode.STANDARD)

        assert result["passes"] is False
        assert result["pass_rate"] == 94.9
        assert result["threshold"] == 95.0
        assert result["mode"] == "standard"
        assert result["recommendation"] == "BLOCK DEPLOYMENT"

    def test_mvp_mode_pass(self):
        """Test MVP mode passing threshold (≥80%)"""
        result = QualityGate.check_quality_gate(80.0, Mode.MVP)

        assert result["passes"] is True
        assert result["threshold"] == 80.0
        assert result["mode"] == "mvp"
        assert result["recommendation"] == "DEPLOY"

    def test_mvp_mode_fail(self):
        """Test MVP mode failing threshold (<80%)"""
        result = QualityGate.check_quality_gate(79.9, Mode.MVP)

        assert result["passes"] is False
        assert result["threshold"] == 80.0
        assert result["recommendation"] == "BLOCK DEPLOYMENT"

    def test_enterprise_mode_pass(self):
        """Test enterprise mode passing threshold (≥98%)"""
        result = QualityGate.check_quality_gate(98.0, Mode.ENTERPRISE)

        assert result["passes"] is True
        assert result["threshold"] == 98.0
        assert result["mode"] == "enterprise"
        assert result["recommendation"] == "DEPLOY"

    def test_enterprise_mode_fail(self):
        """Test enterprise mode failing threshold (<98%)"""
        result = QualityGate.check_quality_gate(97.9, Mode.ENTERPRISE)

        assert result["passes"] is False
        assert result["threshold"] == 98.0
        assert result["recommendation"] == "BLOCK DEPLOYMENT"

    def test_perfect_score(self):
        """Test perfect 100% pass rate"""
        result = QualityGate.check_quality_gate(100.0, Mode.ENTERPRISE)

        assert result["passes"] is True
        assert result["pass_rate"] == 100.0
        assert result["recommendation"] == "DEPLOY"

    def test_zero_score(self):
        """Test zero pass rate"""
        result = QualityGate.check_quality_gate(0.0, Mode.MVP)

        assert result["passes"] is False
        assert result["pass_rate"] == 0.0
        assert result["recommendation"] == "BLOCK DEPLOYMENT"

    def test_default_mode_is_standard(self):
        """Test default mode is standard when not specified"""
        result = QualityGate.check_quality_gate(95.0)

        assert result["mode"] == "standard"
        assert result["threshold"] == 95.0

    def test_edge_case_exactly_at_threshold(self):
        """Test behavior exactly at threshold for all modes"""
        # MVP: exactly 80%
        mvp_result = QualityGate.check_quality_gate(80.0, Mode.MVP)
        assert mvp_result["passes"] is True

        # Standard: exactly 95%
        standard_result = QualityGate.check_quality_gate(95.0, Mode.STANDARD)
        assert standard_result["passes"] is True

        # Enterprise: exactly 98%
        enterprise_result = QualityGate.check_quality_gate(98.0, Mode.ENTERPRISE)
        assert enterprise_result["passes"] is True

    def test_edge_case_just_below_threshold(self):
        """Test behavior just below threshold for all modes"""
        # MVP: 79.999%
        mvp_result = QualityGate.check_quality_gate(79.999, Mode.MVP)
        assert mvp_result["passes"] is False

        # Standard: 94.999%
        standard_result = QualityGate.check_quality_gate(94.999, Mode.STANDARD)
        assert standard_result["passes"] is False

        # Enterprise: 97.999%
        enterprise_result = QualityGate.check_quality_gate(97.999, Mode.ENTERPRISE)
        assert enterprise_result["passes"] is False

    def test_threshold_lookup_correct(self):
        """Test threshold lookup for each mode"""
        assert QualityGate.THRESHOLDS[Mode.MVP] == 80.0
        assert QualityGate.THRESHOLDS[Mode.STANDARD] == 95.0
        assert QualityGate.THRESHOLDS[Mode.ENTERPRISE] == 98.0


class TestDeploymentRecommendations:
    """Test deployment recommendation logic"""

    def test_deploy_recommendation_on_pass(self):
        """Test DEPLOY recommendation when quality gate passes"""
        result = QualityGate.check_quality_gate(100.0, Mode.STANDARD)
        assert result["recommendation"] == "DEPLOY"

    def test_block_recommendation_on_fail(self):
        """Test BLOCK DEPLOYMENT recommendation when quality gate fails"""
        result = QualityGate.check_quality_gate(50.0, Mode.STANDARD)
        assert result["recommendation"] == "BLOCK DEPLOYMENT"

    def test_recommendation_consistency(self):
        """Test recommendation is consistent with passes flag"""
        for pass_rate in [0, 50, 79.9, 80, 94.9, 95, 97.9, 98, 100]:
            for mode in [Mode.MVP, Mode.STANDARD, Mode.ENTERPRISE]:
                result = QualityGate.check_quality_gate(pass_rate, mode)

                if result["passes"]:
                    assert result["recommendation"] == "DEPLOY"
                else:
                    assert result["recommendation"] == "BLOCK DEPLOYMENT"
