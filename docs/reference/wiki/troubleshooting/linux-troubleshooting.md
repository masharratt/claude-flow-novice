# Linux Troubleshooting Guide

This guide covers Linux-specific issues and solutions for Claude Flow across different distributions.

## Table of Contents

1. [Linux Distribution Differences](#linux-distribution-differences)
2. [Package Management Issues](#package-management-issues)
3. [Permission and Security](#permission-and-security)
4. [System Dependencies](#system-dependencies)
5. [Environment Configuration](#environment-configuration)
6. [Network and Firewall](#network-and-firewall)
7. [Performance and Resource Management](#performance-and-resource-management)

## Linux Distribution Differences

### Ubuntu/Debian-based Systems

**Node.js Installation:**
```bash
# Update package index
sudo apt update

# Install Node.js from NodeSource repository
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verify installation
node --version
npm --version

# Install build dependencies
sudo apt-get install -y build-essential
```

**Alternative Installation Methods:**
```bash
# Using snap
sudo snap install node --classic

# Using Ubuntu's repository (older version)
sudo apt install nodejs npm

# Using nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
source ~/.bashrc
nvm install 20
```

### CentOS/RHEL/Fedora-based Systems

**Node.js Installation:**
```bash
# CentOS/RHEL - Enable EPEL repository
sudo yum install epel-release

# Install Node.js from NodeSource
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
sudo yum install nodejs

# Fedora
sudo dnf install nodejs npm

# Install development tools
sudo yum groupinstall "Development Tools"
# or for Fedora:
sudo dnf groupinstall "Development Tools"
```

### Arch Linux

**Node.js Installation:**
```bash
# Update system
sudo pacman -Syu

# Install Node.js
sudo pacman -S nodejs npm

# Install base development tools
sudo pacman -S base-devel
```

### SUSE/openSUSE

**Node.js Installation:**
```bash
# openSUSE
sudo zypper install nodejs20 npm20

# Install development patterns
sudo zypper install -t pattern devel_basis
```

### Alpine Linux

**Node.js Installation:**
```bash
# Update package index
sudo apk update

# Install Node.js
sudo apk add nodejs npm

# Install build dependencies
sudo apk add build-base python3
```

## Package Management Issues

### npm Permission Issues

**Issue: EACCES permission denied**

**Solutions:**

#### 1. Use npx (Recommended)
```bash
npx claude-flow-novice@latest init
```

#### 2. Configure npm for Global Packages
```bash
# Create directory for global packages
mkdir ~/.npm-global

# Configure npm
npm config set prefix '~/.npm-global'

# Add to PATH
echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.bashrc
source ~/.bashrc

# Install globally
npm install -g claude-flow-novice
```

#### 3. Fix npm Ownership (Ubuntu/Debian)
```bash
# Fix npm directory ownership
sudo chown -R $(whoami) $(npm config get prefix)/{lib/node_modules,bin,share}
```

### Package Dependencies

**Issue: Missing system dependencies**

**Common Missing Dependencies:**

#### Python and Build Tools
```bash
# Ubuntu/Debian
sudo apt-get install python3 python3-pip build-essential

# CentOS/RHEL
sudo yum install python3 python3-pip gcc gcc-c++ make

# Fedora
sudo dnf install python3 python3-pip gcc gcc-c++ make

# Arch Linux
sudo pacman -S python python-pip base-devel
```

#### Git
```bash
# Ubuntu/Debian
sudo apt-get install git

# CentOS/RHEL
sudo yum install git

# Fedora
sudo dnf install git

# Arch Linux
sudo pacman -S git
```

#### SSL/TLS Libraries
```bash
# Ubuntu/Debian
sudo apt-get install libssl-dev

# CentOS/RHEL
sudo yum install openssl-devel

# Fedora
sudo dnf install openssl-devel

# Arch Linux
sudo pacman -S openssl
```

### Node.js Version Issues

**Issue: Wrong Node.js version**

**Using Node Version Manager (nvm):**
```bash
# Install nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash

# Reload shell
source ~/.bashrc

# Install and use Node.js 20
nvm install 20
nvm use 20
nvm alias default 20

# List installed versions
nvm list
```

**Using Node.js Version Switching:**
```bash
# Install multiple versions
sudo npm install -g n

# Install latest LTS
sudo n lts

# Install specific version
sudo n 20.0.0

# List available versions
n ls
```

## Permission and Security

### File Permissions

**Issue: Permission denied errors**

**Check and Fix Permissions:**
```bash
# Check current permissions
ls -la ~/.claude-flow/

# Fix directory permissions
chmod 755 ~/.claude-flow/
chmod 644 ~/.claude-flow/*.json

# Fix ownership
sudo chown -R $(whoami):$(whoami) ~/.claude-flow/

# Create with proper permissions
install -d -m 755 ~/.claude-flow
install -m 644 /dev/null ~/.claude-flow/config.json
```

### SELinux Issues (CentOS/RHEL/Fedora)

**Check SELinux Status:**
```bash
# Check SELinux status
sestatus

# Check if SELinux is enforcing
getenforce
```

**SELinux Troubleshooting:**
```bash
# Check SELinux denials
sudo ausearch -m AVC -ts recent

# View SELinux context
ls -Z ~/.claude-flow/

# Temporarily set permissive mode (testing only)
sudo setenforce 0

# Set SELinux context for application files
sudo setsebool -P httpd_can_network_connect 1
sudo restorecon -R ~/.claude-flow/

# Create custom SELinux policy (advanced)
sudo audit2allow -a -M claude-flow-policy
sudo semodule -i claude-flow-policy.pp
```

### AppArmor Issues (Ubuntu)

**Check AppArmor Status:**
```bash
# Check AppArmor status
sudo aa-status

# Check if specific profile is loaded
sudo aa-status | grep claude-flow
```

**AppArmor Troubleshooting:**
```bash
# Check AppArmor logs
sudo journalctl -f | grep apparmor

# Put profile in complain mode
sudo aa-complain /path/to/profile

# Disable profile temporarily
sudo aa-disable /path/to/profile

# Generate profile
sudo aa-genprof claude-flow-novice
```

### Sudo Configuration

**Issue: sudo permission problems**

**Configure sudo for npm:**
```bash
# Edit sudoers file
sudo visudo

# Add line (replace username with your username):
username ALL=(ALL) NOPASSWD: /usr/bin/npm

# Or create separate sudoers file
echo 'username ALL=(ALL) NOPASSWD: /usr/bin/npm' | sudo tee /etc/sudoers.d/npm
```

## System Dependencies

### Missing System Libraries

**Issue: Native module compilation fails**

**Install Development Dependencies:**

#### Ubuntu/Debian
```bash
sudo apt-get update
sudo apt-get install -y \
  build-essential \
  python3-dev \
  libnode-dev \
  node-gyp \
  libssl-dev \
  libffi-dev
```

#### CentOS/RHEL
```bash
sudo yum groupinstall "Development Tools"
sudo yum install -y \
  python3-devel \
  openssl-devel \
  libffi-devel \
  nodejs-devel
```

#### Fedora
```bash
sudo dnf groupinstall "Development Tools"
sudo dnf install -y \
  python3-devel \
  openssl-devel \
  libffi-devel \
  nodejs-devel
```

#### Arch Linux
```bash
sudo pacman -S \
  base-devel \
  python \
  openssl \
  libffi
```

### C++ Compiler Issues

**Issue: C++ compiler not found**

**Solutions:**
```bash
# Ubuntu/Debian
sudo apt-get install g++

# CentOS/RHEL
sudo yum install gcc-c++

# Fedora
sudo dnf install gcc-c++

# Arch Linux
sudo pacman -S gcc

# Verify installation
g++ --version
```

### Python Version Issues

**Issue: Wrong Python version**

**Solutions:**
```bash
# Check Python version
python3 --version

# Configure npm to use specific Python
npm config set python python3

# Use specific Python version
npm config set python /usr/bin/python3.8

# Install python-is-python3 (Ubuntu)
sudo apt-get install python-is-python3
```

## Environment Configuration

### Shell Configuration

**Issue: Environment variables not set**

**Bash Configuration (~/.bashrc or ~/.bash_profile):**
```bash
# Node.js and npm paths
export PATH="$HOME/.npm-global/bin:$PATH"
export PATH="/usr/local/bin:$PATH"

# Node.js options
export NODE_OPTIONS="--max-old-space-size=8192"

# Claude Flow configuration
export CLAUDE_FLOW_CONFIG="$HOME/.claude-flow/config.json"
export DEBUG="claude-flow:*"

# Reload configuration
source ~/.bashrc
```

**Zsh Configuration (~/.zshrc):**
```bash
# Same as bash configuration
# Add to ~/.zshrc instead

# For Oh My Zsh users, ensure proper loading order
```

**Fish Shell Configuration (~/.config/fish/config.fish):**
```bash
# Set environment variables
set -gx PATH $HOME/.npm-global/bin $PATH
set -gx NODE_OPTIONS "--max-old-space-size=8192"
set -gx CLAUDE_FLOW_CONFIG "$HOME/.claude-flow/config.json"
```

### System Environment Variables

**Global Environment Configuration:**
```bash
# System-wide environment variables
sudo tee /etc/environment << EOF
NODE_OPTIONS="--max-old-space-size=8192"
CLAUDE_FLOW_CONFIG="/etc/claude-flow/config.json"
EOF

# Profile.d script for all users
sudo tee /etc/profile.d/claude-flow.sh << EOF
export PATH="/usr/local/bin:$PATH"
export NODE_OPTIONS="--max-old-space-size=8192"
EOF
```

### Desktop Environment Issues

**Issue: GUI applications not finding Node.js**

**Solutions:**
```bash
# Create desktop entry
cat > ~/.local/share/applications/claude-flow.desktop << EOF
[Desktop Entry]
Version=1.0
Type=Application
Name=Claude Flow
Comment=AI Agent Orchestration
Exec=bash -c 'source ~/.bashrc && claude-flow-novice'
Icon=text-editor
Terminal=true
Categories=Development;
EOF

# Update desktop database
update-desktop-database ~/.local/share/applications/
```

## Network and Firewall

### Firewall Configuration

#### iptables
```bash
# Check current rules
sudo iptables -L

# Allow specific port
sudo iptables -A INPUT -p tcp --dport 3001 -j ACCEPT

# Save rules (Ubuntu/Debian)
sudo iptables-save > /etc/iptables/rules.v4

# Save rules (CentOS/RHEL)
sudo service iptables save
```

#### UFW (Ubuntu)
```bash
# Check UFW status
sudo ufw status

# Enable UFW
sudo ufw enable

# Allow specific port
sudo ufw allow 3001

# Allow specific application
sudo ufw allow from any to any port 3001 proto tcp
```

#### firewalld (CentOS/RHEL/Fedora)
```bash
# Check firewalld status
sudo firewall-cmd --state

# List current rules
sudo firewall-cmd --list-all

# Add port
sudo firewall-cmd --permanent --add-port=3001/tcp
sudo firewall-cmd --reload

# Add service
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --reload
```

### Network Configuration

**Issue: Network connectivity problems**

**Diagnostic Commands:**
```bash
# Test connectivity
ping -c 4 google.com

# Check DNS resolution
nslookup api.anthropic.com
dig api.anthropic.com

# Check routing
ip route show
netstat -rn

# Check listening ports
ss -tulpn | grep :3001
netstat -tulpn | grep :3001
```

**Network Reset:**
```bash
# Restart network service
sudo systemctl restart networking     # Ubuntu/Debian
sudo systemctl restart network        # CentOS/RHEL
sudo systemctl restart NetworkManager # Most modern distributions

# Flush DNS cache
sudo systemctl restart systemd-resolved  # systemd-resolved
sudo service nscd restart                # nscd
```

### Proxy Configuration

**System-wide Proxy:**
```bash
# Configure in /etc/environment
sudo tee -a /etc/environment << EOF
http_proxy=http://proxy.company.com:8080
https_proxy=http://proxy.company.com:8080
ftp_proxy=http://proxy.company.com:8080
no_proxy=localhost,127.0.0.1,.local
EOF

# Configure for apt (Ubuntu/Debian)
sudo tee /etc/apt/apt.conf.d/95proxies << EOF
Acquire::http::proxy "http://proxy.company.com:8080/";
Acquire::https::proxy "http://proxy.company.com:8080/";
EOF

# Configure for yum (CentOS/RHEL)
echo "proxy=http://proxy.company.com:8080" | sudo tee -a /etc/yum.conf
```

## Performance and Resource Management

### System Resource Limits

**Check Current Limits:**
```bash
# Check current limits
ulimit -a

# Check specific limits
ulimit -n  # File descriptors
ulimit -u  # Processes
ulimit -v  # Virtual memory
```

**Increase Limits:**
```bash
# Temporary increase
ulimit -n 65536
ulimit -u 32768

# Permanent increase - edit /etc/security/limits.conf
sudo tee -a /etc/security/limits.conf << EOF
* soft nofile 65536
* hard nofile 65536
* soft nproc 32768
* hard nproc 32768
EOF

# For systemd services
sudo mkdir -p /etc/systemd/system/user@.service.d/
sudo tee /etc/systemd/system/user@.service.d/limits.conf << EOF
[Service]
LimitNOFILE=65536
LimitNPROC=32768
EOF
```

### Memory Management

**Check Memory Usage:**
```bash
# Check memory usage
free -h
cat /proc/meminfo

# Check swap usage
swapon --show

# Monitor memory usage
watch -n 5 free -h
```

**Memory Optimization:**
```bash
# Increase swap file size
sudo fallocate -l 4G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile

# Make permanent
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

# Adjust swappiness
echo 'vm.swappiness=10' | sudo tee -a /etc/sysctl.conf
```

### CPU Management

**Check CPU Usage:**
```bash
# Check CPU information
lscpu
cat /proc/cpuinfo

# Monitor CPU usage
top
htop
iostat 5
```

**CPU Optimization:**
```bash
# Set CPU governor for performance
echo performance | sudo tee /sys/devices/system/cpu/cpu*/cpufreq/scaling_governor

# Enable all CPU cores
echo 1 | sudo tee /sys/devices/system/cpu/cpu*/online
```

### Disk I/O Optimization

**Check Disk Usage:**
```bash
# Check disk space
df -h

# Check inode usage
df -i

# Monitor I/O
iostat -x 1
iotop
```

**I/O Optimization:**
```bash
# Check disk scheduler
cat /sys/block/sda/queue/scheduler

# Set I/O scheduler
echo mq-deadline | sudo tee /sys/block/sda/queue/scheduler

# Mount with optimized options
sudo mount -o noatime,nodiratime /dev/sda1 /mnt/data
```

## Distribution-Specific Issues

### Ubuntu/Debian Specific

**Snap Package Issues:**
```bash
# Check snap packages
snap list

# Update snap packages
sudo snap refresh

# Remove snap version if conflicting
sudo snap remove node
```

**PPA Management:**
```bash
# Add NodeSource PPA
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -

# Remove PPA if needed
sudo add-apt-repository --remove ppa:nodesource/node
```

### CentOS/RHEL Specific

**EPEL Repository:**
```bash
# Install EPEL (CentOS 7)
sudo yum install epel-release

# Install EPEL (CentOS 8)
sudo dnf install epel-release

# Enable PowerTools (CentOS 8)
sudo dnf config-manager --enable powertools
```

**SELinux Context Issues:**
```bash
# Set proper SELinux context
sudo setsebool -P httpd_can_network_connect 1
sudo restorecon -R ~/.claude-flow/
```

### Arch Linux Specific

**AUR Package Management:**
```bash
# Install yay (AUR helper)
git clone https://aur.archlinux.org/yay.git
cd yay
makepkg -si

# Install packages from AUR
yay -S claude-flow-novice-git
```

**Pacman Issues:**
```bash
# Update package database
sudo pacman -Sy

# Full system upgrade
sudo pacman -Syu

# Clear package cache
sudo pacman -Sc
```

## Troubleshooting Workflow for Linux

### Step 1: Distribution Identification
```bash
# Check distribution
cat /etc/os-release
lsb_release -a
uname -a
```

### Step 2: Package Manager Check
```bash
# Check package manager
which apt && echo "Debian-based" || echo "Not Debian-based"
which yum && echo "RHEL-based" || echo "Not RHEL-based"
which pacman && echo "Arch-based" || echo "Not Arch-based"
```

### Step 3: Dependencies Check
```bash
# Check Node.js
node --version
npm --version

# Check build tools
gcc --version
python3 --version
make --version
```

### Step 4: Permission Check
```bash
# Check user permissions
id
groups

# Check file permissions
ls -la ~/.claude-flow/

# Check SELinux/AppArmor
sestatus 2>/dev/null || echo "SELinux not found"
aa-status 2>/dev/null || echo "AppArmor not found"
```

### Step 5: Network Check
```bash
# Test connectivity
ping -c 4 google.com

# Check firewall
sudo iptables -L
sudo ufw status
sudo firewall-cmd --list-all
```

### Step 6: Resource Check
```bash
# Check system resources
free -h
df -h
ulimit -a

# Check running processes
ps aux | grep node
systemctl status claude-flow 2>/dev/null || echo "Service not found"
```

---

**Next Steps:**
- [Debug Mode Guide](./debug-mode.md)
- [Performance Troubleshooting](./performance-troubleshooting.md)
- [Error Analysis Guide](./error-analysis.md)