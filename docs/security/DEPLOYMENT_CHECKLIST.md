# Security Deployment Checklist

Complete security hardening checklist for deploying Claude Flow Novice to production environments.

## Overview

This checklist ensures all critical security components are properly configured before production deployment. Follow each section in order and verify completion.

---

## Pre-Deployment Checklist

### ✅ Phase 1: Environment Setup

- [ ] **1.1 Node.js Version**
  ```bash
  node --version  # Should be >= 20.0.0
  npm --version   # Should be >= 9.0.0
  ```

- [ ] **1.2 Operating System Hardening**
  - [ ] System updates installed
  - [ ] Firewall configured (UFW/iptables)
  - [ ] SELinux/AppArmor enabled
  - [ ] Non-root user created for application
  - [ ] SSH key-based authentication only

- [ ] **1.3 Network Configuration**
  - [ ] TLS/SSL certificates obtained (Let's Encrypt or commercial)
  - [ ] Ports configured (443 for HTTPS, 6379 for Redis)
  - [ ] Load balancer configured (if applicable)
  - [ ] CDN configured (if applicable)

---

### ✅ Phase 2: Secrets Management

- [ ] **2.1 Master Encryption Key Generation**
  ```bash
  # Generate 256-bit encryption key
  openssl rand -hex 32 > .env.keys
  chmod 600 .env.keys

  # Add to .env
  echo "MASTER_ENCRYPTION_KEY=$(cat .env.keys)" >> .env
  ```

- [ ] **2.2 Environment Variables Configuration**

  Create `.env` file with strict permissions:
  ```bash
  touch .env
  chmod 600 .env
  ```

  Required variables:
  ```bash
  # Application
  NODE_ENV=production
  PORT=3001

  # Redis Authentication
  REDIS_HOST=localhost
  REDIS_PORT=6379
  REDIS_PASSWORD=<64-character-secure-password>
  REDIS_TLS=true

  # JWT Configuration
  JWT_ALGORITHM=RS256
  JWT_EXPIRES_IN=1h
  JWT_REFRESH_EXPIRES_IN=7d
  JWT_ISSUER=claude-flow-novice
  JWT_AUDIENCE=claude-flow-users

  # Session Management
  SESSION_TIMEOUT=1800000          # 30 minutes
  ABSOLUTE_SESSION_TIMEOUT=28800000 # 8 hours
  MAX_CONCURRENT_SESSIONS=5

  # Password Security
  PASSWORD_MIN_LENGTH=12
  PASSWORD_HASHING_ALGORITHM=argon2
  BCRYPT_ROUNDS=12

  # Rate Limiting
  ENABLE_RATE_LIMITING=true
  LOGIN_ATTEMPTS=5
  LOGIN_WINDOW=900000              # 15 minutes

  # MFA (Optional)
  ENABLE_MFA=false
  MFA_ISSUER=claude-flow-novice

  # API Keys (encrypted)
  ANTHROPIC_API_KEY=<your-key>
  Z_AI_API_KEY=<your-key>
  NPM_API_KEY=<your-key>

  # Security Headers
  ENABLE_HELMET=true
  ENABLE_CORS=true
  CORS_ORIGIN=https://yourdomain.com

  # Logging
  LOG_LEVEL=warn
  ENABLE_AUDIT_LOGGING=true
  LOG_FILE=/var/log/claude-flow-novice/app.log

  # Monitoring
  ENABLE_MONITORING=true
  METRICS_PORT=9090
  ```

- [ ] **2.3 Redis Password Generation**
  ```bash
  # Generate 64-character secure password
  npm run security:redis-auth

  # Or manually:
  openssl rand -base64 48 | head -c 64
  ```

- [ ] **2.4 git-secrets Installation**
  ```bash
  npm run security:git-secrets

  # Verify installation
  git secrets --scan
  ```

- [ ] **2.5 File Permissions**
  ```bash
  chmod 600 .env
  chmod 600 .env.keys
  chmod 700 memory/security/
  chmod 600 memory/security/*
  ```

- [ ] **2.6 Secrets Validation**
  ```bash
  npm run security:full-audit
  ```

---

### ✅ Phase 3: Redis Security

- [ ] **3.1 Redis Authentication**
  ```bash
  # Update redis.conf
  requirepass <64-character-secure-password>
  ```

- [ ] **3.2 Redis Network Security**
  ```bash
  # redis.conf
  bind 127.0.0.1                    # Localhost only (or specific IP)
  protected-mode yes
  port 6379
  tcp-backlog 511
  ```

- [ ] **3.3 Redis Command Restrictions**
  ```bash
  # Disable dangerous commands
  rename-command FLUSHDB ""
  rename-command FLUSHALL ""
  rename-command CONFIG ""
  rename-command SHUTDOWN ""
  rename-command DEBUG ""
  ```

- [ ] **3.4 Redis TLS/SSL (Production)**
  ```bash
  # Generate certificates
  openssl req -x509 -newkey rsa:4096 -keyout redis-key.pem -out redis-cert.pem -days 365

  # redis.conf
  tls-port 6380
  port 0                            # Disable non-TLS
  tls-cert-file /path/to/redis-cert.pem
  tls-key-file /path/to/redis-key.pem
  tls-ca-cert-file /path/to/ca-cert.pem
  ```

- [ ] **3.5 Redis Persistence**
  ```bash
  # redis.conf
  appendonly yes
  appendfsync everysec
  save 900 1
  save 300 10
  save 60 10000
  ```

- [ ] **3.6 Redis Connection Test**
  ```bash
  redis-cli -a "$REDIS_PASSWORD" ping
  # Expected: PONG

  # With TLS
  redis-cli --tls \
    --cert /path/to/redis-cert.pem \
    --key /path/to/redis-key.pem \
    --cacert /path/to/ca-cert.pem \
    -a "$REDIS_PASSWORD" ping
  ```

---

### ✅ Phase 4: JWT Authentication

- [ ] **4.1 Admin User Creation**
  ```bash
  node scripts/create-admin-user.js

  # Change default password immediately
  # Username: admin
  # Default Password: ChangeMe123!@#
  ```

- [ ] **4.2 JWT Key Pair Generation**

  Keys are auto-generated on service initialization. Verify:
  ```bash
  # Check logs for successful key generation
  grep "Enhanced Authentication Service initialized" logs/app.log
  ```

- [ ] **4.3 Session Configuration**

  Verify in `.env`:
  - SESSION_TIMEOUT (30 minutes recommended)
  - ABSOLUTE_SESSION_TIMEOUT (8 hours recommended)
  - MAX_CONCURRENT_SESSIONS (5 recommended)

- [ ] **4.4 Password Policy**

  Verify in `.env`:
  - PASSWORD_MIN_LENGTH=12
  - REQUIRE_UPPERCASE=true
  - REQUIRE_LOWERCASE=true
  - REQUIRE_NUMBERS=true
  - REQUIRE_SPECIAL_CHARS=true

- [ ] **4.5 Rate Limiting**

  Verify in `.env`:
  - LOGIN_ATTEMPTS=5
  - LOGIN_WINDOW=900000 (15 minutes)
  - REGISTRATION_ATTEMPTS=3

- [ ] **4.6 Authentication Test**
  ```bash
  # Test login
  curl -X POST http://localhost:3001/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"username":"admin","password":"<your-password>"}'

  # Should return access and refresh tokens
  ```

---

### ✅ Phase 5: TLS/SSL Configuration

- [ ] **5.1 Certificate Acquisition**

  **Let's Encrypt (Free):**
  ```bash
  sudo apt install certbot
  sudo certbot certonly --standalone -d yourdomain.com
  ```

  **Commercial Certificate:**
  - Purchase from CA (DigiCert, Comodo, etc.)
  - Follow CA-specific installation instructions

- [ ] **5.2 Node.js HTTPS Configuration**
  ```javascript
  // src/server.js
  import https from 'https';
  import fs from 'fs';

  const httpsOptions = {
    key: fs.readFileSync('/etc/letsencrypt/live/yourdomain.com/privkey.pem'),
    cert: fs.readFileSync('/etc/letsencrypt/live/yourdomain.com/fullchain.pem')
  };

  https.createServer(httpsOptions, app).listen(443, () => {
    console.log('HTTPS server running on port 443');
  });
  ```

- [ ] **5.3 HTTP to HTTPS Redirect**
  ```javascript
  // Redirect HTTP to HTTPS
  import http from 'http';

  http.createServer((req, res) => {
    res.writeHead(301, { Location: `https://${req.headers.host}${req.url}` });
    res.end();
  }).listen(80);
  ```

- [ ] **5.4 SSL Test**
  ```bash
  # Test SSL configuration
  curl -I https://yourdomain.com

  # Or use SSL Labs
  # https://www.ssllabs.com/ssltest/analyze.html?d=yourdomain.com
  ```

---

### ✅ Phase 6: Security Headers

- [ ] **6.1 Helmet.js Installation**
  ```bash
  npm install helmet
  ```

- [ ] **6.2 Helmet Configuration**
  ```javascript
  // src/server.js
  import helmet from 'helmet';

  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"]
      }
    },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true
    },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    noSniff: true,
    xssFilter: true,
    hidePoweredBy: true,
    frameguard: { action: 'deny' }
  }));
  ```

- [ ] **6.3 CORS Configuration**
  ```javascript
  import cors from 'cors';

  const corsOptions = {
    origin: process.env.CORS_ORIGIN || 'https://yourdomain.com',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
    maxAge: 86400
  };

  app.use(cors(corsOptions));
  ```

- [ ] **6.4 Security Headers Test**
  ```bash
  curl -I https://yourdomain.com | grep -E "(X-|Strict-Transport-Security|Content-Security-Policy)"
  ```

---

### ✅ Phase 7: Logging and Monitoring

- [ ] **7.1 Application Logging**
  ```javascript
  // src/logger.js
  import winston from 'winston';

  const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.json(),
    transports: [
      new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
      new winston.transports.File({ filename: 'logs/combined.log' })
    ]
  });

  if (process.env.NODE_ENV !== 'production') {
    logger.add(new winston.transports.Console({
      format: winston.format.simple()
    }));
  }

  export default logger;
  ```

- [ ] **7.2 Audit Logging**
  ```javascript
  // Log all authentication events
  logger.info('Authentication event', {
    event: 'user_login',
    userId: user.id,
    username: user.username,
    ip: req.ip,
    userAgent: req.headers['user-agent'],
    timestamp: new Date().toISOString()
  });
  ```

- [ ] **7.3 Log Rotation**
  ```bash
  # Install logrotate
  sudo apt install logrotate

  # Create /etc/logrotate.d/claude-flow-novice
  /var/log/claude-flow-novice/*.log {
    daily
    rotate 30
    compress
    delaycompress
    notifempty
    create 0640 appuser appuser
    sharedscripts
    postrotate
      systemctl reload claude-flow-novice
    endscript
  }
  ```

- [ ] **7.4 Monitoring Setup**

  **Prometheus + Grafana (Recommended):**
  ```javascript
  // Install prom-client
  npm install prom-client

  // src/metrics.js
  import client from 'prom-client';

  const register = new client.Registry();
  client.collectDefaultMetrics({ register });

  // Custom metrics
  const httpRequestDuration = new client.Histogram({
    name: 'http_request_duration_seconds',
    help: 'Duration of HTTP requests in seconds',
    labelNames: ['method', 'route', 'status_code'],
    registers: [register]
  });

  // Expose metrics endpoint
  app.get('/metrics', async (req, res) => {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  });
  ```

- [ ] **7.5 Alerting Configuration**

  Configure alerts for:
  - High error rates (> 5% of requests)
  - Authentication failures (> 10/minute)
  - Memory usage (> 80%)
  - CPU usage (> 80%)
  - Redis connection failures

---

### ✅ Phase 8: Backup and Recovery

- [ ] **8.1 Redis Backup**
  ```bash
  # Configure redis.conf
  save 900 1
  save 300 10
  save 60 10000
  dir /var/lib/redis
  dbfilename dump.rdb

  # Manual backup
  redis-cli -a "$REDIS_PASSWORD" BGSAVE

  # Automated daily backup
  crontab -e
  0 2 * * * redis-cli -a "$REDIS_PASSWORD" BGSAVE && \
            cp /var/lib/redis/dump.rdb /backup/redis-$(date +\%Y\%m\%d).rdb
  ```

- [ ] **8.2 Configuration Backup**
  ```bash
  # Backup .env and configs (encrypted)
  tar -czf config-backup.tar.gz .env .env.keys redis.conf
  gpg -c config-backup.tar.gz
  rm config-backup.tar.gz

  # Automated weekly backup
  crontab -e
  0 3 * * 0 /usr/local/bin/backup-claude-flow-config.sh
  ```

- [ ] **8.3 Recovery Testing**
  ```bash
  # Test Redis restore
  redis-cli -a "$REDIS_PASSWORD" SHUTDOWN
  cp /backup/redis-latest.rdb /var/lib/redis/dump.rdb
  redis-server /etc/redis/redis.conf

  # Verify data
  redis-cli -a "$REDIS_PASSWORD" DBSIZE
  ```

---

### ✅ Phase 9: Firewall Configuration

- [ ] **9.1 UFW Setup (Ubuntu)**
  ```bash
  # Install UFW
  sudo apt install ufw

  # Default policies
  sudo ufw default deny incoming
  sudo ufw default allow outgoing

  # Allow SSH
  sudo ufw allow 22/tcp

  # Allow HTTP/HTTPS
  sudo ufw allow 80/tcp
  sudo ufw allow 443/tcp

  # Allow Redis (localhost only)
  sudo ufw allow from 127.0.0.1 to any port 6379

  # Enable firewall
  sudo ufw enable

  # Check status
  sudo ufw status verbose
  ```

- [ ] **9.2 iptables Rules (Advanced)**
  ```bash
  # Block all by default
  iptables -P INPUT DROP
  iptables -P FORWARD DROP
  iptables -P OUTPUT ACCEPT

  # Allow established connections
  iptables -A INPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT

  # Allow loopback
  iptables -A INPUT -i lo -j ACCEPT

  # Allow SSH
  iptables -A INPUT -p tcp --dport 22 -j ACCEPT

  # Allow HTTP/HTTPS
  iptables -A INPUT -p tcp --dport 80 -j ACCEPT
  iptables -A INPUT -p tcp --dport 443 -j ACCEPT

  # Rate limit SSH
  iptables -A INPUT -p tcp --dport 22 -m conntrack --ctstate NEW -m recent --set
  iptables -A INPUT -p tcp --dport 22 -m conntrack --ctstate NEW -m recent --update --seconds 60 --hitcount 4 -j DROP

  # Save rules
  iptables-save > /etc/iptables/rules.v4
  ```

---

### ✅ Phase 10: Security Hardening

- [ ] **10.1 Disable Root Login**
  ```bash
  # /etc/ssh/sshd_config
  PermitRootLogin no
  PasswordAuthentication no

  sudo systemctl restart sshd
  ```

- [ ] **10.2 Fail2Ban Installation**
  ```bash
  sudo apt install fail2ban

  # /etc/fail2ban/jail.local
  [DEFAULT]
  bantime = 3600
  findtime = 600
  maxretry = 5

  [sshd]
  enabled = true

  sudo systemctl enable fail2ban
  sudo systemctl start fail2ban
  ```

- [ ] **10.3 System Updates**
  ```bash
  # Enable automatic security updates
  sudo apt install unattended-upgrades
  sudo dpkg-reconfigure unattended-upgrades
  ```

- [ ] **10.4 SELinux/AppArmor**
  ```bash
  # Ubuntu (AppArmor)
  sudo apt install apparmor apparmor-utils
  sudo systemctl enable apparmor
  sudo systemctl start apparmor

  # RHEL/CentOS (SELinux)
  sudo setenforce 1
  # Edit /etc/selinux/config
  SELINUX=enforcing
  ```

- [ ] **10.5 File Integrity Monitoring**
  ```bash
  # Install AIDE
  sudo apt install aide

  # Initialize database
  sudo aideinit

  # Check for changes
  sudo aide --check

  # Automated daily checks
  crontab -e
  0 4 * * * /usr/bin/aide --check
  ```

---

## Deployment Execution

### ✅ Step 1: Pre-Deployment Testing

- [ ] **Security Audit**
  ```bash
  npm run security:full-audit
  ```

- [ ] **Dependency Audit**
  ```bash
  npm audit
  npm audit fix
  ```

- [ ] **Code Quality**
  ```bash
  npm run lint
  npm run typecheck
  npm test
  ```

### ✅ Step 2: Service Deployment

- [ ] **Systemd Service Creation**

  Create `/etc/systemd/system/claude-flow-novice.service`:
  ```ini
  [Unit]
  Description=Claude Flow Novice - AI Agent Orchestration
  After=network.target redis.service

  [Service]
  Type=simple
  User=appuser
  Group=appuser
  WorkingDirectory=/opt/claude-flow-novice
  Environment="NODE_ENV=production"
  EnvironmentFile=/opt/claude-flow-novice/.env
  ExecStart=/usr/bin/node src/index.js
  Restart=always
  RestartSec=10
  StandardOutput=syslog
  StandardError=syslog
  SyslogIdentifier=claude-flow-novice

  # Security
  NoNewPrivileges=true
  PrivateTmp=true
  ProtectSystem=strict
  ProtectHome=true
  ReadWritePaths=/opt/claude-flow-novice/logs /opt/claude-flow-novice/memory

  # Resource limits
  LimitNOFILE=65536
  LimitNPROC=4096
  MemoryLimit=4G
  CPUQuota=200%

  [Install]
  WantedBy=multi-user.target
  ```

- [ ] **Service Management**
  ```bash
  # Reload systemd
  sudo systemctl daemon-reload

  # Enable service
  sudo systemctl enable claude-flow-novice

  # Start service
  sudo systemctl start claude-flow-novice

  # Check status
  sudo systemctl status claude-flow-novice

  # View logs
  sudo journalctl -u claude-flow-novice -f
  ```

### ✅ Step 3: Post-Deployment Validation

- [ ] **Health Check**
  ```bash
  curl -I https://yourdomain.com/health
  # Expected: 200 OK
  ```

- [ ] **Authentication Test**
  ```bash
  curl -X POST https://yourdomain.com/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"username":"admin","password":"<password>"}'
  ```

- [ ] **Dashboard Access**
  - Open https://yourdomain.com in browser
  - Login with admin credentials
  - Verify all features working

- [ ] **SSL/TLS Verification**
  ```bash
  openssl s_client -connect yourdomain.com:443 -tls1_3
  ```

- [ ] **Security Headers Check**
  ```bash
  curl -I https://yourdomain.com | grep -E "(X-|Strict|Content-Security)"
  ```

- [ ] **Performance Test**
  ```bash
  # Install Apache Bench
  sudo apt install apache2-utils

  # Load test (100 requests, 10 concurrent)
  ab -n 100 -c 10 https://yourdomain.com/api/health
  ```

---

## Maintenance Checklist

### Daily Tasks

- [ ] Monitor logs for errors: `sudo journalctl -u claude-flow-novice -n 100`
- [ ] Check system resources: `htop`
- [ ] Verify Redis status: `redis-cli -a "$REDIS_PASSWORD" ping`

### Weekly Tasks

- [ ] Review security audit: `npm run security:full-audit`
- [ ] Check for dependency updates: `npm outdated`
- [ ] Backup Redis data
- [ ] Review failed login attempts

### Monthly Tasks

- [ ] Rotate API keys: `npm run security:rotate-keys`
- [ ] Update dependencies: `npm update && npm audit fix`
- [ ] Review and rotate logs
- [ ] Security scan: `npm audit`
- [ ] SSL certificate renewal check

### Quarterly Tasks

- [ ] Full security audit
- [ ] Password policy review
- [ ] Access control review
- [ ] Disaster recovery test
- [ ] Performance optimization review

---

## Emergency Procedures

### Service Failure

```bash
# Check service status
sudo systemctl status claude-flow-novice

# View recent logs
sudo journalctl -u claude-flow-novice -n 100 --no-pager

# Restart service
sudo systemctl restart claude-flow-novice

# If restart fails, check configuration
node src/index.js
```

### Redis Failure

```bash
# Check Redis status
sudo systemctl status redis

# Restart Redis
sudo systemctl restart redis

# Verify connection
redis-cli -a "$REDIS_PASSWORD" ping

# Restore from backup if needed
sudo systemctl stop redis
cp /backup/redis-latest.rdb /var/lib/redis/dump.rdb
sudo systemctl start redis
```

### Security Breach Response

1. **Immediate Actions**:
   ```bash
   # Stop service
   sudo systemctl stop claude-flow-novice

   # Rotate all API keys
   npm run security:rotate-keys --all

   # Flush Redis sessions
   redis-cli -a "$REDIS_PASSWORD" FLUSHALL

   # Force password reset for all users
   ```

2. **Investigation**:
   - Review audit logs: `/var/log/claude-flow-novice/audit.log`
   - Check failed login attempts
   - Analyze network traffic
   - Review system logs: `sudo journalctl -n 1000`

3. **Recovery**:
   - Patch vulnerabilities
   - Update dependencies
   - Restore from clean backup
   - Notify affected users
   - Document incident

---

## Compliance Checklist

### GDPR Compliance

- [ ] Data encryption at rest (Redis persistence encrypted)
- [ ] Data encryption in transit (TLS/SSL)
- [ ] Right to erasure (user deletion functionality)
- [ ] Data portability (export functionality)
- [ ] Audit logging enabled
- [ ] Privacy policy accessible

### SOC 2 Compliance

- [ ] Access controls (RBAC implemented)
- [ ] Encryption (AES-256 for sensitive data)
- [ ] Logging and monitoring
- [ ] Incident response plan
- [ ] Regular security audits
- [ ] Vendor management

### HIPAA Compliance (if handling health data)

- [ ] Encryption of PHI
- [ ] Access logs
- [ ] Automatic logout (session timeout)
- [ ] Audit controls
- [ ] Integrity controls
- [ ] Transmission security

---

## Support and Documentation

### Resources

- [JWT Authentication Guide](./JWT_AUTHENTICATION.md)
- [Migration Guide](./MIGRATION_BASE64_TO_JWT.md)
- [Secrets Management](./SECRETS_MANAGEMENT.md)
- [Redis Authentication](./REDIS_AUTHENTICATION.md)
- [Troubleshooting](../TROUBLESHOOTING.md)

### Get Help

- **GitHub Issues**: https://github.com/masharratt/claude-flow-novice/issues
- **Security**: security@claude-flow-novice.com
- **Documentation**: https://docs.claude-flow-novice.com

---

**Deployment Version**: 1.6.6
**Last Updated**: 2025-01-09
**Next Review**: 2025-02-09

---

## Final Verification

Before declaring deployment complete:

```bash
# Run comprehensive security validation
npm run security:full-audit

# Check all services
sudo systemctl status claude-flow-novice
sudo systemctl status redis

# Test authentication
curl -X POST https://yourdomain.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"<password>"}'

# Verify monitoring
curl https://yourdomain.com/metrics

# Check logs
sudo journalctl -u claude-flow-novice -n 50
```

**Deployment Status**: [ ] Complete

**Deployed By**: ________________
**Date**: ________________
**Sign-off**: ________________
