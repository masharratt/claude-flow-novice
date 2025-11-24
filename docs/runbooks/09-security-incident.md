# Security Incident Runbook

## Overview
This runbook covers response procedures for security incidents including potential breaches, unauthorized access, malware detection, credential compromise, and compliance violations. Focuses on containment, investigation, and recovery.

**Expected Duration:** Variable (immediate containment → 72+ hour investigation)
**Difficulty:** Advanced
**Requires:** Security team access, forensics tools, legal/compliance involvement

**Incident Security Level:** CONFIDENTIAL

## Security Incident Classification

| Type | Severity | Examples | Response |
|------|----------|----------|----------|
| Unauthorized access attempt | P2 | Brute force, invalid creds | Containment, audit logs |
| Potential data breach | P1 | Database access, data export | Immediate shutdown, forensics |
| Credential compromise | P1 | Exposed API key, password leak | Rotation, revocation, audit |
| Malware detection | P1 | Container exploit, injection | Quarantine, scan, rebuild |
| Config drift/misconfiguration | P2 | Open ports, disabled auth | Fix immediately, audit |
| Compliance violation | P2 | Missing encryption, logs | Remediate, notify regulators |

## Pre-Incident Preparation

### Security Monitoring

```bash
#!/bin/bash
# scripts/security-baseline.sh

set -euo pipefail

echo "=== Security Baseline ==="

# 1. Document container images
echo "Container images in use:"
docker images | grep -E "cfn-|postgres|redis" | awk '{print $1":"$2}' > /var/log/security/baseline-images.txt

# 2. Document open ports
echo "Open ports:"
netstat -tlnp | grep -E "3000|3001|5432|6379|9090" > /var/log/security/baseline-ports.txt

# 3. Document file permissions
echo "Critical file permissions:"
ls -la docker-compose.yml .env* scripts/ > /var/log/security/baseline-permissions.txt

# 4. Document users/accounts
docker-compose exec postgres psql -U postgres -c "
  SELECT usename, usecanlogin, usecreatedb FROM pg_user;
" > /var/log/security/baseline-postgres-users.txt

# 5. Document Redis auth
docker-compose exec redis redis-cli -a "$REDIS_PASSWORD" ACL LIST > /var/log/security/baseline-redis-acl.txt

# 6. List installed software
docker exec cfn-agent-1 pip list > /var/log/security/baseline-python-packages.txt || true
docker exec cfn-agent-1 npm list > /var/log/security/baseline-npm-packages.txt || true

echo "✓ Security baseline documented"
```

### Audit Logging

```bash
# Enable comprehensive audit logging
docker-compose exec postgres psql -U postgres -c "
  ALTER SYSTEM SET log_statement = 'all';
  ALTER SYSTEM SET log_connections = on;
  ALTER SYSTEM SET log_disconnections = on;
  ALTER SYSTEM SET log_duration = on;
  SELECT pg_reload_conf();
"

# Enable Docker container logging
docker run --log-driver json-file --log-opt max-size=100m --log-opt max-file=10 ...

# Configure Redis command logging
docker-compose exec redis redis-cli -a "$REDIS_PASSWORD" CONFIG SET loglevel verbose
```

## Incident Response Procedures

### Phase 1: Containment (< 5 minutes)

#### Incident Type: Unauthorized Access Attempt

**Detection:**
```bash
# Alert: Failed login attempts spike
docker logs postgres | grep "password authentication failed" | wc -l

# Alert: Invalid API tokens
docker logs cfn-agent-1 | grep "invalid token" | wc -l

# Alert: Unknown source IP connecting
docker logs nginx | grep "Source: [Unknown IP]"
```

**Response:**

```bash
#!/bin/bash
# scripts/incident-unauthorized-access.sh

set -euo pipefail

INCIDENT_ID="INC-$(date +%Y%m%d-%H%M%S)"
mkdir -p "/tmp/incidents/$INCIDENT_ID"
cd "/tmp/incidents/$INCIDENT_ID"

echo "[SECURITY] Unauthorized access incident: $INCIDENT_ID"

# 1. Preserve evidence immediately
echo "Preserving forensic evidence..."

# Capture active connections
netstat -an > connections.txt
lsof -i > open_files.txt

# Capture running processes
ps aux > processes.txt

# Capture Docker containers
docker ps -a --no-trunc > containers.json

# 2. Identify attack vector
echo "Analyzing attack vector..."

# Check PostgreSQL logs
docker logs postgres 2>&1 | grep -E "failed|error" | tail -50 > pg-errors.txt

# Check application logs
docker logs cfn-agent-1 2>&1 | grep -E "unauthorized|forbidden" | tail -50 > app-errors.txt

# Check firewall logs
iptables -L -n > firewall-rules.txt

# 3. Immediate containment actions
echo "Implementing containment..."

# Option A: Fail-safe deny (most conservative)
# Immediately block all external access
docker exec nginx iptables -I INPUT -j DROP
echo "WARNING: All external access blocked"

# Option B: Restrict to known IPs (safer)
TRUSTED_IPS="203.0.113.0/24"  # Your office network
docker exec nginx iptables -I INPUT -s "$TRUSTED_IPS" -j ACCEPT
docker exec nginx iptables -I INPUT -j DROP

# Option C: Isolate affected component (if localized)
# docker-compose stop cfn-agent-1

# 4. Notify security team immediately
echo "Incident notifications..."
echo "🚨 SECURITY INCIDENT: $INCIDENT_ID - Unauthorized access attempt detected" | \
  mail -s "SECURITY: Unauthorized Access" security-team@example.com

# Slack notification (immediate, high priority)
curl -X POST https://hooks.slack.com/services/YOUR/WEBHOOK/URL \
  -H 'Content-type: application/json' \
  -d "{
    \"text\": \"🚨 SECURITY INCIDENT: $INCIDENT_ID\",
    \"attachments\": [{
      \"color\": \"danger\",
      \"fields\": [
        {\"title\": \"Type\", \"value\": \"Unauthorized Access Attempt\", \"short\": true},
        {\"title\": \"Severity\", \"value\": \"P1\", \"short\": true},
        {\"title\": \"Status\", \"value\": \"Investigating\", \"short\": true}
      ]
    }]
  }"

echo "✓ Incident $INCIDENT_ID containment complete"
echo "Evidence preserved in: /tmp/incidents/$INCIDENT_ID"
```

---

#### Incident Type: Credential Compromise

**Detection:**
```bash
# Alert: API key exposed in logs/GitHub
# Alert: Weak password detected
# Alert: Key rotation deadline passed

# Check for exposed credentials
grep -r "password\|api_key\|secret" /var/log/ | grep -v encrypted | head -20

# Check .env files
ls -la .env* | grep -v ".example"
```

**Response:**

```bash
#!/bin/bash
# scripts/incident-credential-compromise.sh

CREDENTIAL_TYPE="${1:?Usage: $0 <postgres|redis|api_key|jwt>"

echo "Handling $CREDENTIAL_TYPE credential compromise"

# 1. STOP using compromised credentials immediately
echo "Revoking compromised credentials..."

case $CREDENTIAL_TYPE in
  postgres)
    # Revoke PostgreSQL user
    docker-compose exec postgres psql -U postgres -c "
      ALTER USER cfn_user WITH PASSWORD 'TEMPORARY_PASSWORD_$(openssl rand -base64 12)';
      ALTER USER cfn_user WITH ENCRYPTED PASSWORD '\$RANDOM_PASSWORD';
    "

    # Update connection strings
    NEW_PASSWORD=$(openssl rand -base64 12)
    sed -i "s/POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=$NEW_PASSWORD/" .env.production

    # Restart agents to use new credentials
    docker-compose restart cfn-agent-1 cfn-agent-2 cfn-agent-3
    ;;

  redis)
    # Change Redis password
    NEW_PASSWORD=$(openssl rand -base64 12)
    docker-compose exec redis redis-cli -a "$REDIS_PASSWORD" CONFIG SET requirepass "$NEW_PASSWORD"

    # Update environment
    sed -i "s/REDIS_PASSWORD=.*/REDIS_PASSWORD=$NEW_PASSWORD/" .env.production

    # Restart agents
    docker-compose restart cfn-agent-1 cfn-agent-2 cfn-agent-3
    ;;

  api_key)
    # Revoke API key
    # For each service that uses the key:
    # 1. Revoke in API service
    # 2. Generate new key
    # 3. Update in application
    # 4. Monitor for any remaining use of old key
    ;;

  jwt)
    # Rotate JWT signing key
    # Generate new key
    NEW_JWT_SECRET=$(openssl rand -hex 32)
    sed -i "s/JWT_SECRET=.*/JWT_SECRET=$NEW_JWT_SECRET/" .env.production

    # Invalidate existing tokens
    # Clear token cache in Redis
    docker-compose exec redis redis-cli -a "$REDIS_PASSWORD" DEL "jwt:tokens:*"

    # Force re-authentication
    docker-compose restart cfn-orchestrator
    ;;
esac

# 2. Audit usage of compromised credential
echo "Auditing credential usage..."

# Check logs for suspicious access with old credentials
docker logs postgres 2>&1 | grep "cfn_user" | grep "$(date -d 'now - 7 days' +%Y-%m-%d)" | \
  tee /tmp/incidents/$INCIDENT_ID/credential-usage.txt

# 3. Check for lateral movement
echo "Checking for unauthorized access..."

docker-compose exec postgres psql -U cfn_user -d cfn -c "
  SELECT
    current_user,
    datname,
    COUNT(*) as queries
  FROM pg_stat_activity
  GROUP BY current_user, datname;
"

# 4. Notify affected users
echo "Notifying users of credential rotation..."
# Send security advisory

# 5. Update monitoring
echo "Adding detection for re-use of old credentials..."
# Create alert for if old password is ever used again
```

---

### Phase 2: Investigation (1-24 hours)

#### Forensic Data Collection

```bash
#!/bin/bash
# scripts/collect-forensics.sh

INCIDENT_ID="$1"
INVESTIGATION_DIR="/tmp/incidents/$INCIDENT_ID/forensics"

mkdir -p "$INVESTIGATION_DIR"

echo "=== Collecting Forensic Evidence ==="

# 1. Container filesystem snapshots
echo "Creating container filesystem snapshots..."
for container in $(docker ps -a -q); do
  NAME=$(docker inspect -f '{{.Name}}' "$container" | tr -d '/')
  docker export "$container" | gzip > "$INVESTIGATION_DIR/$NAME-fs.tar.gz"
done

# 2. Full log collection
echo "Collecting all system logs..."
docker logs --timestamps postgres > "$INVESTIGATION_DIR/postgres-logs.txt" 2>&1
docker logs --timestamps redis > "$INVESTIGATION_DIR/redis-logs.txt" 2>&1
docker logs --timestamps cfn-agent-1 > "$INVESTIGATION_DIR/agent-logs.txt" 2>&1

# 3. Database audit trail
echo "Extracting database audit trail..."
docker-compose exec postgres psql -U cfn_user -d cfn -c "
  SELECT * FROM pg_stat_activity ORDER BY query_start DESC;
" > "$INVESTIGATION_DIR/db-activity.txt"

# 4. Redis command history
echo "Extracting Redis command history..."
docker-compose exec redis redis-cli -a "$REDIS_PASSWORD" SLOWLOG GET 1000 | \
  tee "$INVESTIGATION_DIR/redis-slowlog.txt"

# 5. Network traffic logs
echo "Collecting network logs..."
iptables -L -n -v | tee "$INVESTIGATION_DIR/iptables-rules.txt"
netstat -an | tee "$INVESTIGATION_DIR/netstat.txt"

# 6. File integrity
echo "Checking file integrity..."
sha256sum .env* docker-compose.yml > "$INVESTIGATION_DIR/file-hashes.txt"

# 7. Vulnerability scan
echo "Scanning for vulnerabilities..."
docker run --rm -v /var/run/docker.sock:/var/run/docker.sock \
  aquasec/trivy image --severity HIGH,CRITICAL cfn-agent:latest | \
  tee "$INVESTIGATION_DIR/vulnerability-scan.txt"

echo "✓ Forensics collected: $INVESTIGATION_DIR"
```

#### Timeline Reconstruction

```bash
#!/bin/bash
# scripts/reconstruct-timeline.sh

INVESTIGATION_DIR="$1"

echo "=== Reconstructing Attack Timeline ==="

# Extract timestamps from logs
echo "Extracting key events..."

echo "--- PostgreSQL Access Events ---" >> timeline.txt
docker logs postgres 2>&1 | \
  grep -E "authentication|connection|SELECT|UPDATE|DELETE" | \
  head -50 >> timeline.txt

echo "" >> timeline.txt
echo "--- Agent Error Events ---" >> timeline.txt
docker logs cfn-agent-1 2>&1 | \
  grep -E "ERROR|WARN|fatal" | \
  head -50 >> timeline.txt

echo "" >> timeline.txt
echo "--- Redis Command Events ---" >> timeline.txt
cat "$INVESTIGATION_DIR/redis-slowlog.txt" | head -50 >> timeline.txt

# Sort by timestamp
sort timeline.txt > timeline-ordered.txt

echo "✓ Timeline reconstructed: timeline-ordered.txt"
```

---

### Phase 3: Eradication (2-24 hours)

#### Container Image Rebuild

If compromise detected in container:

```bash
#!/bin/bash
# scripts/rebuild-compromised-image.sh

COMPROMISED_IMAGE="cfn-agent:latest"
BUILD_CONTEXT="./docker/agent"

echo "Rebuilding compromised image: $COMPROMISED_IMAGE"

# 1. Stop using compromised image
docker-compose stop cfn-agent-1 cfn-agent-2 cfn-agent-3

# 2. Rebuild from source
docker build \
  --pull \
  --no-cache \
  -t $COMPROMISED_IMAGE:rebuild-$(date +%s) \
  $BUILD_CONTEXT

# 3. Scan for vulnerabilities
docker run --rm -v /var/run/docker.sock:/var/run/docker.sock \
  aquasec/trivy image --severity HIGH,CRITICAL \
  $COMPROMISED_IMAGE:rebuild-$(date +%s)

# 4. If clean, tag as latest
docker tag $COMPROMISED_IMAGE:rebuild-$(date +%s) $COMPROMISED_IMAGE:latest-clean

# 5. Start with new image
docker-compose up -d cfn-agent-1 cfn-agent-2 cfn-agent-3

# 6. Quarantine old image for forensics
docker tag $COMPROMISED_IMAGE:latest $COMPROMISED_IMAGE:compromised-$(date +%s)
docker rmi $COMPROMISED_IMAGE:latest

echo "✓ Image rebuild complete"
```

#### System Hardening

```bash
#!/bin/bash
# scripts/incident-hardening.sh

echo "=== Post-Incident Hardening ==="

# 1. Update all packages
docker-compose pull
docker-compose up -d

# 2. Enable additional security controls
echo "Enabling security controls..."

# Network policy: Restrict to known sources only
docker network update \
  --opt "com.docker.network.driver.mtu=1500" \
  --opt "com.docker.driver.overlay.vxlanid.list=4096:4096" \
  cfn-network

# 3. Implement WAF rules (if using reverse proxy)
# Block: SQL injection patterns, XSS attempts, etc.

# 4. Enable secrets encryption
docker-compose exec postgres psql -U postgres -c "
  CREATE EXTENSION IF NOT EXISTS pgcrypto;
"

# 5. Audit permissions
echo "Auditing permissions..."
docker exec postgres-ls -la /var/lib/postgresql/data
find . -name ".env*" -exec ls -la {} \;

# 6. Enable MFA if available
# Configure LDAP/SASL for PostgreSQL
# Configure OAuth2 for applications

echo "✓ Hardening complete"
```

---

### Phase 4: Recovery & Validation

#### System Validation

```bash
#!/bin/bash
# scripts/validate-incident-recovery.sh

set -euo pipefail

echo "=== Post-Incident Validation ==="

# 1. Verify no backdoors remain
echo "Checking for persistence mechanisms..."

# Check for scheduled tasks
docker exec cfn-agent-1 crontab -l | grep -v "^#" || echo "No suspicious cron jobs"

# Check for suspicious processes
docker exec cfn-agent-1 ps aux | grep -v "cfn-agent" | wc -l | grep -q "[0-9]"

# Check for unauthorized users
docker-compose exec postgres psql -U postgres -c "
  SELECT usename, usecanlogin FROM pg_user WHERE usename NOT IN ('postgres', 'cfn_user');
"

# 2. Verify integrity of critical data
echo "Verifying data integrity..."

# Compare checksums
sha256sum .env* docker-compose.yml | diff - baseline-checksums.txt

# Check database for signs of tampering
docker-compose exec postgres psql -U cfn_user -d cfn -c "
  SELECT COUNT(*) FROM pg_catalog.pg_class
  WHERE relname NOT IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public');
"

# 3. Verify credentials working
echo "Verifying credential rotation..."

# Test PostgreSQL with new password
docker-compose exec postgres psql -U cfn_user -d cfn -c "SELECT 1;"

# Test Redis with new password
docker-compose exec redis redis-cli -a "$REDIS_PASSWORD" PING

# 4. Verify monitoring detects issues
echo "Testing security monitoring..."

# Simulate intrusion attempt
# Attempt invalid login (should be logged and alerted)
docker-compose exec postgres psql -U postgres -d cfn -c "SELECT 1;" 2>/dev/null || \
  echo "✓ Invalid login attempt properly blocked"

# 5. Review all access logs
echo "Reviewing access logs..."
docker logs cfn-orchestrator 2>&1 | tail -50 | grep -E "access|error" || true

echo ""
echo "✓ Post-incident validation complete"
```

## Compliance & Notification

### Breach Notification (Required for Data Breaches)

```bash
#!/bin/bash
# scripts/handle-data-breach.sh

set -euo pipefail

BREACH_DATE=$(date -u +%Y-%m-%dT%H:%M:%SZ)
AFFECTED_RECORDS=$1  # Number of affected records
NOTIFICATION_FILE="/tmp/incidents/breach-notification-$BREACH_DATE.txt"

echo "=== Data Breach Notification Protocol ==="

# 1. Notify legal and compliance
cat > "$NOTIFICATION_FILE" <<EOF
DATA BREACH NOTIFICATION
Date Detected: $BREACH_DATE
Incident: Unauthorized access to customer data
Affected Records: ~$AFFECTED_RECORDS
Data Types: [List specific data: emails, passwords, API keys, etc.]

IMMEDIATE ACTIONS TAKEN:
1. Contained unauthorized access
2. Revoked compromised credentials
3. Increased monitoring
4. Initiated forensic investigation

NOTIFICATION TIMELINE:
- Affected individuals: Within 30 days
- Regulatory bodies: As required
- Law enforcement: If warranted

CONTACT:
Legal: legal@example.com
Privacy: privacy@example.com
EOF

# 2. Notify customers (template)
cat > /tmp/customer-notification-template.txt <<EOF
Subject: Security Notice - Action Required

We are writing to inform you that we recently discovered
unauthorized access to [SYSTEM]. We have taken the following
actions:

1. Immediately contained the unauthorized access
2. Secured all affected systems
3. Initiated a comprehensive forensic investigation
4. Reset your passwords/API keys

ACTIONS YOU SHOULD TAKE:
1. Change your password on other services if similar
2. Monitor accounts for suspicious activity
3. Enable multi-factor authentication
4. Contact us with any concerns

[Details on type of breach and data exposed]

Questions? Contact: security@example.com
EOF

# 3. Log notification in compliance system
echo "Logging in compliance system..."
# Integration with legal/compliance tracking system

# 4. Create incident post-mortem ticket
echo "Creating post-mortem ticket..."

echo ""
echo "✓ Breach notification handled"
echo "✓ Legal team to review: $NOTIFICATION_FILE"
```

### Post-Incident Review

```bash
#!/bin/bash
# scripts/security-incident-postmortem.sh

INCIDENT_ID="$1"

cat > "/tmp/incidents/$INCIDENT_ID/postmortem.md" <<EOF
# Security Incident Post-Mortem

## Incident Summary
- **ID:** $INCIDENT_ID
- **Date:** $(date)
- **Type:** [Type of incident]
- **Severity:** [P1/P2/P3]
- **Impact:** [What was affected]

## Timeline
- **Detection:** [When discovered]
- **Containment:** [When stopped]
- **Investigation:** [Key findings]
- **Recovery:** [When back to normal]

## Root Cause
[What allowed the incident to happen]

## Contributing Factors
- [Factor 1]
- [Factor 2]
- [Factor 3]

## Lessons Learned
- [Learning 1]
- [Learning 2]

## Preventive Measures
- [ ] Implement fix 1
- [ ] Deploy monitoring 1
- [ ] Update runbook
- [ ] Train team

## Follow-up Actions
- [ ] Deploy prevention changes
- [ ] Test fixes
- [ ] Update security policies
- [ ] Schedule follow-up review
EOF

echo "✓ Post-mortem template: /tmp/incidents/$INCIDENT_ID/postmortem.md"
```

## Security Contacts

| Role | Contact | Escalation |
|------|---------|-----------|
| Security Lead | security-lead@example.com | Immediate |
| CISO | ciso@example.com | P1 breaches |
| Legal | legal@example.com | Data breaches |
| Privacy Officer | privacy@example.com | PII exposure |
| Incident Commander | on-call@example.com | 24/7 available |

## Security Resources

- **Vulnerability Reporting:** security@example.com
- **Security Policy:** docs/SECURITY.md
- **Incident History:** /var/log/security/incidents.log
- **Forensics Tools:** /usr/local/bin/forensics/
- **Security Dashboard:** https://security-dashboard.example.com/
