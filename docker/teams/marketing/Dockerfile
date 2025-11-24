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

# Install Composer (PHP package manager) with checksum verification
RUN curl -sS https://getcomposer.org/installer | php -- --install-dir=/usr/local/bin --filename=composer && \
    curl -sS https://getcomposer.org/download/latest-stable/composer.phar -o /tmp/composer.phar && \
    echo "471f2d857abf0ec18af7b055e61472214d91adb24f9bdbbb864c1c64faad7dd6  /tmp/composer.phar" | sha256sum -c - && \
    mv /tmp/composer.phar /usr/local/bin/composer && \
    chmod +x /usr/local/bin/composer || \
    (echo "ERROR: Composer checksum verification failed" && exit 1)

# Install WP-CLI (WordPress command line) with checksum verification
RUN curl -O https://raw.githubusercontent.com/wp-cli/builds/gh-pages/phar/wp-cli.phar && \
    echo "be928f6b8ca1e8dfb9d2f4b75a13aa4aee0896f8a9a0a1c45cd5d2c98605e6172e6d014dda2e27f88c98befc16c040cbb2bd1bfa121510ea5cdf5f6a30fe8832  wp-cli.phar" | sha512sum -c - && \
    chmod +x wp-cli.phar && \
    mv wp-cli.phar /usr/local/bin/wp || \
    (echo "ERROR: WP-CLI checksum verification failed" && exit 1)

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
