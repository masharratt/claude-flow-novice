#!/bin/bash
# CFN Docker Monitoring Dashboard Startup Script

set -e

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 Starting CFN Docker Monitoring Dashboard${NC}"
echo "=================================================="

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js is not installed. Please install Node.js 16+ to run the dashboard.${NC}"
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node --version | cut -d'v' -f2)
REQUIRED_VERSION="16.0.0"

if [ "$(printf '%s\n' "$REQUIRED_VERSION" "$NODE_VERSION" | sort -V | head -n1)" != "$REQUIRED_VERSION" ]; then
    echo -e "${RED}❌ Node.js version $NODE_VERSION is too old. Please install Node.js 16+${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Node.js version $NODE_VERSION detected${NC}"

# Check if we're in the monitoring directory
if [ ! -f "package.json" ] || [ ! -f "server.js" ]; then
    echo -e "${RED}❌ Please run this script from the monitoring/ directory${NC}"
    exit 1
fi

# Check if dependencies are installed
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}📦 Installing dependencies...${NC}"
    npm install
    echo -e "${GREEN}✅ Dependencies installed${NC}"
else
    echo -e "${GREEN}✅ Dependencies already installed${NC}"
fi

# Check if Docker is running
if ! docker info &> /dev/null; then
    echo -e "${YELLOW}⚠️  Docker is not running. Some dashboard features may not work.${NC}"
fi

# Check if Redis is accessible
if redis-cli ping &> /dev/null; then
    echo -e "${GREEN}✅ Redis connection established${NC}"
else
    echo -e "${YELLOW}⚠️  Redis is not accessible on localhost:6379. CFN metrics will show default values.${NC}"
fi

echo ""
echo -e "${BLUE}🎯 Starting monitoring server...${NC}"
echo ""

# Start the server
if command -v nodemon &> /dev/null && [ "$1" = "--dev" ]; then
    echo -e "${YELLOW}🛠️  Development mode with auto-reload${NC}"
    npm run dev
else
    echo -e "${GREEN}🚀 Production mode${NC}"
    npm start
fi