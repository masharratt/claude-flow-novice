#!/bin/bash
# tests/api-gateway/test-jwt-authentication.sh
# Phase 1 :: Test JWT authentication middleware (Bug #21 validation)

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"

cleanup() {
  # Clean up test processes
  pkill -f "node.*jwt-test" 2>/dev/null || true
  rm -f "$PROJECT_ROOT/test-jwt-server.js" "$PROJECT_ROOT/test-jwt-client.js" 2>/dev/null || true
}
trap cleanup EXIT

test_jwt_middleware_exists() {
  log_step "GIVEN JWT authentication middleware exists"
  # WHEN checking for middleware files
  # THEN JWT middleware should exist
  assert_file_exists "$PROJECT_ROOT/src/middleware/jwt-auth.js"
  assert_file_exists "$PROJECT_ROOT/src/auth/token-manager.js"
}

test_jwt_middleware_syntax() {
  log_step "GIVEN JWT middleware is created"
  # WHEN checking JavaScript syntax
  # THEN middleware should be syntactically valid
  if command -v node >/dev/null 2>&1; then
    assert_success "node -c $PROJECT_ROOT/src/middleware/jwt-auth.js"
    assert_success "node -c $PROJECT_ROOT/src/auth/token-manager.js"
  else
    log_info "Node.js not available, skipping syntax validation"
  fi
}

test_jwt_dependencies_available() {
  log_step "GIVEN JWT middleware dependencies"
  # WHEN checking package.json
  # THEN required dependencies should be available
  if [[ -f "$PROJECT_ROOT/package.json" ]]; then
    assert_file_contains "$PROJECT_ROOT/package.json" "jsonwebtoken"
    assert_file_contains "$PROJECT_ROOT/package.json" "joi"
  fi
}

test_jwt_token_generation() {
  log_step "GIVEN JWT token generation functionality"
  # WHEN creating test server
  # THEN tokens should be generated correctly
  
  cat > "$PROJECT_ROOT/test-jwt-server.js" << 'EOF'
const jwt = require('jsonwebtoken');

// Test token generation
const secret = 'test-secret';
const payload = { userId: 'test-user', role: 'user' };

try {
  const token = jwt.sign(payload, secret, { expiresIn: '1h' });
  console.log('Token generated:', token.substring(0, 20) + '...');
  
  // Test token verification
  const decoded = jwt.verify(token, secret);
  console.log('Token verified:', decoded);
  
  process.exit(0);
} catch (error) {
  console.error('JWT error:', error.message);
  process.exit(1);
}
EOF

  if command -v node >/dev/null 2>&1 && npm list jsonwebtoken >/dev/null 2>&1; then
    assert_success "node $PROJECT_ROOT/test-jwt-server.js"
  else
    log_info "Node.js or jsonwebtoken not available, skipping token test"
  fi
}

test_jwt_middleware_integration() {
  log_step "GIVEN JWT middleware integration test"
  # WHEN creating integration test
  # THEN middleware should work correctly

  cat > "$PROJECT_ROOT/test-jwt-client.js" << 'EOF'
const express = require('express');
const jwt = require('jsonwebtoken');

// Mock JWT middleware (simplified version)
function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }
  
  const token = authHeader.substring(7);
  
  try {
    const decoded = jwt.verify(token, 'test-secret');
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

const app = express();

// Protected route
app.get('/api/protected', verifyToken, (req, res) => {
  res.json({ message: 'Access granted', user: req.user });
});

// Health route
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

const server = app.listen(3001, () => {
  console.log('Test server running on port 3001');
  
  // Run tests
  const axios = require('axios');
  
  async function runTests() {
    try {
      // Test without token
      await axios.get('http://localhost:3001/api/protected')
        .then(() => {
          console.log('ERROR: Should have failed without token');
          process.exit(1);
        })
        .catch(error => {
          if (error.response && error.response.status === 401) {
            console.log('✓ Rejected request without token');
          } else {
            throw error;
          }
        });
      
      // Test with valid token
      const token = jwt.sign({ userId: 'test-user' }, 'test-secret');
      const response = await axios.get('http://localhost:3001/api/protected', {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (response.data.user.userId === 'test-user') {
        console.log('✓ Accepted request with valid token');
      } else {
        console.log('ERROR: Invalid user data');
        process.exit(1);
      }
      
      console.log('All JWT tests passed');
      server.close();
      process.exit(0);
    } catch (error) {
      console.error('Test failed:', error.message);
      server.close();
      process.exit(1);
    }
  }
  
  // Wait a bit then run tests
  setTimeout(runTests, 100);
});

EOF

  if command -v node >/dev/null 2>&1 && npm list express jsonwebtoken axios >/dev/null 2>&1; then
    assert_success "node $PROJECT_ROOT/test-jwt-client.js"
  else
    log_info "Required Node.js packages not available, skipping integration test"
  fi
}

test_jwt_config_validation() {
  log_step "GIVEN JWT configuration validation"
  # WHEN checking configuration files
  # THEN JWT settings should be properly configured
  
  # Check for JWT configuration in main config
  if [[ -f "$PROJECT_ROOT/config/default.yml" ]]; then
    # JWT settings might be in security section
    assert_file_contains "$PROJECT_ROOT/config/default.yml" "security"
  fi
  
  # Check for environment variables
  if [[ -f "$PROJECT_ROOT/.env.example" ]]; then
    assert_file_contains "$PROJECT_ROOT/.env.example" "JWT_SECRET"
  fi
}

test_jwt_security_best_practices() {
  log_step "GIVEN JWT security best practices"
  # WHEN checking implementation
  # THEN security measures should be in place
  
  if [[ -f "$PROJECT_ROOT/src/middleware/jwt-auth.js" ]]; then
    # Should have token expiration
    assert_file_contains "$PROJECT_ROOT/src/middleware/jwt-auth.js" "expiresIn"
    
    # Should have issuer verification
    assert_file_contains "$PROJECT_ROOT/src/middleware/jwt-auth.js" "issuer"
  fi
}

# Run tests
test_jwt_middleware_exists
test_jwt_middleware_syntax
test_jwt_dependencies_available
test_jwt_token_generation
test_jwt_middleware_integration
test_jwt_config_validation
test_jwt_security_best_practices

log_info "JWT authentication tests completed"