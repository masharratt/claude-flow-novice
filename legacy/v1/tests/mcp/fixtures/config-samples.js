/**
 * MCP Configuration Test Fixtures
 * Pre-defined configuration samples for comprehensive testing
 */

/**
 * Valid MCP configuration samples
 */
export const validConfigurations = {
  // Minimal valid configuration
  minimal: {
    mcpServers: {
      'claude-flow-novice': {
        command: 'npx',
        args: ['claude-flow-novice', 'mcp', 'start']
      }
    }
  },

  // Standard production configuration
  standard: {
    mcpServers: {
      'claude-flow-novice': {
        command: 'npx',
        args: ['claude-flow-novice', 'mcp', 'start'],
        env: {
          NODE_ENV: 'production',
          CLAUDE_FLOW_NOVICE_MODE: 'novice'
        }
      }
    }
  },

  // Multi-server configuration
  multiServer: {
    mcpServers: {
      'claude-flow-novice': {
        command: 'npx',
        args: ['claude-flow-novice', 'mcp', 'start'],
        env: {
          NODE_ENV: 'production'
        }
      },
      'filesystem-server': {
        command: 'npx',
        args: ['@modelcontextprotocol/server-filesystem', '/path/to/files'],
        env: {
          NODE_ENV: 'production'
        }
      },
      'github-server': {
        command: 'npx',
        args: ['@modelcontextprotocol/server-github'],
        env: {
          GITHUB_PERSONAL_ACCESS_TOKEN: 'your_token_here'
        }
      }
    }
  },

  // Development configuration
  development: {
    mcpServers: {
      'claude-flow-novice': {
        command: 'node',
        args: ['./src/mcp/mcp-server-novice.js'],
        env: {
          NODE_ENV: 'development',
          DEBUG: 'true',
          LOG_LEVEL: 'debug'
        }
      }
    }
  },

  // Complex configuration with multiple environment variables
  complex: {
    mcpServers: {
      'claude-flow-novice': {
        command: 'npx',
        args: ['claude-flow-novice', 'mcp', 'start'],
        env: {
          NODE_ENV: 'production',
          CLAUDE_FLOW_NOVICE_MODE: 'novice',
          MAX_AGENTS: '10',
          MEMORY_LIMIT: '512MB',
          TIMEOUT: '30000'
        }
      },
      'database-server': {
        command: 'node',
        args: ['./servers/database-server.js', '--port', '3001'],
        env: {
          DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
          POOL_SIZE: '10',
          SSL_MODE: 'prefer'
        }
      },
      'api-server': {
        command: 'python',
        args: ['-m', 'api_server', '--host', '0.0.0.0', '--port', '8000'],
        env: {
          PYTHON_ENV: 'production',
          API_KEY: 'secret_key_here',
          CORS_ORIGINS: 'https://example.com,https://app.example.com'
        }
      }
    }
  }
};

/**
 * Invalid/broken configuration samples
 */
export const invalidConfigurations = {
  // Missing mcpServers property
  noMcpServers: {
    otherProperty: 'value'
  },

  // Empty mcpServers
  emptyServers: {
    mcpServers: {}
  },

  // Missing command
  missingCommand: {
    mcpServers: {
      'broken-server': {
        args: ['--start']
      }
    }
  },

  // Invalid command type
  invalidCommandType: {
    mcpServers: {
      'broken-server': {
        command: 123,
        args: ['--start']
      }
    }
  },

  // Missing args
  missingArgs: {
    mcpServers: {
      'broken-server': {
        command: 'node'
      }
    }
  },

  // Invalid args type
  invalidArgsType: {
    mcpServers: {
      'broken-server': {
        command: 'node',
        args: 'should-be-array'
      }
    }
  },

  // Invalid environment variables
  invalidEnv: {
    mcpServers: {
      'broken-server': {
        command: 'node',
        args: ['server.js'],
        env: 'should-be-object'
      }
    }
  },

  // Broken JSON structure
  malformedJson: '{"mcpServers": {"broken": {"command"',

  // Non-existent file paths
  nonExistentPaths: {
    mcpServers: {
      'broken-server': {
        command: 'node',
        args: ['/non/existent/path/server.js']
      }
    }
  },

  // Dangerous command injection attempts
  commandInjection: {
    mcpServers: {
      'malicious-server': {
        command: 'node; rm -rf /',
        args: ['server.js']
      }
    }
  },

  // Path traversal attempts
  pathTraversal: {
    mcpServers: {
      'malicious-server': {
        command: 'node',
        args: ['../../../etc/passwd']
      }
    }
  }
};

/**
 * Legacy configuration patterns (common in older setups)
 */
export const legacyConfigurations = {
  // Old claude-flow-novice directory reference
  oldDirectoryReference: {
    mcpServers: {
      'claude-flow-novice': {
        command: 'node',
        args: ['./.claude-flow-novice/src/mcp/mcp-server.js']
      }
    }
  },

  // Absolute path to non-existent installation
  absolutePathReference: {
    mcpServers: {
      'claude-flow-novice': {
        command: 'node',
        args: ['/usr/local/lib/claude-flow-novice/src/mcp/mcp-server.js']
      }
    }
  },

  // Using deprecated server name
  deprecatedServerName: {
    mcpServers: {
      'claude-flow': {
        command: 'npx',
        args: ['claude-flow', 'mcp']
      }
    }
  },

  // Mixed old and new patterns
  mixedPatterns: {
    mcpServers: {
      'claude-flow-novice': {
        command: 'node',
        args: ['./.claude-flow-novice/src/mcp/mcp-server.js']
      },
      'new-server': {
        command: 'npx',
        args: ['claude-flow-novice', 'mcp', 'start']
      }
    }
  }
};

/**
 * Performance test configurations
 */
export const performanceConfigurations = {
  // Large number of servers
  manyServers: (count = 1000) => {
    const servers = {};
    for (let i = 0; i < count; i++) {
      servers[`server-${i}`] = {
        command: 'node',
        args: [`server-${i}.js`, '--port', `${3000 + i}`],
        env: {
          NODE_ENV: 'production',
          PORT: `${3000 + i}`,
          SERVER_ID: `server-${i}`
        }
      };
    }
    return { mcpServers: servers };
  },

  // Deep nesting
  deeplyNested: (depth = 10) => {
    const createNestedConfig = (currentDepth) => {
      if (currentDepth >= depth) {
        return { value: `depth-${currentDepth}` };
      }
      return {
        [`level-${currentDepth}`]: createNestedConfig(currentDepth + 1),
        [`array-${currentDepth}`]: new Array(5).fill(null).map((_, i) => ({
          index: i,
          data: `data-${currentDepth}-${i}`,
          nested: currentDepth < depth - 2 ? createNestedConfig(currentDepth + 2) : null
        }))
      };
    };

    return {
      mcpServers: {
        'deep-server': {
          command: 'node',
          args: ['server.js'],
          config: createNestedConfig(0)
        }
      }
    };
  },

  // Large strings
  largeStrings: {
    mcpServers: {
      'large-config-server': {
        command: 'node',
        args: ['server.js'],
        env: {
          LARGE_CONFIG: 'A'.repeat(100000), // 100KB string
          ANOTHER_LARGE: 'B'.repeat(50000),   // 50KB string
          DESCRIPTION: 'Lorem ipsum dolor sit amet, '.repeat(1000) // Long description
        }
      }
    }
  },

  // Unicode and special characters
  unicodeContent: {
    mcpServers: {
      '测试服务器': {
        command: 'node',
        args: ['服务器.js'],
        env: {
          '环境变量': '测试值',
          'EMOJI_VAR': '🚀🎉💻🔧⚡️',
          'SPECIAL_CHARS': '!@#$%^&*()[]{}|\\:";\'<>?,./',
          'ACCENTS': 'àáâãäåæçèéêëìíîïðñòóôõöøùúûüýþÿ'
        }
      }
    }
  }
};

/**
 * Security test configurations
 */
export const securityConfigurations = {
  // Command injection attempts
  commandInjectionAttempts: [
    {
      mcpServers: {
        'injection-1': {
          command: 'node; echo "INJECTED"',
          args: ['server.js']
        }
      }
    },
    {
      mcpServers: {
        'injection-2': {
          command: 'node',
          args: ['server.js', '; cat /etc/passwd']
        }
      }
    },
    {
      mcpServers: {
        'injection-3': {
          command: 'node',
          args: ['server.js'],
          env: {
            'MALICIOUS': '; rm -rf /'
          }
        }
      }
    }
  ],

  // Path traversal attempts
  pathTraversalAttempts: [
    {
      mcpServers: {
        'traversal-1': {
          command: 'node',
          args: ['../../../etc/passwd']
        }
      }
    },
    {
      mcpServers: {
        'traversal-2': {
          command: 'node',
          args: ['..\\..\\..\\windows\\system32\\config\\sam']
        }
      }
    },
    {
      mcpServers: {
        'traversal-3': {
          command: 'node',
          args: ['%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd']
        }
      }
    }
  ],

  // Environment variable injection
  envInjectionAttempts: [
    {
      mcpServers: {
        'env-injection-1': {
          command: 'node',
          args: ['server.js'],
          env: {
            'PATH': '/tmp:$PATH'
          }
        }
      }
    },
    {
      mcpServers: {
        'env-injection-2': {
          command: 'node',
          args: ['server.js'],
          env: {
            'LD_PRELOAD': '/tmp/malicious.so'
          }
        }
      }
    },
    {
      mcpServers: {
        'env-injection-3': {
          command: 'node',
          args: ['server.js'],
          env: {
            'NODE_OPTIONS': '--inspect=0.0.0.0:9229'
          }
        }
      }
    }
  ]
};

/**
 * Real-world configuration samples from common setups
 */
export const realWorldConfigurations = {
  // Typical development setup
  typicalDevelopment: {
    mcpServers: {
      'claude-flow-novice': {
        command: 'npx',
        args: ['claude-flow-novice', 'mcp', 'start'],
        env: {
          NODE_ENV: 'development',
          DEBUG: '*'
        }
      },
      'filesystem': {
        command: 'npx',
        args: ['@modelcontextprotocol/server-filesystem', './src'],
        env: {
          NODE_ENV: 'development'
        }
      }
    }
  },

  // Production enterprise setup
  enterpriseProduction: {
    mcpServers: {
      'claude-flow-novice': {
        command: 'npx',
        args: ['claude-flow-novice', 'mcp', 'start'],
        env: {
          NODE_ENV: 'production',
          CLAUDE_FLOW_NOVICE_MODE: 'enterprise',
          MAX_AGENTS: '50',
          MEMORY_LIMIT: '2GB',
          LOG_LEVEL: 'info'
        }
      },
      'database': {
        command: 'node',
        args: ['./enterprise/database-mcp-server.js'],
        env: {
          DATABASE_URL: 'postgresql://user:pass@db.internal:5432/enterprise',
          POOL_SIZE: '20',
          CONNECTION_TIMEOUT: '30000'
        }
      },
      'auth': {
        command: 'python',
        args: ['-m', 'enterprise.auth_server'],
        env: {
          LDAP_URL: 'ldap://auth.internal:389',
          JWT_SECRET: 'enterprise_secret_key',
          SESSION_TIMEOUT: '3600'
        }
      }
    }
  },

  // CI/CD environment
  cicdEnvironment: {
    mcpServers: {
      'claude-flow-novice': {
        command: 'npx',
        args: ['claude-flow-novice', 'mcp', 'start'],
        env: {
          NODE_ENV: 'test',
          CI: 'true',
          TEST_MODE: 'integration',
          HEADLESS: 'true'
        }
      },
      'test-runner': {
        command: 'node',
        args: ['./ci/test-mcp-server.js'],
        env: {
          TEST_DATABASE_URL: 'sqlite:///:memory:',
          PARALLEL_TESTS: '4',
          COVERAGE_THRESHOLD: '80'
        }
      }
    }
  }
};

/**
 * State transition test scenarios
 */
export const stateTransitions = {
  // From broken to fixed
  brokenToFixed: {
    before: {
      mcpServers: {
        'claude-flow-novice': {
          command: 'node',
          args: ['./.claude-flow-novice/src/mcp/mcp-server.js']
        }
      }
    },
    after: {
      mcpServers: {
        'claude-flow-novice': {
          command: 'npx',
          args: ['claude-flow-novice', 'mcp', 'start']
        }
      }
    }
  },

  // Adding new server
  addingServer: {
    before: {
      mcpServers: {
        'existing-server': {
          command: 'node',
          args: ['existing.js']
        }
      }
    },
    after: {
      mcpServers: {
        'existing-server': {
          command: 'node',
          args: ['existing.js']
        },
        'claude-flow-novice': {
          command: 'npx',
          args: ['claude-flow-novice', 'mcp', 'start']
        }
      }
    }
  },

  // Removing conflicting server
  removingConflict: {
    before: {
      local: {
        mcpServers: {
          'claude-flow-novice': {
            command: 'node',
            args: ['old-server.js']
          }
        }
      },
      project: {
        mcpServers: {
          'claude-flow-novice': {
            command: 'npx',
            args: ['claude-flow-novice', 'mcp', 'start']
          }
        }
      }
    },
    after: {
      local: {
        mcpServers: {}
      },
      project: {
        mcpServers: {
          'claude-flow-novice': {
            command: 'npx',
            args: ['claude-flow-novice', 'mcp', 'start']
          }
        }
      }
    }
  }
};

/**
 * Helper functions for working with fixtures
 */
export const fixtureHelpers = {
  /**
   * Create a configuration with specific number of servers
   */
  createConfigWithServerCount(count, baseConfig = {}) {
    const servers = {};
    for (let i = 0; i < count; i++) {
      servers[`test-server-${i}`] = {
        command: 'node',
        args: [`server-${i}.js`],
        ...baseConfig
      };
    }
    return { mcpServers: servers };
  },

  /**
   * Merge multiple configurations
   */
  mergeConfigurations(...configs) {
    const merged = { mcpServers: {} };
    for (const config of configs) {
      if (config.mcpServers) {
        Object.assign(merged.mcpServers, config.mcpServers);
      }
    }
    return merged;
  },

  /**
   * Create configuration with specific issues
   */
  createConfigWithIssues(issues = []) {
    const servers = {};

    if (issues.includes('missing-command')) {
      servers['broken-missing-command'] = {
        args: ['server.js']
      };
    }

    if (issues.includes('missing-args')) {
      servers['broken-missing-args'] = {
        command: 'node'
      };
    }

    if (issues.includes('non-existent-path')) {
      servers['broken-path'] = {
        command: 'node',
        args: ['/non/existent/path/server.js']
      };
    }

    if (issues.includes('legacy-pattern')) {
      servers['legacy-server'] = {
        command: 'node',
        args: ['./.claude-flow-novice/src/mcp/mcp-server.js']
      };
    }

    return { mcpServers: servers };
  },

  /**
   * Validate configuration structure
   */
  validateConfiguration(config) {
    const errors = [];

    if (!config || typeof config !== 'object') {
      errors.push('Configuration must be an object');
      return errors;
    }

    if (!config.mcpServers) {
      errors.push('Configuration must have mcpServers property');
      return errors;
    }

    if (typeof config.mcpServers !== 'object') {
      errors.push('mcpServers must be an object');
      return errors;
    }

    for (const [name, server] of Object.entries(config.mcpServers)) {
      if (!server.command) {
        errors.push(`Server '${name}' missing command`);
      }

      if (server.args && !Array.isArray(server.args)) {
        errors.push(`Server '${name}' args must be an array`);
      }

      if (server.env && typeof server.env !== 'object') {
        errors.push(`Server '${name}' env must be an object`);
      }
    }

    return errors;
  }
};

export default {
  validConfigurations,
  invalidConfigurations,
  legacyConfigurations,
  performanceConfigurations,
  securityConfigurations,
  realWorldConfigurations,
  stateTransitions,
  fixtureHelpers
};