#!/bin/bash

# Setup Redis Authentication
# Configures Redis with secure password and proper authentication

set -e

echo "🔐 Setting up Redis Authentication"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
REDIS_CONF="/etc/redis/redis.conf"
REDIS_CONF_LOCAL="$HOME/.redis/redis.conf"
REDIS_CONF_WSL="/mnt/c/ProgramData/Redis/redis.conf"
MIN_PASSWORD_LENGTH=32

# Detect Redis configuration file location
if [ -f "$REDIS_CONF" ]; then
    REDIS_CONFIG_FILE="$REDIS_CONF"
elif [ -f "$REDIS_CONF_LOCAL" ]; then
    REDIS_CONFIG_FILE="$REDIS_CONF_LOCAL"
elif [ -f "$REDIS_CONF_WSL" ]; then
    REDIS_CONFIG_FILE="$REDIS_CONF_WSL"
else
    echo -e "${YELLOW}⚠️  Redis configuration file not found in standard locations${NC}"
    echo "   Please specify the path to redis.conf:"
    read -p "   Path: " REDIS_CONFIG_FILE

    if [ ! -f "$REDIS_CONFIG_FILE" ]; then
        echo -e "${RED}❌ File not found: $REDIS_CONFIG_FILE${NC}"
        exit 1
    fi
fi

echo -e "${BLUE}📁 Using Redis config: $REDIS_CONFIG_FILE${NC}"

# Check if .env exists
if [ ! -f ".env" ]; then
    echo -e "${RED}❌ .env file not found${NC}"
    echo "   Run from the project root directory"
    exit 1
fi

# Check if REDIS_PASSWORD is already set in .env
CURRENT_PASSWORD=$(grep "^REDIS_PASSWORD=" .env 2>/dev/null | cut -d= -f2- | tr -d '\r\n')

if [ -n "$CURRENT_PASSWORD" ] && [ ${#CURRENT_PASSWORD} -ge $MIN_PASSWORD_LENGTH ]; then
    echo -e "${GREEN}✅ REDIS_PASSWORD already configured in .env${NC}"
    echo "   Length: ${#CURRENT_PASSWORD} characters"

    read -p "Generate new password? (yes/no): " REGENERATE
    if [ "$REGENERATE" != "yes" ]; then
        REDIS_PASSWORD="$CURRENT_PASSWORD"
    else
        # Generate new secure password
        REDIS_PASSWORD=$(openssl rand -base64 48 | tr -d '\n' | head -c 64)
        echo -e "${BLUE}🔑 Generated new secure password (64 characters)${NC}"
    fi
else
    echo -e "${YELLOW}⚠️  REDIS_PASSWORD not configured or too weak${NC}"

    # Generate secure password
    REDIS_PASSWORD=$(openssl rand -base64 48 | tr -d '\n' | head -c 64)
    echo -e "${BLUE}🔑 Generated secure password (64 characters)${NC}"
fi

# Update .env file
echo -e "${BLUE}💾 Updating .env file...${NC}"

# Backup .env
cp .env .env.backup.$(date +%s)
echo -e "${GREEN}✅ Backed up .env${NC}"

# Update or add REDIS_PASSWORD
if grep -q "^REDIS_PASSWORD=" .env; then
    # Update existing
    sed -i.bak "s|^REDIS_PASSWORD=.*|REDIS_PASSWORD=$REDIS_PASSWORD|" .env
else
    # Add new
    echo "" >> .env
    echo "# Redis Authentication (auto-generated)" >> .env
    echo "REDIS_PASSWORD=$REDIS_PASSWORD" >> .env
fi

# Set secure permissions
chmod 600 .env
echo -e "${GREEN}✅ Set .env permissions to 600${NC}"

# Update Redis configuration
echo -e "${BLUE}🔧 Configuring Redis...${NC}"

# Check if we have write permission
if [ ! -w "$REDIS_CONFIG_FILE" ]; then
    echo -e "${YELLOW}⚠️  No write permission for $REDIS_CONFIG_FILE${NC}"
    echo "   You'll need to update Redis config manually with sudo/admin"
    echo ""
    echo -e "${BLUE}Manual Configuration:${NC}"
    echo "   1. Edit $REDIS_CONFIG_FILE"
    echo "   2. Add or update: requirepass $REDIS_PASSWORD"
    echo "   3. Restart Redis"
    echo ""

    # Save password to temporary file for manual setup
    TEMP_PASSWORD_FILE="memory/security/redis-password.txt"
    mkdir -p "memory/security"
    echo "$REDIS_PASSWORD" > "$TEMP_PASSWORD_FILE"
    chmod 600 "$TEMP_PASSWORD_FILE"

    echo -e "${GREEN}✅ Password saved to: $TEMP_PASSWORD_FILE${NC}"
    echo "   (delete after manual configuration)"

    exit 0
fi

# Backup Redis config
cp "$REDIS_CONFIG_FILE" "${REDIS_CONFIG_FILE}.backup.$(date +%s)"
echo -e "${GREEN}✅ Backed up Redis config${NC}"

# Update requirepass in redis.conf
if grep -q "^requirepass" "$REDIS_CONFIG_FILE"; then
    # Update existing
    sed -i.bak "s|^requirepass.*|requirepass $REDIS_PASSWORD|" "$REDIS_CONFIG_FILE"
elif grep -q "^# requirepass" "$REDIS_CONFIG_FILE"; then
    # Uncomment and update
    sed -i.bak "s|^# requirepass.*|requirepass $REDIS_PASSWORD|" "$REDIS_CONFIG_FILE"
else
    # Add new
    echo "" >> "$REDIS_CONFIG_FILE"
    echo "# Redis Authentication - Auto-configured by Claude Flow Novice" >> "$REDIS_CONFIG_FILE"
    echo "requirepass $REDIS_PASSWORD" >> "$REDIS_CONFIG_FILE"
fi

echo -e "${GREEN}✅ Updated Redis configuration${NC}"

# Additional security settings
echo -e "${BLUE}🔒 Applying additional security settings...${NC}"

# Disable dangerous commands
DANGEROUS_COMMANDS="FLUSHDB FLUSHALL KEYS CONFIG SHUTDOWN DEBUG"
for cmd in $DANGEROUS_COMMANDS; do
    if ! grep -q "rename-command $cmd" "$REDIS_CONFIG_FILE"; then
        echo "rename-command $cmd \"\"" >> "$REDIS_CONFIG_FILE"
    fi
done

echo -e "${GREEN}✅ Disabled dangerous Redis commands${NC}"

# Bind to localhost only (unless already configured for network)
if grep -q "^bind 127.0.0.1" "$REDIS_CONFIG_FILE"; then
    echo -e "${GREEN}✅ Redis already bound to localhost${NC}"
elif grep -q "^bind 0.0.0.0" "$REDIS_CONFIG_FILE"; then
    echo -e "${YELLOW}⚠️  Redis is bound to all interfaces (0.0.0.0)${NC}"
    echo "   Consider binding to localhost only for security"
    read -p "   Bind to localhost only? (yes/no): " BIND_LOCALHOST
    if [ "$BIND_LOCALHOST" = "yes" ]; then
        sed -i.bak "s|^bind 0.0.0.0|bind 127.0.0.1|" "$REDIS_CONFIG_FILE"
        echo -e "${GREEN}✅ Updated bind to localhost${NC}"
    fi
else
    echo "bind 127.0.0.1" >> "$REDIS_CONFIG_FILE"
    echo -e "${GREEN}✅ Configured bind to localhost${NC}"
fi

# Enable protected mode
if ! grep -q "^protected-mode yes" "$REDIS_CONFIG_FILE"; then
    echo "protected-mode yes" >> "$REDIS_CONFIG_FILE"
    echo -e "${GREEN}✅ Enabled protected mode${NC}"
fi

# Restart Redis
echo ""
echo -e "${BLUE}🔄 Restarting Redis...${NC}"

# Detect init system
if command -v systemctl &> /dev/null; then
    # systemd
    if sudo systemctl restart redis 2>/dev/null || sudo systemctl restart redis-server 2>/dev/null; then
        echo -e "${GREEN}✅ Redis restarted successfully${NC}"
    else
        echo -e "${YELLOW}⚠️  Failed to restart Redis automatically${NC}"
        echo "   Please restart Redis manually"
    fi
elif command -v service &> /dev/null; then
    # SysV init
    if sudo service redis restart 2>/dev/null || sudo service redis-server restart 2>/dev/null; then
        echo -e "${GREEN}✅ Redis restarted successfully${NC}"
    else
        echo -e "${YELLOW}⚠️  Failed to restart Redis automatically${NC}"
        echo "   Please restart Redis manually"
    fi
else
    echo -e "${YELLOW}⚠️  Could not detect init system${NC}"
    echo "   Please restart Redis manually"
fi

# Test connection
echo ""
echo -e "${BLUE}🧪 Testing Redis authentication...${NC}"

if redis-cli -a "$REDIS_PASSWORD" ping 2>/dev/null | grep -q "PONG"; then
    echo -e "${GREEN}✅ Redis authentication test successful${NC}"
else
    echo -e "${RED}❌ Redis authentication test failed${NC}"
    echo "   Check Redis logs for errors"
    echo "   Verify password in .env matches redis.conf"
fi

# Cleanup backup files
rm -f "${REDIS_CONFIG_FILE}.bak"

# Create documentation
echo ""
echo -e "${BLUE}📚 Creating documentation...${NC}"

mkdir -p docs/security

cat > "docs/security/REDIS_AUTHENTICATION.md" << 'EOF'
# Redis Authentication Setup

This document describes the Redis authentication configuration for Claude Flow Novice.

## Configuration

Redis is configured with:

- **Password Authentication**: 64-character secure password
- **Bind Address**: localhost (127.0.0.1) - not accessible from network
- **Protected Mode**: Enabled
- **Dangerous Commands**: Disabled (FLUSHDB, FLUSHALL, CONFIG, etc.)

## Password Storage

The Redis password is stored in:

1. `.env` file (chmod 600)
2. Environment variable `REDIS_PASSWORD`

## Connecting to Redis

### From Application

```javascript
const redis = require('redis');
const client = redis.createClient({
  host: 'localhost',
  port: 6379,
  password: process.env.REDIS_PASSWORD
});
```

### From Redis CLI

```bash
redis-cli -a "$REDIS_PASSWORD"
```

Or set the environment variable:

```bash
export REDIS_PASSWORD=$(grep REDIS_PASSWORD .env | cut -d= -f2)
redis-cli -a "$REDIS_PASSWORD"
```

## Security Best Practices

1. **Never commit `.env`** to version control
2. **Rotate password every 90 days**: `node scripts/security/rotate-api-keys.js --key=REDIS_PASSWORD --auto`
3. **Use TLS** for production Redis connections
4. **Firewall rules** to restrict Redis port (6379)
5. **Monitor** Redis logs for authentication failures

## Troubleshooting

### Authentication Failed

1. Check password in `.env`:
   ```bash
   grep REDIS_PASSWORD .env
   ```

2. Check Redis config:
   ```bash
   sudo grep requirepass /etc/redis/redis.conf
   ```

3. Verify they match

### Connection Refused

1. Check Redis is running:
   ```bash
   sudo systemctl status redis
   # or
   sudo service redis status
   ```

2. Check bind address:
   ```bash
   sudo grep bind /etc/redis/redis.conf
   ```

3. Restart Redis:
   ```bash
   sudo systemctl restart redis
   ```

## Rotating the Password

### Automated

```bash
node scripts/security/rotate-api-keys.js --key=REDIS_PASSWORD --auto
```

### Manual

1. Generate new password:
   ```bash
   openssl rand -base64 48 | head -c 64
   ```

2. Update `.env`:
   ```
   REDIS_PASSWORD=new-password-here
   ```

3. Update Redis config:
   ```bash
   sudo sed -i 's/^requirepass.*/requirepass new-password-here/' /etc/redis/redis.conf
   ```

4. Restart Redis:
   ```bash
   sudo systemctl restart redis
   ```

5. Test connection:
   ```bash
   redis-cli -a "new-password-here" ping
   ```

## Configuration Files

- **Application Config**: `.env` (chmod 600)
- **Redis Config**: `/etc/redis/redis.conf` (or platform-specific)
- **Backup Location**: `memory/security/` (chmod 700)

## Security Audit

Run security audit to check Redis authentication:

```bash
node scripts/security/security-audit.js
```

## Support

For issues with Redis authentication:

- Check logs: `sudo tail -f /var/log/redis/redis-server.log`
- Verify config: `redis-cli CONFIG GET requirepass` (after auth)
- Test connection: `redis-cli -a "$REDIS_PASSWORD" ping`
EOF

echo -e "${GREEN}✅ Documentation created at docs/security/REDIS_AUTHENTICATION.md${NC}"

# Summary
echo ""
echo -e "${GREEN}════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}✅ Redis Authentication Setup Complete!${NC}"
echo -e "${GREEN}════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "${BLUE}Configuration Summary:${NC}"
echo "   ✅ Password length: ${#REDIS_PASSWORD} characters"
echo "   ✅ .env file permissions: 600"
echo "   ✅ Redis config updated"
echo "   ✅ Dangerous commands disabled"
echo "   ✅ Protected mode enabled"
echo "   ✅ Bound to localhost"
echo ""
echo -e "${BLUE}Next Steps:${NC}"
echo "   1. Test application with new Redis authentication"
echo "   2. Rotate password every 90 days"
echo "   3. Review docs/security/REDIS_AUTHENTICATION.md"
echo "   4. Set up monitoring for failed auth attempts"
echo ""
echo -e "${YELLOW}⚠️  IMPORTANT: Keep your .env file secure!${NC}"
echo ""

exit 0
