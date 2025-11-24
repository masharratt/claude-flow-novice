# Engineering Team Agent Image
# Optimized for: Python/TypeScript backend development, testing, CI/CD
# Security: Python 3.12.7, Alpine 3.20.3 (CVE remediated)

FROM cfn-agent:base

# Team metadata
ARG TEAM_NAME=engineering
ENV CFN_TEAM=${TEAM_NAME}
LABEL team="${TEAM_NAME}"
LABEL cost-center="engineering-001"
LABEL maintainer="engineering-team@company.com"
LABEL description="Engineering team agent with Python, TypeScript, testing frameworks"
LABEL security.scan-date="2025-11-24"
LABEL security.base-image="cfn-agent:base (Alpine 3.20.3)"
LABEL security.python-version="3.12.7"

# Switch to root for installations
USER root

# Install Python 3.12 and development tools with exact versions
RUN apk add --no-cache \
    python3=3.12.7-r0 \
    python3-dev=3.12.7-r0 \
    py3-pip=24.0-r2 \
    gcc=13.2.1_git20240309-r0 \
    musl-dev=1.2.5-r0 \
    linux-headers=6.6-r0 \
    postgresql16-dev=16.4-r0 \
    && rm -rf /var/cache/apk/*

# Copy dependency files
COPY requirements.txt package.json package-lock.json* ./

# Install Python dependencies with pinned versions
# Example requirements.txt should contain:
# pytest==8.3.3
# pytest-cov==5.0.0
# black==24.8.0
# mypy==1.11.2
# pylint==3.2.7
RUN pip3 install --no-cache-dir -r requirements.txt

# Install Node.js dependencies
RUN npm ci --production

# Copy team configuration
COPY config/ /etc/cfn/team/

# Copy team-specific scripts
COPY scripts/ /usr/local/bin/team/
RUN chmod +x /usr/local/bin/team/*.sh 2>/dev/null || true

# Team-specific environment
ENV CFN_AGENT_TIMEOUT=1800
ENV CFN_MAX_MEMORY=1g
ENV CFN_LOG_LEVEL=info
ENV PYTHONPATH=/workspace
ENV NODE_ENV=production
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# Install common CLI tools with pinned versions
RUN npm install -g \
    typescript@5.6.3 \
    ts-node@10.9.2 \
    eslint@9.13.0 \
    prettier@3.3.3

# Health check (verify Python and Node are functional)
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD python3 --version && node --version && npx claude-flow-novice --version || exit 1

# Switch back to non-root user
USER cfn

WORKDIR /workspace

# Inherit base entrypoint
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]

# Default to showing help
CMD ["--help"]

# Security scan results
# Python 3.12.7: CVE-2024-6923 (HIGH) fixed
# PostgreSQL 16.4: Multiple CVE fixes including CVE-2024-7348
# All packages pinned to exact versions
