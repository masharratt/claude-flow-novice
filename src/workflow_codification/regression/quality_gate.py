"""
QualityGate module for regression testing
Enforces mode-specific pass rate thresholds
"""

from enum import Enum


class Mode(Enum):
    """Quality gate modes with different thresholds"""
    MVP = "mvp"
    STANDARD = "standard"
    ENTERPRISE = "enterprise"


class QualityGate:
    """Enforce quality gate thresholds based on mode"""

    # Mode-specific pass rate thresholds
    THRESHOLDS = {
        Mode.MVP: 80.0,
        Mode.STANDARD: 95.0,
        Mode.ENTERPRISE: 98.0
    }

    @staticmethod
    def check_quality_gate(
        pass_rate: float,
        mode: Mode = Mode.STANDARD
    ) -> dict:
        """
        Check if pass rate meets quality gate threshold

        Args:
            pass_rate: Pass rate percentage (0-100)
            mode: Quality mode (default: STANDARD)

        Returns:
            Quality gate result dict with:
            - passes: Whether quality gate passed
            - pass_rate: Pass rate percentage
            - threshold: Required threshold for mode
            - mode: Mode name
            - recommendation: Deployment recommendation (DEPLOY or BLOCK DEPLOYMENT)
        """
        threshold = QualityGate.THRESHOLDS[mode]
        passes = pass_rate >= threshold

        return {
            "passes": passes,
            "pass_rate": pass_rate,
            "threshold": threshold,
            "mode": mode.value,
            "recommendation": "DEPLOY" if passes else "BLOCK DEPLOYMENT"
        }
