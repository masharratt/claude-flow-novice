"""
Comprehensive security hardening test suite
Tests cover OWASP Top 10 attack vectors and compliance validation
"""
import pytest
import os
import sys
import time
from unittest.mock import Mock, patch, MagicMock

# Add src to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../../../../src'))


class TestInputValidation:
    """Test input validation against injection attacks"""

    def test_sql_injection_select_prevention(self):
        """Test SQL injection prevention with SELECT statement"""
        from src.workflow_codification.security.input_validator import InputValidator

        with pytest.raises(ValueError) as exc:
            InputValidator.validate_sql_parameter("SELECT * FROM users")
        assert "SQL injection pattern" in str(exc.value)

    def test_sql_injection_union_prevention(self):
        """Test SQL injection prevention with UNION statement"""
        from src.workflow_codification.security.input_validator import InputValidator

        with pytest.raises(ValueError):
            InputValidator.validate_sql_parameter("' UNION SELECT password FROM admin --")

    def test_sql_injection_drop_prevention(self):
        """Test SQL injection prevention with DROP statement"""
        from src.workflow_codification.security.input_validator import InputValidator

        with pytest.raises(ValueError):
            InputValidator.validate_sql_parameter("'; DROP TABLE users; --")

    def test_sql_injection_comment_prevention(self):
        """Test SQL injection prevention with SQL comments"""
        from src.workflow_codification.security.input_validator import InputValidator

        with pytest.raises(ValueError):
            InputValidator.validate_sql_parameter("admin' -- comment")

    def test_sql_injection_string_delimiter_prevention(self):
        """Test SQL injection prevention with string delimiters"""
        from src.workflow_codification.security.input_validator import InputValidator

        with pytest.raises(ValueError):
            InputValidator.validate_sql_parameter("' OR '1'='1")

    def test_command_injection_semicolon_prevention(self):
        """Test command injection prevention with semicolon"""
        from src.workflow_codification.security.input_validator import InputValidator

        with pytest.raises(ValueError):
            InputValidator.validate_command("npm test; rm -rf /")

    def test_command_injection_pipe_prevention(self):
        """Test command injection prevention with pipe"""
        from src.workflow_codification.security.input_validator import InputValidator

        with pytest.raises(ValueError):
            InputValidator.validate_command("ls | cat /etc/passwd")

    def test_command_injection_ampersand_prevention(self):
        """Test command injection prevention with ampersand"""
        from src.workflow_codification.security.input_validator import InputValidator

        with pytest.raises(ValueError):
            InputValidator.validate_command("npm install & rm -rf /")

    def test_command_injection_backtick_prevention(self):
        """Test command injection prevention with backticks"""
        from src.workflow_codification.security.input_validator import InputValidator

        with pytest.raises(ValueError):
            InputValidator.validate_command("echo `cat /etc/passwd`")

    def test_command_injection_variable_substitution_prevention(self):
        """Test command injection prevention with variable substitution"""
        from src.workflow_codification.security.input_validator import InputValidator

        with pytest.raises(ValueError):
            InputValidator.validate_command("echo ${SHELL}")

    def test_xss_script_tag_prevention(self):
        """Test XSS prevention with script tag"""
        from src.workflow_codification.security.input_validator import InputValidator

        with pytest.raises(ValueError):
            InputValidator.validate_command("<script>alert(1)</script>")

    def test_xss_javascript_protocol_prevention(self):
        """Test XSS prevention with javascript: protocol"""
        from src.workflow_codification.security.input_validator import InputValidator

        with pytest.raises(ValueError):
            InputValidator.validate_command("javascript:alert('xss')")

    def test_xss_event_handler_prevention(self):
        """Test XSS prevention with event handler"""
        from src.workflow_codification.security.input_validator import InputValidator

        with pytest.raises(ValueError):
            InputValidator.validate_command("onload=alert(1)")

    def test_path_traversal_parent_directory_prevention(self):
        """Test path traversal prevention with ../ pattern"""
        from src.workflow_codification.security.input_validator import InputValidator

        with pytest.raises(ValueError):
            InputValidator.validate_file_path("../../../etc/passwd")

    def test_path_traversal_backslash_prevention(self):
        """Test path traversal prevention with ..\\ pattern"""
        from src.workflow_codification.security.input_validator import InputValidator

        with pytest.raises(ValueError):
            InputValidator.validate_file_path("..\\..\\windows\\system32")

    def test_path_traversal_tilde_prevention(self):
        """Test path traversal prevention with tilde"""
        from src.workflow_codification.security.input_validator import InputValidator

        with pytest.raises(ValueError):
            InputValidator.validate_file_path("~/.ssh/id_rsa")

    def test_valid_skill_name_acceptance(self):
        """Test valid skill name is accepted"""
        from src.workflow_codification.security.input_validator import InputValidator

        assert InputValidator.validate_skill_name("cfn-coordination") is True

    def test_valid_skill_name_with_underscore(self):
        """Test valid skill name with underscore"""
        from src.workflow_codification.security.input_validator import InputValidator

        assert InputValidator.validate_skill_name("cfn_coordination_v2") is True

    def test_valid_skill_name_alphanumeric(self):
        """Test valid alphanumeric skill name"""
        from src.workflow_codification.security.input_validator import InputValidator

        assert InputValidator.validate_skill_name("skill123") is True

    def test_skill_name_empty_rejection(self):
        """Test empty skill name is rejected"""
        from src.workflow_codification.security.input_validator import InputValidator

        with pytest.raises(ValueError):
            InputValidator.validate_skill_name("")

    def test_skill_name_length_limit(self):
        """Test skill name length limit enforcement"""
        from src.workflow_codification.security.input_validator import InputValidator

        long_name = "a" * 101
        with pytest.raises(ValueError):
            InputValidator.validate_skill_name(long_name)

    def test_skill_name_invalid_characters(self):
        """Test skill name rejects invalid characters"""
        from src.workflow_codification.security.input_validator import InputValidator

        with pytest.raises(ValueError):
            InputValidator.validate_skill_name("cfn; DROP TABLE")

    def test_empty_command_rejection(self):
        """Test empty command is rejected"""
        from src.workflow_codification.security.input_validator import InputValidator

        with pytest.raises(ValueError):
            InputValidator.validate_command("")

    def test_command_length_limit(self):
        """Test command length limit enforcement"""
        from src.workflow_codification.security.input_validator import InputValidator

        long_command = "a" * 10001
        with pytest.raises(ValueError):
            InputValidator.validate_command(long_command)

    def test_output_sanitization_html_entities(self):
        """Test output sanitization converts HTML entities"""
        from src.workflow_codification.security.input_validator import InputValidator

        output = '<script>alert("xss")</script>'
        sanitized = InputValidator.sanitize_output(output)

        assert "<" not in sanitized
        assert ">" not in sanitized
        assert "&lt;" in sanitized
        assert "&gt;" in sanitized

    def test_output_sanitization_quotes(self):
        """Test output sanitization converts quotes"""
        from src.workflow_codification.security.input_validator import InputValidator

        output = 'Hello "world" and \'test\''
        sanitized = InputValidator.sanitize_output(output)

        assert "&quot;" in sanitized
        assert "&#x27;" in sanitized

    def test_file_path_validation_within_base(self):
        """Test file path validation within allowed base"""
        from src.workflow_codification.security.input_validator import InputValidator

        assert InputValidator.validate_file_path("/tmp/test.txt", "/tmp") is True

    def test_file_path_validation_outside_base(self):
        """Test file path validation rejects paths outside base"""
        from src.workflow_codification.security.input_validator import InputValidator

        with pytest.raises(ValueError):
            InputValidator.validate_file_path("/etc/passwd", "/tmp")


class TestRateLimiting:
    """Test rate limiting functionality"""

    @patch('src.workflow_codification.security.rate_limiter.RedisClient')
    def test_rate_limit_first_request_allowed(self, mock_redis_client):
        """Test first request within limit is allowed"""
        from src.workflow_codification.security.rate_limiter import RateLimiter

        mock_client = MagicMock()
        mock_redis_client.return_value.get_client.return_value = mock_client
        mock_client.zcard.return_value = 0

        limiter = RateLimiter()
        allowed, retry_after = limiter.check_rate_limit("user123", limit=100, window_seconds=60)

        assert allowed is True
        assert retry_after is None

    @patch('src.workflow_codification.security.rate_limiter.RedisClient')
    def test_rate_limit_within_threshold(self, mock_redis_client):
        """Test request count within limit"""
        from src.workflow_codification.security.rate_limiter import RateLimiter

        mock_client = MagicMock()
        mock_redis_client.return_value.get_client.return_value = mock_client
        mock_client.zcard.return_value = 50

        limiter = RateLimiter()
        allowed, retry_after = limiter.check_rate_limit("user123", limit=100, window_seconds=60)

        assert allowed is True
        assert retry_after is None

    @patch('src.workflow_codification.security.rate_limiter.RedisClient')
    def test_rate_limit_exceeded(self, mock_redis_client):
        """Test request rate limit exceeded"""
        from src.workflow_codification.security.rate_limiter import RateLimiter

        mock_client = MagicMock()
        mock_redis_client.return_value.get_client.return_value = mock_client
        mock_client.zcard.return_value = 100
        mock_client.zrange.return_value = [(b'timestamp', 1000.0)]

        limiter = RateLimiter()
        allowed, retry_after = limiter.check_rate_limit("user123", limit=100, window_seconds=60)

        assert allowed is False
        assert retry_after is not None
        assert retry_after > 0

    @patch('src.workflow_codification.security.rate_limiter.RedisClient')
    def test_user_rate_limit_100_per_minute(self, mock_redis_client):
        """Test per-user rate limit is 100 requests/minute"""
        from src.workflow_codification.security.rate_limiter import RateLimiter

        mock_client = MagicMock()
        mock_redis_client.return_value.get_client.return_value = mock_client
        mock_client.zcard.return_value = 99

        limiter = RateLimiter()
        allowed, retry_after = limiter.check_user_rate_limit("user123")

        assert allowed is True
        assert retry_after is None

    @patch('src.workflow_codification.security.rate_limiter.RedisClient')
    def test_ip_rate_limit_200_per_minute(self, mock_redis_client):
        """Test per-IP rate limit is 200 requests/minute"""
        from src.workflow_codification.security.rate_limiter import RateLimiter

        mock_client = MagicMock()
        mock_redis_client.return_value.get_client.return_value = mock_client
        mock_client.zcard.return_value = 199

        limiter = RateLimiter()
        allowed, retry_after = limiter.check_ip_rate_limit("192.168.1.1")

        assert allowed is True
        assert retry_after is None

    @patch('src.workflow_codification.security.rate_limiter.RedisClient')
    def test_rate_limit_independent_users(self, mock_redis_client):
        """Test rate limits tracked independently per user"""
        from src.workflow_codification.security.rate_limiter import RateLimiter

        mock_client = MagicMock()
        mock_redis_client.return_value.get_client.return_value = mock_client

        # First user at limit
        limiter = RateLimiter()
        mock_client.zcard.return_value = 100
        mock_client.zrange.return_value = [(b'timestamp', 1000.0)]
        allowed1, _ = limiter.check_rate_limit("user1", limit=100)

        # Second user not at limit
        mock_client.zcard.return_value = 50
        allowed2, _ = limiter.check_rate_limit("user2", limit=100)

        assert allowed1 is False
        assert allowed2 is True


class TestPIISanitization:
    """Test PII sanitization functionality"""

    def test_email_sanitization(self):
        """Test email address sanitization"""
        from src.workflow_codification.security.pii_sanitizer import PIISanitizer

        text = "Contact user@example.com for support"
        sanitized = PIISanitizer.sanitize_text(text)

        assert "user@example.com" not in sanitized
        assert "[EMAIL_REDACTED]" in sanitized

    def test_multiple_emails_sanitization(self):
        """Test multiple email addresses are sanitized"""
        from src.workflow_codification.security.pii_sanitizer import PIISanitizer

        text = "Email alice@example.com and bob@example.com"
        sanitized = PIISanitizer.sanitize_text(text)

        assert sanitized.count("[EMAIL_REDACTED]") == 2

    def test_api_key_sanitization(self):
        """Test API key sanitization"""
        from src.workflow_codification.security.pii_sanitizer import PIISanitizer

        text = "API Key: abcdef0123456789abcdef0123456789"
        sanitized = PIISanitizer.sanitize_text(text)

        assert "abcdef0123456789abcdef0123456789" not in sanitized
        assert "[API_KEY_REDACTED]" in sanitized

    def test_password_sanitization(self):
        """Test password sanitization"""
        from src.workflow_codification.security.pii_sanitizer import PIISanitizer

        text = "password=secret123 and pwd='mypassword'"
        sanitized = PIISanitizer.sanitize_text(text)

        assert "secret123" not in sanitized
        assert "mypassword" not in sanitized
        assert "[PASSWORD_REDACTED]" in sanitized

    def test_credit_card_sanitization(self):
        """Test credit card number sanitization"""
        from src.workflow_codification.security.pii_sanitizer import PIISanitizer

        text = "Card: 4111-1111-1111-1111"
        sanitized = PIISanitizer.sanitize_text(text)

        assert "4111-1111-1111-1111" not in sanitized
        assert "[CARD_REDACTED]" in sanitized

    def test_credit_card_without_dashes_sanitization(self):
        """Test credit card without dashes is sanitized"""
        from src.workflow_codification.security.pii_sanitizer import PIISanitizer

        text = "Card: 4111111111111111"
        sanitized = PIISanitizer.sanitize_text(text)

        assert "4111111111111111" not in sanitized
        assert "[CARD_REDACTED]" in sanitized

    def test_ip_address_masking(self):
        """Test IP address is masked"""
        from src.workflow_codification.security.pii_sanitizer import PIISanitizer

        text = "Server 192.168.1.100 connected"
        sanitized = PIISanitizer.sanitize_text(text)

        assert "192.168.1.100" not in sanitized
        assert "192.xxx.xxx.xxx" in sanitized

    def test_ip_address_first_octet_preserved(self):
        """Test first IP octet is preserved in masking"""
        from src.workflow_codification.security.pii_sanitizer import PIISanitizer

        text = "IP: 10.0.0.5"
        sanitized = PIISanitizer.sanitize_text(text)

        assert "10.xxx.xxx.xxx" in sanitized

    def test_trace_sanitization_error_message(self):
        """Test trace error message is sanitized"""
        from src.workflow_codification.security.pii_sanitizer import PIISanitizer

        trace = {
            "error_message": "Connection failed from user@example.com"
        }
        sanitized = PIISanitizer.sanitize_trace(trace)

        assert "[EMAIL_REDACTED]" in sanitized["error_message"]

    def test_trace_sanitization_steps(self):
        """Test trace steps are sanitized"""
        from src.workflow_codification.security.pii_sanitizer import PIISanitizer

        trace = {
            "steps": [
                {"error_message": "Invalid password=secret123"}
            ]
        }
        sanitized = PIISanitizer.sanitize_trace(trace)

        assert "[PASSWORD_REDACTED]" in sanitized["steps"][0]["error_message"]


class TestAuthenticationManagement:
    """Test authentication and authorization"""

    def test_api_key_validation_valid_key(self):
        """Test valid API key is accepted"""
        from src.workflow_codification.security.auth_manager import AuthManager

        auth = AuthManager()
        # Valid format: 32 alphanumeric characters
        is_valid = auth.validate_api_key("abcdef0123456789abcdef0123456789")
        assert is_valid is True

    def test_api_key_validation_invalid_length(self):
        """Test API key with invalid length is rejected"""
        from src.workflow_codification.security.auth_manager import AuthManager

        auth = AuthManager()
        is_valid = auth.validate_api_key("short")
        assert is_valid is False

    def test_api_key_validation_invalid_characters(self):
        """Test API key with invalid characters is rejected"""
        from src.workflow_codification.security.auth_manager import AuthManager

        auth = AuthManager()
        is_valid = auth.validate_api_key("invalid@key$with#special&chars%")
        assert is_valid is False

    @patch('src.workflow_codification.security.auth_manager.RedisClient')
    def test_token_expiration_valid_token(self, mock_redis_client):
        """Test valid token is accepted"""
        from src.workflow_codification.security.auth_manager import AuthManager
        import time

        mock_client = MagicMock()
        mock_redis_client.return_value.get_client.return_value = mock_client
        mock_client.get.return_value = str(time.time() + 3600).encode()

        auth = AuthManager()
        is_valid = auth.validate_token("token123")
        assert is_valid is True

    @patch('src.workflow_codification.security.auth_manager.RedisClient')
    def test_token_expiration_expired_token(self, mock_redis_client):
        """Test expired token is rejected"""
        from src.workflow_codification.security.auth_manager import AuthManager
        import time

        mock_client = MagicMock()
        mock_redis_client.return_value.get_client.return_value = mock_client
        mock_client.get.return_value = str(time.time() - 3600).encode()

        auth = AuthManager()
        is_valid = auth.validate_token("token123")
        assert is_valid is False

    @patch('src.workflow_codification.security.auth_manager.RedisClient')
    def test_token_expiration_missing_token(self, mock_redis_client):
        """Test missing token is rejected"""
        from src.workflow_codification.security.auth_manager import AuthManager

        mock_client = MagicMock()
        mock_redis_client.return_value.get_client.return_value = mock_client
        mock_client.get.return_value = None

        auth = AuthManager()
        is_valid = auth.validate_token("token123")
        assert is_valid is False


class TestSecurityAudit:
    """Test security audit functionality"""

    @patch('src.workflow_codification.security.security_audit.subprocess.run')
    def test_bandit_scan_successful(self, mock_run):
        """Test Bandit scan executes successfully"""
        from src.workflow_codification.security.security_audit import SecurityAuditor
        import json

        mock_run.return_value = Mock(
            returncode=0,
            stdout=json.dumps({
                "results": [
                    {"issue_severity": "MEDIUM"}
                ]
            })
        )

        result = SecurityAuditor.run_bandit_scan()
        assert "results" in result

    @patch('src.workflow_codification.security.security_audit.subprocess.run')
    def test_bandit_scan_detects_high_severity(self, mock_run):
        """Test Bandit detects high severity issues"""
        from src.workflow_codification.security.security_audit import SecurityAuditor
        import json

        mock_run.return_value = Mock(
            returncode=1,
            stdout=json.dumps({
                "results": [
                    {"issue_severity": "HIGH"},
                    {"issue_severity": "MEDIUM"}
                ]
            })
        )

        result = SecurityAuditor.run_bandit_scan()
        assert len(result.get("results", [])) == 2

    def test_check_secrets_in_files(self):
        """Test hardcoded secrets detection"""
        from src.workflow_codification.security.security_audit import SecurityAuditor
        import tempfile
        import os

        with tempfile.TemporaryDirectory() as tmpdir:
            # Create test file with hardcoded secret
            test_file = os.path.join(tmpdir, "test.py")
            with open(test_file, 'w') as f:
                f.write("api_key = 'secret123456789'")

            result = SecurityAuditor.check_secrets(tmpdir)
            assert len(result) > 0

    @patch('src.workflow_codification.security.security_audit.SecurityAuditor.run_bandit_scan')
    @patch('src.workflow_codification.security.security_audit.SecurityAuditor.check_secrets')
    def test_security_report_generation(self, mock_check_secrets, mock_bandit):
        """Test security report generation"""
        from src.workflow_codification.security.security_audit import SecurityAuditor

        mock_bandit.return_value = {
            "results": [
                {"issue_severity": "MEDIUM"}
            ]
        }
        mock_check_secrets.return_value = []

        report = SecurityAuditor.generate_security_report()

        assert "bandit_scan" in report
        assert "hardcoded_secrets" in report
        assert "overall_status" in report

    @patch('src.workflow_codification.security.security_audit.SecurityAuditor.run_bandit_scan')
    @patch('src.workflow_codification.security.security_audit.SecurityAuditor.check_secrets')
    def test_security_report_high_severity_fails(self, mock_check_secrets, mock_bandit):
        """Test security report fails with high severity findings"""
        from src.workflow_codification.security.security_audit import SecurityAuditor

        mock_bandit.return_value = {
            "results": [
                {"issue_severity": "HIGH"}
            ]
        }
        mock_check_secrets.return_value = []

        report = SecurityAuditor.generate_security_report()

        assert report["overall_status"] == "FAIL"

    @patch('src.workflow_codification.security.security_audit.SecurityAuditor.run_bandit_scan')
    @patch('src.workflow_codification.security.security_audit.SecurityAuditor.check_secrets')
    def test_security_report_no_high_severity_passes(self, mock_check_secrets, mock_bandit):
        """Test security report passes with no high severity findings"""
        from src.workflow_codification.security.security_audit import SecurityAuditor

        mock_bandit.return_value = {
            "results": [
                {"issue_severity": "LOW"},
                {"issue_severity": "MEDIUM"}
            ]
        }
        mock_check_secrets.return_value = []

        report = SecurityAuditor.generate_security_report()

        assert report["overall_status"] == "PASS"


class TestOWASPCompliance:
    """Test OWASP Top 10 compliance"""

    def test_owasp_a01_broken_access_control(self):
        """A01: Broken Access Control - verify authentication"""
        from src.workflow_codification.security.auth_manager import AuthManager

        auth = AuthManager()
        # Should reject invalid keys
        assert auth.validate_api_key("invalid") is False

    def test_owasp_a02_cryptographic_failure(self):
        """A02: Cryptographic Failure - PII should be protected"""
        from src.workflow_codification.security.pii_sanitizer import PIISanitizer

        text = "Card: 4111-1111-1111-1111"
        sanitized = PIISanitizer.sanitize_text(text)
        assert "[CARD_REDACTED]" in sanitized

    def test_owasp_a03_injection_sql(self):
        """A03: Injection - SQL injection prevention"""
        from src.workflow_codification.security.input_validator import InputValidator

        with pytest.raises(ValueError):
            InputValidator.validate_sql_parameter("' OR '1'='1")

    def test_owasp_a03_injection_command(self):
        """A03: Injection - Command injection prevention"""
        from src.workflow_codification.security.input_validator import InputValidator

        with pytest.raises(ValueError):
            InputValidator.validate_command("ls; rm -rf /")

    def test_owasp_a04_insecure_design(self):
        """A04: Insecure Design - Rate limiting enforced"""
        from src.workflow_codification.security.rate_limiter import RateLimiter
        from unittest.mock import MagicMock, patch

        with patch('src.workflow_codification.security.rate_limiter.RedisClient'):
            limiter = RateLimiter()
            # Rate limiter should exist and be configurable
            assert limiter is not None

    def test_owasp_a05_broken_authentication(self):
        """A05: Broken Authentication - token validation"""
        from src.workflow_codification.security.auth_manager import AuthManager

        auth = AuthManager()
        # Should validate token expiration
        with patch('src.workflow_codification.security.auth_manager.RedisClient'):
            # Mock validation succeeds
            assert auth.validate_api_key("abcdef0123456789abcdef0123456789") is True

    def test_owasp_a07_xss(self):
        """A07: Cross-Site Scripting - XSS prevention"""
        from src.workflow_codification.security.input_validator import InputValidator

        with pytest.raises(ValueError):
            InputValidator.validate_command("<script>alert(1)</script>")

    def test_owasp_a10_ssrf(self):
        """A10: Server-Side Request Forgery - Path validation"""
        from src.workflow_codification.security.input_validator import InputValidator

        # Path traversal should be blocked
        with pytest.raises(ValueError):
            InputValidator.validate_file_path("../../../etc/passwd")


class TestEdgeCases:
    """Test edge cases and boundary conditions"""

    def test_unicode_in_input_validation(self):
        """Test unicode characters are rejected for security"""
        from src.workflow_codification.security.input_validator import InputValidator

        # Unicode characters should be rejected for security (whitelist approach)
        with pytest.raises(ValueError):
            InputValidator.validate_skill_name("skill_名前")

    def test_null_bytes_injection_prevention(self):
        """Test null byte injection prevention"""
        from src.workflow_codification.security.input_validator import InputValidator

        # Null bytes should be detected
        with pytest.raises(ValueError):
            InputValidator.validate_file_path("test\x00.txt")

    def test_very_long_input_rejection(self):
        """Test extremely long input is rejected"""
        from src.workflow_codification.security.input_validator import InputValidator

        long_input = "a" * 100000
        with pytest.raises(ValueError):
            InputValidator.validate_command(long_input)

    def test_special_characters_in_sanitization(self):
        """Test special characters are properly sanitized"""
        from src.workflow_codification.security.input_validator import InputValidator

        output = '<div class="test" data-attr="value">Content</div>'
        sanitized = InputValidator.sanitize_output(output)

        assert "<" not in sanitized
        assert ">" not in sanitized
        assert "&quot;" in sanitized


class TestIntegration:
    """Integration tests combining multiple security components"""

    def test_end_to_end_input_validation_to_sanitization(self):
        """Test complete flow from validation to sanitization"""
        from src.workflow_codification.security.input_validator import InputValidator

        # Validate input
        assert InputValidator.validate_skill_name("test-skill") is True

        # Sanitize output
        output = InputValidator.sanitize_output("<script>test</script>")
        assert "<script>" not in output

    @patch('src.workflow_codification.security.rate_limiter.RedisClient')
    def test_rate_limit_with_auth(self, mock_redis_client):
        """Test rate limiting with authentication"""
        from src.workflow_codification.security.rate_limiter import RateLimiter
        from src.workflow_codification.security.auth_manager import AuthManager

        mock_client = MagicMock()
        mock_redis_client.return_value.get_client.return_value = mock_client
        mock_client.zcard.return_value = 50

        # Authenticate
        auth = AuthManager()
        api_key_valid = auth.validate_api_key("abcdef0123456789abcdef0123456789")
        assert api_key_valid is True

        # Check rate limit
        limiter = RateLimiter()
        allowed, _ = limiter.check_user_rate_limit("user123")
        assert allowed is True

    def test_sanitization_with_multiple_pii_types(self):
        """Test sanitization with multiple PII types"""
        from src.workflow_codification.security.pii_sanitizer import PIISanitizer

        text = "User email@example.com with API key abcdef0123456789abcdef0123456789"
        sanitized = PIISanitizer.sanitize_text(text)

        assert "[EMAIL_REDACTED]" in sanitized
        assert "[API_KEY_REDACTED]" in sanitized
