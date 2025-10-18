FROM node:20-alpine

# Install dependencies for CLI coordination testing
RUN apk add --no-cache \
    bash \
    coreutils \
    findutils \
    grep \
    jq

# Create working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY . .

# Create test directory
RUN mkdir -p /app/tests/environment-validation

# Set default command
CMD ["/bin/bash"]
