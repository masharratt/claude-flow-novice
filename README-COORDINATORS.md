# CFN Byzantine Consensus Coordinators

## Overview
This repository contains three Byzantine consensus coordinator profiles implementing PBFT (Practical Byzantine Fault Tolerance) protocols for achieving consensus in adversarial environments where up to f < n/3 agents may be malicious.

## Coordinator Profiles

### 🚀 MVP Coordinator (`cfn-coordinator-mvp.md`)
**Designed for small teams (3-5 agents) requiring lightweight coordination**

- **Gate Threshold**: 0.70 (70% confidence to proceed)
- **Consensus Threshold**: 0.80 (80% agreement for final decision)
- **Validators**: 2 validators
- **Max Faulty Nodes**: 1 malicious agent tolerated
- **Timeout**: 30 seconds per phase
- **Features**: Basic Byzantine fault tolerance, lightweight malicious detection

### 🏢 Standard Coordinator (`cfn-coordinator-standard.md`)
**Designed for medium teams (5-9 agents) needing robust coordination**

- **Gate Threshold**: 0.75 (75% confidence to proceed)
- **Consensus Threshold**: 0.90 (90% agreement for final decision)
- **Validators**: 4 validators
- **Max Faulty Nodes**: 2 malicious agents tolerated
- **Timeout**: 45 seconds per phase
- **Features**: Enhanced security, zero-knowledge proofs, advanced malicious detection

### 🏛️ Enterprise Coordinator (`cfn-coordinator-enterprise.md`)
**Designed for large teams (9-15 agents) requiring mission-critical coordination**

- **Gate Threshold**: 0.75 (75% confidence to proceed)
- **Consensus Threshold**: 0.95 (95% agreement for final decision)
- **Validators**: 4 validators + 4-person governance board
- **Max Faulty Nodes**: 4 malicious agents tolerated
- **Timeout**: 60 seconds per phase
- **Features**: Military-grade security, full regulatory compliance, comprehensive governance

## PBFT Three-Phase Protocol

All coordinators implement the standard PBFT consensus algorithm:

### Phase 1: PRE-PREPARE
- Primary broadcasts proposal with sequence number
- Validate proposal authenticity and ordering
- Store pre-prepare message in SQLite (ACL Level 3/4)

### Phase 2: PREPARE
- All replicas broadcast PREPARE messages
- Wait for 2f PREPARE messages
- Validate message signatures cryptographically
- Detect conflicting PREPARE messages (malicious behavior)

### Phase 3: COMMIT
- Broadcast COMMIT after 2f matching PREPARE messages
- Wait for 2f+1 COMMIT messages
- Execute consensus value once threshold reached
- Store final consensus result in SQLite

## Quick Start

### 1. Spawn MVP Coordinator
```bash
node spawn-workers.js --mode mvp --coordinator-id mvp-demo
```

### 2. Spawn Standard Coordinator
```bash
node spawn-workers.js --mode standard --coordinator-id std-demo
```

### 3. Spawn Enterprise Coordinator
```bash
node spawn-workers.js --mode enterprise --coordinator-id ent-demo
```

### 4. List Active Coordinators
```bash
node spawn-workers.js --list
```

### 5. View Coordinator Metrics
```bash
node spawn-workers.js --metrics <coordinator-id>
```

## Configuration Options

### Common Parameters
- `--mode`: Coordinator mode (mvp|standard|enterprise)
- `--coordinator-id`: Unique identifier for the coordinator
- `--gate-threshold`: Minimum confidence to proceed (0.0-1.0)
- `--consensus-threshold`: Minimum agreement for consensus (0.0-1.0)
- `--validators`: Number of validators
- `--timeout`: Phase timeout in milliseconds
- `--checkpoint-interval`: Checkpoint frequency in milliseconds

### Enterprise-Specific Parameters
- `--board-size`: Number of governance board members
- `--military-grade-crypto`: Enable military-grade cryptography
- `--compliance-level`: Compliance level (basic|standard|enterprise)

## SQLite Integration

All coordinators maintain comprehensive audit trails in SQLite:

### Coordinator Registry
```sql
-- Track all coordinator instances
CREATE TABLE coordinators (
  id TEXT PRIMARY KEY,
  mode TEXT NOT NULL,
  status TEXT NOT NULL,
  config TEXT NOT NULL,
  spawned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_active DATETIME,
  completed_at DATETIME
);
```

### Consensus Metrics
```sql
-- Track consensus progress and performance
CREATE TABLE coordinator_metrics (
  coordinator_id TEXT,
  round INTEGER,
  phase TEXT,
  confidence REAL,
  votes INTEGER,
  malicious_detected TEXT,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### Audit Log
```sql
-- Comprehensive audit trail for all actions
CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id TEXT,
  action TEXT,
  details TEXT,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

## Security Features

### Byzantine Fault Tolerance
- **Tolerance**: f < n/3 malicious nodes
- **Detection**: Advanced pattern recognition for malicious behavior
- **Isolation**: Automatic quarantine of suspicious agents
- **Recovery**: View change protocol for primary failure

### Cryptographic Security
- **Signatures**: All messages cryptographically signed
- **Verification**: Multi-level signature verification
- **Zero-Knowledge**: ZK proofs for validator verification (Standard/Enterprise)
- **Quantum Resistance**: Quantum-resistant cryptography (Enterprise)

### Compliance & Governance
- **Audit Trails**: Complete logging of all consensus events
- **Regulatory Compliance**: SOC2, ISO27001, GDPR, HIPAA (Enterprise)
- **Governance Oversight**: Board approval requirements (Enterprise)
- **Real-time Monitoring**: Continuous security monitoring

## Return-to-Chat Triggers

### Human Decision Trigger
Automatically triggers human oversight for:
- High confidence decisions (>90% for MVP, >85% for Standard, >80% for Enterprise)
- High-risk scenarios
- Security alerts
- Consensus failures
- Malicious agent detection

### Sprint Complete Trigger
Triggers return to chat when:
- Consensus achieved with required thresholds
- All validators confirmed
- Board approval obtained (Enterprise)
- Checkpoint created
- Compliance verified (Enterprise)

## Performance Metrics

### Success Criteria
- **MVP**: >80% consensus success rate, <2s average latency
- **Standard**: >90% consensus success rate, <3s average latency
- **Enterprise**: >95% consensus success rate, <5s average latency

### Key Metrics
- Consensus achievement rate
- Average consensus latency
- Malicious agent detection accuracy
- Signature verification success rate
- View change completion time
- Checkpoint recovery success rate

## Error Handling

### SQLite Failures
- Automatic retry with exponential backoff
- Fallback to Redis for ephemeral coordination
- Graceful degradation during database issues

### Network Partitions
- Automatic partition detection
- State reconciliation after healing
- Dynamic quorum adjustment

### Malicious Behavior
- Immediate isolation of confirmed malicious agents
- Pattern analysis for sophisticated attacks
- Forensic data collection for investigation

## Troubleshooting

### Common Issues
1. **Coordinator fails to start**: Check SQLite permissions and disk space
2. **Consensus timeouts**: Increase timeout values or check network connectivity
3. **High false positive rate**: Adjust detection thresholds for your environment
4. **Performance issues**: Reduce checkpoint frequency or optimize SQLite configuration

### Debug Mode
```bash
node spawn-workers.js --mode mvp --debug --log-level verbose
```

### Logs and Monitoring
- Coordinator logs stored in SQLite audit_log table
- Real-time metrics available via coordinator_metrics table
- System health monitoring via status command

## Architecture

### Components
- **spawn-workers.js**: CLI interface for spawning coordinators
- **coordinator-runner.js**: Core consensus execution engine
- **SQLite Database**: Persistent storage for state and audit trails
- **Blocking Coordination**: Inter-agent signaling and synchronization

### Data Flow
1. Coordinator spawned via CLI
2. PBFT consensus phases executed
3. All events persisted to SQLite
4. Consensus results returned to chat
5. Triggers activate for human oversight or sprint completion

## Contributing

When modifying coordinator profiles:
1. Maintain backward compatibility
2. Update SQLite schemas if needed
3. Add comprehensive tests
4. Document security implications
5. Run post-edit validation hooks

## License

This implementation follows the Byzantine Consensus Coordinator specifications with enhanced SQLite integration and ACL Level 3/4 security controls.

---

**Status**: All three coordinator profiles are ready for deployment with comprehensive Byzantine fault tolerance, SQLite integration, and return-to-chat triggers.