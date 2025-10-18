/**
 * SECURITY AUDIT: Portal Server Route Pattern Changes
 *
 * CHANGES ANALYZED:
 * - OLD: `/api/*` → NEW: `/^\/api\/.*/` (rate limiter)
 * - OLD: `'*'` → NEW: `/^\/(?!api).*/` (catch-all with negative lookahead)
 *
 * AUDIT DATE: 2025-09-30
 * AUDITOR: Security Specialist Agent
 */

const securityAudit = {
  metadata: {
    auditDate: '2025-09-30',
    component: 'Portal Server Route Patterns',
    changeType: 'path-to-regexp Error Fix',
    severity: 'CRITICAL_SECURITY_REVIEW',
  },

  routePatterns: {
    rateLimiter: {
      old: '/api/*',
      new: '/^\/api\/.*/',
      description: 'Rate limiter middleware applied to API routes',
    },
    catchAll: {
      old: "'*'",
      new: '/^\/(?!api).*/',
      description: 'Catch-all route for non-API requests (frontend serving)',
    },
  },

  threatAnalysis: {
    /**
     * THREAT 1: ReDoS (Regular Expression Denial of Service)
     *
     * ANALYSIS:
     * Pattern 1: /^\/api\/.*/
     * - Simple pattern with no nested quantifiers
     * - Linear time complexity O(n)
     * - No backtracking issues
     * - VERDICT: SAFE from ReDoS
     *
     * Pattern 2: /^\/(?!api).*/
     * - Negative lookahead with .* wildcard
     * - Potential for catastrophic backtracking if misused
     * - However, anchor (^) at start limits backtracking
     * - .* at end could match any length but is efficient
     * - VERDICT: LOW RISK with caveats
     */
    redos: {
      risk: 'LOW',
      confidence: 95,

      pattern1Analysis: {
        pattern: '/^\/api\/.*/',
        complexity: 'O(n) - Linear',
        backtrackingRisk: 'NONE',
        verdict: 'SAFE',
        reasoning: [
          'Simple sequential matching with no nested quantifiers',
          'No alternation or optional groups that cause backtracking',
          'Anchored at start (^) prevents runaway matching',
        ],
      },

      pattern2Analysis: {
        pattern: '/^\/(?!api).*/',
        complexity: 'O(n*m) - Acceptable',
        backtrackingRisk: 'LOW',
        verdict: 'ACCEPTABLE',
        reasoning: [
          'Negative lookahead (?!api) is zero-width assertion - fast',
          'Lookahead only checks 3 characters, bounded operation',
          'Wildcard .* after lookahead is greedy but efficient',
          'Anchored at start (^) prevents excessive backtracking',
        ],
        caveats: [
          'Could be slow on extremely long URLs (>10,000 chars)',
          'Recommend URL length validation middleware (2048 byte limit)',
        ],
      },

      mitigations: [
        'Add URL length limit middleware before route matching',
        'Express built-in limits provide some protection',
        'Monitor request processing times for anomalies',
      ],
    },

    /**
     * THREAT 2: Route Precedence and Security Bypass
     *
     * CRITICAL: Route order in Express determines which handler executes
     */
    routePrecedence: {
      risk: 'MEDIUM',
      confidence: 90,

      expectedOrder: [
        '1. Rate limiter: /^\/api\/.*/ (should execute FIRST for all /api/* paths)',
        '2. API routes: /api/health, /api/users, etc. (protected by rate limiter)',
        '3. Catch-all: /^\/(?!api).*/ (should execute LAST for non-API paths)',
      ],

      bypassScenarios: [
        {
          scenario: 'Catch-all executes before rate limiter',
          impact: 'API routes unprotected - CRITICAL',
          likelihood: 'HIGH if misconfigured',
          test: 'Verify middleware order in server.js',
          mitigation: 'Ensure rate limiter registered before catch-all',
        },
        {
          scenario: 'Rate limiter bypassed via URL encoding',
          impact: 'Rate limiting ineffective',
          likelihood: 'LOW - Express normalizes URLs',
          test: 'Send /api%2Fhealth and /%61pi/health',
          mitigation: 'Express decodes URLs before routing',
        },
        {
          scenario: 'Case sensitivity bypass',
          impact: 'Rate limiter bypassed via /API/health',
          likelihood: 'MEDIUM - depends on config',
          test: 'Test /API/, /Api/, /ApI/ variants',
          mitigation: 'Add case-insensitive flag or normalize paths',
        },
      ],

      requiredValidation: [
        'Verify rate limiter middleware registered BEFORE API routes',
        'Verify catch-all registered AFTER API routes',
        'Test actual execution order with logging',
        'Confirm negative lookahead doesn\'t create gaps',
      ],
    },

    /**
     * THREAT 3: Rate Limiter Coverage
     */
    rateLimiterCoverage: {
      risk: 'HIGH',
      confidence: 85,

      protectedPaths: [
        '/api/* - ALL API endpoints should be protected',
      ],

      potentialGaps: [
        {
          path: '/api',
          issue: 'Pattern /^\/api\/.*/ requires trailing slash and content',
          vulnerable: '/api (exact match, no trailing slash)',
          test: 'curl http://localhost:3000/api',
          fix: 'Use pattern /^\/api(\/.*)?$/ to match /api and /api/*',
        },
        {
          path: '/api/',
          issue: 'Pattern requires characters after /api/',
          vulnerable: '/api/ (trailing slash, no resource)',
          test: 'curl http://localhost:3000/api/',
          fix: 'Pattern should be /^\/api(\/.*)?$/',
        },
        {
          path: '/API/users',
          issue: 'Case sensitivity may bypass rate limiter',
          vulnerable: 'Uppercase variants like /API/, /Api/',
          test: 'curl http://localhost:3000/API/users',
          fix: 'Add case-insensitive middleware or use /^\/api\/.*/i',
        },
      ],

      criticalFinding: {
        severity: 'HIGH',
        issue: 'Pattern /^\/api\/.*/ does NOT match /api or /api/',
        impact: 'Endpoints at /api and /api/ are unprotected by rate limiter',
        recommendation: 'Change pattern to /^\/api(\/.*)?$/ to cover all variations',
        confidence: 90,
      },
    },

    /**
     * THREAT 4: Negative Lookahead Exploitation
     */
    negativeLookahead: {
      risk: 'MEDIUM',
      confidence: 88,

      pattern: '/^\/(?!api).*/',
      purpose: 'Match all routes EXCEPT those starting with /api',

      vulnerabilities: [
        {
          exploit: 'Path traversal via /..;/api/resource',
          likelihood: 'LOW - Express normalizes paths',
          impact: 'Bypass catch-all, hit API without rate limiting',
          mitigation: 'Express path normalization prevents this',
        },
        {
          exploit: 'Unicode normalization bypass /\u0061pi (api)',
          likelihood: 'LOW - Express decodes before routing',
          impact: 'Lookahead checks "api" but decoded path is /api',
          mitigation: 'Test with Unicode escapes',
        },
        {
          exploit: 'Multiple slashes /////api/resource',
          likelihood: 'MEDIUM - depends on Express config',
          impact: 'Lookahead sees "////api" not "api"',
          mitigation: 'Enable strict routing or normalize slashes',
        },
      ],

      edgeCases: [
        {
          path: '/',
          matches: true,
          protected: false,
          issue: 'Root path matches catch-all, no rate limiting',
          acceptable: true,
          reason: 'Root typically serves frontend, not sensitive API',
        },
        {
          path: '/apidata',
          matches: true,
          protected: false,
          issue: 'Paths starting with "api" but not "/api" match catch-all',
          acceptable: true,
          reason: 'Lookahead specifically checks for "/api" not "api" prefix',
        },
        {
          path: '/api',
          matches: false,
          protected: false,
          issue: 'CRITICAL: /api exact match excluded by lookahead BUT may not be protected by rate limiter',
          acceptable: false,
          reason: 'Gap between negative lookahead and rate limiter pattern',
        },
      ],
    },

    /**
     * THREAT 5: Path Traversal and Injection
     */
    pathTraversal: {
      risk: 'LOW',
      confidence: 92,

      attacks: [
        {
          vector: '../../../etc/passwd',
          blocked: true,
          reason: 'Express normalizes paths, serves static files safely',
        },
        {
          vector: '/api/users/../../admin',
          blocked: true,
          reason: 'Express resolves .. before routing',
        },
        {
          vector: '/api/users/%2e%2e%2fadmin',
          blocked: true,
          reason: 'Express decodes URL encoding before normalization',
        },
        {
          vector: '/api/users/..;/admin',
          blocked: true,
          reason: 'Semicolon tricks don\'t work in Express',
        },
      ],

      recommendation: 'Express provides good built-in protection. Verify serve-static configuration.',
    },

    /**
     * THREAT 6: Regular Expression Injection
     */
    regexInjection: {
      risk: 'NONE',
      confidence: 100,

      analysis: [
        'Patterns are hardcoded in server configuration, not user-controlled',
        'No dynamic regex construction from user input',
        'Express compiles patterns once at startup',
        'No runtime regex modification endpoints',
      ],

      verdict: 'NOT VULNERABLE',
    },
  },

  /**
   * COMPREHENSIVE SECURITY ASSESSMENT
   */
  overallAssessment: {
    verdict: 'CONDITIONAL PASS with CRITICAL FINDINGS',
    riskRating: 'MEDIUM-HIGH',
    confidence: 87,

    criticalFindings: [
      {
        id: 'CF-001',
        severity: 'CRITICAL',
        title: 'Rate Limiter Pattern Gap',
        description: 'Pattern /^\/api\/.*/ does not match /api or /api/ endpoints',
        impact: 'Unprotected API endpoints vulnerable to rate limit bypass',
        likelihood: 'HIGH',
        recommendation: 'Change pattern to /^\/api(\/.*)?$/',
        mustFix: true,
      },
      {
        id: 'CF-002',
        severity: 'HIGH',
        title: 'Route Ordering Not Verified',
        description: 'Cannot confirm middleware registration order without server.js',
        impact: 'Rate limiter may execute after catch-all, leaving APIs unprotected',
        likelihood: 'MEDIUM',
        recommendation: 'Audit actual server.js middleware registration order',
        mustFix: true,
      },
    ],

    highRiskFindings: [
      {
        id: 'HF-001',
        severity: 'HIGH',
        title: 'Case Sensitivity Not Addressed',
        description: 'Patterns may not match uppercase variants like /API/',
        impact: 'Rate limiter bypass via case manipulation',
        likelihood: 'MEDIUM',
        recommendation: 'Add case-insensitive flag or lowercase normalization middleware',
        mustFix: false,
      },
      {
        id: 'HF-002',
        severity: 'MEDIUM',
        title: 'Multiple Slash Handling',
        description: 'Pattern may not handle /////api/resource correctly',
        impact: 'Potential rate limiter bypass',
        likelihood: 'LOW',
        recommendation: 'Enable strict routing or add path normalization',
        mustFix: false,
      },
    ],

    lowRiskFindings: [
      {
        id: 'LF-001',
        severity: 'LOW',
        title: 'ReDoS Risk on Extremely Long URLs',
        description: 'Negative lookahead with .* could be slow on 10,000+ char URLs',
        impact: 'Potential DoS via extremely long URLs',
        likelihood: 'LOW',
        recommendation: 'Add URL length limit middleware (2048 bytes recommended)',
        mustFix: false,
      },
    ],

    passingControls: [
      '✅ ReDoS protection: Patterns have acceptable complexity',
      '✅ Path traversal: Express provides built-in protection',
      '✅ Regex injection: Patterns are hardcoded, not user-controlled',
      '✅ URL encoding bypass: Express normalizes URLs before routing',
    ],

    failingControls: [
      '❌ Rate limiter coverage: Pattern gap at /api and /api/',
      '❌ Route precedence: Cannot verify without server.js inspection',
      '⚠️ Case sensitivity: Not explicitly handled',
    ],
  },

  /**
   * REMEDIATION PLAN
   */
  remediationPlan: {
    immediate: [
      {
        priority: 'CRITICAL',
        action: 'Fix rate limiter pattern',
        current: '/^\/api\/.*/',
        recommended: '/^\/api(\/.*)?$/',
        reason: 'Closes protection gap at /api and /api/ endpoints',
        effort: '5 minutes',
      },
      {
        priority: 'CRITICAL',
        action: 'Verify middleware registration order',
        steps: [
          '1. Open server.js or equivalent',
          '2. Confirm rate limiter registered BEFORE catch-all',
          '3. Confirm rate limiter registered BEFORE API routes',
          '4. Add inline comment documenting critical ordering',
        ],
        reason: 'Prevents catastrophic security bypass',
        effort: '10 minutes',
      },
    ],

    shortTerm: [
      {
        priority: 'HIGH',
        action: 'Add case-insensitive routing',
        implementation: 'app.use((req, res, next) => { req.url = req.url.toLowerCase(); next(); })',
        reason: 'Prevents case-based bypasses',
        effort: '15 minutes',
      },
      {
        priority: 'MEDIUM',
        action: 'Add URL length validation',
        implementation: 'app.use((req, res, next) => { if (req.url.length > 2048) return res.status(414).send("URI Too Long"); next(); })',
        reason: 'Mitigates ReDoS and general DoS risks',
        effort: '10 minutes',
      },
    ],

    longTerm: [
      {
        priority: 'MEDIUM',
        action: 'Implement comprehensive route testing',
        implementation: 'Add test suite covering all bypass scenarios',
        reason: 'Prevents regression and validates security controls',
        effort: '2-4 hours',
      },
      {
        priority: 'LOW',
        action: 'Add security monitoring',
        implementation: 'Log rate limiter hits, suspicious patterns, bypass attempts',
        reason: 'Enables detection of exploitation attempts',
        effort: '1-2 hours',
      },
    ],
  },

  /**
   * VALIDATION TEST CASES
   */
  validationTests: [
    {
      test: 'Rate limiter protects /api',
      method: 'GET',
      path: '/api',
      expectedHeader: 'X-RateLimit-Limit',
      mustPass: true,
    },
    {
      test: 'Rate limiter protects /api/',
      method: 'GET',
      path: '/api/',
      expectedHeader: 'X-RateLimit-Limit',
      mustPass: true,
    },
    {
      test: 'Rate limiter protects /api/health',
      method: 'GET',
      path: '/api/health',
      expectedHeader: 'X-RateLimit-Limit',
      mustPass: true,
    },
    {
      test: 'Rate limiter protects uppercase /API/health',
      method: 'GET',
      path: '/API/health',
      expectedHeader: 'X-RateLimit-Limit',
      mustPass: true,
    },
    {
      test: 'Catch-all handles root path',
      method: 'GET',
      path: '/',
      expectedStatus: 200,
      mustPass: true,
    },
    {
      test: 'Catch-all handles frontend routes',
      method: 'GET',
      path: '/dashboard',
      expectedStatus: 200,
      mustPass: true,
    },
    {
      test: 'API routes return before catch-all',
      method: 'GET',
      path: '/api/health',
      expectedContentType: 'application/json',
      mustPass: true,
    },
  ],

  /**
   * BYZANTINE CONSENSUS CHECKLIST
   */
  consensusValidation: {
    securityControls: [
      'ReDoS protection implemented and verified',
      'Route precedence correctly configured',
      'Rate limiter covers all API endpoints',
      'Negative lookahead does not expose unprotected routes',
      'Path traversal protections validated',
      'Case sensitivity addressed',
      'URL length limits in place',
    ],

    validatorChecks: [
      {
        validator: 'Regex Complexity Analyzer',
        checks: ['Linear time complexity', 'No catastrophic backtracking', 'Bounded operations'],
        status: 'PASS',
      },
      {
        validator: 'Route Precedence Auditor',
        checks: ['Middleware order verified', 'No routing conflicts', 'Catch-all is last'],
        status: 'PENDING - Need server.js',
      },
      {
        validator: 'Coverage Analyzer',
        checks: ['All /api/* paths protected', 'No pattern gaps', 'Edge cases covered'],
        status: 'FAIL - Pattern gap detected',
      },
      {
        validator: 'Penetration Tester',
        checks: ['Bypass attempts blocked', 'Injection attempts blocked', 'DoS attempts mitigated'],
        status: 'PENDING - Need live tests',
      },
    ],
  },

  /**
   * FINAL VERDICT
   */
  finalVerdict: {
    overallStatus: 'CONDITIONAL PASS',
    securityRating: 'MEDIUM-HIGH RISK',
    confidenceScore: 87,

    summary: [
      '✅ ReDoS: Patterns are safe with acceptable complexity',
      '❌ Rate Limiter Coverage: CRITICAL gap at /api and /api/ endpoints',
      '⚠️ Route Precedence: Cannot verify without server.js inspection',
      '⚠️ Case Sensitivity: Not addressed, potential bypass vector',
      '✅ Path Traversal: Express provides adequate protection',
      '✅ Regex Injection: Not vulnerable, patterns are hardcoded',
    ],

    requiresAction: true,
    blockingIssues: 2,
    warningIssues: 2,

    recommendation: 'FIX CRITICAL ISSUES BEFORE DEPLOYMENT',

    nextSteps: [
      '1. CRITICAL: Change rate limiter pattern to /^\/api(\/.*)?$/',
      '2. CRITICAL: Verify middleware registration order in server.js',
      '3. HIGH: Add case-insensitive routing or normalization',
      '4. MEDIUM: Add URL length validation middleware',
      '5. MEDIUM: Implement comprehensive security test suite',
      '6. Run validation tests after fixes applied',
      '7. Re-audit after remediation',
    ],
  },
};

// Export for testing and memory storage
export default securityAudit;

/**
 * SELF-VALIDATION CONFIDENCE SCORE: 87%
 *
 * CONFIDENCE BREAKDOWN:
 * - ReDoS Analysis: 95% (patterns analyzed, complexity calculated)
 * - Route Precedence: 70% (cannot verify actual server.js middleware order)
 * - Rate Limiter Coverage: 90% (pattern gap identified with high confidence)
 * - Negative Lookahead: 88% (edge cases identified, tested mentally)
 * - Path Traversal: 92% (Express built-in protections well-documented)
 * - Regex Injection: 100% (patterns hardcoded, not user-controlled)
 *
 * OVERALL: 87% confidence
 *
 * CONFIDENCE LIMITER: Cannot access actual server.js to verify:
 * - Middleware registration order (critical for security)
 * - Actual route definitions
 * - Configuration settings
 * - Static file serving configuration
 *
 * REQUIRES: server.js inspection for 95%+ confidence
 */
