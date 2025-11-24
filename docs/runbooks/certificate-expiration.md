# Certificate Expiration Runbook

## Alert Information
- **Alert Name:** `CertificateExpiringSoon`
- **Severity:** P2 (becomes P1 at <3 days)
- **Notification:** Slack #cfn-alerts + #security
- **Threshold:** Certificate expiring in <7 days

## Symptoms
- SSL/TLS certificate expiration warning
- Monitoring endpoints showing certificate warnings
- Prometheus metrics indicating near expiration
- Grafana HTTPS connection issues (if monitoring cert)
- External service warnings about expiring certificates

**Grafana Dashboards:**
- System Resources Dashboard → Security panel

**Common Error Messages:**
```
WARNING: Certificate expires in 5 days (threshold: 7 days)
ERROR: SSL certificate expired for [domain]
WARNING: Certificate for [endpoint] invalid after [date]
curl: (60) SSL certificate problem: certificate has expired
```

## Diagnosis

### 1. Identify Expiring Certificates
```bash
# Check all certificates in use
for cert in /etc/ssl/certs/*.crt /etc/ssl/private/*.crt; do
  if [ -f "$cert" ]; then
    echo "=== $cert ==="
    openssl x509 -in "$cert" -noout -enddate
  fi
done

# Check certificate expiration details
openssl x509 -in /path/to/cert.crt -noout -enddate -subject -issuer

# Calculate days until expiration
expiry_date=$(openssl x509 -in /path/to/cert.crt -noout -enddate | cut -d= -f2)
days_left=$(( ($(date -d "$expiry_date" +%s) - $(date +%s)) / 86400 ))
echo "Days until expiration: $days_left"
```

### 2. Check Certificate Usage
```bash
# Find services using the certificate
lsof | grep /path/to/cert.crt

# Check Docker container mounts
docker ps --format "{{.Names}}" | while read container; do
  echo "=== $container ==="
  docker inspect "$container" | jq -r '.[0].Mounts[] | select(.Source | contains("ssl") or contains("cert"))'
done

# Check Grafana certificate
curl -vI https://localhost:3000 2>&1 | grep -E "expire|issuer"

# Check Prometheus certificate (if HTTPS enabled)
curl -vI https://localhost:9090 2>&1 | grep -E "expire|issuer"
```

### 3. Check Certificate Authority
```bash
# Verify certificate chain
openssl s_client -connect localhost:3000 -showcerts

# Check if self-signed or CA-signed
openssl x509 -in /path/to/cert.crt -noout -issuer
# Self-signed: Issuer matches Subject
# CA-signed: Issuer is CA

# Verify certificate validity
openssl verify -CAfile /path/to/ca.crt /path/to/cert.crt
```

### 4. Review Certificate Renewal Process
```bash
# Check if certbot/acme is installed (for Let's Encrypt)
which certbot
certbot certificates

# Check for renewal cron jobs
crontab -l | grep cert
grep -r cert /etc/cron.*

# Check systemd timers
systemctl list-timers | grep cert
```

### 5. Identify Root Cause

**Common root causes:**
- Self-signed certificate approaching expiration
- Let's Encrypt auto-renewal failed
- Certificate renewal cron job not configured
- CA certificate expired before leaf certificate
- Certificate renewal notification missed
- Manual certificate without renewal process

## Resolution

### Immediate Actions (P2 - 1 hour response)

**Action 1: Renew Let's Encrypt Certificate (if applicable)**
```bash
# Attempt automatic renewal
sudo certbot renew

# If renewal fails, force renewal
sudo certbot renew --force-renewal

# Check renewal success
sudo certbot certificates
# Expected: Valid for 90 days

# Restart services using certificate
sudo systemctl reload nginx
# Or for Docker services:
docker-compose -f docker-compose.monitoring.yml restart grafana
```

**Action 2: Generate New Self-Signed Certificate**
```bash
# If using self-signed cert for development/internal use
DOMAIN="localhost"
CERT_PATH="/etc/ssl/certs"
KEY_PATH="/etc/ssl/private"

# Generate new certificate (valid for 365 days)
sudo openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout "$KEY_PATH/$DOMAIN.key" \
  -out "$CERT_PATH/$DOMAIN.crt" \
  -subj "/C=US/ST=State/L=City/O=Organization/CN=$DOMAIN"

# Set proper permissions
sudo chmod 600 "$KEY_PATH/$DOMAIN.key"
sudo chmod 644 "$CERT_PATH/$DOMAIN.crt"

# Restart services
docker-compose -f docker-compose.monitoring.yml restart grafana
```

**Action 3: Update Certificate in Docker Volumes**
```bash
# If certificate is mounted in Docker containers
CERT_FILE="/etc/ssl/certs/localhost.crt"
KEY_FILE="/etc/ssl/private/localhost.key"

# Copy new certificate to Docker volume
docker cp "$CERT_FILE" grafana:/etc/ssl/certs/localhost.crt
docker cp "$KEY_FILE" grafana:/etc/ssl/private/localhost.key

# Restart container to load new certificate
docker restart grafana

# Verify new certificate loaded
docker exec grafana openssl x509 -in /etc/ssl/certs/localhost.crt -noout -enddate
```

### Complete Fix

**Step 1: Implement Automatic Renewal**
```bash
# For Let's Encrypt certificates:
# Add renewal cron job (runs twice daily)
sudo tee /etc/cron.d/certbot-renew <<EOF
0 */12 * * * root certbot renew --quiet --deploy-hook "systemctl reload nginx"
EOF

# For self-signed certificates:
# Create renewal script
sudo tee /usr/local/bin/renew-selfsigned-cert.sh <<'EOF'
#!/bin/bash
set -euo pipefail

DOMAIN="localhost"
CERT_PATH="/etc/ssl/certs"
KEY_PATH="/etc/ssl/private"

# Check days until expiration
days_left=$(( ($(date -d "$(openssl x509 -in "$CERT_PATH/$DOMAIN.crt" -noout -enddate | cut -d= -f2)" +%s) - $(date +%s)) / 86400 ))

# Renew if <30 days left
if [ "$days_left" -lt 30 ]; then
  echo "$(date): Renewing certificate (expires in $days_left days)"

  # Generate new certificate
  openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
    -keyout "$KEY_PATH/$DOMAIN.key" \
    -out "$CERT_PATH/$DOMAIN.crt" \
    -subj "/C=US/ST=State/L=City/O=Organization/CN=$DOMAIN"

  # Restart services
  docker-compose -f /path/to/docker-compose.monitoring.yml restart grafana

  echo "$(date): Certificate renewed successfully"
else
  echo "$(date): Certificate valid for $days_left days, no renewal needed"
fi
EOF

sudo chmod +x /usr/local/bin/renew-selfsigned-cert.sh

# Add to crontab (weekly check)
(crontab -l 2>/dev/null; echo "0 2 * * 0 /usr/local/bin/renew-selfsigned-cert.sh >> /var/log/cert-renewal.log 2>&1") | crontab -
```

**Step 2: Configure Certificate Monitoring**
```bash
# Add certificate expiration exporter to Prometheus
# (Already configured in prometheus.yml if using blackbox_exporter)

# Verify Prometheus is scraping certificate metrics
curl -s http://localhost:9090/api/v1/query?query=probe_ssl_earliest_cert_expiry | jq

# Add Grafana dashboard panel for certificate expiration
# (See: monitoring/dashboards/system-resources.json)
```

**Step 3: Document Certificate Inventory**
```bash
# Create certificate inventory
sudo tee /etc/ssl/certificate-inventory.txt <<EOF
# Certificate Inventory
# Updated: $(date)

# Grafana HTTPS
Path: /etc/ssl/certs/localhost.crt
Type: Self-signed
Expires: $(openssl x509 -in /etc/ssl/certs/localhost.crt -noout -enddate)
Renewal: Automatic (weekly check)

# Add other certificates here...
EOF

# Set reminder to review inventory quarterly
echo "0 0 1 */3 * cat /etc/ssl/certificate-inventory.txt | mail -s 'Certificate Inventory Review' security@example.com" | crontab -
```

**Step 4: Test Renewal Process**
```bash
# Test automatic renewal script
sudo /usr/local/bin/renew-selfsigned-cert.sh

# Verify new certificate
openssl x509 -in /etc/ssl/certs/localhost.crt -noout -enddate

# Test service connectivity with new certificate
curl -vI https://localhost:3000 2>&1 | grep -E "expire|issuer"

# Expected: Certificate valid for ~365 days
```

## Verification Checklist
- [ ] Alert cleared (certificate >7 days until expiration)
- [ ] New certificate generated and deployed
- [ ] Services restarted and using new certificate
- [ ] Certificate accessible via HTTPS
- [ ] No browser/curl certificate warnings
- [ ] Automatic renewal configured (cron/systemd timer)
- [ ] Certificate monitoring active in Prometheus
- [ ] Grafana dashboard shows valid certificate
- [ ] Certificate inventory updated
- [ ] Renewal process tested and documented

## Prevention

### Configuration Changes
1. **Automatic renewal:** Let's Encrypt or self-signed renewal script
2. **Renewal buffer:** Renew at 30 days (not 7 days)
3. **Monitoring interval:** Check expiration daily
4. **Alert threshold:** Warn at 30 days, critical at 7 days
5. **Backup certificates:** Keep last 3 certificate versions

### Monitoring Improvements
1. **Add alert:** Certificate expiring in <30 days (early warning)
2. **Add alert:** Certificate renewal script failure
3. **Add dashboard:** Certificate expiration timeline for all certs
4. **Add metric:** Days until expiration for each certificate
5. **Add notification:** Monthly certificate inventory report

### Process Changes
1. **Quarterly review:** Audit all certificates and renewal processes
2. **Documentation:** Maintain certificate inventory with renewal procedures
3. **Testing:** Annual certificate renewal drill
4. **Automation:** Use cert-manager for Kubernetes certificates
5. **Centralization:** Single source of truth for all certificates
6. **Notification:** 30/14/7/3/1 day expiration warnings

## Post-Incident

### Required Actions
1. Create post-incident review within 24 hours
2. Update certificate inventory
3. Implement automatic renewal within 1 week
4. Test renewal process in staging
5. Document renewal procedures

### Post-Incident Review Template
```markdown
# PIR: Certificate Expiration - [DATE]

## Timeline
- [TIME]: Alert fired (certificate <7 days)
- [TIME]: On-call notified
- [TIME]: Certificate identified
- [TIME]: New certificate generated
- [TIME]: Certificate deployed
- [TIME]: Services restarted
- [TIME]: Alert cleared

## Root Cause
[No renewal process / renewal script failed / notification missed]

## Impact
- **Risk level:** [Low - caught before expiration / High - service downtime]
- **Affected services:** [Grafana / Prometheus / other]
- **User impact:** [None - internal cert / HTTPS warnings / service unavailable]

## Resolution
[Generated new cert / renewed Let's Encrypt / configured auto-renewal]

## Certificate Details
- **Domain:** [domain/hostname]
- **Type:** [Self-signed / Let's Encrypt / CA-signed]
- **Previous expiration:** [date]
- **New expiration:** [date]
- **Renewal method:** [Manual / automatic]

## Lessons Learned
- No automatic renewal configured
- Alert threshold too late (7 days)
- Certificate inventory outdated
- Renewal process not documented

## Action Items
1. Configure automatic renewal - Owner: DevOps - Due: [date]
2. Adjust alert to 30 days - Owner: SRE - Due: [date]
3. Update certificate inventory - Owner: Security - Due: [date]
4. Document renewal procedures - Owner: DevOps - Due: [date]
5. Test renewal in staging - Owner: SRE - Due: [date]
```

## Related Alerts
- N/A (Certificate expiration is standalone alert)

## References
- **Grafana:** http://localhost:3000/d/system-resources
- **Prometheus:** http://localhost:9090/alerts
- **Docs:** [MONITORING_GUIDE.md](/mnt/wsl/.../docs/MONITORING_GUIDE.md)
- **Certificate Inventory:** [/etc/ssl/certificate-inventory.txt]
- **Let's Encrypt Docs:** https://letsencrypt.org/docs/
- **OpenSSL Docs:** https://www.openssl.org/docs/

---
**Last Updated:** 2025-11-24
**Version:** 1.0
**Maintainer:** Security Team + DevOps
