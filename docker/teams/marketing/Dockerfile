# Marketing Team Agent Image
# Optimized for: WordPress, PHP, content management, SEO

FROM cfn-agent:base

# Team metadata
ARG TEAM_NAME=marketing
ENV CFN_TEAM=${TEAM_NAME}
LABEL team="${TEAM_NAME}"
LABEL cost-center="marketing-002"
LABEL maintainer="marketing-team@company.com"
LABEL description="Marketing team agent with PHP, WordPress CLI, content tools"

# Switch to root for installations
USER root

# Install PHP 8.2 and extensions
RUN apk add --no-cache \
    php82 \
    php82-fpm \
    php82-mysqli \
    php82-json \
    php82-openssl \
    php82-curl \
    php82-zlib \
    php82-xml \
    php82-phar \
    php82-intl \
    php82-dom \
    php82-xmlreader \
    php82-xmlwriter \
    php82-simplexml \
    php82-ctype \
    php82-mbstring \
    php82-gd \
    php82-tokenizer \
    mysql-client \
    && ln -s /usr/bin/php82 /usr/bin/php \
    && rm -rf /var/cache/apk/*

# Install Composer (PHP package manager)
RUN curl -sS https://getcomposer.org/installer | php -- --install-dir=/usr/local/bin --filename=composer

# Install WP-CLI (WordPress command line)
RUN curl -O https://raw.githubusercontent.com/wp-cli/builds/gh-pages/phar/wp-cli.phar && \
    chmod +x wp-cli.phar && \
    mv wp-cli.phar /usr/local/bin/wp

# Copy dependency files
COPY composer.json composer.lock* package.json package-lock.json* ./

# Install PHP dependencies
RUN composer install --no-dev --no-scripts --no-interaction

# Install Node.js dependencies (for build tools)
RUN npm ci --production

# Copy team configuration
COPY config/ /etc/cfn/team/

# Copy team-specific scripts
COPY scripts/ /usr/local/bin/team/
RUN chmod +x /usr/local/bin/team/*.sh 2>/dev/null || true

# Team-specific environment
ENV CFN_AGENT_TIMEOUT=2400
ENV CFN_MAX_MEMORY=1g
ENV CFN_LOG_LEVEL=info
ENV WP_CLI_CACHE_DIR=/tmp/wp-cli-cache

# Health check (verify PHP and WP-CLI are functional)
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD php --version && wp --version && npx claude-flow-novice --version || exit 1

# Switch back to non-root user
USER cfn

WORKDIR /workspace

# Inherit base entrypoint
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]

# Default to showing help
CMD ["--help"]
