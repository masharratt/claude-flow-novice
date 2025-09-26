# macOS Troubleshooting Guide

This guide covers macOS-specific issues and solutions for Claude Flow.

## Table of Contents

1. [macOS Installation Issues](#macos-installation-issues)
2. [Homebrew and Package Management](#homebrew-and-package-management)
3. [System Integrity Protection (SIP)](#system-integrity-protection-sip)
4. [Permission and Security](#permission-and-security)
5. [Gatekeeper and Code Signing](#gatekeeper-and-code-signing)
6. [Terminal and Shell Issues](#terminal-and-shell-issues)
7. [Network and Firewall](#network-and-firewall)

## macOS Installation Issues

### Node.js Installation Problems

**Issue: Node.js not found or wrong version**

**Solutions:**

#### 1. Official Node.js Installer
```bash
# Download from https://nodejs.org/
# Install Node.js 20.x LTS
# Verify installation
node --version
npm --version
```

#### 2. Using Homebrew
```bash
# Install Homebrew if not already installed
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Install Node.js
brew install node@20

# Link specific version
brew link node@20 --force

# Verify
node --version
```

#### 3. Using nvm (Node Version Manager)
```bash
# Install nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash

# Reload shell configuration
source ~/.bash_profile  # or ~/.zshrc

# Install and use Node.js 20
nvm install 20
nvm use 20
nvm alias default 20

# Verify
node --version
```

#### 4. Using MacPorts
```bash
# Install MacPorts from https://www.macports.org/

# Install Node.js
sudo port install nodejs20

# Select version
sudo port select --set nodejs nodejs20
```

### Claude Flow Installation Issues

**Issue: Global installation fails**

```bash
# Error: EACCES permission denied
npm install -g claude-flow-novice
```

**Solutions:**

#### 1. Use npx (Recommended)
```bash
# Instead of global install
npx claude-flow-novice@latest init
npx claude-flow-novice status
```

#### 2. Fix npm permissions
```bash
# Create global directory for npm
mkdir ~/.npm-global
npm config set prefix '~/.npm-global'

# Add to PATH in shell profile
echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.bash_profile
# or for zsh:
echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.zshrc

# Reload shell
source ~/.bash_profile  # or source ~/.zshrc

# Install globally
npm install -g claude-flow-novice
```

#### 3. Use sudo (Not recommended)
```bash
sudo npm install -g claude-flow-novice
```

### Xcode Command Line Tools

**Issue: Build tools not found**

```bash
# Error: No Xcode or CLT version detected
# or: gyp: No Xcode or CLT version detected
```

**Solutions:**

```bash
# Install Xcode Command Line Tools
xcode-select --install

# If already installed, reset
sudo xcode-select --reset

# Check installation
xcode-select -p

# Update if needed
sudo xcode-select --install
```

## Homebrew and Package Management

### Homebrew Issues

**Issue: Homebrew not found or outdated**

**Solutions:**

#### 1. Install or Reinstall Homebrew
```bash
# Check if Homebrew is installed
which brew

# Install Homebrew
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Add to PATH (for Apple Silicon Macs)
echo 'export PATH="/opt/homebrew/bin:$PATH"' >> ~/.zshrc

# Add to PATH (for Intel Macs)
echo 'export PATH="/usr/local/bin:$PATH"' >> ~/.zshrc
```

#### 2. Update Homebrew
```bash
# Update Homebrew
brew update

# Upgrade packages
brew upgrade

# Clean up
brew cleanup
```

#### 3. Fix Homebrew Permissions
```bash
# Fix permissions
sudo chown -R $(whoami) $(brew --prefix)/*

# Fix specific directories
sudo chown -R $(whoami) /opt/homebrew  # Apple Silicon
# or
sudo chown -R $(whoami) /usr/local    # Intel
```

### Apple Silicon (M1/M2) Compatibility

**Issue: Architecture compatibility problems**

**Solutions:**

#### 1. Use ARM64 Native Packages
```bash
# Check architecture
uname -m

# Install ARM64 version of Node.js
brew install node

# Verify architecture
node -e "console.log(process.arch)"  # Should show 'arm64'
```

#### 2. Rosetta 2 for x86_64 Compatibility
```bash
# Install Rosetta 2
sudo softwareupdate --install-rosetta

# Run Terminal in Rosetta mode
# Applications > Terminal > Get Info > Open using Rosetta

# Install x86_64 Homebrew
arch -x86_64 /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Use x86_64 packages when needed
arch -x86_64 brew install package-name
```

#### 3. Multiple Architecture Support
```bash
# Add both paths to shell profile
echo 'export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"' >> ~/.zshrc

# Use specific architecture
arch -arm64 brew install node    # ARM64
arch -x86_64 brew install node   # x86_64
```

## System Integrity Protection (SIP)

### SIP-Related Issues

**Issue: Operation not permitted due to SIP**

**Check SIP Status:**
```bash
csrutil status
```

**Temporarily Disable SIP (Advanced Users Only):**
```bash
# 1. Reboot and hold Command + R to enter Recovery Mode
# 2. Open Terminal from Utilities menu
# 3. Run: csrutil disable
# 4. Reboot normally
# 5. After fixing issues, re-enable: csrutil enable
```

**Work with SIP Enabled (Recommended):**
```bash
# Use user directories instead of system directories
npm config set prefix '~/.npm-global'

# Install packages in user space
pip3 install --user package-name

# Use virtual environments
python3 -m venv ~/.claude-flow-env
source ~/.claude-flow-env/bin/activate
```

### File System Protection

**Issue: Cannot modify certain directories**

**Solutions:**
```bash
# Use ~/Library instead of /Library
mkdir -p ~/Library/Application\ Support/claude-flow

# Use ~/.local instead of /usr/local
mkdir -p ~/.local/bin
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.zshrc

# Use user-specific configurations
claude-flow-novice config set storage.path ~/Documents/claude-flow
```

## Permission and Security

### File and Directory Permissions

**Issue: Permission denied errors**

**Check Permissions:**
```bash
# Check file permissions
ls -la ~/.claude-flow/

# Check if directory is writable
[ -w ~/.claude-flow ] && echo "Writable" || echo "Not writable"
```

**Fix Permissions:**
```bash
# Fix ownership
sudo chown -R $(whoami):staff ~/.claude-flow/

# Fix permissions
chmod -R 755 ~/.claude-flow/
chmod -R 644 ~/.claude-flow/*.json

# Create with proper permissions
install -d -m 755 ~/.claude-flow
install -m 644 /dev/null ~/.claude-flow/config.json
```

### Privacy Permissions

**Issue: Privacy permissions preventing file access**

**Grant Permissions:**
```
1. System Preferences → Security & Privacy → Privacy
2. Select relevant category (Files and Folders, Full Disk Access)
3. Click lock icon and authenticate
4. Add Terminal or your terminal application
5. Restart terminal application
```

**Common Privacy Categories:**
- **Full Disk Access**: For accessing system directories
- **Files and Folders**: For accessing Documents, Downloads, etc.
- **Developer Tools**: For using development tools

### Keychain Access Issues

**Issue: Certificate or credential problems**

**Solutions:**
```bash
# Update certificates
brew install ca-certificates

# Reset keychain (if needed)
security delete-keychain ~/Library/Keychains/login.keychain-db
# Note: This will require re-entering saved passwords

# Trust certificates
sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain cert.pem
```

## Gatekeeper and Code Signing

### Gatekeeper Issues

**Issue: Application cannot be opened due to Gatekeeper**

**Check Gatekeeper Status:**
```bash
spctl --status
```

**Solutions:**

#### 1. Allow Specific Application
```bash
# Allow specific binary
sudo spctl --add /usr/local/bin/claude-flow-novice

# Allow with override
sudo xattr -r -d com.apple.quarantine /usr/local/bin/claude-flow-novice
```

#### 2. System Preferences Method
```
1. System Preferences → Security & Privacy → General
2. Click "Allow Anyway" next to blocked application
3. Try running again
4. Click "Open" when prompted
```

#### 3. Command Line Override
```bash
# Temporarily disable Gatekeeper (not recommended)
sudo spctl --master-disable

# Re-enable Gatekeeper
sudo spctl --master-enable
```

### Code Signing Issues

**Issue: Code signature verification errors**

**Solutions:**
```bash
# Check code signature
codesign -v /usr/local/bin/claude-flow-novice

# Remove quarantine attribute
xattr -d com.apple.quarantine /usr/local/bin/claude-flow-novice

# Sign locally (for development)
codesign -s - /usr/local/bin/claude-flow-novice
```

## Terminal and Shell Issues

### Shell Configuration

**Issue: Commands not found or PATH issues**

**Identify Current Shell:**
```bash
echo $SHELL
```

**Fix PATH Issues:**

#### For bash (~/.bash_profile or ~/.bashrc)
```bash
# Add to ~/.bash_profile
echo 'export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH"' >> ~/.bash_profile
echo 'export PATH="$HOME/.npm-global/bin:$PATH"' >> ~/.bash_profile

# Reload configuration
source ~/.bash_profile
```

#### For zsh (~/.zshrc)
```bash
# Add to ~/.zshrc
echo 'export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH"' >> ~/.zshrc
echo 'export PATH="$HOME/.npm-global/bin:$PATH"' >> ~/.zshrc

# Reload configuration
source ~/.zshrc
```

#### For fish (~/.config/fish/config.fish)
```bash
# Add to ~/.config/fish/config.fish
echo 'set -gx PATH /usr/local/bin /opt/homebrew/bin $PATH' >> ~/.config/fish/config.fish
echo 'set -gx PATH $HOME/.npm-global/bin $PATH' >> ~/.config/fish/config.fish
```

### Terminal App Issues

**Issue: Terminal not working properly**

**Solutions:**

#### 1. Reset Terminal Preferences
```bash
# Delete Terminal preferences
rm ~/Library/Preferences/com.apple.Terminal.plist

# Restart Terminal
```

#### 2. Use Alternative Terminals
```bash
# Install iTerm2
brew install --cask iterm2

# Install Hyper
brew install --cask hyper

# Install Alacritty
brew install --cask alacritty
```

#### 3. Terminal Environment Issues
```bash
# Check environment variables
env | grep -E "PATH|NODE|NPM"

# Reset environment
exec $SHELL -l

# Clear environment
env -i $SHELL
```

### Shell Scripting Issues

**Issue: Scripts not executing properly**

**Solutions:**
```bash
# Make script executable
chmod +x script.sh

# Use full path to interpreter
#!/usr/bin/env bash

# Check shell compatibility
shellcheck script.sh

# Run with specific shell
bash script.sh
zsh script.sh
```

## Network and Firewall

### macOS Firewall

**Check Firewall Status:**
```bash
# Check firewall status
sudo /usr/libexec/ApplicationFirewall/socketfilterfw --getglobalstate

# List firewall rules
sudo /usr/libexec/ApplicationFirewall/socketfilterfw --listapps
```

**Configure Firewall:**
```bash
# Enable firewall
sudo /usr/libexec/ApplicationFirewall/socketfilterfw --setglobalstate on

# Allow specific application
sudo /usr/libexec/ApplicationFirewall/socketfilterfw --add /usr/local/bin/node

# Allow Node.js to accept incoming connections
sudo /usr/libexec/ApplicationFirewall/socketfilterfw --unblock /usr/local/bin/node
```

**System Preferences Method:**
```
1. System Preferences → Security & Privacy → Firewall
2. Click lock icon and authenticate
3. Turn on Firewall
4. Click "Firewall Options"
5. Add applications as needed
```

### Network Configuration

**Issue: Network connectivity problems**

**Diagnostic Commands:**
```bash
# Test connectivity
ping -c 4 google.com

# Check DNS resolution
nslookup api.anthropic.com

# Check routing
netstat -rn

# Check open ports
lsof -i :3001
```

**Network Reset:**
```bash
# Flush DNS cache
sudo dscacheutil -flushcache
sudo killall -HUP mDNSResponder

# Reset network settings (advanced)
sudo route -n flush
sudo ifconfig en0 down
sudo ifconfig en0 up
```

### Proxy Configuration

**Issue: Corporate proxy settings**

**Configure System Proxy:**
```
1. System Preferences → Network
2. Select network interface
3. Click "Advanced"
4. Go to "Proxies" tab
5. Configure HTTP/HTTPS proxy
```

**Configure npm Proxy:**
```bash
# Set npm proxy
npm config set proxy http://proxy.company.com:8080
npm config set https-proxy http://proxy.company.com:8080

# Set environment variables
export HTTP_PROXY=http://proxy.company.com:8080
export HTTPS_PROXY=http://proxy.company.com:8080
export NO_PROXY=localhost,127.0.0.1,.local

# Add to shell profile
echo 'export HTTP_PROXY=http://proxy.company.com:8080' >> ~/.zshrc
```

## macOS-Specific Optimizations

### Performance Tweaks

**Disable Spotlight Indexing for Development Directories:**
```bash
# Add to Spotlight privacy
sudo mdutil -i off /path/to/development/directory

# Or use System Preferences:
# System Preferences → Spotlight → Privacy → Add development folders
```

**Optimize SSD Performance:**
```bash
# Enable TRIM (usually enabled by default)
sudo trimforce enable

# Check TRIM status
system_profiler SPSerialATADataType | grep TRIM
```

### Development Environment

**Install Development Tools:**
```bash
# Essential development tools
brew install git
brew install wget
brew install curl
brew install jq
brew install tree

# Development utilities
brew install --cask visual-studio-code
brew install --cask docker
brew install --cask postman
```

**Configure Git:**
```bash
# Configure Git for macOS
git config --global credential.helper osxkeychain
git config --global core.autocrlf input
```

### System Monitoring

**Monitor System Resources:**
```bash
# Activity Monitor (GUI)
open -a "Activity Monitor"

# Command line monitoring
top -o cpu
top -o mem

# Disk usage
df -h
du -sh ~/.claude-flow

# Process monitoring
ps aux | grep claude-flow
lsof -p $(pgrep node)
```

## Troubleshooting Workflow for macOS

### Step 1: System Check
```bash
# Check macOS version
sw_vers

# Check hardware
system_profiler SPHardwareDataType

# Check available space
df -h

# Check memory
vm_stat
```

### Step 2: Development Environment Check
```bash
# Check Xcode Command Line Tools
xcode-select -p

# Check Homebrew
brew doctor

# Check Node.js and npm
node --version
npm --version
which node
which npm
```

### Step 3: Permission Check
```bash
# Check user permissions
id

# Check directory permissions
ls -la ~/.claude-flow/

# Check System Integrity Protection
csrutil status

# Check Gatekeeper
spctl --status
```

### Step 4: Network Check
```bash
# Test connectivity
ping -c 4 google.com

# Check DNS
scutil --dns

# Check proxy settings
scutil --proxy
```

### Step 5: Application-Specific Check
```bash
# Test Claude Flow installation
npx claude-flow-novice@latest --version

# Check configuration
npx claude-flow-novice@latest config validate

# Test basic functionality
npx claude-flow-novice@latest status
```

---

**Next Steps:**
- [Linux Troubleshooting](./linux-troubleshooting.md)
- [Debug Mode Guide](./debug-mode.md)
- [Log Analysis Guide](./log-analysis.md)