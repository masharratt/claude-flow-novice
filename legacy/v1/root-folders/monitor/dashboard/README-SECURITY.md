# 🔐 Secure Performance Dashboard - Production Deployment Guide

## Overview

This guide provides comprehensive instructions for deploying the secure performance monitoring dashboard in production environments with all security controls enabled.

## 🚀 Quick Start

### Prerequisites

- Docker & Docker Compose
- Node.js 18+ (for local development)
- SSL certificates (for production HTTPS)
- Environment configuration

### Production Deployment

1. **Clone and Configure**
```bash
git clone <repository-url>
cd monitor/dashboard
cp .env.example .env
# Edit .env with your configuration
```

2. **Deploy with Docker Compose**
```bash
docker-compose up -d
```

3. **Initial Login**
- Check container logs for default admin credentials
- Login at `https://your-domain.com`
- Change default password immediately

---

## 🔑 Authentication & Security

### Default Credentials

After first deployment, check the container logs for automatically generated credentials:

```bash
docker logs secure-dashboard
```

Look for:
```
🔐 DEFAULT ADMIN CREDENTIALS:
Username: admin
Password: <generated-password>
⚠️  Change this password immediately after first login!
```

### User Roles

- **Admin:** Full access to all features and user management
- **Operator:** Can view metrics and run benchmarks
- **Viewer:** Read-only access to metrics

### Security Features

- **JWT Authentication:** Token-based authentication with refresh tokens
- **Rate Limiting:** Protection against brute force and DoS attacks
- **Session Management:** Automatic session timeout (1 hour)
- **Account Lockout:** 5 failed attempts = 30-minute lockout
- **Security Headers:** Complete security header implementation
- **Input Validation:** XSS and injection prevention

---

## 🛡️ Security Configuration

### Environment Variables

Create a `.env` file with the following security settings:

```bash
# Security Configuration
NODE_ENV=production
JWT_SECRET=<your-256-bit-secret-key>
DEFAULT_ADMIN_PASSWORD=<strong-default-password>

# Access Control
ALLOWED_ORIGINS=https://your-domain.com,https://dashboard.company.com

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
AUTH_MAX_LOGIN_ATTEMPTS=5
AUTH_LOCKOUT_DURATION=1800000

# HTTPS Configuration
HTTPS_CERT_PATH=/app/ssl/cert.pem
HTTPS_KEY_PATH=/app/ssl/key.pem

# Monitoring & Logging
LOG_LEVEL=info
LOG_FORMAT=json
METRICS_ENABLED=true
SECURITY_ENABLED=true
ALERTING_ENABLED=true

# Resource Limits
NODE_OPTIONS=--max-old-space-size=512 --no-expose-gc
UV_THREADPOOL_SIZE=4
```

### SSL Certificate Setup

1. **Obtain SSL Certificates**
```bash
# Let's Encrypt (recommended)
certbot certonly --standalone -d your-domain.com

# Copy certificates to ssl directory
cp /etc/letsencrypt/live/your-domain.com/fullchain.pem ./ssl/cert.pem
cp /etc/letsencrypt/live/your-domain.com/privkey.pem ./ssl/key.pem
```

2. **Set Proper Permissions**
```bash
chmod 600 ./ssl/*
chown 1001:1001 ./ssl/*
```

---

## 🐳 Docker Security

### Security Features

- **Non-root User:** Container runs as non-privileged user (UID 1001)
- **Read-only Filesystem:** All directories mounted as read-only except necessary ones
- **Capability Dropping:** All Linux capabilities dropped except essential ones
- **Resource Limits:** CPU and memory limits enforced
- **Seccomp Profiles:** System call filtering enabled
- **Security Scanning:** Integrated vulnerability scanning

### Container Hardening

```yaml
# Docker Compose Security Settings
security_opt:
  - no-new-privileges:true
cap_drop:
  - ALL
cap_add:
  - CHOWN
  - SETGID
  - SETUID
read_only: true
tmpfs:
  - /tmp:noexec,nosuid,size=100m
  - /var/run:noexec,nosuid,size=100m
user: "1001:1001"
```

---

## 📊 Monitoring & Logging

### Security Monitoring

The dashboard includes comprehensive security monitoring:

- **Failed Authentication Tracking:** Monitors login failures and brute force attempts
- **Rate Limiting Violations:** Tracks and blocks suspicious activity
- **XSS/Injection Attempts:** Detects and blocks attack attempts
- **Unusual Activity:** AI-powered anomaly detection
- **Resource Monitoring:** System resource exhaustion detection

### Log Locations

```
logs/
├── combined.log      # All application logs
├── error.log         # Error-level logs only
├── security.log      # Security events and alerts
└── access.log        # HTTP access logs (nginx)
```

### Monitoring Integration

Configure external monitoring systems:

```yaml
# Prometheus Configuration
scrape_configs:
  - job_name: 'secure-dashboard'
    static_configs:
      - targets: ['dashboard:3001']
    metrics_path: '/metrics'
```

---

## 🔧 Operations Guide

### User Management

1. **Create New Users**
```bash
# Via API (requires admin token)
curl -X POST https://your-domain.com/api/admin/users \
  -H "Authorization: Bearer <admin-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "operator1",
    "password": "StrongPassword123!",
    "role": "operator"
  }'
```

2. **User Role Management**
- Admin: Can manage users and all system settings
- Operator: Can view metrics and run benchmarks
- Viewer: Read-only access to monitoring data

### Security Maintenance

1. **Regular Updates**
```bash
# Update dependencies
docker-compose pull
docker-compose up -d

# Security scan
npm audit fix
```

2. **Log Rotation**
```bash
# Configure log rotation
sudo nano /etc/logrotate.d/secure-dashboard
```

3. **Backup Configuration**
```bash
# Backup configuration and SSL certificates
tar -czf backup-$(date +%Y%m%d).tar.gz .env ssl/ config/
```

### Incident Response

1. **Security Event Detection**
- Check security logs: `logs/security.log`
- Monitor dashboard alerts
- Review failed authentication attempts

2. **Response Procedures**
```bash
# Block suspicious IP
iptables -A INPUT -s <suspicious-ip> -j DROP

# Restart services if needed
docker-compose restart secure-dashboard

# Review security audit logs
docker logs secure-dashboard --tail 100
```

---

## 🚨 Security Best Practices

### Production Security Checklist

- [ ] Change default admin password
- [ ] Configure proper SSL certificates
- [ ] Set up monitoring and alerting
- [ ] Configure log rotation
- [ ] Implement backup procedures
- [ ] Review user permissions
- [ ] Test incident response procedures
- [ ] Schedule regular security updates
- [ ] Monitor security events daily
- [ ] Perform quarterly security assessments

### Access Control

1. **Principle of Least Privilege**
- Grant minimum necessary permissions
- Regular user access reviews
- Immediate revocation for terminated users

2. **Network Security**
- Use VPN for remote access
- Implement network segmentation
- Configure firewall rules

3. **Data Protection**
- Encrypt sensitive data at rest
- Use TLS 1.3 for all communications
- Implement data retention policies

---

## 📞 Support & Contacts

### Security Issues

For security vulnerabilities or incidents:
- **Emergency:** security@company.com
- **Incident Response:** incident@company.com

### Technical Support

For deployment and operational issues:
- **Documentation:** Check this guide first
- **Logs:** Review application logs for errors
- **Health Check:** `https://your-domain.com/health`

### Security Resources

- [OWASP Security Guidelines](https://owasp.org/)
- [NIST Cybersecurity Framework](https://www.nist.gov/cyberframework)
- [CIS Security Benchmarks](https://www.cisecurity.org/cis-benchmarks/)

---

## 🔄 Updates & Maintenance

### Security Updates

1. **Monthly Tasks**
- Update container images
- Review security advisories
- Rotate secrets if needed
- Check user access logs

2. **Quarterly Tasks**
- Full security assessment
- Penetration testing
- User permission audit
- Backup verification

### Version Updates

```bash
# Update to latest version
git pull origin main
docker-compose build --no-cache
docker-compose up -d
```

---

## 📄 License & Compliance

This secure dashboard is designed to meet:
- **GDPR** compliance requirements
- **SOC 2** security principles
- **ISO 27001** security controls
- **NIST** cybersecurity framework

For compliance documentation and audit reports, see the `compliance/` directory.

---

**Version:** 2.0.0
**Last Updated:** October 4, 2025
**Security Classification:** Confidential
**Distribution:** Authorized Personnel Only