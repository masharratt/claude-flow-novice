/**
 * Enterprise Mode Configuration
 *
 * Quality-focused CFN Loop mode for production-grade enterprise systems.
 *
 * Characteristics:
 * - Higher thresholds (Gate: 0.75, Consensus: 0.95)
 * - More iterations (Max Loop2: 15, Max Loop3: 15)
 * - Loop 0.5: Planning consensus (3 architects vote on ADRs/diagrams)
 * - 4 validators (comprehensive team)
 * - 4-person product owner board with weighted voting
 * - No skipped validations (full quality checks)
 * - Prioritize quality, security, scalability, accessibility
 *
 * @module cfn-loop/modes/enterprise-mode
 */

import type { CFNLoopMode, ProductOwnerRole } from './types.js';

/**
 * Product owner team roles with weights
 *
 * Weights from DESIGN_CONSENSUS_MULTI_STAKEHOLDER_ARCHITECTURE.md:780-786
 * - CTO: 30% (strategic decisions)
 * - Product Owner: 30% (business value)
 * - Power User: 20% (usability)
 * - Accessibility User: 20% (WCAG compliance)
 */
const enterpriseProductOwnerRoles: ProductOwnerRole[] = [
  { name: 'cto', weight: 0.30 },
  { name: 'product-owner', weight: 0.30 },
  { name: 'user-power', weight: 0.20 },
  { name: 'user-accessibility', weight: 0.20 },
];

/**
 * Enterprise mode configuration
 *
 * Optimized for:
 * - Production-grade quality
 * - Enterprise security standards
 * - Full accessibility compliance (WCAG)
 * - Scalability and performance
 * - Comprehensive documentation
 */
export const enterpriseMode: CFNLoopMode = {
  name: 'enterprise',

  // Higher confidence thresholds for quality
  gateThreshold: 0.75, // Loop 3 gate (standard)
  consensusThreshold: 0.95, // Loop 2 consensus (higher than 0.90 standard)

  // Extended iteration limits
  maxLoop2Iterations: 15, // Phase-level (vs 10 standard)
  maxLoop3Iterations: 15, // Swarm-level (vs 10 standard)

  // Comprehensive validator team
  validatorCount: 4,
  validatorTypes: [
    'code-quality-validator',
    'security-specialist',
    'perf-analyzer',
    'tester',
  ],

  // Product owner board (4-person team)
  productOwnerStructure: 'team',

  // No skipped validations (full enterprise checks)
  skipValidations: [],

  // Special instructions for enterprise mindset
  specialInstructions: `
# Enterprise Mode - Quality-Focused Development

You are working in **Enterprise Mode**. Priorities:

1. **Enterprise-Grade Quality**
   - Production-ready architecture
   - Comprehensive error handling
   - Full test coverage (>90%)
   - Complete documentation

2. **Security & Compliance**
   - Security audit required
   - WCAG 2.1 AA accessibility compliance
   - Data protection (GDPR/SOC2)
   - Vulnerability scanning

3. **Scalability & Performance**
   - Designed for scale (1000+ concurrent users)
   - Performance benchmarks required
   - Load testing and optimization
   - Monitoring and observability

4. **Team Consensus Required**
   - All decisions require board approval
   - CTO: Strategic alignment
   - Product Owner: Business value
   - Power User: Usability validation
   - Accessibility User: WCAG compliance

**Remember:** This is enterprise mode. Quality, security, and accessibility are non-negotiable.
  `.trim(),

  // Loop 0.5: Planning consensus (3 architects)
  planningConsensus: {
    enabled: true,
    architectTypes: ['architect', 'system-architect', 'security-specialist'],
    threshold: 0.85, // Higher than Loop 2's 0.90 (early-stage design)
  },

  // Loop 4: Product owner board with weighted voting
  productOwnerTeam: {
    roles: enterpriseProductOwnerRoles,
    votingAlgorithm: 'weighted-confidence',
  },
};

/**
 * Get Enterprise mode configuration
 */
export function getEnterpriseMode(): CFNLoopMode {
  return enterpriseMode;
}

/**
 * Get product owner roles for Enterprise mode
 */
export function getEnterpriseProductOwnerRoles(): ProductOwnerRole[] {
  return [...enterpriseProductOwnerRoles];
}

export default enterpriseMode;
