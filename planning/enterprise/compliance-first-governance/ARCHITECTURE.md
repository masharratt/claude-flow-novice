# Compliance-First Governance - Architecture

## System Architecture Overview

### High-Level Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────────────┐
│                         CFN v3 Orchestration Layer                       │
│  ┌────────────────┐    ┌────────────────┐    ┌────────────────┐        │
│  │ Main Chat      │───▶│ Coordinator    │───▶│ Agents         │        │
│  └────────────────┘    └────────┬───────┘    └───┬────────────┘        │
│                                  │                 │                      │
└──────────────────────────────────┼─────────────────┼──────────────────────┘
                                   │                 │
                                   │ Policy Check    │ Action Request
                                   ▼                 ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                     Compliance Middleware Layer                          │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                      Action Interceptor                            │ │
│  │  • Pre-spawn hooks      • Pre-file-op hooks                       │ │
│  │  • Pre-network hooks    • Pre-process hooks                       │ │
│  └───────────────────────┬────────────────────────────────────────────┘ │
│                          │                                               │
│                          ▼                                               │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                       Policy Engine                              │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │   │
│  │  │ Rule Loader  │  │ Evaluator    │  │ Decision     │          │   │
│  │  │              │  │ (JS/Python)  │  │ Aggregator   │          │   │
│  │  └──────────────┘  └──────────────┘  └──────────────┘          │   │
│  │                                                                   │   │
│  │  ┌──────────────────────────────────────────────────────┐       │   │
│  │  │ Policy Packs: HIPAA | SOX | GDPR | PCI-DSS | FDA    │       │   │
│  │  └──────────────────────────────────────────────────────┘       │   │
│  └────────────────────────┬──────────────────────────────────────────┘   │
│                           │                                               │
└───────────────────────────┼───────────────────────────────────────────────┘
                            │
                            │ ALLOW/DENY/WARN + Audit Event
                            ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                          Audit & Logging Layer                           │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                       Audit Logger                                 │ │
│  │  • Hash chain generation    • Ed25519 signing                     │ │
│  │  • Replication trigger      • Retention management                │ │
│  └───────────────────────┬────────────────────────────────────────────┘ │
│                          │                                               │
│                          ▼                                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                  │
│  │ PostgreSQL   │  │ Elasticsearch│  │ S3 Archive   │                  │
│  │ (Primary)    │  │ (Search)     │  │ (7-year)     │                  │
│  └──────────────┘  └──────────────┘  └──────────────┘                  │
│         │                  │                  │                          │
└─────────┼──────────────────┼──────────────────┼──────────────────────────┘
          │                  │                  │
          ▼                  ▼                  ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                      Compliance Dashboard Layer                          │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                    Web Dashboard (React + TypeScript)              │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐            │ │
│  │  │ Violations   │  │ Compliance   │  │ Reports      │            │ │
│  │  │ Monitor      │  │ Scores       │  │ Generator    │            │ │
│  │  └──────────────┘  └──────────────┘  └──────────────┘            │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                           │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                  Integration Layer                                 │ │
│  │  • Slack/Teams notifications    • Jira/ServiceNow ticketing       │ │
│  │  • Okta/Azure AD SSO           • AWS KMS encryption               │ │
│  └────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────┘

External Systems:
┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐
│ Okta SSO   │  │ Slack API  │  │ Jira API   │  │ AWS KMS    │
└────────────┘  └────────────┘  └────────────┘  └────────────┘
```

---

## Component Breakdown

### 1. Compliance Middleware Layer

**Purpose:** Intercept all agent actions for policy evaluation before execution.

**Components:**

#### 1.1 Action Interceptor
**Technology:** TypeScript/Node.js hooks injected into CFN v3 orchestrate.sh

**Responsibilities:**
- Hook into CFN orchestration lifecycle events
- Normalize actions from various sources (file ops, network, process spawn)
- Forward actions to Policy Engine for evaluation
- Block/allow actions based on policy decisions
- Attach execution tokens to allowed actions

**Interfaces:**
```typescript
interface IActionInterceptor {
  registerHook(hookPoint: HookPoint, handler: HookHandler): void;
  intercept(agentId: string, action: AgentAction): Promise<InterceptionResult>;
  normalizeAction(rawAction: any): AgentAction;
  handleDecision(decision: PolicyDecision): Promise<void>;
}
```

**Hook Points:**
- `pre_agent_spawn`: Before orchestrator spawns new agent
- `pre_file_operation`: Before any file read/write/delete
- `pre_network_request`: Before API calls or database queries
- `pre_process_spawn`: Before shell command execution
- `pre_data_transformation`: Before encryption/decryption operations

**Implementation Pattern:**
```typescript
// Inject into orchestrate.sh via environment variable
export CFN_COMPLIANCE_HOOK_URL="http://localhost:3000/api/v1/compliance/intercept"

// orchestrate.sh calls hook before agent action
curl -X POST "$CFN_COMPLIANCE_HOOK_URL" \
  -H "Authorization: Bearer $SERVICE_TOKEN" \
  -d "{\"agent_id\": \"$AGENT_ID\", \"action\": $ACTION_JSON}" \
  || exit 1  # Block on policy violation
```

#### 1.2 Policy Engine
**Technology:** TypeScript/Node.js with embedded JavaScript/Python evaluator

**Responsibilities:**
- Load policy packs from database/file system
- Evaluate policy rules against agent actions
- Aggregate multiple rule decisions (most restrictive wins)
- Cache decisions in Redis for performance
- Return ALLOW/DENY/WARN with detailed metadata

**Database Schema (PostgreSQL):**
```sql
CREATE TABLE policy_packs (
    pack_id VARCHAR(100) PRIMARY KEY,
    version VARCHAR(20) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    regulatory_framework VARCHAR(100),
    effective_date DATE,
    created_at TIMESTAMP DEFAULT NOW(),
    created_by VARCHAR(255),
    auditor_approved BOOLEAN DEFAULT FALSE,
    certification_date DATE,
    UNIQUE(pack_id, version)
);

CREATE TABLE policy_rules (
    rule_id VARCHAR(100) PRIMARY KEY,
    pack_id VARCHAR(100) REFERENCES policy_packs(pack_id),
    version VARCHAR(20),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    regulatory_reference VARCHAR(100),
    scope TEXT[],  -- Array of action types
    condition TEXT NOT NULL,  -- JavaScript/Python code
    condition_type VARCHAR(20) DEFAULT 'javascript',
    action VARCHAR(10) CHECK (action IN ('ALLOW', 'DENY', 'WARN')),
    severity VARCHAR(20) CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
    priority INTEGER DEFAULT 0,
    remediation TEXT,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_policy_rules_pack ON policy_rules(pack_id, version);
CREATE INDEX idx_policy_rules_scope ON policy_rules USING GIN(scope);
```

**Caching Strategy (Redis):**
```redis
# Cache key pattern
policy:decision:{pack_id}:{action_hash}

# Value: JSON PolicyDecision
{
  "decision": "DENY",
  "violated_rule": "hipaa_phi_encryption",
  "violation_code": "HIPAA-164.312(a)(2)(iv)",
  "reason": "...",
  "cached_at": 1700230400
}

# TTL: 300 seconds (5 minutes)
EXPIRE policy:decision:HIPAA_2024:abc123... 300
```

#### 1.3 Policy Pack Loader
**Technology:** TypeScript with YAML parser

**Responsibilities:**
- Load policy packs from file system or database
- Version management (support N-2 versions)
- Hot-reload on policy updates (no system restart)
- Validate policy syntax before deployment

**Storage Format (YAML):**
```yaml
# /etc/cfn/policies/HIPAA_2024_v1.2.0.yaml
pack_id: HIPAA_2024
version: 1.2.0
name: HIPAA Healthcare Compliance Pack
regulatory_framework: HIPAA
effective_date: 2024-01-01

rules:
  - rule_id: hipaa_phi_encryption
    name: PHI Encryption Requirement
    regulatory_reference: HIPAA-164.312(a)(2)(iv)
    scope: [FILE_WRITE, DATA_STORAGE]
    condition: |
      const containsPHI = resource.data_classification === 'PHI';
      const hasEncryption = action.encryption?.enabled;
      return containsPHI && !hasEncryption;
    action: DENY
    severity: CRITICAL
    remediation: |
      Enable AES-256-GCM encryption for all PHI data.
      See: https://docs.cfn.dev/compliance/hipaa-encryption
```

---

### 2. Audit & Logging Layer

**Purpose:** Provide tamper-proof, immutable audit trail for regulatory compliance.

#### 2.1 Audit Logger
**Technology:** TypeScript with PostgreSQL and Elasticsearch

**Responsibilities:**
- Log all compliance events (policy evaluations, violations, config changes)
- Generate hash chains for tamper detection
- Sign events with Ed25519 for cryptographic verification
- Replicate to backup storage (S3, GCS)
- Enforce retention policies (auto-delete after 7 years)

**Database Schema (PostgreSQL):**
```sql
CREATE TABLE audit_events (
    event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    timestamp TIMESTAMP(6) NOT NULL DEFAULT NOW(),  -- Nanosecond precision
    event_type VARCHAR(50) NOT NULL CHECK (event_type IN (
        'AGENT_ACTION', 'POLICY_EVAL', 'VIOLATION',
        'CONFIG_CHANGE', 'AGENT_SPAWN', 'USER_LOGIN'
    )),
    agent_id VARCHAR(100),
    user_id VARCHAR(255) NOT NULL,
    resource TEXT,
    operation VARCHAR(50),
    policy_rule VARCHAR(100),
    policy_pack VARCHAR(100),
    decision VARCHAR(10) CHECK (decision IN ('ALLOW', 'DENY', 'WARN')),
    violation_code VARCHAR(100),
    severity VARCHAR(20),
    context JSONB,  -- Flexible metadata
    hash_chain VARCHAR(64) NOT NULL,  -- SHA-256 of (event_data + previous_hash)
    signature TEXT NOT NULL,  -- Ed25519 signature
    retention_until DATE NOT NULL,  -- Auto-delete after this date
    created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_audit_timestamp ON audit_events(timestamp DESC);
CREATE INDEX idx_audit_agent ON audit_events(agent_id, timestamp DESC);
CREATE INDEX idx_audit_user ON audit_events(user_id, timestamp DESC);
CREATE INDEX idx_audit_violation ON audit_events(event_type, severity) WHERE event_type = 'VIOLATION';
CREATE INDEX idx_audit_retention ON audit_events(retention_until) WHERE retention_until <= CURRENT_DATE;

-- GIN index for JSONB context search
CREATE INDEX idx_audit_context ON audit_events USING GIN(context);

-- Prevent updates/deletes (append-only table)
CREATE TRIGGER prevent_audit_modification
    BEFORE UPDATE OR DELETE ON audit_events
    FOR EACH ROW
    EXECUTE FUNCTION reject_modification();

CREATE FUNCTION reject_modification() RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Audit events are immutable. Tampering attempt logged.';
END;
$$ LANGUAGE plpgsql;
```

**Hash Chain Implementation:**
```typescript
class AuditLogger {
  private lastEventHash: string = '';

  async logEvent(event: AuditEvent): Promise<string> {
    // Step 1: Serialize event to canonical JSON (deterministic order)
    const canonicalData = JSON.stringify(event, Object.keys(event).sort());

    // Step 2: Generate hash chain link
    const hashInput = canonicalData + this.lastEventHash;
    const hashChain = createHash('sha256').update(hashInput).digest('hex');

    // Step 3: Sign event with Ed25519 private key
    const signature = sign(canonicalData, this.signingKey);

    // Step 4: Insert into database
    const eventId = await this.db.query(`
      INSERT INTO audit_events (
        timestamp, event_type, agent_id, user_id, resource,
        operation, policy_rule, decision, violation_code,
        context, hash_chain, signature, retention_until
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING event_id
    `, [
      event.timestamp,
      event.event_type,
      event.agent_id,
      event.user_id,
      event.resource,
      event.operation,
      event.policy_rule,
      event.decision,
      event.violation_code,
      event.context,
      hashChain,
      signature,
      this.calculateRetentionDate(event)
    ]);

    // Step 5: Update last hash for next event
    this.lastEventHash = hashChain;

    // Step 6: Async replication to backup (non-blocking)
    this.replicateToS3(event).catch(err => {
      logger.error('S3 replication failed', err);
    });

    return eventId;
  }
}
```

#### 2.2 Elasticsearch Integration
**Purpose:** Fast full-text search across millions of audit events

**Index Mapping:**
```json
{
  "mappings": {
    "properties": {
      "event_id": { "type": "keyword" },
      "timestamp": { "type": "date", "format": "strict_date_optional_time_nanos" },
      "event_type": { "type": "keyword" },
      "agent_id": { "type": "keyword" },
      "user_id": { "type": "keyword" },
      "resource": { "type": "text", "fields": { "keyword": { "type": "keyword" } } },
      "operation": { "type": "keyword" },
      "policy_rule": { "type": "keyword" },
      "decision": { "type": "keyword" },
      "violation_code": { "type": "keyword" },
      "severity": { "type": "keyword" },
      "context": { "type": "object", "enabled": true }
    }
  },
  "settings": {
    "number_of_shards": 3,
    "number_of_replicas": 2,
    "index.lifecycle.name": "audit_logs_policy",
    "index.lifecycle.rollover_alias": "audit_logs"
  }
}
```

**Index Lifecycle Management (ILM):**
```json
{
  "policy": {
    "phases": {
      "hot": {
        "actions": {
          "rollover": {
            "max_size": "50GB",
            "max_age": "30d"
          }
        }
      },
      "warm": {
        "min_age": "30d",
        "actions": {
          "shrink": { "number_of_shards": 1 },
          "forcemerge": { "max_num_segments": 1 }
        }
      },
      "cold": {
        "min_age": "90d",
        "actions": {
          "freeze": {}
        }
      },
      "delete": {
        "min_age": "2555d",
        "actions": {
          "delete": {}
        }
      }
    }
  }
}
```

#### 2.3 S3 Archive Storage
**Purpose:** Long-term (7-year) retention with cost optimization

**Bucket Configuration:**
```yaml
bucket_name: cfn-compliance-audit-logs-archive
region: us-east-1
storage_class: GLACIER_DEEP_ARCHIVE  # $0.00099/GB/month

lifecycle_policy:
  - id: archive_old_logs
    status: Enabled
    transitions:
      - days: 90
        storage_class: GLACIER
      - days: 365
        storage_class: DEEP_ARCHIVE
    expiration:
      days: 2555  # 7 years

encryption:
  sse_algorithm: aws:kms
  kms_master_key_id: arn:aws:kms:us-east-1:123456789:key/...

versioning: Enabled
object_lock: Enabled  # Prevents deletion before retention period
```

**Archive Format:**
```
s3://cfn-compliance-audit-logs-archive/
  ├── 2024/
  │   ├── 01/
  │   │   ├── 01/
  │   │   │   ├── audit_events_2024-01-01.jsonl.gz  # Compressed JSONL
  │   │   │   ├── audit_events_2024-01-01.checksum.sha256
  │   │   │   └── audit_events_2024-01-01.signature.ed25519
  │   │   ├── 02/
  │   │   └── ...
  │   ├── 02/
  │   └── ...
  └── ...
```

---

### 3. Compliance Dashboard Layer

#### 3.1 Web Dashboard (React + TypeScript)
**Technology:** React 18, TypeScript, TailwindCSS, Recharts

**Components:**

**Violations Monitor:**
```typescript
// src/dashboard/components/ViolationsMonitor.tsx
import { useQuery } from 'react-query';
import { LineChart, Line, XAxis, YAxis, Tooltip } from 'recharts';

interface ViolationTrend {
  date: string;
  count: number;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}

export function ViolationsMonitor() {
  const { data: violations } = useQuery('violations/trend', () =>
    fetch('/api/v1/compliance/violations/trend?days=30').then(r => r.json())
  );

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-xl font-semibold mb-4">Violation Trends (30 Days)</h2>

      <LineChart width={800} height={300} data={violations}>
        <XAxis dataKey="date" />
        <YAxis />
        <Tooltip />
        <Line type="monotone" dataKey="count" stroke="#ef4444" name="Violations" />
      </LineChart>

      <div className="mt-4 grid grid-cols-4 gap-4">
        <MetricCard
          label="Total Violations"
          value={violations?.total || 0}
          trend="down"
        />
        <MetricCard
          label="Critical"
          value={violations?.critical || 0}
          color="red"
        />
        <MetricCard
          label="Open"
          value={violations?.open || 0}
          color="yellow"
        />
        <MetricCard
          label="MTTR"
          value={violations?.mttr_hours || 0}
          unit="hours"
        />
      </div>
    </div>
  );
}
```

**Compliance Scores:**
```typescript
// src/dashboard/components/ComplianceScores.tsx
export function ComplianceScores() {
  const { data: scores } = useQuery('compliance/scores', () =>
    fetch('/api/v1/compliance/scores?period=last_30_days').then(r => r.json())
  );

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-xl font-semibold mb-4">Compliance Scores by Team</h2>

      <table className="min-w-full divide-y divide-gray-200">
        <thead>
          <tr>
            <th>Team</th>
            <th>Score</th>
            <th>Grade</th>
            <th>Violations</th>
            <th>Trend</th>
          </tr>
        </thead>
        <tbody>
          {scores?.map(score => (
            <tr key={score.entity_id}>
              <td>{score.entity_name}</td>
              <td>
                <ScoreBar value={score.score} />
              </td>
              <td>
                <GradeBadge grade={score.grade} />
              </td>
              <td>{score.metrics.violations}</td>
              <td>
                <TrendIndicator trend={score.trend} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

#### 3.2 Report Generator
**Technology:** Node.js with Puppeteer (PDF generation)

**Report Types:**
- **SOC2 Type II Report:** Maps CFN activities to security controls
- **HIPAA Compliance Report:** PHI access audit, encryption verification
- **SOX Internal Controls Report:** Dual-approval workflows, change logs
- **GDPR Data Processing Report:** Cross-border transfers, data subject requests

**Implementation:**
```typescript
// src/reports/soc2-report.ts
import puppeteer from 'puppeteer';

export async function generateSOC2Report(
  startDate: Date,
  endDate: Date
): Promise<Buffer> {
  // Query audit events for report period
  const auditEvents = await db.query(`
    SELECT * FROM audit_events
    WHERE timestamp BETWEEN $1 AND $2
    ORDER BY timestamp ASC
  `, [startDate, endDate]);

  // Map events to SOC2 control objectives
  const controlMappings = mapEventsToControls(auditEvents);

  // Render HTML template
  const html = renderSOC2Template({
    period: { start: startDate, end: endDate },
    controls: controlMappings,
    violations: auditEvents.filter(e => e.event_type === 'VIOLATION'),
    verification: verifyHashChain(auditEvents)
  });

  // Generate PDF
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page.setContent(html);
  const pdf = await page.pdf({
    format: 'A4',
    printBackground: true,
    margin: { top: '1cm', right: '1cm', bottom: '1cm', left: '1cm' }
  });
  await browser.close();

  return pdf;
}

function mapEventsToControls(events: AuditEvent[]): ControlMapping[] {
  // SOC2 Trust Service Criteria mapping
  return [
    {
      control: 'CC6.1',
      objective: 'Logical and physical access controls',
      evidence: events.filter(e => e.event_type === 'USER_LOGIN'),
      compliance: calculateCompliance(events, 'CC6.1')
    },
    {
      control: 'CC7.2',
      objective: 'System monitoring',
      evidence: events.filter(e => e.event_type === 'POLICY_EVAL'),
      compliance: calculateCompliance(events, 'CC7.2')
    },
    // ... 60+ SOC2 controls
  ];
}
```

---

### 4. Integration Layer

#### 4.1 Notification System (Slack/Teams)
**Purpose:** Real-time alerts for policy violations

**Slack Integration:**
```typescript
// src/integrations/slack.ts
import { WebClient } from '@slack/web-api';

export async function sendViolationAlert(violation: Violation) {
  const slack = new WebClient(process.env.SLACK_TOKEN);

  await slack.chat.postMessage({
    channel: '#compliance-alerts',
    text: `🚨 Policy Violation Detected`,
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `🚨 ${violation.severity} Policy Violation`
        }
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Agent:*\n${violation.agent_id}` },
          { type: 'mrkdwn', text: `*Rule:*\n${violation.policy_rule}` },
          { type: 'mrkdwn', text: `*Code:*\n${violation.violation_code}` },
          { type: 'mrkdwn', text: `*Time:*\n${violation.timestamp}` }
        ]
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Reason:*\n${violation.reason}`
        }
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Remediation:*\n\`\`\`${violation.remediation}\`\`\``
        }
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: { type: 'plain_text', text: 'View in Dashboard' },
            url: `https://compliance.cfn.dev/violations/${violation.event_id}`
          },
          {
            type: 'button',
            text: { type: 'plain_text', text: 'Create Jira Ticket' },
            action_id: 'create_jira_ticket'
          }
        ]
      }
    ]
  });
}
```

#### 4.2 Ticketing System (Jira/ServiceNow)
**Purpose:** Automated violation remediation workflow

**Jira Integration:**
```typescript
// src/integrations/jira.ts
import JiraClient from 'jira-connector';

export async function createViolationTicket(violation: Violation): Promise<string> {
  const jira = new JiraClient({
    host: process.env.JIRA_HOST,
    basic_auth: {
      username: process.env.JIRA_USERNAME,
      password: process.env.JIRA_API_TOKEN
    }
  });

  const issue = await jira.issue.createIssue({
    fields: {
      project: { key: 'COMPLIANCE' },
      summary: `Policy Violation: ${violation.violation_code}`,
      description: `
        h2. Violation Details
        * *Agent:* ${violation.agent_id}
        * *Policy Rule:* ${violation.policy_rule}
        * *Violation Code:* ${violation.violation_code}
        * *Severity:* ${violation.severity}
        * *Timestamp:* ${violation.timestamp}

        h2. Reason
        ${violation.reason}

        h2. Remediation Steps
        {code}
        ${violation.remediation}
        {code}

        h2. Resources
        * [View in Compliance Dashboard|https://compliance.cfn.dev/violations/${violation.event_id}]
        * [Audit Log|https://compliance.cfn.dev/audit/${violation.event_id}]
      `,
      issuetype: { name: 'Bug' },
      priority: { name: mapSeverityToPriority(violation.severity) },
      labels: ['compliance', 'policy-violation', violation.policy_rule],
      assignee: { name: await getAgentOwner(violation.agent_id) }
    }
  });

  // Link violation to Jira ticket in database
  await db.query(`
    UPDATE audit_events
    SET context = jsonb_set(context, '{jira_ticket}', $1)
    WHERE event_id = $2
  `, [JSON.stringify(issue.key), violation.event_id]);

  return issue.key;
}
```

#### 4.3 Identity Provider (Okta/Azure AD)
**Purpose:** SSO and RBAC for compliance dashboard

**Okta SAML Integration:**
```typescript
// src/auth/okta-saml.ts
import passport from 'passport';
import { Strategy as SamlStrategy } from 'passport-saml';

passport.use(new SamlStrategy(
  {
    callbackUrl: process.env.OKTA_CALLBACK_URL,
    entryPoint: process.env.OKTA_ENTRY_POINT,
    issuer: 'cfn-compliance-dashboard',
    cert: process.env.OKTA_CERT,
    identifierFormat: null
  },
  async (profile, done) => {
    // Extract user details from SAML assertion
    const user = {
      id: profile.nameID,
      email: profile['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress'],
      name: profile['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name'],
      roles: profile['http://schemas.xmlsoap.org/claims/Group'] || []
    };

    // Map Okta groups to CFN roles
    const cfnRoles = mapOktaGroupsToCFNRoles(user.roles);

    // Store user session
    await db.query(`
      INSERT INTO user_sessions (user_id, email, roles, created_at)
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT (user_id) DO UPDATE SET roles = $3, last_login = NOW()
    `, [user.id, user.email, cfnRoles]);

    done(null, { ...user, cfnRoles });
  }
));
```

**RBAC Middleware:**
```typescript
// src/auth/rbac.ts
export function requireRole(requiredRole: Role) {
  return (req, res, next) => {
    const userRoles = req.user.cfnRoles;

    if (!userRoles.includes(requiredRole)) {
      return res.status(403).json({
        error: 'Forbidden',
        message: `Requires role: ${requiredRole}`,
        user_roles: userRoles
      });
    }

    next();
  };
}

// Usage in routes
app.get('/api/v1/compliance/violations',
  requireRole('COMPLIANCE_OFFICER'),
  async (req, res) => {
    // Only compliance officers can view all violations
  }
);
```

---

## API Design

### REST API Endpoints

#### Policy Evaluation API
```
POST /api/v1/policy/evaluate
Authorization: Bearer <service_token>
Content-Type: application/json

Request Body:
{
  "agent_id": "backend-dev-001",
  "action": {
    "type": "FILE_WRITE",
    "resource": "/data/patients/john_doe.json",
    "operation": "write",
    "data_classification": "PHI",
    "encryption": null
  },
  "policy_pack": "HIPAA_2024"
}

Response (200 OK - DENY):
{
  "decision": "DENY",
  "violated_rule": "hipaa_phi_encryption",
  "violation_code": "HIPAA-164.312(a)(2)(iv)",
  "reason": "PHI must be encrypted at rest using AES-256-GCM",
  "remediation": "Enable encryption before writing sensitive data",
  "severity": "CRITICAL",
  "evaluated_rules": ["hipaa_phi_encryption", "hipaa_access_controls"]
}

Response (200 OK - ALLOW):
{
  "decision": "ALLOW",
  "execution_token": "exec-abc123...",
  "ttl_seconds": 300,
  "conditions": ["Must use AES-256-GCM encryption"],
  "evaluated_rules": ["hipaa_phi_encryption"]
}
```

#### Audit Log API
```
GET /api/v1/audit/events?start=2024-01-01&end=2024-12-31&agent_id=backend-dev-001
Authorization: Bearer <user_token>

Response (200 OK):
{
  "total": 15420,
  "page": 1,
  "page_size": 100,
  "events": [
    {
      "event_id": "evt-789xyz...",
      "timestamp": "2024-11-17T10:30:00.123456Z",
      "event_type": "POLICY_VIOLATION",
      "agent_id": "backend-dev-001",
      "user_id": "dev@enterprise.com",
      "resource": "/data/patients/john_doe.json",
      "operation": "FILE_WRITE",
      "policy_rule": "hipaa_phi_encryption",
      "decision": "DENY",
      "violation_code": "HIPAA-164.312(a)(2)(iv)",
      "severity": "CRITICAL",
      "hash_chain": "sha256-abc123...",
      "signature": "ed25519-def456..."
    }
  ]
}
```

#### Compliance Score API
```
GET /api/v1/compliance/scores?entity_id=backend-dev-001&period=last_30_days
Authorization: Bearer <user_token>

Response (200 OK):
{
  "entity_id": "backend-dev-001",
  "entity_type": "AGENT",
  "policy_pack": "HIPAA_2024",
  "period": {
    "start": "2024-10-18",
    "end": "2024-11-17"
  },
  "metrics": {
    "total_evaluations": 12500,
    "violations": 34,
    "violation_rate": 0.0027,
    "remediated": 32,
    "mttr_hours": 6.5
  },
  "score": 92.3,
  "grade": "A",
  "trend": "IMPROVING"
}
```

#### Report Generation API
```
POST /api/v1/compliance/reports/generate
Authorization: Bearer <compliance_officer_token>
Content-Type: application/json

Request Body:
{
  "report_type": "SOC2_TYPE_II",
  "policy_pack": "HIPAA_2024",
  "period": {
    "start": "2024-01-01",
    "end": "2024-12-31"
  },
  "format": "PDF"
}

Response (202 Accepted):
{
  "report_id": "rpt-soc2-2024-001",
  "status": "GENERATING",
  "estimated_completion": "2024-11-17T10:35:00Z",
  "download_url": null
}

// Poll for completion
GET /api/v1/compliance/reports/rpt-soc2-2024-001

Response (200 OK):
{
  "report_id": "rpt-soc2-2024-001",
  "status": "COMPLETED",
  "download_url": "https://cdn.cfn.dev/reports/rpt-soc2-2024-001.pdf",
  "expires_at": "2024-11-18T10:35:00Z"
}
```

---

## Event Flows

### Flow 1: Policy Violation Detection and Remediation

```
1. Agent attempts non-compliant action
   └─> Action Interceptor intercepts file write
       └─> Policy Engine evaluates action
           └─> Rule "hipaa_phi_encryption" returns DENY

2. Violation logged to audit trail
   └─> Audit Logger creates event
       └─> Hash chain link generated
           └─> Event signed with Ed25519
               └─> Replicated to PostgreSQL + Elasticsearch + S3

3. Notifications sent
   ├─> Slack alert to #compliance-alerts channel
   ├─> Email to agent owner
   └─> PagerDuty alert for CRITICAL violations

4. Jira ticket created
   └─> Auto-assigned to agent owner
       └─> SLA: 24 hours for CRITICAL, 72 hours for HIGH

5. Developer fixes code
   └─> Resubmits action with encryption enabled
       └─> Policy Engine evaluates: ALLOW
           └─> Jira ticket updated: "Fix verified"

6. Compliance officer reviews
   └─> Marks violation as REMEDIATED
       └─> Updates compliance score
           └─> Dashboard reflects improvement
```

### Flow 2: Compliance Report Generation for Audit

```
1. Compliance officer requests SOC2 report
   └─> POST /api/v1/compliance/reports/generate

2. Report Generator queries audit events
   └─> PostgreSQL: SELECT * FROM audit_events WHERE ...
       └─> Returns 1.25M events for 12-month period

3. Events mapped to SOC2 controls
   └─> CC6.1: Access control events
   └─> CC7.2: System monitoring events
   └─> CC8.1: Change management events

4. Compliance calculations
   ├─> Total policy evaluations: 1,250,000
   ├─> Violations: 342 (0.027%)
   ├─> Remediated: 338 (98.8%)
   └─> Average MTTR: 12.5 hours

5. Hash chain verification
   └─> Verify integrity of all 1.25M events
       └─> Generate cryptographic proof for auditor

6. PDF rendering
   └─> Puppeteer generates 45-page report
       └─> Includes charts, tables, verification proof

7. Report delivered
   └─> Upload to S3
       └─> Pre-signed URL sent to compliance officer
           └─> Email with download link
```

---

## Security Model

### Authentication & Authorization

**Service Account (Machine-to-Machine):**
```
Policy Engine ←→ Agent (via Action Interceptor)
- Authentication: JWT service token
- Token lifetime: 1 hour
- Rotation: Automatic every 30 minutes
- Scopes: policy:evaluate, audit:write
```

**User Access (Dashboard):**
```
Compliance Officer → Dashboard
- Authentication: Okta SAML 2.0 SSO
- Session lifetime: 8 hours
- MFA: Required for all users
- Roles: COMPLIANCE_OFFICER, AUDITOR, VIEWER
```

**API Key (Integrations):**
```
Slack/Jira → Compliance API
- Authentication: API key in header
- Rotation: Manual (90-day expiry)
- Scopes: Limited to specific endpoints
```

### Encryption

**Data at Rest:**
- PostgreSQL: Transparent Data Encryption (TDE) via AWS RDS encryption
- S3: Server-side encryption with AWS KMS (SSE-KMS)
- Elasticsearch: Encryption at rest enabled

**Data in Transit:**
- TLS 1.3 for all HTTP traffic
- Certificate pinning for critical endpoints
- mTLS for service-to-service communication

**Key Management:**
```
AWS KMS Integration:
- Master key: aws/rds (managed by AWS)
- Data keys: Generated per encryption operation
- Key rotation: Automatic annual rotation
- Access control: IAM policies restrict key usage

Signing Keys (Ed25519):
- Private key stored in AWS Secrets Manager
- Public key distributed to auditors
- Rotation: Annual with backward compatibility
```

---

## Scalability Considerations

### Horizontal Scaling

**Policy Engine:**
- Stateless service (can run multiple instances)
- Load balancer distributes requests (round-robin)
- Redis cache shared across instances
- Target: 10,000 evaluations/second with 5 instances

**Audit Logger:**
- Write-heavy workload (100K events/day)
- Batch inserts to PostgreSQL (100 events/batch)
- Async replication to Elasticsearch (2-minute lag acceptable)
- Target: 50,000 events/day per instance

**Dashboard:**
- Read-heavy workload (compliance officers querying data)
- CDN for static assets (CloudFront)
- Redis cache for expensive queries (compliance scores)
- Target: 1,000 concurrent users

### Database Scaling

**PostgreSQL (Audit Events):**
- Vertical scaling: r6g.2xlarge (8 vCPU, 64GB RAM)
- Read replicas: 2 replicas for dashboard queries
- Partitioning: Monthly partitions (audit_events_2024_11)
- Archival: Move events older than 90 days to S3

**Elasticsearch:**
- 3-node cluster (hot-warm architecture)
- Hot nodes: Recent 30 days (SSD storage)
- Warm nodes: 31-90 days (HDD storage)
- Index rollover: Daily (or 50GB size limit)

**Redis (Policy Cache):**
- redis.r6g.large (2 vCPU, 13.07GB RAM)
- Replication: 1 primary + 2 read replicas
- Persistence: AOF (Append-Only File) for durability
- Eviction: LRU (Least Recently Used) when memory full

---

## Monitoring & Observability

### Metrics (Prometheus)

```yaml
# Policy Engine Metrics
cfn_policy_evaluations_total{decision="ALLOW|DENY|WARN"}  # Counter
cfn_policy_evaluation_duration_seconds                     # Histogram
cfn_policy_cache_hits_total                                 # Counter
cfn_policy_cache_misses_total                               # Counter

# Audit Logger Metrics
cfn_audit_events_written_total{event_type="..."}           # Counter
cfn_audit_write_duration_seconds                            # Histogram
cfn_audit_replication_lag_seconds                           # Gauge
cfn_audit_hash_chain_verifications_total{result="..."}     # Counter

# Compliance Dashboard Metrics
cfn_compliance_dashboard_requests_total{endpoint="..."}    # Counter
cfn_compliance_dashboard_response_duration_seconds         # Histogram
cfn_compliance_report_generation_duration_seconds          # Histogram
```

### Logs (Structured JSON)

```json
{
  "timestamp": "2024-11-17T10:30:00.123Z",
  "level": "INFO",
  "service": "policy-engine",
  "message": "Policy evaluation completed",
  "agent_id": "backend-dev-001",
  "policy_pack": "HIPAA_2024",
  "decision": "DENY",
  "violated_rule": "hipaa_phi_encryption",
  "duration_ms": 47,
  "trace_id": "abc123..."
}
```

### Traces (OpenTelemetry)

```
Agent Action Request
└─ Action Interceptor (5ms)
   └─ Policy Engine (45ms)
      ├─ Load Policy Pack (2ms)
      ├─ Evaluate Rules (40ms)
      │  ├─ Rule: hipaa_phi_encryption (35ms)
      │  └─ Rule: hipaa_access_controls (5ms)
      └─ Aggregate Decisions (3ms)
   └─ Audit Logger (8ms)
      ├─ Generate Hash Chain (3ms)
      ├─ Sign Event (2ms)
      └─ Write to PostgreSQL (3ms)
   └─ Notification Service (100ms, async)
      ├─ Slack Alert (80ms)
      └─ Jira Ticket (20ms)

Total: 158ms (53ms synchronous, 105ms async)
```

### Alerts (PagerDuty)

```yaml
alerts:
  - name: HighViolationRate
    condition: cfn_policy_evaluations_total{decision="DENY"} > 100/min
    severity: WARNING
    notify: compliance-team

  - name: AuditLogReplicationLag
    condition: cfn_audit_replication_lag_seconds > 300
    severity: CRITICAL
    notify: sre-oncall

  - name: HashChainBroken
    condition: cfn_audit_hash_chain_verifications_total{result="BROKEN"} > 0
    severity: CRITICAL
    notify: security-team, compliance-team

  - name: PolicyEngineDown
    condition: up{job="policy-engine"} == 0
    severity: CRITICAL
    notify: sre-oncall
```

---

## Deployment Model

### Container Architecture (Docker)

```dockerfile
# Dockerfile.policy-engine
FROM node:18-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --production

# Copy application code
COPY src/ ./src/
COPY policies/ ./policies/

# Security: Run as non-root user
RUN addgroup -g 1001 -S cfn && \
    adduser -S cfn -u 1001
USER cfn

# Health check
HEALTHCHECK --interval=30s --timeout=3s \
  CMD node healthcheck.js

EXPOSE 3000

CMD ["node", "src/policy-engine/server.js"]
```

### Kubernetes Deployment

```yaml
# k8s/policy-engine-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: policy-engine
  namespace: cfn-compliance
spec:
  replicas: 3
  selector:
    matchLabels:
      app: policy-engine
  template:
    metadata:
      labels:
        app: policy-engine
    spec:
      containers:
      - name: policy-engine
        image: cfn/policy-engine:v1.2.0
        ports:
        - containerPort: 3000
        env:
        - name: REDIS_URL
          valueFrom:
            secretKeyRef:
              name: redis-credentials
              key: url
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: postgres-credentials
              key: url
        resources:
          requests:
            cpu: 500m
            memory: 1Gi
          limits:
            cpu: 2000m
            memory: 4Gi
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /ready
            port: 3000
          initialDelaySeconds: 5
          periodSeconds: 5

---
apiVersion: v1
kind: Service
metadata:
  name: policy-engine
  namespace: cfn-compliance
spec:
  selector:
    app: policy-engine
  ports:
  - port: 80
    targetPort: 3000
  type: LoadBalancer
```

### Docker Compose (Development)

```yaml
# docker-compose.yml
version: '3.8'

services:
  policy-engine:
    build:
      context: .
      dockerfile: Dockerfile.policy-engine
    ports:
      - "3000:3000"
    environment:
      - REDIS_URL=redis://redis:6379
      - DATABASE_URL=postgresql://postgres:password@postgres:5432/cfn_compliance
    depends_on:
      - redis
      - postgres

  audit-logger:
    build:
      context: .
      dockerfile: Dockerfile.audit-logger
    ports:
      - "3001:3001"
    environment:
      - DATABASE_URL=postgresql://postgres:password@postgres:5432/cfn_compliance
      - ELASTICSEARCH_URL=http://elasticsearch:9200
    depends_on:
      - postgres
      - elasticsearch

  dashboard:
    build:
      context: .
      dockerfile: Dockerfile.dashboard
    ports:
      - "3002:80"
    environment:
      - API_URL=http://policy-engine:3000
    depends_on:
      - policy-engine

  postgres:
    image: postgres:15-alpine
    environment:
      - POSTGRES_DB=cfn_compliance
      - POSTGRES_PASSWORD=password
    volumes:
      - postgres-data:/var/lib/postgresql/data
      - ./schema.sql:/docker-entrypoint-initdb.d/schema.sql

  redis:
    image: redis:7-alpine
    command: redis-server --appendonly yes
    volumes:
      - redis-data:/data

  elasticsearch:
    image: docker.elastic.co/elasticsearch/elasticsearch:8.10.0
    environment:
      - discovery.type=single-node
      - xpack.security.enabled=false
    volumes:
      - elastic-data:/usr/share/elasticsearch/data

volumes:
  postgres-data:
  redis-data:
  elastic-data:
```

---

## Migration Path (CFN v3 → Compliance-Enabled)

### Phase 1: Foundation (Weeks 1-4)

**Tasks:**
1. Deploy PostgreSQL for audit events
2. Implement Audit Logger with hash chains
3. Build Policy Engine core (rule evaluation)
4. Create HIPAA policy pack (10 core rules)
5. Inject Action Interceptor into orchestrate.sh

**Migration Steps:**
```bash
# 1. Deploy database
docker-compose up -d postgres
psql -h localhost -U postgres -f schema.sql

# 2. Deploy audit logger
docker-compose up -d audit-logger

# 3. Deploy policy engine
docker-compose up -d policy-engine

# 4. Configure CFN v3 to use compliance hooks
export CFN_COMPLIANCE_HOOK_URL="http://localhost:3000/api/v1/compliance/intercept"
export COMPLIANCE_POLICY_PACK="HIPAA_2024"

# 5. Test with sample agent
./.claude/skills/cfn-agent-spawning/spawn-agent.sh \
  --type backend-developer \
  --task "Read patient data" \
  --compliance-mode enabled
```

### Phase 2: Integration (Weeks 5-8)

**Tasks:**
1. Integrate Okta SSO for dashboard
2. Build Slack notification system
3. Implement Jira ticket creation
4. Deploy Elasticsearch for audit search
5. Build compliance dashboard MVP

**Rollout Strategy:**
- Start with non-production environments
- Monitor false positive rate (<5% acceptable)
- Gradually enable policy packs per team
- Provide training on remediation workflows

### Phase 3: Advanced Features (Weeks 9-12)

**Tasks:**
1. Add GDPR, SOX, PCI-DSS policy packs
2. Implement policy simulation mode
3. Build report generator (PDF exports)
4. Add compliance score calculations
5. Deploy S3 archival for long-term retention

### Phase 4: Enterprise Hardening (Weeks 13-16)

**Tasks:**
1. Multi-tenancy support (isolate customers)
2. HSM integration for key management
3. Third-party audit certification (SOC2)
4. Performance optimization (target: <50ms P95)
5. Disaster recovery testing

---

**Document Version:** 1.0
**Last Updated:** 2024-11-17
**Author:** CFN System Architect
**Estimated Implementation:** 16 weeks (4-month timeline)
**Cost Estimate:** $120K engineering + $30K infrastructure (first year)
