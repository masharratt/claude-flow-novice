# Windows Troubleshooting Guide

This guide covers Windows-specific issues and solutions for Claude Flow.

## Table of Contents

1. [Windows Installation Issues](#windows-installation-issues)
2. [PowerShell and Command Prompt](#powershell-and-command-prompt)
3. [Windows Subsystem for Linux (WSL)](#windows-subsystem-for-linux-wsl)
4. [Path and Environment Issues](#path-and-environment-issues)
5. [Permission and Security](#permission-and-security)
6. [Windows Defender and Antivirus](#windows-defender-and-antivirus)
7. [Network and Firewall](#network-and-firewall)

## Windows Installation Issues

### Node.js Installation Problems

**Issue: Node.js not found or wrong version**

**Solutions:**

#### 1. Official Node.js Installer
```powershell
# Download from https://nodejs.org/
# Install Node.js 20.x LTS
# Verify installation
node --version
npm --version
```

#### 2. Using Chocolatey
```powershell
# Install Chocolatey first
Set-ExecutionPolicy Bypass -Scope Process -Force
[System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072
iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))

# Install Node.js
choco install nodejs

# Verify
node --version
```

#### 3. Using winget
```powershell
# Install using Windows Package Manager
winget install OpenJS.NodeJS

# Verify
node --version
```

#### 4. Using nvm-windows
```powershell
# Download from https://github.com/coreybutler/nvm-windows
# Install nvm-windows
nvm install 20.0.0
nvm use 20.0.0
```

### Claude Flow Installation Issues

**Issue: Global installation fails**

```powershell
# Error: EACCES permission denied
npm install -g claude-flow-novice
```

**Solutions:**

#### 1. Use npx (Recommended)
```powershell
# Instead of global install
npx claude-flow-novice@latest init
npx claude-flow-novice status
```

#### 2. Fix npm permissions
```powershell
# Create global directory for npm
mkdir "$env:APPDATA\npm"
npm config set prefix "$env:APPDATA\npm"

# Add to PATH
$env:PATH += ";$env:APPDATA\npm"

# Install globally
npm install -g claude-flow-novice
```

#### 3. Run as Administrator
```powershell
# Right-click PowerShell -> "Run as administrator"
npm install -g claude-flow-novice
```

### Long Path Issues

**Issue: `ENAMETOOLONG` or path too long errors**

**Solutions:**

#### 1. Enable Long Path Support
```powershell
# Run as Administrator
New-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem" -Name "LongPathsEnabled" -Value 1 -PropertyType DWORD -Force

# Or use Group Policy:
# Computer Configuration > Administrative Templates > System > Filesystem > Enable Win32 long paths
```

#### 2. Use Shorter Paths
```powershell
# Move project to shorter path
mkdir C:\dev
cd C:\dev
git clone https://github.com/masharratt/claude-flow-novice.git
cd claude-flow-novice
```

#### 3. Junction Links
```powershell
# Create junction for long paths
mklink /J C:\cf "C:\very\long\path\to\claude-flow-novice"
cd C:\cf
```

## PowerShell and Command Prompt

### PowerShell Execution Policy

**Issue: `cannot be loaded because running scripts is disabled`**

**Check Current Policy:**
```powershell
Get-ExecutionPolicy
```

**Solutions:**

#### 1. Set Execution Policy for Current User
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

#### 2. Bypass for Single Command
```powershell
PowerShell -ExecutionPolicy Bypass -Command "claude-flow-novice status"
```

#### 3. Unblock Downloaded Scripts
```powershell
# If downloaded, unblock the script
Unblock-File -Path "path\to\script.ps1"
```

### Command Line Encoding Issues

**Issue: Unicode characters not displaying correctly**

**Solutions:**

#### 1. Set UTF-8 Encoding
```powershell
# PowerShell
$OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

# Command Prompt
chcp 65001
```

#### 2. Use Windows Terminal
```powershell
# Install Windows Terminal from Microsoft Store
# Or use winget
winget install Microsoft.WindowsTerminal

# Configure UTF-8 support in settings
```

### PowerShell vs Command Prompt

**Quoting Differences:**

#### PowerShell
```powershell
# PowerShell quoting
claude-flow-novice sparc run "Create user system"
claude-flow-novice sparc run 'Create "user" system'

# Escape characters
claude-flow-novice sparc run "Create `"user`" system"
```

#### Command Prompt
```cmd
REM Command Prompt quoting
claude-flow-novice sparc run "Create user system"
claude-flow-novice sparc run "Create \"user\" system"
```

### Environment Variables

#### PowerShell
```powershell
# Set environment variables
$env:CLAUDE_FLOW_CONFIG = "C:\path\to\config.json"
$env:NODE_ENV = "development"

# Persistent setting
[Environment]::SetEnvironmentVariable("CLAUDE_FLOW_CONFIG", "C:\path\to\config.json", "User")
```

#### Command Prompt
```cmd
REM Set environment variables
set CLAUDE_FLOW_CONFIG=C:\path\to\config.json
set NODE_ENV=development

REM Persistent setting
setx CLAUDE_FLOW_CONFIG "C:\path\to\config.json"
```

## Windows Subsystem for Linux (WSL)

### Using Claude Flow in WSL

**Install WSL:**
```powershell
# Install WSL
wsl --install

# Install specific distribution
wsl --install -d Ubuntu-22.04

# Update WSL
wsl --update
```

**Setup in WSL:**
```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install Claude Flow
npx claude-flow-novice@latest init
```

### WSL File System Access

**Access Windows files from WSL:**
```bash
# Windows drives are mounted under /mnt/
cd /mnt/c/Users/username/Documents/project
npx claude-flow-novice status
```

**Access WSL files from Windows:**
```powershell
# Use \\wsl$ path
cd \\wsl$\Ubuntu-22.04\home\username\project
# Or use File Explorer: \\wsl$\Ubuntu-22.04\
```

### WSL Performance Optimization

```bash
# Use WSL 2 for better performance
wsl --set-version Ubuntu-22.04 2

# Store project files in WSL filesystem
mkdir ~/claude-flow-projects
cd ~/claude-flow-projects
```

### Common WSL Issues

#### 1. Network Connectivity
```bash
# Check DNS resolution
nslookup google.com

# Fix DNS if needed
echo "nameserver 8.8.8.8" | sudo tee /etc/resolv.conf
```

#### 2. File Permissions
```bash
# Fix file permissions
chmod +x node_modules/.bin/claude-flow-novice

# Set proper umask
echo "umask 022" >> ~/.bashrc
```

## Path and Environment Issues

### PATH Configuration

**Check Current PATH:**
```powershell
# PowerShell
$env:PATH -split ';'

# Command Prompt
echo %PATH%
```

**Add to PATH:**

#### 1. Temporary (Current Session)
```powershell
# PowerShell
$env:PATH += ";C:\path\to\add"

# Command Prompt
set PATH=%PATH%;C:\path\to\add
```

#### 2. Permanent (User)
```powershell
# PowerShell
$currentPath = [Environment]::GetEnvironmentVariable("PATH", "User")
[Environment]::SetEnvironmentVariable("PATH", "$currentPath;C:\path\to\add", "User")

# Command Prompt
setx PATH "%PATH%;C:\path\to\add"
```

#### 3. Using System Properties
```
1. Win + R -> sysdm.cpl
2. Advanced tab -> Environment Variables
3. Edit PATH variable
4. Add new path
5. OK and restart applications
```

### npm Global Path Issues

**Check npm global path:**
```powershell
npm config get prefix
npm root -g
```

**Fix npm global path:**
```powershell
# Set npm prefix to user directory
npm config set prefix "$env:APPDATA\npm"

# Add to PATH
$env:PATH += ";$env:APPDATA\npm"
```

### Node.js Path Issues

**Multiple Node.js versions:**
```powershell
# Check which Node.js is being used
where node
where npm

# Use nvm-windows to manage versions
nvm list
nvm use 20.0.0
```

## Permission and Security

### File and Directory Permissions

**Check permissions:**
```powershell
# Check file permissions
Get-Acl "C:\path\to\file" | Format-Table

# Check if file is writable
Test-Path "C:\path\to\file" -PathType Leaf
```

**Fix permissions:**
```powershell
# Take ownership
takeown /f "C:\path\to\directory" /r /d y

# Grant full control
icacls "C:\path\to\directory" /grant:r "$env:USERNAME:(OI)(CI)F" /t
```

### UAC (User Account Control)

**Running with elevated privileges:**
```powershell
# Check if running as administrator
([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")

# Run specific command as administrator
Start-Process powershell -Verb RunAs -ArgumentList "claude-flow-novice status"
```

**Bypass UAC for specific application:**
```
1. Task Scheduler -> Create Task
2. General tab -> Run with highest privileges
3. Actions -> Start a program -> PowerShell
4. Arguments: -Command "claude-flow-novice status"
```

### Windows Security

**SmartScreen issues:**
```powershell
# If Windows blocks execution
# Click "More info" -> "Run anyway"

# Or disable SmartScreen (not recommended)
# Windows Security -> App & browser control -> Reputation-based protection
```

## Windows Defender and Antivirus

### Windows Defender Real-time Protection

**Issue: Slow file operations or blocks**

**Solutions:**

#### 1. Add Exclusions
```powershell
# Add folder exclusion
Add-MpPreference -ExclusionPath "C:\dev\claude-flow-novice"
Add-MpPreference -ExclusionPath "$env:APPDATA\npm"

# Add process exclusion
Add-MpPreference -ExclusionProcess "node.exe"
Add-MpPreference -ExclusionProcess "npm.exe"
```

#### 2. Temporarily Disable (Testing only)
```powershell
# Disable real-time protection (as Administrator)
Set-MpPreference -DisableRealtimeMonitoring $true

# Re-enable
Set-MpPreference -DisableRealtimeMonitoring $false
```

### Third-party Antivirus

**Common issues:**
- File access blocked
- Network connections blocked
- Process execution prevented

**Solutions:**
1. Add Claude Flow directories to antivirus exclusions
2. Allow node.exe and npm.exe in firewall
3. Whitelist Claude Flow network connections

## Network and Firewall

### Windows Firewall

**Check firewall status:**
```powershell
# Check firewall profiles
Get-NetFirewallProfile

# Check if specific port is blocked
Test-NetConnection -ComputerName localhost -Port 3001
```

**Configure firewall:**
```powershell
# Allow inbound connection for Node.js
New-NetFirewallRule -DisplayName "Node.js" -Direction Inbound -Protocol TCP -LocalPort 3001 -Action Allow

# Allow specific program
New-NetFirewallRule -DisplayName "Claude Flow" -Direction Inbound -Program "C:\path\to\node.exe" -Action Allow
```

### Proxy Configuration

**Corporate proxy setup:**
```powershell
# Set npm proxy
npm config set proxy http://proxy.company.com:8080
npm config set https-proxy http://proxy.company.com:8080

# Set environment variables
$env:HTTP_PROXY = "http://proxy.company.com:8080"
$env:HTTPS_PROXY = "http://proxy.company.com:8080"

# Configure Claude Flow proxy
claude-flow-novice config set network.proxy.http "http://proxy.company.com:8080"
```

**Bypass proxy for local connections:**
```powershell
npm config set noproxy "localhost,127.0.0.1,.local"
$env:NO_PROXY = "localhost,127.0.0.1,.local"
```

### DNS Issues

**Check DNS resolution:**
```powershell
# Test DNS resolution
Resolve-DnsName google.com
nslookup api.anthropic.com

# Flush DNS cache
ipconfig /flushdns

# Use alternative DNS
# Change DNS to 8.8.8.8 and 8.8.4.4 in network settings
```

## Windows-Specific Optimizations

### Performance Tweaks

**Disable Windows Search indexing for development directories:**
```powershell
# Exclude from indexing
Get-WmiObject -Class Win32_Volume | Where-Object {$_.DriveLetter -eq "C:"} | Set-WmiInstance -Arguments @{IndexingEnabled=$false}
```

**SSD optimization:**
```powershell
# Disable defragmentation for SSD
Disable-ScheduledTask -TaskName "Microsoft\Windows\Defrag\ScheduledDefrag"

# Enable TRIM
fsutil behavior set DisableDeleteNotify 0
```

### Developer Mode

**Enable Developer Mode:**
```
1. Settings -> Update & Security -> For developers
2. Select "Developer mode"
3. Restart if prompted
```

**Benefits:**
- Symbolic link creation without admin rights
- Improved file system performance
- Better debugging capabilities

### Windows Terminal Configuration

**Install Windows Terminal:**
```powershell
winget install Microsoft.WindowsTerminal
```

**Configure for Claude Flow:**
```json
{
    "profiles": {
        "defaults": {
            "fontFace": "Cascadia Code",
            "fontSize": 12,
            "colorScheme": "Campbell"
        },
        "list": [
            {
                "name": "Claude Flow Dev",
                "commandline": "powershell.exe -NoExit -Command \"cd C:\\dev\\claude-flow-novice; Write-Host 'Claude Flow Development Environment' -ForegroundColor Green\"",
                "startingDirectory": "C:\\dev\\claude-flow-novice"
            }
        ]
    }
}
```

## Troubleshooting Workflow for Windows

### Step 1: Environment Check
```powershell
# Check Windows version
winver

# Check PowerShell version
$PSVersionTable.PSVersion

# Check Node.js and npm
node --version
npm --version

# Check PATH
$env:PATH -split ';' | Where-Object {$_ -like "*node*" -or $_ -like "*npm*"}
```

### Step 2: Permission Check
```powershell
# Check if running as admin
([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")

# Check execution policy
Get-ExecutionPolicy

# Check file permissions
Get-Acl "$env:APPDATA\npm" | Format-Table
```

### Step 3: Network Check
```powershell
# Test internet connectivity
Test-NetConnection google.com -Port 443

# Test npm registry
npm ping

# Check proxy settings
npm config get proxy
npm config get https-proxy
```

### Step 4: Antivirus Check
```powershell
# Check Windows Defender status
Get-MpPreference | Select-Object DisableRealtimeMonitoring, ExclusionPath, ExclusionProcess

# Check firewall
Get-NetFirewallProfile | Select-Object Name, Enabled
```

### Step 5: Installation Verification
```powershell
# Try npx installation
npx claude-flow-novice@latest --version

# Test basic functionality
npx claude-flow-novice@latest status

# Check for errors
npx claude-flow-novice@latest config validate
```

---

**Next Steps:**
- [macOS Troubleshooting](./macos-troubleshooting.md)
- [Linux Troubleshooting](./linux-troubleshooting.md)
- [Debug Mode Guide](./debug-mode.md)