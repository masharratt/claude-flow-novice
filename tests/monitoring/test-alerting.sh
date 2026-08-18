#!/usr/bin/env bash
# tests/monitoring/test-alerting.sh
# Comprehensive Alerting Infrastructure Integration Test Suite
# Phase 6 #2: Alerting Infrastructure Implementation

set -euo pipefail

# Test Configuration
TEST_ID="alerting-integration-$(date +%s)"
AGENT_ID="integration-tester-1"
PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"

# Test Environment Variables
export TEST_ALERT_DURATION="30s"
export TEST_ESCALATION_TIMEOUT="60s"
export TEST_PAGERDUTY_KEY="${PAGERDUTY_SERVICE_KEY:-test-key}"
export TEST_SLACK_WEBHOOK="${SLACK_WEBHOOK_URL:-https://hooks.slack.com/test}"
export TEST_ALERTMANAGER_URL="http://localhost:9093"
export TEST_PROMETHEUS_URL="http://localhost:9090"

# Test Counters
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

# Cleanup function
cleanup() {
  log_info "Cleaning up test environment..."
  
  # Stop test containers
  docker stop alertmanager-test 2>/dev/null || true
  docker rm alertmanager-test 2>/dev/null || true
  
  # Kill mock services
  if [ -f /tmp/pagerduty-mock.pid ]; then
    kill $(cat /tmp/pagerduty-mock.pid) 2>/dev/null || true
  fi
  if [ -f /tmp/slack-mock.pid ]; then
    kill $(cat /tmp/slack-mock.pid) 2>/dev/null || true
  fi
  
  # Clean up test files
  rm -f /tmp/test-alertmanager.yml
  rm -f /tmp/test-rules.yml
  rm -f /tmp/alert-test-output.json
  rm -rf /tmp/pagerduty-mock
  rm -rf /tmp/slack-mock
  
  log_info "Cleanup completed"
}

trap cleanup EXIT

# Utility Functions
log_test_start() {
  local test_name="$1"
  log_step "Starting test: $test_name"
  ((TOTAL_TESTS++))
}

log_test_pass() {
  local test_name="$1"
  log_info "✅ PASS: $test_name"
  ((PASSED_TESTS++))
}

log_test_fail() {
  local test_name="$1"
  local reason="$2"
  log_error "❌ FAIL: $test_name - $reason"
  ((FAILED_TESTS++))
}

# Wait for service to be ready
wait_for_service() {
  local url="$1"
  local max_attempts="${2:-30}"
  local attempt=1
  
  while [ $attempt -le $max_attempts ]; do
    if curl -s "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep 2
    ((attempt++))
  done
  return 1
}

# Create test Alertmanager configuration
create_test_alertmanager_config() {
  cat > /tmp/test-alertmanager.yml << 'EOF'
global:
  resolve_timeout: 5m
  smtp_smarthost: 'localhost:587'
  smtp_from: 'alerts@cfn-loop.local'

route:
  group_by: ['alertname']
  group_wait: 10s
  group_interval: 10s
  repeat_interval: 1h
  receiver: 'web.hook'
  routes:
  - match:
      severity: critical
    receiver: 'pagerduty-critical'
    continue: true
  - match:
      severity: warning
    receiver: 'slack-warning'
    continue: true
  - match:
      severity: info
    receiver: 'slack-info'

receivers:
- name: 'web.hook'
  webhook_configs:
  - url: 'http://localhost:8080/webhook'
    send_resolved: true

- name: 'pagerduty-critical'
  pagerduty_configs:
  - service_key: '${PAGERDUTY_SERVICE_KEY}'
    description: '{{ .CommonAnnotations.summary }}'
    details:
      firing: '{{ .Alerts.Firing | len }}'
      resolved: '{{ .Alerts.Resolved | len }}'
      severity: '{{ .GroupLabels.severity }}'

- name: 'slack-warning'
  slack_configs:
  - api_url: '${SLACK_WEBHOOK_URL}'
    channel: '#cfn-alerts-warning'
    title: 'CFN Loop Alert: {{ .GroupLabels.alertname }}'
    text: '{{ range .Alerts }}{{ .Annotations.description }}{{ end }}'
    send_resolved: true

- name: 'slack-info'
  slack_configs:
  - api_url: '${SLACK_WEBHOOK_URL}'
    channel: '#cfn-alerts-info'
    title: 'CFN Loop Info: {{ .GroupLabels.alertname }}'
    text: '{{ range .Alerts }}{{ .Annotations.description }}{{ end }}'
    send_resolved: true

inhibit_rules:
- source_match:
    severity: 'critical'
  target_match:
    severity: 'warning'
  equal: ['alertname', 'instance']
EOF
}

# Create test alert rules
create_test_alert_rules() {
  cat > /tmp/test-rules.yml << 'EOF'
groups:
- name: test_alerts
  rules:
  # Test Critical Alert
  - alert: TestCriticalAlert
    expr: up{job="test"} == 0
    for: 30s
    labels:
      severity: critical
      team: devops
      service: alerting-test
    annotations:
      summary: "Test critical alert for integration testing"
      description: "This is a test critical alert to validate PagerDuty integration"
      runbook_url: "https://runbooks.cfn-loop.local/test-critical"

  # Test Warning Alert
  - alert: TestWarningAlert
    expr: up{job="test"} == 0
    for: 30s
    labels:
      severity: warning
      team: devops
      service: alerting-test
    annotations:
      summary: "Test warning alert for integration testing"
      description: "This is a test warning alert to validate Slack integration"
      runbook_url: "https://runbooks.cfn-loop.local/test-warning"

  # Test Info Alert
  - alert: TestInfoAlert
    expr: up{job="test"} == 0
    for: 30s
    labels:
      severity: info
      team: devops
      service: alerting-test
    annotations:
      summary: "Test info alert for integration testing"
      description: "This is a test info alert to validate Slack integration"
      runbook_url: "https://runbooks.cfn-loop.local/test-info"
EOF
}

# Start mock PagerDuty service
start_pagerduty_mock() {
  log_info "Starting mock PagerDuty service..."
  
  mkdir -p /tmp/pagerduty-mock
  cat > /tmp/pagerduty-mock/server.py << 'EOF'
#!/usr/bin/env python3
from http.server import HTTPServer, BaseHTTPRequestHandler
import json
import urllib.parse
from datetime import datetime

class PagerDutyMockHandler(BaseHTTPRequestHandler):
    def do_POST(self):
        content_length = int(self.headers['Content-Length'])
        post_data = self.rfile.read(content_length)
        
        try:
            # Parse PagerDuty Events API v2 payload
            payload = json.loads(post_data.decode('utf-8'))
            
            # Log received alert
            timestamp = datetime.now().isoformat()
            alert_data = {
                'timestamp': timestamp,
                'event_type': payload.get('event_type'),
                'service_key': payload.get('service_key', 'unknown')[:10] + '...',
                'summary': payload.get('payload', {}).get('summary'),
                'severity': payload.get('payload', {}).get('severity'),
                'source': payload.get('payload', {}).get('source')
            }
            
            with open('/tmp/pagerduty-mock/alerts.log', 'a') as f:
                json.dump(alert_data, f)
                f.write('\n')
            
            # Send success response
            response = {
                'status': 'success',
                'message': 'Event processed',
                'dedup_key': f'test-{timestamp}'
            }
            
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps(response).encode())
            
        except Exception as e:
            self.send_response(400)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            error_response = {'error': str(e)}
            self.wfile.write(json.dumps(error_response).encode())
    
    def log_message(self, format, *args):
        # Suppress default logging
        pass

if __name__ == '__main__':
    server = HTTPServer(('localhost', 8080), PagerDutyMockHandler)
    print("Mock PagerDuty server running on port 8080")
    server.serve_forever()
EOF

  python3 /tmp/pagerduty-mock/server.py &
  PAGERDUTY_MOCK_PID=$!
  echo $PAGERDUTY_MOCK_PID > /tmp/pagerduty-mock.pid
  
  # Wait for mock to start
  sleep 2
  log_info "Mock PagerDuty service started (PID: $PAGERDUTY_MOCK_PID)"
}

# Start mock Slack service
start_slack_mock() {
  log_info "Starting mock Slack service..."
  
  mkdir -p /tmp/slack-mock
  cat > /tmp/slack-mock/server.py << 'EOF'
#!/usr/bin/env python3
from http.server import HTTPServer, BaseHTTPRequestHandler
import json
import urllib.parse
from datetime import datetime

class SlackMockHandler(BaseHTTPRequestHandler):
    def do_POST(self):
        content_length = int(self.headers['Content-Length'])
        post_data = self.rfile.read(content_length)
        
        try:
            # Parse Slack webhook payload
            payload = json.loads(post_data.decode('utf-8'))
            
            # Log received message
            timestamp = datetime.now().isoformat()
            message_data = {
                'timestamp': timestamp,
                'channel': payload.get('channel'),
                'title': payload.get('title'),
                'text': payload.get('text'),
                'color': payload.get('color', 'good')
            }
            
            with open('/tmp/slack-mock/messages.log', 'a') as f:
                json.dump(message_data, f)
                f.write('\n')
            
            # Send success response
            response = {'ok': True, 'timestamp': timestamp}
            
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps(response).encode())
            
        except Exception as e:
            self.send_response(400)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            error_response = {'error': str(e)}
            self.wfile.write(json.dumps(error_response).encode())
    
    def log_message(self, format, *args):
        # Suppress default logging
        pass

if __name__ == '__main__':
    server = HTTPServer(('localhost', 8081), SlackMockHandler)
    print("Mock Slack server running on port 8081")
    server.serve_forever()
EOF

  # Update mock URLs in config
  sed -i "s|http://localhost:8080/webhook|http://localhost:8081|g" /tmp/test-alertmanager.yml
  sed -i "s|\${PAGERDUTY_SERVICE_KEY}|$TEST_PAGERDUTY_KEY|g" /tmp/test-alertmanager.yml
  sed -i "s|\${SLACK_WEBHOOK_URL}|http://localhost:8081|g" /tmp/test-alertmanager.yml
  
  python3 /tmp/slack-mock/server.py &
  SLACK_MOCK_PID=$!
  echo $SLACK_MOCK_PID > /tmp/slack-mock.pid
  
  # Wait for mock to start
  sleep 2
  log_info "Mock Slack service started (PID: $SLACK_MOCK_PID)"
}

# Start Alertmanager for testing
start_test_alertmanager() {
  log_info "Starting test Alertmanager..."
  
  docker run -d \
    --name alertmanager-test \
    -p 9093:9093 \
    -v /tmp/test-alertmanager.yml:/etc/alertmanager/alertmanager.yml:ro \
    prom/alertmanager:v0.25.0 \
    --config.file=/etc/alertmanager/alertmanager.yml \
    --log.level=debug
  
  # Wait for Alertmanager to be ready
  if wait_for_service "http://localhost:9093/-/healthy" 30; then
    log_info "Alertmanager is ready"
  else
    log_error "Alertmanager failed to start"
    return 1
  fi
}

# Test 1: Alertmanager Configuration Validation
test_alertmanager_config() {
  log_test_start "Alertmanager Configuration Validation"
  
  # Validate Alertmanager configuration
  if docker exec alertmanager-test amtool config routes >/dev/null 2>&1; then
    log_test_pass "Alertmanager Configuration Validation"
  else
    log_test_fail "Alertmanager Configuration Validation" "Invalid configuration"
  fi
}

# Test 2: Critical Alert Routing to PagerDuty
test_critical_alert_routing() {
  log_test_start "Critical Alert Routing to PagerDuty"
  
  # Trigger a critical alert by pushing to Alertmanager
  curl -XPOST http://localhost:9093/api/v1/alerts \
    -H 'Content-Type: application/json' \
    -d '[{
      "labels": {
        "alertname": "TestCriticalAlert",
        "severity": "critical",
        "team": "devops",
        "service": "alerting-test"
      },
      "annotations": {
        "summary": "Test critical alert for integration testing",
        "description": "This is a test critical alert to validate PagerDuty integration",
        "runbook_url": "https://runbooks.cfn-loop.local/test-critical"
      },
      "generatorURL": "http://test.example.com"
    }]' >/dev/null 2>&1
  
  # Wait for alert processing
  sleep 10
  
  # Check if PagerDuty mock received the alert
  if [ -f /tmp/pagerduty-mock/alerts.log ] && \
     grep -q "TestCriticalAlert" /tmp/pagerduty-mock/alerts.log; then
    log_test_pass "Critical Alert Routing to PagerDuty"
  else
    log_test_fail "Critical Alert Routing to PagerDuty" "Alert not received by PagerDuty mock"
  fi
}

# Test 3: Warning Alert Routing to Slack
test_warning_alert_routing() {
  log_test_start "Warning Alert Routing to Slack"
  
  # Trigger a warning alert
  curl -XPOST http://localhost:9093/api/v1/alerts \
    -H 'Content-Type: application/json' \
    -d '[{
      "labels": {
        "alertname": "TestWarningAlert",
        "severity": "warning",
        "team": "devops",
        "service": "alerting-test"
      },
      "annotations": {
        "summary": "Test warning alert for integration testing",
        "description": "This is a test warning alert to validate Slack integration",
        "runbook_url": "https://runbooks.cfn-loop.local/test-warning"
      },
      "generatorURL": "http://test.example.com"
    }]' >/dev/null 2>&1
  
  # Wait for alert processing
  sleep 10
  
  # Check if Slack mock received the message
  if [ -f /tmp/slack-mock/messages.log ] && \
     grep -q "TestWarningAlert" /tmp/slack-mock/messages.log; then
    log_test_pass "Warning Alert Routing to Slack"
  else
    log_test_fail "Warning Alert Routing to Slack" "Alert not received by Slack mock"
  fi
}

# Test 4: Info Alert Routing to Slack Info Channel
test_info_alert_routing() {
  log_test_start "Info Alert Routing to Slack Info Channel"
  
  # Trigger an info alert
  curl -XPOST http://localhost:9093/api/v1/alerts \
    -H 'Content-Type: application/json' \
    -d '[{
      "labels": {
        "alertname": "TestInfoAlert",
        "severity": "info",
        "team": "devops",
        "service": "alerting-test"
      },
      "annotations": {
        "summary": "Test info alert for integration testing",
        "description": "This is a test info alert to validate Slack integration",
        "runbook_url": "https://runbooks.cfn-loop.local/test-info"
      },
      "generatorURL": "http://test.example.com"
    }]' >/dev/null 2>&1
  
  # Wait for alert processing
  sleep 10
  
  # Check if Slack mock received the info message
  if [ -f /tmp/slack-mock/messages.log ] && \
     grep -q "TestInfoAlert" /tmp/slack-mock/messages.log; then
    log_test_pass "Info Alert Routing to Slack Info Channel"
  else
    log_test_fail "Info Alert Routing to Slack Info Channel" "Alert not received by Slack mock"
  fi
}

# Test 5: Alert Inhibition Rules
test_alert_inhibition() {
  log_test_start "Alert Inhibition Rules"
  
  # Trigger both critical and warning alerts for same instance
  curl -XPOST http://localhost:9093/api/v1/alerts \
    -H 'Content-Type: application/json' \
    -d '[
      {
        "labels": {
          "alertname": "HighAgentFailureRate",
          "severity": "critical",
          "instance": "test-instance",
          "team": "devops"
        }
      },
      {
        "labels": {
          "alertname": "HighAgentFailureRate",
          "severity": "warning",
          "instance": "test-instance",
          "team": "devops"
        }
      }
    ]' >/dev/null 2>&1
  
  # Wait for inhibition processing
  sleep 10
  
  # Check inhibition logic (critical should inhibit warning)
  local critical_count=$(grep -c "critical" /tmp/pagerduty-mock/alerts.log 2>/dev/null || echo "0")
  local warning_count=$(grep -c "warning" /tmp/slack-mock/messages.log 2>/dev/null || echo "0")
  
  if [ "$critical_count" -gt 0 ] && [ "$warning_count" -eq 0 ]; then
    log_test_pass "Alert Inhibition Rules"
  else
    log_test_fail "Alert Inhibition Rules" "Inhibition not working correctly (critical: $critical_count, warning: $warning_count)"
  fi
}

# Test 6: Alert Resolution
test_alert_resolution() {
  log_test_start "Alert Resolution"
  
  # Trigger and then resolve an alert
  curl -XPOST http://localhost:9093/api/v1/alerts \
    -H 'Content-Type: application/json' \
    -d '[{
      "labels": {
        "alertname": "TestResolutionAlert",
        "severity": "warning",
        "instance": "test-resolution",
        "team": "devops"
      },
      "annotations": {
        "summary": "Test alert resolution",
        "description": "Testing alert resolution workflow"
      },
      "generatorURL": "http://test.example.com"
    }]' >/dev/null 2>&1
  
  sleep 5
  
  # Resolve the alert
  curl -XPOST http://localhost:9093/api/v1/alerts \
    -H 'Content-Type: application/json' \
    -d '[{
      "labels": {
        "alertname": "TestResolutionAlert",
        "severity": "warning",
        "instance": "test-resolution",
        "team": "devops"
      },
      "annotations": {
        "summary": "Test alert resolved",
        "description": "Alert has been resolved"
      },
      "endsAt": "'$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)'",
      "generatorURL": "http://test.example.com"
    }]' >/dev/null 2>&1
  
  # Wait for resolution processing
  sleep 10
  
  # Check resolution was processed
  if [ -f /tmp/slack-mock/messages.log ] && \
     grep -q "resolved" /tmp/slack-mock/messages.log; then
    log_test_pass "Alert Resolution"
  else
    log_test_fail "Alert Resolution" "Alert resolution not processed correctly"
  fi
}

# Test 7: Runbook Validation
test_runbook_validation() {
  log_test_start "Runbook Validation"
  
  # Check if runbooks exist for critical alerts
  local runbook_count=0
  local required_runbooks=(
    "agent-spawn-failure.md"
    "redis-connection-loss.md"
    "postgres-connection-loss.md"
    "docker-daemon-unavailable.md"
    "disk-space-exhaustion.md"
    "high-cost-per-team.md"
    "cfn-loop-stuck.md"
    "certificate-expiration.md"
    "memory-exhaustion.md"
    "backup-failure.md"
  )
  
  for runbook in "${required_runbooks[@]}"; do
    if [ -f "$PROJECT_ROOT/docs/runbooks/$runbook" ]; then
      ((runbook_count++))
    fi
  done
  
  local runbook_coverage=$((runbook_count * 100 / ${#required_runbooks[@]}))
  
  if [ $runbook_coverage -ge 80 ]; then
    log_test_pass "Runbook Validation (Coverage: $runbook_coverage%)"
  else
    log_test_fail "Runbook Validation" "Insufficient runbook coverage ($runbook_count/${#required_runbooks[@]})"
  fi
}

# Test 8: Escalation Timeout Logic
test_escalation_timeout() {
  log_test_start "Escalation Timeout Logic"
  
  # Test escalation configuration in Alertmanager
  local escalation_config=$(docker exec alertmanager-test amtool config routes 2>/dev/null | grep -c "group_wait\|group_interval\|repeat_interval" || echo "0")
  
  if [ "$escalation_config" -ge 2 ]; then
    log_test_pass "Escalation Timeout Logic"
  else
    log_test_fail "Escalation Timeout Logic" "Missing escalation configuration"
  fi
}

# Test 9: Alertmanager Health Check
test_alertmanager_health() {
  log_test_start "Alertmanager Health Check"
  
  if curl -f http://localhost:9093/-/healthy >/dev/null 2>&1; then
    log_test_pass "Alertmanager Health Check"
  else
    log_test_fail "Alertmanager Health Check" "Alertmanager not healthy"
  fi
}

# Test 10: Integration with Prometheus
test_prometheus_integration() {
  log_test_start "Prometheus Integration"
  
  # Check if Prometheus can reach Alertmanager
  if curl -f http://localhost:9090/-/healthy >/dev/null 2>&1; then
    # Check Prometheus configuration for Alertmanager
    if grep -q "alertmanagers" "$PROJECT_ROOT/monitoring/prometheus.yml" 2>/dev/null; then
      log_test_pass "Prometheus Integration"
    else
      log_test_fail "Prometheus Integration" "Alertmanager not configured in Prometheus"
    fi
  else
    log_test_fail "Prometheus Integration" "Prometheus not accessible"
  fi
}

# Test 11: Alert Rules Validation
test_alert_rules_validation() {
  log_test_start "Alert Rules Validation"
  
  local rules_file="$PROJECT_ROOT/monitoring/prometheus-rules.yml"
  
  if [ -f "$rules_file" ]; then
    # Validate rule syntax using promtool
    if docker run --rm -v "$rules_file":/rules.yml prom/prometheus:v2.48.0 \
      promtool check rules /rules.yml >/dev/null 2>&1; then
      # Count alert rules
      local alert_count=$(grep -c "alert:" "$rules_file" || echo "0")
      if [ "$alert_count" -ge 12 ]; then
        log_test_pass "Alert Rules Validation ($alert_count rules found)"
      else
        log_test_fail "Alert Rules Validation" "Insufficient alert rules ($alert_count < 12)"
      fi
    else
      log_test_fail "Alert Rules Validation" "Invalid rule syntax"
    fi
  else
    log_test_fail "Alert Rules Validation" "Alert rules file not found"
  fi
}

# Test 12: Mock Service Validation
test_mock_services() {
  log_test_start "Mock Services Validation"
  
  local pagerduty_healthy=false
  local slack_healthy=false
  
  # Check PagerDuty mock
  if curl -f http://localhost:8080 >/dev/null 2>&1; then
    pagerduty_healthy=true
  fi
  
  # Check Slack mock
  if curl -f http://localhost:8081 >/dev/null 2>&1; then
    slack_healthy=true
  fi
  
  if $pagerduty_healthy && $slack_healthy; then
    log_test_pass "Mock Services Validation"
  else
    log_test_fail "Mock Services Validation" "One or more mock services unhealthy"
  fi
}

# Main test execution
main() {
  log_info "Starting Alerting Infrastructure Integration Tests (ID: $TEST_ID)"
  
  # Setup test environment
  log_step "Setting up test environment..."
  
  # Create test configurations
  create_test_alertmanager_config
  create_test_alert_rules
  
  # Start mock services
  start_pagerduty_mock
  start_slack_mock
  
  # Start Alertmanager
  if ! start_test_alertmanager; then
    log_error "Failed to start Alertmanager"
    exit 1
  fi
  
  # Wait for all services to be ready
  sleep 5
  
  # Run tests
  test_alertmanager_health
  test_alertmanager_config
  test_mock_services
  test_alert_rules_validation
  test_critical_alert_routing
  test_warning_alert_routing
  test_info_alert_routing
  test_alert_inhibition
  test_alert_resolution
  test_runbook_validation
  test_escalation_timeout
  test_prometheus_integration
  
  # Calculate results
  local pass_rate=0
  if [ $TOTAL_TESTS -gt 0 ]; then
    pass_rate=$(echo "scale=2; $PASSED_TESTS / $TOTAL_TESTS" | bc -l)
  fi
  
  # Print results
  log_info "=================================="
  log_info "Test Results Summary:"
  log_info "=================================="
  log_info "Total Tests: $TOTAL_TESTS"
  log_info "Passed: $PASSED_TESTS"
  log_info "Failed: $FAILED_TESTS"
  log_info "Pass Rate: $(echo "$pass_rate * 100" | bc -l)%"
  log_info "=================================="
  
  # Save results
  cat > "/tmp/alert-test-results-$TEST_ID.json" << EOF
{
  "test_id": "$TEST_ID",
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)",
  "total_tests": $TOTAL_TESTS,
  "passed_tests": $PASSED_TESTS,
  "failed_tests": $FAILED_TESTS,
  "pass_rate": $pass_rate,
  "success_criteria_met": $(echo "$pass_rate >= 0.95" | bc -l)
}
EOF
  
  # Return appropriate exit code
  if (( $(echo "$pass_rate >= 0.95" | bc -l) )); then
    log_info "✅ Alerting integration tests PASSED (≥95% pass rate)"
    return 0
  else
    log_error "❌ Alerting integration tests FAILED (<95% pass rate)"
    return 1
  fi
}

# Execute main function
main "$@"