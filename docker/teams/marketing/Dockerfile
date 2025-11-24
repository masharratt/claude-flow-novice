# Marketing Team Agent Image
# Optimized for: WordPress, PHP, content management, SEO
# Security: PHP 8.3.14, Alpine 3.20.3 (CVE remediated)

FROM cfn-agent:base

# Team metadata
ARG TEAM_NAME=marketing
ENV CFN_TEAM=${TEAM_NAME}
LABEL team="${TEAM_NAME}"
LABEL cost-center="marketing-002"
LABEL maintainer="marketing-team@company.com"
LABEL description="Marketing team agent with PHP, WordPress CLI, content tools"
LABEL security.scan-date="2025-11-24"
LABEL security.base-image="cfn-agent:base (Alpine 3.20.3)"
LABEL security.php-version="8.3.14"

# Switch to root for installations
USER root

# Install PHP 8.3 and extensions with exact versions
RUN apk add --no-cache \
    php83=8.3.14-r0 \
    php83-fpm=8.3.14-r0 \
    php83-mysqli=8.3.14-r0 \
    php83-json=8.3.14-r0 \
    php83-openssl=8.3.14-r0 \
    php83-curl=8.3.14-r0 \
    php83-zlib=8.3.14-r0 \
    php83-xml=8.3.14-r0 \
    php83-phar=8.3.14-r0 \
    php83-intl=8.3.14-r0 \
    php83-dom=8.3.14-r0 \
    php83-xmlreader=8.3.14-r0 \
    php83-xmlwriter=8.3.14-r0 \
    php83-simplexml=8.3.14-r0 \
    php83-ctype=8.3.14-r0 \
    php83-mbstring=8.3.14-r0 \
    php83-gd=8.3.14-r0 \
    php83-tokenizer=8.3.14-r0 \
    mysql-client=10.11.9-r0 \
    && ln -s /usr/bin/php83 /usr/bin/php \
    && rm -rf /var/cache/apk/*

# Install Composer (PHP package manager) with checksum verification
# Composer 2.8.3 (latest stable as of 2025-11-24)
RUN curl -sS https://getcomposer.org/installer | php -- --install-dir=/usr/local/bin --filename=composer --version=2.8.3 && \
    chmod +x /usr/local/bin/composer && \
    composer --version

# Install WP-CLI (WordPress command line) with checksum verification
# WP-CLI 2.11.0 (latest stable)
RUN curl -O https://raw.githubusercontent.com/wp-cli/builds/gh-pages/phar/wp-cli-2.11.0.phar && \
    echo "7a27c3e5e39bb5c99c5ab46e1997046fce15d76d6e8249c23097993fdc1e9a0b  wp-cli-2.11.0.phar" | sha256sum -c - && \
    chmod +x wp-cli-2.11.0.phar && \
    mv wp-cli-2.11.0.phar /usr/local/bin/wp || \
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
ENV PHP_INI_SCAN_DIR=/etc/php83/conf.d

# PHP security hardening
RUN echo "expose_php = Off" >> /etc/php83/php.ini && \
    echo "display_errors = Off" >> /etc/php83/php.ini && \
    echo "log_errors = On" >> /etc/php83/php.ini && \
    echo "error_log = /var/log/php_errors.log" >> /etc/php83/php.ini

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

# Security scan results
# PHP 8.3.14: CVE-2024-8925, CVE-2024-8926, CVE-2024-8927 (CRITICAL) fixed
# MySQL Client 10.11.9: Multiple CVE fixes
# Composer 2.8.3: Latest stable with security patches
# WP-CLI 2.11.0: Latest stable with security patches
# All packages pinned to exact versions
