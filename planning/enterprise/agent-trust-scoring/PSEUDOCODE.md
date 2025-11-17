# Agent Trust Scoring - Pseudocode

## Core Algorithms

### Algorithm 1: Trust Score Calculation

```python
class TrustScoreEngine:
    """Real-time trust score calculation with multi-dimensional analysis."""

    def calculate_trust_score(self, agent_id: str, time_window_hours: int = 24) -> TrustScore:
        """
        Calculate comprehensive trust score for agent.

        Components:
        - Accuracy (30%): Task success, error rates
        - Compliance (25%): Policy violations
        - Reliability (20%): Uptime, SLA adherence
        - Security (15%): Auth, access patterns
        - Efficiency (10%): Cost, resource usage
        """

        # Fetch agent behavior data
        behavior = self.get_agent_behavior(agent_id, time_window_hours)

        # Calculate component scores (0-1 scale)
        accuracy = self.calculate_accuracy(behavior)
        compliance = self.calculate_compliance(behavior)
        reliability = self.calculate_reliability(behavior)
        security = self.calculate_security(behavior)
        efficiency = self.calculate_efficiency(behavior)

        # Weighted sum (0-100 scale)
        base_score = (
            accuracy * 0.30 +
            compliance * 0.25 +
            reliability * 0.20 +
            security * 0.15 +
            efficiency * 0.10
        ) * 100

        # Apply adjustments
        adjusted_score = self.apply_adjustments(
            agent_id=agent_id,
            base_score=base_score,
            behavior=behavior
        )

        # Determine tier and privileges
        tier = self.determine_tier(adjusted_score)

        return TrustScore(
            agent_id=agent_id,
            overall_score=adjusted_score,
            components={
                'accuracy': accuracy * 100,
                'compliance': compliance * 100,
                'reliability': reliability * 100,
                'security': security * 100,
                'efficiency': efficiency * 100
            },
            tier=tier,
            trend=self.calculate_trend(agent_id),
            last_updated=datetime.utcnow()
        )

    def calculate_accuracy(self, behavior: AgentBehavior) -> float:
        """Calculate accuracy score (0-1)."""

        # Task completion rate
        if behavior.total_tasks > 0:
            completion_rate = behavior.successful_tasks / behavior.total_tasks
        else:
            completion_rate = 0.5  # Neutral for new agents

        # Error rate (inverted, lower is better)
        if behavior.total_actions > 0:
            error_rate = behavior.errors / behavior.total_actions
            error_score = max(0, 1 - (error_rate * 10))  # Penalize errors heavily
        else:
            error_score = 0.5

        # Test pass rate
        if behavior.total_tests > 0:
            test_pass_rate = behavior.passing_tests / behavior.total_tests
        else:
            test_pass_rate = 0.5

        # Weighted average
        accuracy = (
            completion_rate * 0.50 +
            error_score * 0.30 +
            test_pass_rate * 0.20
        )

        return accuracy

    def calculate_compliance(self, behavior: AgentBehavior) -> float:
        """Calculate compliance score (0-1)."""

        # Policy adherence
        if behavior.total_policy_checks > 0:
            adherence_rate = 1 - (behavior.policy_violations / behavior.total_policy_checks)
        else:
            adherence_rate = 1.0

        # Data handling compliance
        if behavior.sensitive_data_operations > 0:
            data_compliance = behavior.proper_data_handling / behavior.sensitive_data_operations
        else:
            data_compliance = 1.0

        # Audit completeness
        if behavior.total_actions > 0:
            audit_completeness = behavior.logged_actions / behavior.total_actions
        else:
            audit_completeness = 1.0

        compliance = (
            adherence_rate * 0.50 +
            data_compliance * 0.30 +
            audit_completeness * 0.20
        )

        return compliance

    def calculate_reliability(self, behavior: AgentBehavior) -> float:
        """Calculate reliability score (0-1)."""

        # Uptime
        uptime = behavior.online_time / behavior.total_time if behavior.total_time > 0 else 1.0

        # SLA compliance
        if behavior.total_tasks > 0:
            sla_compliance = behavior.tasks_meeting_deadline / behavior.total_tasks
        else:
            sla_compliance = 0.5

        # Recovery rate (how well agent recovers from failures)
        if behavior.failed_attempts > 0:
            recovery_rate = behavior.successful_retries / behavior.failed_attempts
        else:
            recovery_rate = 1.0

        reliability = (
            uptime * 0.40 +
            sla_compliance * 0.40 +
            recovery_rate * 0.20
        )

        return reliability

    def apply_adjustments(
        self,
        agent_id: str,
        base_score: float,
        behavior: AgentBehavior
    ) -> float:
        """Apply temporal adjustments to base score."""

        adjusted = base_score

        # Violation recency penalty (exponential decay)
        recent_violations = self.get_recent_violations(agent_id, days=7)
        for violation in recent_violations:
            days_ago = (datetime.utcnow() - violation.timestamp).days
            decay = 0.5 ** days_ago  # Half-life of 1 day
            penalty = violation.severity_penalty * decay
            adjusted -= penalty

        # Improvement trend bonus
        trend = self.calculate_trend(agent_id, days=30)
        if trend == 'IMPROVING':
            adjusted += 5

        # Violation streak penalty
        violations_24h = len([v for v in recent_violations if (datetime.utcnow() - v.timestamp).days < 1])
        if violations_24h >= 3:
            adjusted -= 10  # Heavy penalty for repeated violations

        # Clamp to 0-100
        return max(0, min(100, adjusted))
```

### Algorithm 2: Anomaly Detection

```python
class AnomalyDetector:
    """Statistical anomaly detection for agent behavior."""

    def detect_anomalies(
        self,
        agent_id: str,
        current_behavior: AgentBehavior,
        lookback_days: int = 30
    ) -> List[Anomaly]:
        """
        Detect anomalies using 3-sigma rule and baseline comparison.
        """

        baseline = self.calculate_baseline(agent_id, lookback_days)
        anomalies = []

        metrics = [
            'error_rate', 'api_call_volume', 'resource_access_count',
            'response_time_avg', 'cost_per_task'
        ]

        for metric in metrics:
            current_value = getattr(current_behavior, metric)
            baseline_mean = baseline[metric]['mean']
            baseline_std = baseline[metric]['std']

            # Handle zero std deviation (constant behavior)
            if baseline_std == 0:
                if current_value != baseline_mean:
                    z_score = float('inf')
                else:
                    continue
            else:
                z_score = (current_value - baseline_mean) / baseline_std

            # 3-sigma threshold for anomaly
            if abs(z_score) > 3:
                severity = self.determine_severity(z_score)

                anomalies.append(Anomaly(
                    agent_id=agent_id,
                    metric=metric,
                    current_value=current_value,
                    expected_value=baseline_mean,
                    std_deviations=abs(z_score),
                    severity=severity,
                    timestamp=datetime.utcnow(),
                    description=self.generate_anomaly_description(
                        metric, current_value, baseline_mean, z_score
                    )
                ))

        # Pattern-based anomalies
        pattern_anomalies = self.detect_pattern_anomalies(agent_id, current_behavior)
        anomalies.extend(pattern_anomalies)

        return anomalies

    def calculate_baseline(
        self,
        agent_id: str,
        lookback_days: int
    ) -> Dict[str, Dict[str, float]]:
        """Calculate baseline statistics for agent behavior."""

        historical_data = self.db.query("""
            SELECT
                AVG(error_rate) as error_rate_mean,
                STDDEV(error_rate) as error_rate_std,
                AVG(api_call_volume) as api_call_volume_mean,
                STDDEV(api_call_volume) as api_call_volume_std,
                AVG(resource_access_count) as resource_access_mean,
                STDDEV(resource_access_count) as resource_access_std,
                AVG(response_time_avg) as response_time_mean,
                STDDEV(response_time_avg) as response_time_std,
                AVG(cost_per_task) as cost_per_task_mean,
                STDDEV(cost_per_task) as cost_per_task_std
            FROM agent_behavior_metrics
            WHERE agent_id = %s
                AND timestamp > NOW() - INTERVAL '%s days'
        """, (agent_id, lookback_days))

        return {
            'error_rate': {
                'mean': historical_data['error_rate_mean'],
                'std': historical_data['error_rate_std']
            },
            'api_call_volume': {
                'mean': historical_data['api_call_volume_mean'],
                'std': historical_data['api_call_volume_std']
            },
            # ... other metrics
        }

    def detect_pattern_anomalies(
        self,
        agent_id: str,
        behavior: AgentBehavior
    ) -> List[Anomaly]:
        """Detect anomalies based on patterns (not just statistics)."""

        anomalies = []

        # Off-hours activity (if agent normally works 9-5)
        typical_hours = self.get_typical_working_hours(agent_id)
        if behavior.has_activity_outside_hours(typical_hours):
            anomalies.append(Anomaly(
                agent_id=agent_id,
                metric='working_hours',
                severity='MEDIUM',
                description='Agent active during unusual hours'
            ))

        # Access pattern change (accessing new resources)
        typical_resources = self.get_typical_resources(agent_id)
        new_resources = behavior.accessed_resources - typical_resources
        if len(new_resources) > 5:
            anomalies.append(Anomaly(
                agent_id=agent_id,
                metric='resource_access',
                severity='HIGH',
                description=f'Agent accessed {len(new_resources)} new resources'
            ))

        # Sudden code style change (potential agent takeover)
        if self.detect_code_style_change(agent_id, behavior):
            anomalies.append(Anomaly(
                agent_id=agent_id,
                metric='code_style',
                severity='CRITICAL',
                description='Significant code style change detected'
            ))

        return anomalies
```

### Algorithm 3: Automated Privilege Management

```python
class PrivilegeManager:
    """Manage agent privileges based on trust scores."""

    def update_privileges(self, agent_id: str, trust_score: TrustScore) -> PrivilegeUpdate:
        """
        Automatically adjust agent privileges based on trust score.
        """

        current_tier = self.get_current_tier(agent_id)
        new_tier = trust_score.tier

        if current_tier == new_tier:
            # No change needed
            return PrivilegeUpdate(changed=False)

        # Determine privilege changes
        privilege_changes = self.calculate_privilege_changes(
            from_tier=current_tier,
            to_tier=new_tier
        )

        # Apply changes
        for change in privilege_changes:
            if change.action == 'GRANT':
                self.grant_privilege(agent_id, change.privilege)
            elif change.action == 'REVOKE':
                self.revoke_privilege(agent_id, change.privilege)

        # Update agent configuration
        self.db.execute("""
            UPDATE agents
            SET trust_tier = %s,
                privilege_level = %s,
                updated_at = NOW()
            WHERE agent_id = %s
        """, (new_tier, self.get_privilege_level(new_tier), agent_id))

        # Notify stakeholders
        self.notify_privilege_change(
            agent_id=agent_id,
            from_tier=current_tier,
            to_tier=new_tier,
            trust_score=trust_score.overall_score
        )

        # Audit log
        self.audit_logger.log({
            'event_type': 'PRIVILEGE_CHANGE',
            'agent_id': agent_id,
            'from_tier': current_tier,
            'to_tier': new_tier,
            'trust_score': trust_score.overall_score,
            'changes': privilege_changes
        })

        return PrivilegeUpdate(
            changed=True,
            from_tier=current_tier,
            to_tier=new_tier,
            changes=privilege_changes
        )

    def calculate_privilege_changes(
        self,
        from_tier: str,
        to_tier: str
    ) -> List[PrivilegeChange]:
        """Determine what privileges to grant or revoke."""

        tier_privileges = {
            'TRUSTED': [
                'auto_approve_low_risk',
                'auto_approve_medium_risk',
                'increased_rate_limits',
                'production_write_access'
            ],
            'STANDARD': [
                'auto_approve_low_risk',
                'standard_rate_limits',
                'staging_write_access'
            ],
            'SUPERVISED': [
                'read_only_access',
                'reduced_rate_limits'
            ],
            'RESTRICTED': [
                'quarantine_mode'
            ]
        }

        from_privileges = set(tier_privileges.get(from_tier, []))
        to_privileges = set(tier_privileges.get(to_tier, []))

        changes = []

        # Privileges to grant
        for privilege in to_privileges - from_privileges:
            changes.append(PrivilegeChange(
                privilege=privilege,
                action='GRANT'
            ))

        # Privileges to revoke
        for privilege in from_privileges - to_privileges:
            changes.append(PrivilegeChange(
                privilege=privilege,
                action='REVOKE'
            ))

        return changes
```

---

## Data Flow

### Trust Score Update Flow

```
Agent Action
     │
     ▼
┌────────────────────┐
│ Behavior Collector │  Captures action metadata
└────────┬───────────┘
         │
         │ Store raw event
         ▼
┌────────────────────┐
│ Event Store (DB)   │
└────────┬───────────┘
         │
         │ Trigger (every 1 min or on violation)
         ▼
┌────────────────────┐
│ Trust Score Engine │  Calculates new score
└────────┬───────────┘
         │
         ├─────────────┬──────────────┬────────────┐
         ▼             ▼              ▼            ▼
┌───────────┐  ┌──────────────┐  ┌────────┐  ┌────────┐
│ Component │  │   Anomaly    │  │ Tier   │  │ Audit  │
│ Scores    │  │   Detector   │  │ Update │  │ Logger │
└─────┬─────┘  └──────┬───────┘  └───┬────┘  └────────┘
      │               │               │
      │               │ Anomaly found │
      │               ▼               │
      │        ┌─────────────┐        │
      │        │ Alert System│        │
      │        └─────────────┘        │
      │                               │
      ▼                               ▼
┌──────────────────────────────────────────┐
│       Trust Score Cache (Redis)          │
└──────────────────────────────────────────┘
                    │
                    ▼
          ┌─────────────────┐
          │   Dashboard     │
          └─────────────────┘
```

---

## State Machine: Agent Trust Lifecycle

```
┌─────────────┐
│    NEW      │  ← Agent just created
└──────┬──────┘
       │ Initialize with score 75 (neutral)
       ▼
┌─────────────┐
│  MONITORED  │  ← Normal operation
└──────┬──────┘
       │
       ├─ Score ≥ 90 ──────────┐
       │                        ▼
       │                  ┌─────────────┐
       │                  │   TRUSTED   │  ← High autonomy
       │                  └──────┬──────┘
       │                         │
       │                         │ Score drops < 90
       │                         └──────────────┐
       │                                        │
       ├─ Score < 70 ──────────┐               │
       │                        ▼               │
       │                  ┌─────────────┐       │
       │                  │ SUPERVISED  │  ← Enhanced oversight
       │                  └──────┬──────┘       │
       │                         │              │
       │                         │ Score < 50   │
       │                         ▼              │
       │                  ┌─────────────┐       │
       │                  │ QUARANTINED │  ← Operations restricted
       │                  └──────┬──────┘       │
       │                         │              │
       │                         │ Remediation  │
       │                         ▼              │
       │                  ┌─────────────┐       │
       │                  │ REMEDIATION │  ← Recovery in progress
       │                  └──────┬──────┘       │
       │                         │              │
       │                         │ Score ≥ 75   │
       │                         └──────────────┘
       │                                        │
       └────────────────────────────────────────┘
```

---

## Integration with CFN v3

```typescript
// src/trust/cfn-integration.ts

export class TrustScoringMiddleware {
  /**
   * Inject trust score checks into CFN orchestration.
   */
  async beforeAgentAction(
    agentId: string,
    action: AgentAction
  ): Promise<void> {
    // Get current trust score
    const trustScore = await this.trustEngine.getTrustScore(agentId);

    // Check if action is allowed for current trust tier
    const isAllowed = this.policyEngine.evaluateAction(
      action,
      trustScore.tier
    );

    if (!isAllowed) {
      throw new InsufficientTrustError(
        `Agent ${agentId} (tier: ${trustScore.tier}, score: ${trustScore.overall_score}) ` +
        `not authorized for ${action.type}. Requires tier: ${action.required_tier}`
      );
    }

    // Log action for trust score calculation
    await this.behaviorCollector.recordAction(agentId, action);
  }

  async afterAgentAction(
    agentId: string,
    action: AgentAction,
    result: ActionResult
  ): Promise<void> {
    // Update behavior metrics
    await this.behaviorCollector.recordResult(agentId, action, result);

    // Trigger trust score recalculation if action was significant
    if (this.isSignificantAction(action)) {
      await this.trustEngine.updateTrustScore(agentId);

      // Check for anomalies
      const anomalies = await this.anomalyDetector.detect(agentId);
      if (anomalies.length > 0) {
        await this.alertSystem.sendAnomalyAlerts(agentId, anomalies);
      }
    }
  }
}
```

---

## Testing Strategy

```python
def test_trust_score_calculation():
    """Test trust score calculation with known inputs."""

    engine = TrustScoreEngine()

    # Perfect agent (100% success, no violations)
    behavior = AgentBehavior(
        successful_tasks=100,
        total_tasks=100,
        errors=0,
        total_actions=1000,
        policy_violations=0,
        total_policy_checks=500
    )

    score = engine.calculate_trust_score('perfect-agent', behavior)

    assert score.overall_score >= 95
    assert score.tier == 'TRUSTED'

def test_anomaly_detection():
    """Test anomaly detection for unusual behavior."""

    detector = AnomalyDetector()

    # Normal baseline: 10 API calls/hour
    baseline = {'api_call_volume': {'mean': 10, 'std': 2}}

    # Anomalous behavior: 50 API calls/hour (z-score = 20)
    current_behavior = AgentBehavior(api_call_volume=50)

    anomalies = detector.detect_anomalies(
        'test-agent',
        current_behavior,
        baseline
    )

    assert len(anomalies) > 0
    assert anomalies[0].severity == 'HIGH'

def test_privilege_downgrade():
    """Test automatic privilege downgrade on low trust."""

    manager = PrivilegeManager()

    # Agent drops from TRUSTED to SUPERVISED
    update = manager.update_privileges(
        'test-agent',
        TrustScore(tier='SUPERVISED', overall_score=65)
    )

    assert update.changed == True
    assert 'production_write_access' in [c.privilege for c in update.changes if c.action == 'REVOKE']
```

---

**Document Version:** 1.0
**Last Updated:** 2024-11-17
**Author:** CFN System Architect
