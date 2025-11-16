"""
Security Audit Module
Integrates with Bandit for static security analysis and secret detection
"""
import subprocess
import json
import os
import re
from typing import Dict, List, Any


class SecurityAuditor:
    """Performs comprehensive security audits using static analysis and secret scanning"""

    # Patterns for detecting hardcoded secrets
    SECRET_PATTERNS = [
        (re.compile(r'api[_-]?key\s*=\s*["\'][^"\']+["\']', re.IGNORECASE), "API Key"),
        (re.compile(r'password\s*=\s*["\'][^"\']+["\']', re.IGNORECASE), "Password"),
        (re.compile(r'secret\s*=\s*["\'][^"\']+["\']', re.IGNORECASE), "Secret"),
        (re.compile(r'token\s*=\s*["\'][^"\']+["\']', re.IGNORECASE), "Token"),
        (re.compile(r'auth[_-]?token\s*=\s*["\'][^"\']+["\']', re.IGNORECASE), "Auth Token"),
        (
            re.compile(
                r'(AKIA|ASIA)[0-9A-Z]{16}',
                re.IGNORECASE
            ),
            "AWS Access Key",
        ),
    ]

    @staticmethod
    def run_bandit_scan(directory: str = "src/workflow_codification") -> Dict[str, Any]:
        """
        Run Bandit security scanner on Python code

        Args:
            directory: Directory to scan

        Returns:
            Scan results dictionary
        """
        try:
            result = subprocess.run(
                ["bandit", "-r", directory, "-f", "json"],
                capture_output=True,
                text=True,
                timeout=300,
            )

            if result.returncode in (0, 1):  # 0 = no issues, 1 = issues found
                return json.loads(result.stdout)
            else:
                return {"error": result.stderr, "returncode": result.returncode}

        except FileNotFoundError:
            return {"error": "Bandit not installed. Install with: pip install bandit"}
        except json.JSONDecodeError as e:
            return {"error": f"Failed to parse Bandit output: {str(e)}"}
        except subprocess.TimeoutExpired:
            return {"error": "Bandit scan timed out after 300 seconds"}
        except Exception as e:
            return {"error": f"Bandit scan failed: {str(e)}"}

    @staticmethod
    def check_secrets(directory: str = "src/workflow_codification") -> List[Dict[str, Any]]:
        """
        Check for hardcoded secrets in Python files

        Args:
            directory: Directory to scan

        Returns:
            List of files with potential secrets
        """
        findings = []

        try:
            for root, dirs, files in os.walk(directory):
                # Skip __pycache__ and .git directories
                dirs[:] = [d for d in dirs if d not in ("__pycache__", ".git", ".pytest_cache")]

                for file in files:
                    if file.endswith(".py"):
                        file_path = os.path.join(root, file)

                        try:
                            with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
                                content = f.read()

                                # Check each pattern
                                for pattern, secret_type in SecurityAuditor.SECRET_PATTERNS:
                                    matches = pattern.finditer(content)
                                    for match in matches:
                                        # Calculate line number
                                        line_num = content[:match.start()].count("\n") + 1

                                        findings.append({
                                            "file": file_path,
                                            "line": line_num,
                                            "type": secret_type,
                                            "match": match.group(0),
                                        })

                        except Exception as e:
                            findings.append({
                                "file": file_path,
                                "error": f"Failed to scan file: {str(e)}",
                            })

        except Exception as e:
            findings.append({"error": f"Secret scan failed: {str(e)}"})

        return findings

    @staticmethod
    def generate_security_report() -> Dict[str, Any]:
        """
        Generate comprehensive security report

        Returns:
            Complete security audit report
        """
        # Run Bandit scan
        bandit_results = SecurityAuditor.run_bandit_scan()

        # Check for secrets
        secret_findings = SecurityAuditor.check_secrets()

        # Count severity levels from Bandit
        high_severity = 0
        medium_severity = 0
        low_severity = 0

        if "results" in bandit_results:
            for issue in bandit_results["results"]:
                severity = issue.get("issue_severity", "").upper()
                if severity == "HIGH":
                    high_severity += 1
                elif severity == "MEDIUM":
                    medium_severity += 1
                elif severity == "LOW":
                    low_severity += 1

        # Determine overall status
        # FAIL if any HIGH severity findings or secrets found
        overall_status = "PASS"
        if high_severity > 0 or len(secret_findings) > 0:
            overall_status = "FAIL"

        return {
            "bandit_scan": {
                "high_severity": high_severity,
                "medium_severity": medium_severity,
                "low_severity": low_severity,
                "details": bandit_results.get("results", []),
            },
            "hardcoded_secrets": {
                "count": len(secret_findings),
                "findings": secret_findings,
            },
            "overall_status": overall_status,
            "recommendation": (
                "All high-severity findings must be resolved before production deployment"
                if high_severity > 0
                else "Security audit passed. Review medium/low severity findings."
                if medium_severity > 0 or low_severity > 0
                else "Security audit passed with no findings."
            ),
        }

    @staticmethod
    def check_dependencies() -> Dict[str, Any]:
        """
        Check for known vulnerabilities in dependencies

        Returns:
            Vulnerability report
        """
        try:
            result = subprocess.run(
                ["pip", "install", "safety"],
                capture_output=True,
                timeout=60,
            )

            result = subprocess.run(
                ["safety", "check", "--json"],
                capture_output=True,
                text=True,
                timeout=120,
            )

            if result.returncode == 0:
                return json.loads(result.stdout)
            else:
                return {
                    "error": "Vulnerability check failed",
                    "returncode": result.returncode,
                }

        except FileNotFoundError:
            return {
                "warning": "Safety tool not installed. Install with: pip install safety"
            }
        except subprocess.TimeoutExpired:
            return {"error": "Dependency vulnerability check timed out"}
        except Exception as e:
            return {"error": f"Dependency check failed: {str(e)}"}
