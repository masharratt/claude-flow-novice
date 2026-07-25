# Experimental Test Suite

This directory contains proof-of-concept tests and features that are under active
development but not yet integrated into the production test suite.

## Contents

### api-gateway/
API Gateway integration tests (feature pending). Tests for Kong, AWS API Gateway,
rate limiting, OAuth2/JWT configuration.

**Status:** Feature on hold pending production requirements.

### hello-world/
Multi-layer hello-world coordination experiments. Tests the full CFN Loop workflow
with simple tasks across all layers (Loop 3 → Loop 2 → Product Owner).

**Status:** Reference implementation for CFN Loop validation.

### cfn-loop/
CFN Loop variant implementations, including modes experiments and alternative
coordination patterns.

**Status:** Superseded by standardized CLI/Task mode architecture.

### ace/
Agent Capability Expression (ACE) experiments. Adaptive context extraction and
cognitive reflection patterns.

**Status:** Under development - not yet production-ready.

### tdd-compliance/
TDD validation enforcement experiments. Automated test-driven development
compliance checking.

**Status:** Prototype phase - exploring enforcement patterns.

### playbooks/
Workflow codification experiments. Playbook-based task orchestration patterns.

**Status:** Exploring alternatives to imperative coordination.

### workflows/
Workflow automation experiments. Event-driven workflow patterns and
state machine-based orchestration.

**Status:** Research phase - evaluating workflow frameworks.

## When to Use

These tests are for:
- Feature exploration and validation
- Proof-of-concept verification before production migration
- Batch testing new coordination patterns
- Validating new CFN Loop features
- Research and development

## Integration Path

When an experimental test is ready for production:

1. **Validate functionality**
   - Ensure tests pass consistently
   - Verify production-readiness of feature

2. **Update to standards**
   - Follow `tests/CLAUDE.md` authoring standards
   - Use proper test structure (GIVEN/WHEN/THEN)
   - Add cleanup traps and logging

3. **Move to production**
   - Relocate to appropriate directory (cli-mode/, docker/, security/, etc.)
   - Update relevant test runner to include it
   - Add documentation to test README

4. **Announce deprecation**
   - Document migration in this README
   - Update references in documentation
   - Remove from experimental/ after validation period

## Status Tracking

See individual README.md files in each subdirectory for detailed status and roadmap.

### Recently Promoted to Production

None yet - this archive was created 2025-11-24.

### Deprecated Experiments

None yet - all experiments are still under evaluation.

## Contributing

When adding new experimental tests:

1. Create subdirectory with clear name
2. Add README.md explaining purpose and status
3. Include test files with proper documentation
4. Update this index with new entry
5. Keep experiments isolated (no dependencies on other experiments)

Last updated: 2025-11-24
