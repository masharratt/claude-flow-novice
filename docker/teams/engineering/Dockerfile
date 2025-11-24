# Engineering Team Agent Image
# Optimized for: Python/TypeScript backend development, testing, CI/CD

FROM cfn-agent:base

# Team metadata
ARG TEAM_NAME=engineering
ENV CFN_TEAM=${TEAM_NAME}
LABEL team="${TEAM_NAME}"
LABEL cost-center="engineering-001"
LABEL maintainer="engineering-team@company.com"
LABEL description="Engineering team agent with Python, TypeScript, testing frameworks"

# Switch to root for installations
USER root

# Install Python 3.11 and development tools
RUN apk add --no-cache \
    python3 \
    python3-dev \
    py3-pip \
    gcc \
    musl-dev \
    linux-headers \
    postgresql-dev \
    && rm -rf /var/cache/apk/*

# Copy dependency files
COPY requirements.txt package.json package-lock.json* ./

# Install Python dependencies
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

# Install common CLI tools
RUN npm install -g \
    typescript \
    ts-node \
    eslint \
    prettier

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
