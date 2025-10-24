# Specialists

Domain-specific expert agents with deep knowledge in particular areas.

## Active Agents (16)

**Security:**
- `security-specialist.md` - Security analysis, vulnerability detection, secure coding practices
- `security-specialist-existing.md` - Legacy security specialist (use security-specialist.md instead)
- `security-manager.md` - Security policy management and compliance

**Performance & Optimization:**
- `performance-benchmarker.md` - Performance analysis and optimization
- `code-booster.md` - Code quality improvement and optimization

**Consensus & Distributed Systems:**
- `consensus-builder.md` - Multi-agent consensus mechanisms
- `crdt-synchronizer.md` - CRDT-based data synchronization
- `quorum-manager.md` - Quorum-based decision making
- `raft-manager.md` - Raft consensus protocol implementation

**Development Specialists:**
- `cli-agent-optimizer.md` - CLI agent optimization and cost reduction
- `npm-package-specialist.md` - NPM package development and maintenance
- `rust-developer.md` - Rust language development
- `rust-enterprise-developer.md` - Enterprise-scale Rust applications
- `rust-mvp-developer.md` - Rust MVP and prototyping

**Infrastructure:**
- `devops-engineer.md` - DevOps practices and automation

**Mobile Development:**
- `mobile-dev.md` - Mobile application development
- `spec-mobile-react-native.md` - React Native specialized development

## Purpose

Specialists provide:
- Deep domain expertise
- Specialized analysis and recommendations
- Technical guidance for implementers
- Quality validation in their domain
- Best practices enforcement

## Usage Pattern

Spawn directly for specialized tasks:
```bash
npx claude-flow-novice agent-spawn security-specialist --task-id "$TASK_ID"
```

Or include in CFN Loop workflows for domain validation.

## Confidence Expectations

Specialists typically achieve:
- Self-confidence (gate): 0.85+
- Consensus validation: 0.90+

High confidence comes from deep expertise in narrow domains.
