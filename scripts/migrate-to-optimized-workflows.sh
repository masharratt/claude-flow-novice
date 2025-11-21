#!/bin/bash
# CI/CD Pipeline Migration Script
# Migrates from current workflows to optimized versions

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(git rev-parse --show-toplevel)"
WORKFLOW_DIR="$PROJECT_ROOT/.github/workflows"
BACKUP_DIR="$WORKFLOW_DIR/backup-$(date +%Y%m%d_%H%M%S)"

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Validation functions
validate_project() {
    log_info "Validating project structure..."
    
    if [[ ! -d "$WORKFLOW_DIR" ]]; then
        log_error "GitHub workflows directory not found: $WORKFLOW_DIR"
        exit 1
    fi
    
    if [[ ! -f "$PROJECT_ROOT/package.json" ]]; then
        log_error "package.json not found. This doesn't appear to be a Node.js project."
        exit 1
    fi
    
    log_success "Project structure validated"
}

# Backup current workflows
backup_workflows() {
    log_info "Creating backup of current workflows..."
    
    mkdir -p "$BACKUP_DIR"
    
    # Copy all existing workflows
    find "$WORKFLOW_DIR" -name "*.yml" -not -path "*/backup-*" | while read -r workflow; do
        cp "$workflow" "$BACKUP_DIR/"
        log_info "Backed up: $(basename "$workflow")"
    done
    
    log_success "Backup created at: $BACKUP_DIR"
}

# Check if optimized workflows exist
check_optimized_workflows() {
    log_info "Checking for optimized workflow files..."
    
    local optimized_ci="$WORKFLOW_DIR/ci-optimized.yml"
    local optimized_cd="$WORKFLOW_DIR/cd-optimized.yml"
    
    if [[ ! -f "$optimized_ci" ]]; then
        log_error "Optimized CI workflow not found: $optimized_ci"
        log_info "Please ensure ci-optimized.yml exists in the workflows directory"
        exit 1
    fi
    
    if [[ ! -f "$optimized_cd" ]]; then
        log_error "Optimized CD workflow not found: $optimized_cd"
        log_info "Please ensure cd-optimized.yml exists in the workflows directory"
        exit 1
    fi
    
    log_success "Optimized workflow files found"
}

# Analyze current workflows
analyze_current_workflows() {
    log_info "Analyzing current workflow configuration..."
    
    local current_ci="$WORKFLOW_DIR/ci.yml"
    local current_cd="$WORKFLOW_DIR/cd.yml"
    
    # Check if current workflows exist
    if [[ -f "$current_ci" ]]; then
        log_info "Current CI workflow found: ci.yml"
        
        # Extract key information
        local timeout=$(grep -o "timeout-minutes: [0-9]*" "$current_ci" | head -1 | cut -d: -f2 | xargs || echo "unknown")
        local node_version=$(grep -o "node-version: '[0-9]*" "$current_ci" | head -1 | cut -d: -f2 | tr -d "'" || echo "unknown")
        
        log_info "Current CI Configuration:"
        log_info "  - Timeout: ${timeout} minutes"
        log_info "  - Node.js version: ${node_version}"
    else
        log_warning "No current CI workflow found (ci.yml)"
    fi
    
    if [[ -f "$current_cd" ]]; then
        log_info "Current CD workflow found: cd.yml"
        
        # Extract deployment information
        local environments=$(grep -c "environment:" "$current_cd" || echo "0")
        local secrets=$(grep -o 'secrets\.[A-Z_]*' "$current_cd" | sort -u | wc -l || echo "0")
        
        log_info "Current CD Configuration:"
        log_info "  - Environments: ${environments}"
        log_info "  - Required secrets: ${secrets}"
    else
        log_warning "No current CD workflow found (cd.yml)"
    fi
}

# Validate optimized workflows
validate_optimized_workflows() {
    log_info "Validating optimized workflow configuration..."
    
    local optimized_ci="$WORKFLOW_DIR/ci-optimized.yml"
    local optimized_cd="$WORKFLOW_DIR/cd-optimized.yml"
    
    # Validate CI workflow
    log_info "Validating optimized CI workflow..."
    
    # Check for required sections
    local required_sections=(
        "name:"
        "on:"
        "jobs:"
        "build:"
        "quality-checks:"
        "test-matrix:"
        "coverage-gates:"
    )
    
    for section in "${required_sections[@]}"; do
        if ! grep -q "$section" "$optimized_ci"; then
            log_error "Required section '$section' not found in optimized CI workflow"
            exit 1
        fi
    done
    
    # Check for specific optimizations
    local optimizations=(
        "actions/cache@v3"
        "actions/upload-artifact@v4"
        "actions/download-artifact@v4"
        "dorny/paths-filter@v2"
    )
    
    for opt in "${optimizations[@]}"; do
        if grep -q "$opt" "$optimized_ci"; then
            log_success "✓ Found optimization: $opt"
        else
            log_warning "⚠ Missing optimization: $opt"
        fi
    done
    
    # Validate CD workflow
    log_info "Validating optimized CD workflow..."
    
    local cd_required_sections=(
        "name:"
        "on:"
        "jobs:"
        "deployment-setup:"
        "staging-deployment:"
        "production-deployment:"
    )
    
    for section in "${cd_required_sections[@]}"; do
        if ! grep -q "$section" "$optimized_cd"; then
            log_error "Required section '$section' not found in optimized CD workflow"
            exit 1
        fi
    done
    
    # Check for deployment optimizations
    local cd_optimizations=(
        "blue-green"
        "rollback"
        "backup"
        "health-check"
    )
    
    for opt in "${cd_optimizations[@]}"; do
        if grep -qi "$opt" "$optimized_cd"; then
            log_success "✓ Found deployment feature: $opt"
        else
            log_warning "⚠ Missing deployment feature: $opt"
        fi
    done
    
    log_success "Optimized workflow validation completed"
}

# Perform migration
perform_migration() {
    log_info "Performing workflow migration..."
    
    # Move current workflows to backup
    local current_ci="$WORKFLOW_DIR/ci.yml"
    local current_cd="$WORKFLOW_DIR/cd.yml"
    
    if [[ -f "$current_ci" ]]; then
        mv "$current_ci" "$BACKUP_DIR/ci-original.yml"
        log_info "Moved original CI workflow to backup"
    fi
    
    if [[ -f "$current_cd" ]]; then
        mv "$current_cd" "$BACKUP_DIR/cd-original.yml"
        log_info "Moved original CD workflow to backup"
    fi
    
    # Move optimized workflows to active
    mv "$WORKFLOW_DIR/ci-optimized.yml" "$WORKFLOW_DIR/ci.yml"
    mv "$WORKFLOW_DIR/cd-optimized.yml" "$WORKFLOW_DIR/cd.yml"
    
    log_success "Workflow migration completed"
}

# Create configuration checklist
create_config_checklist() {
    log_info "Creating configuration checklist..."
    
    local checklist_file="$PROJECT_ROOT/DEPLOYMENT_CHECKLIST.md"
    
    cat > "$checklist_file" << 'EOF'
# Deployment Configuration Checklist

## Required GitHub Secrets

### Staging Environment
- [ ] `STAGING_HOST` - Staging server hostname
- [ ] `STAGING_USER` - SSH username for staging server
- [ ] `STAGING_DEPLOY_KEY` - SSH private key for staging
- [ ] `STAGING_URL` - Staging application URL for health checks

### Production Environment
- [ ] `PROD_HOST` - Production server hostname
- [ ] `PROD_USER` - SSH username for production server
- [ ] `PROD_DEPLOY_KEY` - SSH private key for production
- [ ] `PRODUCTION_URL` - Production application URL for health checks

## Server Configuration

### Service Account Setup
```bash
# Create deployment user
sudo useradd -m -s /bin/bash claude-flow
sudo usermod -aG docker claude-flow

# Create required directories
sudo mkdir -p /opt/claude-flow-novice
sudo mkdir -p /opt/backups
sudo chown -R claude-flow:claude-flow /opt/claude-flow-novice
sudo chown -R claude-flow:claude-flow /opt/backups
```

### systemd Service Setup
Create `/etc/systemd/system/claude-flow-staging.service` and `/etc/systemd/system/claude-flow-prod.service`

## Application Configuration

### Health Check Endpoint
Ensure your application has a `/health` endpoint that returns HTTP 200 when healthy.

### Environment Variables
Configure necessary environment variables for production and staging.

## Testing Checklist

### Before First Deployment
- [ ] Test workflow syntax with `gh workflow validate`
- [ ] Verify all required secrets are configured
- [ ] Test SSH connectivity to deployment servers
- [ ] Verify application builds successfully
- [ ] Test health check endpoint

### After Deployment
- [ ] Verify CI pipeline runs successfully
- [ ] Test staging deployment
- [ ] Verify production deployment (with care)
- [ ] Test rollback procedure
- [ ] Monitor application performance

## Monitoring Setup

### Pipeline Metrics
Monitor GitHub Actions workflow performance and success rates.

### Application Metrics
Set up monitoring for application health and performance.

### Alert Configuration
Configure alerts for deployment failures and application issues.

## Security Considerations

### SSH Key Security
- Use strong SSH keys (ED25519 recommended)
- Regularly rotate deployment keys
- Limit SSH access to specific IPs if possible

### Secret Management
- Use GitHub encrypted secrets
- Regularly review and rotate secrets
- Limit access to secrets

### Network Security
- Configure firewalls appropriately
- Use VPNs for remote access if needed
- Implement SSL/TLS for all communications

EOF

    log_success "Configuration checklist created: $checklist_file"
}

# Create rollback script
create_rollback_script() {
    log_info "Creating rollback script..."
    
    local rollback_script="$PROJECT_ROOT/rollback-workflows.sh"
    
    cat > "$rollback_script" << EOF
#!/bin/bash
# Rollback script for CI/CD workflows

set -euo pipefail

WORKFLOW_DIR="\$(cd "\$(dirname "\${BASH_SOURCE[0]}")/.github/workflows" && pwd)"
BACKUP_DIR="$BACKUP_DIR"

if [[ ! -d "\$BACKUP_DIR" ]]; then
    echo "ERROR: Backup directory not found: \$BACKUP_DIR"
    exit 1
fi

echo "Rolling back workflows from backup..."

# Move current workflows to backup
if [[ -f "\$WORKFLOW_DIR/ci.yml" ]]; then
    mv "\$WORKFLOW_DIR/ci.yml" "\$WORKFLOW_DIR/ci-optimized-backup-\$(date +%Y%m%d_%H%M%S).yml"
fi

if [[ -f "\$WORKFLOW_DIR/cd.yml" ]]; then
    mv "\$WORKFLOW_DIR/cd.yml" "\$WORKFLOW_DIR/cd-optimized-backup-\$(date +%Y%m%d_%H%M%S).yml"
fi

# Restore original workflows
if [[ -f "\$BACKUP_DIR/ci-original.yml" ]]; then
    cp "\$BACKUP_DIR/ci-original.yml" "\$WORKFLOW_DIR/ci.yml"
    echo "Restored original CI workflow"
fi

if [[ -f "\$BACKUP_DIR/cd-original.yml" ]]; then
    cp "\$BACKUP_DIR/cd-original.yml" "\$WORKFLOW_DIR/cd.yml"
    echo "Restored original CD workflow"
fi

echo "Rollback completed successfully"
echo "Files have been restored from: \$BACKUP_DIR"
EOF

    chmod +x "$rollback_script"
    
    log_success "Rollback script created: $rollback_script"
}

# Summary and next steps
show_summary() {
    log_info "Migration completed successfully!"
    echo
    log_success "Summary of changes:"
    echo "  ✓ Backed up original workflows to: $BACKUP_DIR"
    echo "  ✓ Activated optimized CI/CD workflows"
    echo "  ✓ Created deployment configuration checklist"
    echo "  ✓ Created rollback script for emergencies"
    echo
    log_info "Next steps:"
    echo "  1. Review the DEPLOYMENT_CHECKLIST.md file"
    echo "  2. Configure required GitHub secrets"
    echo "  3. Set up deployment servers"
    echo "  4. Test the workflows with a sample commit"
    echo "  5. Monitor the optimized pipeline performance"
    echo
    log_warning "Important notes:"
    echo "  - The original workflows are preserved in the backup directory"
    echo "  - Use rollback-workflows.sh if you need to revert"
    echo "  - Review all configurations before production deployments"
    echo "  - Monitor pipeline performance after migration"
    echo
    log_info "For detailed information, see: docs/CI_CD_OPTIMIZATION_GUIDE.md"
}

# Main execution
main() {
    echo "=== CI/CD Pipeline Migration Script ==="
    echo
    
    validate_project
    check_optimized_workflows
    analyze_current_workflows
    validate_optimized_workflows
    
    echo
    log_info "Ready to migrate to optimized workflows"
    read -p "Do you want to continue? (y/N): " -n 1 -r
    echo
    
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log_info "Migration cancelled by user"
        exit 0
    fi
    
    backup_workflows
    perform_migration
    create_config_checklist
    create_rollback_script
    show_summary
}

# Run main function
main "$@"