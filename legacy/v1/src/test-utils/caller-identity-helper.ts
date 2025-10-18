/**
 * Test Utility: Caller Identity Helper
 *
 * Provides standardized test caller identity objects for agent coordination tests.
 * Prevents "callerIdentity parameter not provided" errors in test suites.
 */

export interface CallerIdentity {
  type: 'admin' | 'agent' | 'system' | 'user';
  id: string;
  roles: string[];
  permissions?: string[];
  metadata?: Record<string, any>;
}

/**
 * Create a test caller identity with specified type and roles
 *
 * @param type - Caller type (admin, agent, system, user)
 * @param roles - Array of role names
 * @returns CallerIdentity object for testing
 *
 * @example
 * ```typescript
 * const caller = createTestCallerIdentity('admin', ['admin', 'coordinator']);
 * await queenAgent.spawnWorker(config, caller);
 * ```
 */
export function createTestCallerIdentity(
  type: 'admin' | 'agent' | 'system' | 'user' = 'admin',
  roles: string[] = ['admin']
): CallerIdentity {
  return {
    type,
    id: `test-${type}-${Date.now()}`,
    roles,
    permissions: type === 'admin' ? ['*'] : ['read', 'execute'],
    metadata: {
      testContext: true,
      createdAt: new Date().toISOString(),
    },
  };
}

/**
 * Create an admin caller identity (full permissions)
 */
export function createAdminCaller(): CallerIdentity {
  return createTestCallerIdentity('admin', ['admin', 'coordinator']);
}

/**
 * Create an agent caller identity (standard agent permissions)
 */
export function createAgentCaller(agentId?: string): CallerIdentity {
  return {
    type: 'agent',
    id: agentId || `test-agent-${Date.now()}`,
    roles: ['agent', 'worker'],
    permissions: ['read', 'execute', 'report'],
    metadata: {
      testContext: true,
      createdAt: new Date().toISOString(),
    },
  };
}

/**
 * Create a system caller identity (system-level operations)
 */
export function createSystemCaller(): CallerIdentity {
  return createTestCallerIdentity('system', ['system', 'monitor']);
}

/**
 * Create a restricted user caller identity (limited permissions)
 */
export function createUserCaller(): CallerIdentity {
  return {
    type: 'user',
    id: `test-user-${Date.now()}`,
    roles: ['user'],
    permissions: ['read'],
    metadata: {
      testContext: true,
      createdAt: new Date().toISOString(),
    },
  };
}
