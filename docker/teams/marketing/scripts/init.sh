#!/bin/bash
# Marketing team initialization script
# Sourced by base entrypoint.sh before agent execution

set -euo pipefail

log "INFO" "Running marketing team initialization"

# Validate PHP environment
if ! php --version >/dev/null 2>&1; then
    log "ERROR" "PHP not available"
    exit 1
fi

# Validate WP-CLI
if ! wp --version >/dev/null 2>&1; then
    log "ERROR" "WP-CLI not available"
    exit 1
fi

# Check if workspace is WordPress installation
if [[ -f /workspace/wp-config.php ]]; then
    log "INFO" "Detected WordPress installation"

    # Set up WP-CLI configuration
    if [[ ! -f /workspace/wp-cli.yml ]]; then
        cp /etc/cfn/team/wp-cli.yml /workspace/wp-cli.yml
        log "INFO" "Copied WP-CLI configuration"
    fi

    # Verify WordPress installation
    if wp core is-installed --path=/workspace 2>/dev/null; then
        log "INFO" "WordPress installation verified"

        # Check and install common plugins if not present
        REQUIRED_PLUGINS="wordpress-seo akismet"
        for plugin in $REQUIRED_PLUGINS; do
            if ! wp plugin is-installed "$plugin" --path=/workspace 2>/dev/null; then
                log "INFO" "Installing WordPress plugin: $plugin"
                wp plugin install "$plugin" --path=/workspace 2>/dev/null || true
            fi
        done
    fi
fi

# Check if workspace has composer.json and install dependencies if needed
if [[ -f /workspace/composer.json ]]; then
    log "INFO" "Found composer.json, checking PHP dependencies"
    if [[ ! -d /workspace/vendor ]]; then
        log "INFO" "Installing PHP dependencies"
        cd /workspace && composer install --no-dev --no-interaction
    fi
fi

# Check if workspace has package.json (for frontend build tools)
if [[ -f /workspace/package.json ]] && [[ ! -d /workspace/node_modules ]]; then
    log "INFO" "Found package.json, installing Node.js build dependencies"
    cd /workspace && npm install
fi

log "INFO" "Marketing team initialization complete"
