#!/bin/bash

# OOM Monitor Installation Script
# One-click installer for all Linux distributions

set -euo pipefail

# Configuration
INSTALL_VERSION="1.0.0"
INSTALL_DIR="/opt/oom-monitor"
SERVICE_NAME="oom-monitor"
LOG_DIR="/var/log/oom-monitor"
CONFIG_DIR="/etc/oom-monitor"
STATE_DIR="/var/lib/oom-monitor"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() {
    local level=$1
    shift
    local message="$*"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo "[$timestamp] [$level] $message"
}

info() {
    log "INFO" "$*"
}

warn() {
    log "WARN" "$*"
}

error() {
    log "ERROR" "$*"
}

success() {
    echo -e "${GREEN}[OK] $*${NC}"
}

warning() {
    echo -e "${YELLOW}[WARN] $*${NC}"
}

error_msg() {
    echo -e "${RED}[ERROR] $*${NC}"
}

info_msg() {
    echo -e "${BLUE}[INFO] $*${NC}"
}

check_root() {
    if [[ $EUID -ne 0 ]]; then
        error_msg "This script must be run as root"
        echo "Usage: sudo $0"
        exit 1
    fi
}

detect_distribution() {
    if [[ -f /etc/os-release ]]; then
        . /etc/os-release
        echo "$ID"
    elif command -v lsb_release >/dev/null 2>&1; then
        lsb_release -si | tr '[:upper:]' '[:lower:]'
    else
        echo "unknown"
    fi
}

detect_init_system() {
    if [[ -d /run/systemd/system ]]; then
        echo "systemd"
    elif [[ -f /etc/init.d/rc ]]; then
        echo "sysvinit"
    elif [[ -f /etc/init/rc.conf ]]; then
        echo "openrc"
    else
        echo "unknown"
    fi
}

check_dependencies() {
    info "Checking dependencies..."

    local missing_deps=()

    # Check for required tools
    local required_tools=("bash" "jq" "curl" "systemctl")
    for tool in "${required_tools[@]}"; do
        if ! command -v "$tool" >/dev/null 2>&1; then
            missing_deps+=("$tool")
        fi
    done

    # Install missing dependencies
    if [[ ${#missing_deps[@]} -gt 0 ]]; then
        warn "Missing dependencies: ${missing_deps[*]}"
        install_dependencies "${missing_deps[@]}"
    fi

    success "All dependencies satisfied"
}

install_dependencies() {
    local distro=$(detect_distribution)
    local deps=("$@")

    info "Installing dependencies for $distro: ${deps[*]}"

    case "$distro" in
        ubuntu|debian)
            apt-get update
            apt-get install -y "${deps[@]}"
            ;;
        centos|rhel|fedora)
            if command -v dnf >/dev/null 2>&1; then
                dnf install -y "${deps[@]}"
            else
                yum install -y "${deps[@]}"
            fi
            ;;
        arch)
            pacman -S --noconfirm "${deps[@]}"
            ;;
        alpine)
            apk add "${deps[@]}"
            ;;
        *)
            error_msg "Unsupported distribution: $distro"
            error_msg "Please install manually: ${deps[*]}"
            exit 1
            ;;
    esac
}

create_directories() {
    info "Creating directory structure..."

    # Create directories
    mkdir -p "$INSTALL_DIR"
    mkdir -p "$CONFIG_DIR"
    mkdir -p "$LOG_DIR"
    mkdir -p "$STATE_DIR"
    mkdir -p "$CONFIG_DIR/recovery"

    # Pre-create termination log for leak investigations
    touch "$STATE_DIR/terminated-processes.jsonl"

    # Set permissions
    chmod 755 "$INSTALL_DIR"
    chmod 755 "$CONFIG_DIR"
    chmod 755 "$LOG_DIR"
    chmod 755 "$STATE_DIR"
    chmod 755 "$CONFIG_DIR/recovery"
    chmod 640 "$STATE_DIR/terminated-processes.jsonl"

    success "Directory structure created"
}

install_scripts() {
    info "Installing OOM monitor scripts..."

    # Get script directory
    local script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

    # Install main scripts
    if [[ -f "$script_dir/oom-monitor.sh" ]]; then
        cp "$script_dir/oom-monitor.sh" "$INSTALL_DIR/"
        chmod +x "$INSTALL_DIR/oom-monitor.sh"
        success "Installed oom-monitor.sh"
    else
        error_msg "oom-monitor.sh not found in script directory"
        exit 1
    fi

    if [[ -f "$script_dir/oom-optimizer.sh" ]]; then
        cp "$script_dir/oom-optimizer.sh" "$INSTALL_DIR/"
        chmod +x "$INSTALL_DIR/oom-optimizer.sh"
        success "Installed oom-optimizer.sh"
    else
        error_msg "oom-optimizer.sh not found in script directory"
        exit 1
    fi

    # Create symlinks for easy access
    ln -sf "$INSTALL_DIR/oom-monitor.sh" "/usr/local/bin/oom-monitor"
    ln -sf "$INSTALL_DIR/oom-optimizer.sh" "/usr/local/bin/oom-optimizer"

    success "Scripts installed and symlinks created"
}

create_systemd_service() {
    local init_system=$(detect_init_system)

    if [[ "$init_system" != "systemd" ]]; then
        warning "systemd not detected. Skipping service installation."
        info "You'll need to manually configure the service for your init system."
        return
    fi

    info "Creating systemd service..."

    cat > "/etc/systemd/system/${SERVICE_NAME}.service" << EOF
[Unit]
Description=OOM Monitor Daemon
Documentation=https://github.com/your-org/oom-monitor
After=network.target
Wants=network.target

[Service]
Type=simple
ExecStart=$INSTALL_DIR/oom-monitor.sh start
ExecStop=$INSTALL_DIR/oom-monitor.sh stop
ExecReload=/bin/kill -HUP \$MAINPID
Restart=always
RestartSec=10
StartLimitInterval=60
StartLimitBurst=3

# Run as root for full system access
User=root
Group=root

# Security settings
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=$LOG_DIR $STATE_DIR $CONFIG_DIR
PrivateTmp=true

# Resource limits
LimitNOFILE=65536
MemoryMax=2G
CPUQuota=50%

# Environment
Environment=DEBUG=0

[Install]
WantedBy=multi-user.target
EOF

    # Reload systemd and enable service
    systemctl daemon-reload
    systemctl enable "$SERVICE_NAME"

    success "systemd service created and enabled"
}

create_logrotate_config() {
    info "Creating logrotate configuration..."

    cat > "/etc/logrotate.d/${SERVICE_NAME}" << EOF
# OOM Monitor log rotation
$LOG_DIR/*.log {
    daily
    missingok
    rotate 7
    compress
    delaycompress
    notifempty
    create 0644 root adm
    postrotate
        # Reload systemd service if it's running
        if systemctl is-active --quiet $SERVICE_NAME; then
            systemctl reload $SERVICE_NAME || true
        fi
    endscript
}

# State file rotation
$STATE_DIR/*.json {
    daily
    missingok
    rotate 3
    compress
    delaycompress
    notifempty
    create 0644 root root
}
EOF

    success "logrotate configuration created"
}

create_cron_jobs() {
    info "Setting up maintenance cron jobs..."

    # Create cron file
    cat > "/etc/cron.d/${SERVICE_NAME}" << EOF
# OOM Monitor maintenance tasks
# Run every hour to clean up old state files
0 * * * * root find $STATE_DIR -name "*.json" -mtime +7 -delete

# Run daily at 2 AM to optimize system settings
0 2 * * * root $INSTALL_DIR/oom-optimizer.sh test >/dev/null 2>&1 || true

# Run weekly on Sunday at 3 AM to create backup
0 3 * * 0 root $INSTALL_DIR/oom-optimizer.sh backup >/dev/null 2>&1 || true
EOF

    success "Cron jobs created"
}

create_default_config() {
    info "Creating default configuration..."

    # Default configuration will be created by the script on first run
    # This just ensures the directory exists with proper permissions
    chown -R root:root "$CONFIG_DIR"
    chmod 755 "$CONFIG_DIR"

    success "Configuration directory prepared"
}

setup_firewall_rules() {
    info "Configuring firewall rules (if needed)..."

    # Check if firewall is active
    if command -v firewall-cmd >/dev/null 2>&1 && systemctl is-active --quiet firewalld; then
        info "Configuring firewalld rules..."
        # Add any needed firewall rules here
        # Currently no external ports needed
        success "firewalld rules configured"
    elif command -v ufw >/dev/null 2>&1 && ufw status | grep -q "Status: active"; then
        info "Configuring UFW rules..."
        # Add any needed UFW rules here
        success "UFW rules configured"
    else
        info "No active firewall detected or no rules needed"
    fi
}

run_installation_test() {
    info "Running installation test..."

    # Test if scripts are executable
    if ! "$INSTALL_DIR/oom-monitor.sh" test >/dev/null 2>&1; then
        error_msg "oom-monitor.sh test failed"
        return 1
    fi

    if ! "$INSTALL_DIR/oom-optimizer.sh" test >/dev/null 2>&1; then
        error_msg "oom-optimizer.sh test failed"
        return 1
    fi

    success "Installation test passed"
}

start_service() {
    local init_system=$(detect_init_system)

    if [[ "$init_system" == "systemd" ]]; then
        info "Starting systemd service..."

        if systemctl start "$SERVICE_NAME"; then
            # Check if service is running
            if systemctl is-active --quiet "$SERVICE_NAME"; then
                success "OOM Monitor service started successfully"
            else
                error_msg "Service failed to start"
                systemctl status "$SERVICE_NAME"
                return 1
            fi
        else
            error_msg "Failed to start service"
            return 1
        fi
    else
        warning "Cannot automatically start service on non-systemd systems"
        info "Start manually with: $INSTALL_DIR/oom-monitor.sh start"
    fi
}

display_installation_summary() {
    echo ""
    echo "OOM Monitor Installation Complete!"
    echo ""
    echo "=== Installation Summary ==="
    echo "Version: $INSTALL_VERSION"
    echo "Install Directory: $INSTALL_DIR"
    echo "Configuration: $CONFIG_DIR"
    echo "Logs: $LOG_DIR"
    echo "State: $STATE_DIR"
    echo ""

    local init_system=$(detect_init_system)
    if [[ "$init_system" == "systemd" ]]; then
        echo "=== Service Commands ==="
        echo "Start:   sudo systemctl start $SERVICE_NAME"
        echo "Stop:    sudo systemctl stop $SERVICE_NAME"
        echo "Status:  sudo systemctl status $SERVICE_NAME"
        echo "Enable:  sudo systemctl enable $SERVICE_NAME"
        echo "Logs:    sudo journalctl -u $SERVICE_NAME -f"
        echo ""
    fi

    echo "=== Manual Commands ==="
    echo "Monitor test:     sudo oom-monitor test"
    echo "Optimizer test:   sudo oom-optimizer test"
    echo "System optimize:  sudo oom-optimizer optimize"
    echo "Monitor status:   sudo oom-monitor status"
    echo "Show config:      sudo oom-monitor config"
    echo ""

    echo "=== Recovery Scripts ==="
    echo "Emergency recovery:   sudo $CONFIG_DIR/recovery/emergency-recovery.sh"
    echo "Manual cleanup:       sudo $CONFIG_DIR/recovery/manual-cleanup.sh"
    echo "Process analysis:     sudo $CONFIG_DIR/recovery/analyze-processes.sh"
    echo ""

    echo "=== Important Files ==="
    echo "Main script:       $INSTALL_DIR/oom-monitor.sh"
    echo "Optimizer script:  $INSTALL_DIR/oom-optimizer.sh"
    echo "Config file:       $CONFIG_DIR/oom-monitor.conf"
    echo "Current state:     $STATE_DIR/current-state.json"
    echo "Process log:       $STATE_DIR/terminated-processes.jsonl"
    echo ""

    echo "=== Configuration ==="
    echo "Edit configuration: $CONFIG_DIR/oom-monitor.conf"
    echo "Webhook setup:     Edit 'alerts' section in config"
    echo "Threshold tuning:  Edit 'monitoring' section in config"
    echo ""

    echo "=== Support ==="
    echo "Check logs: $LOG_DIR/oom-monitor.log"
    echo "Check alerts: $LOG_DIR/oom-alerts.log"
    echo "Service status: sudo oom-monitor status"
    echo ""

    success "OOM Monitor is ready to protect your system!"
}

uninstall() {
    warn "Uninstalling OOM Monitor..."

    local init_system=$(detect_init_system)

    # Stop and disable service
    if [[ "$init_system" == "systemd" ]]; then
        systemctl stop "$SERVICE_NAME" 2>/dev/null || true
        systemctl disable "$SERVICE_NAME" 2>/dev/null || true
        rm -f "/etc/systemd/system/${SERVICE_NAME}.service"
        systemctl daemon-reload
    fi

    # Remove cron jobs
    rm -f "/etc/cron.d/${SERVICE_NAME}"

    # Remove logrotate config
    rm -f "/etc/logrotate.d/${SERVICE_NAME}"

    # Remove symlinks
    rm -f "/usr/local/bin/oom-monitor"
    rm -f "/usr/local/bin/oom-optimizer"

    # Remove installation directory
    rm -rf "$INSTALL_DIR"

    # Remove configuration and state directories
    rm -rf "$CONFIG_DIR"
    rm -rf "$STATE_DIR"

    # Keep logs for debugging (optional)
    # rm -rf "$LOG_DIR"

    success "OOM Monitor uninstalled successfully"
}

# Main installation function
main() {
    echo "OOM Monitor Installer v$INSTALL_VERSION"
    echo "Designed for all Linux distributions"
    echo ""

    # Parse command line arguments
    case "${1:-install}" in
        "install")
            check_root
            info_msg "Starting OOM Monitor installation..."

            # Installation steps
            check_dependencies
            create_directories
            install_scripts
            create_systemd_service
            create_logrotate_config
            create_cron_jobs
            create_default_config
            setup_firewall_rules

            # Test installation
            if run_installation_test; then
                start_service
                display_installation_summary
            else
                error_msg "Installation test failed"
                exit 1
            fi
            ;;
        "uninstall")
            check_root
            uninstall
            ;;
        "upgrade")
            check_root
            warn "Upgrading OOM Monitor..."
            uninstall
            main install
            ;;
        *)
            echo "Usage: $0 {install|uninstall|upgrade}"
            echo "  install   - Install OOM Monitor"
            echo "  uninstall - Remove OOM Monitor completely"
            echo "  upgrade   - Upgrade existing installation"
            exit 1
            ;;
    esac
}

# Run main function with all arguments
main "$@"


