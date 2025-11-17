# Cross-Organization Collaboration - Architecture

## System Architecture Overview

```
┌──────────────────────────────────────────────────────────────────────────┐
│                         Organization A (manufacturer.com)                │
│                                                                           │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                    CFN v3 Agent Platform                           │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐            │ │
│  │  │ Production   │  │ Inventory    │  │ Logistics    │            │ │
│  │  │ Planner      │  │ Manager      │  │ Coordinator  │            │ │
│  │  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘            │ │
│  └─────────┼──────────────────┼──────────────────┼────────────────────┘ │
│            │                  │                  │                      │
│            └──────────────────┼──────────────────┘                      │
│                               │                                         │
│  ┌────────────────────────────┼──────────────────────────────────────┐ │
│  │         Cross-Org Collaboration Layer                             │ │
│  │  ┌────────────────────────────────────────────────────────────┐  │ │
│  │  │                   Federation Gateway                       │  │ │
│  │  │  • mTLS Termination   • Session Management                │  │ │
│  │  │  • Identity Verification • Trust Score Engine             │  │ │
│  │  └───────────────────────┬────────────────────────────────────┘  │ │
│  │                          │                                        │ │
│  │  ┌────────────────────────────────────────────────────────────┐  │ │
│  │  │               Message Router & Queue                       │  │ │
│  │  │  • Encryption/Decryption  • Signature Verification        │  │ │
│  │  │  • Replay Protection      • Audit Logging                 │  │ │
│  │  └───────────────────────┬────────────────────────────────────┘  │ │
│  │                          │                                        │ │
│  │  ┌────────────────────────────────────────────────────────────┐  │ │
│  │  │            Negotiation & Cost Settlement Engine            │  │ │
│  │  │  • Resource Negotiation   • Smart Contracts               │  │ │
│  │  │  • Cost Tracking          • Payment Settlement            │  │ │
│  │  └────────────────────────────────────────────────────────────┘  │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                               │                                         │
└───────────────────────────────┼─────────────────────────────────────────┘
                                │
                    ┌───────────┼───────────┐
                    │   Federation Network  │
                    │   (mTLS + gRPC)      │
                    └───────────┼───────────┘
                                │
┌───────────────────────────────┼─────────────────────────────────────────┐
│                         Organization B (supplier.com)                   │
│                               │                                         │
│  ┌────────────────────────────┼──────────────────────────────────────┐ │
│  │         Cross-Org Collaboration Layer                             │ │
│  │                          (Mirror architecture)                     │ │
│  └────────────────────────────┼──────────────────────────────────────┘ │
│                               │                                         │
│  ┌────────────────────────────┼──────────────────────────────────────┐ │
│  │                    CFN v3 Agent Platform                           │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐            │ │
│  │  │ Inventory    │  │ Procurement  │  │ Quality      │            │ │
│  │  │ Manager      │  │ Agent        │  │ Control      │            │ │
│  │  └──────────────┘  └──────────────┘  └──────────────┘            │ │
│  └────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────┘

Shared External Services:
┌────────────────┐  ┌────────────────┐  ┌────────────────┐
│ Federation     │  │ Smart Contract │  │ Payment        │
│ Registry       │  │ Platform       │  │ Settlement     │
│ (DNS-SD)       │  │ (Ethereum)     │  │ (Stripe)       │
└────────────────┘  └────────────────┘  └────────────────┘
```

---

## Component Breakdown

### 1. Federation Gateway

**Purpose:** Secure entry point for cross-org communication with mTLS and identity verification.

**Technology Stack:**
- **Load Balancer:** NGINX with mTLS support
- **API Gateway:** Kong Gateway with rate limiting
- **Service Mesh:** Istio for service-to-service encryption
- **Certificate Management:** cert-manager + Let's Encrypt

**Components:**

#### 1.1 mTLS Termination
```yaml
# nginx-mtls.conf
server {
    listen 443 ssl;
    server_name cfn-federation.manufacturer.com;

    # Server certificate
    ssl_certificate /etc/nginx/certs/server.crt;
    ssl_certificate_key /etc/nginx/certs/server.key;

    # Client certificate verification (mTLS)
    ssl_client_certificate /etc/nginx/certs/trusted-cas.pem;
    ssl_verify_client on;
    ssl_verify_depth 2;

    # Strong ciphers only
    ssl_protocols TLSv1.3;
    ssl_ciphers 'TLS_AES_256_GCM_SHA384:TLS_CHACHA20_POLY1305_SHA256';

    # Client cert info passed to backend
    location / {
        proxy_set_header X-Client-Cert-DN $ssl_client_s_dn;
        proxy_set_header X-Client-Cert-Serial $ssl_client_serial;
        proxy_pass http://federation-backend;
    }
}
```

#### 1.2 Identity Verification Service
**Database Schema:**
```sql
CREATE TABLE verified_organizations (
    org_id VARCHAR(255) PRIMARY KEY,
    org_name VARCHAR(255) NOT NULL,
    domain VARCHAR(255) UNIQUE NOT NULL,
    duns_number VARCHAR(20),
    public_key TEXT NOT NULL,  -- Ed25519 public key
    certificate_serial VARCHAR(100) UNIQUE NOT NULL,
    verified_at TIMESTAMP NOT NULL,
    verification_method VARCHAR(50),  -- 'DOMAIN_OWNERSHIP', 'DUNS', 'MANUAL'
    verified_by VARCHAR(255),
    expires_at TIMESTAMP,
    status VARCHAR(20) DEFAULT 'ACTIVE',  -- ACTIVE, SUSPENDED, REVOKED
    metadata JSONB
);

CREATE TABLE federation_sessions (
    session_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    local_org VARCHAR(255) NOT NULL,
    remote_org VARCHAR(255) NOT NULL,
    session_key TEXT NOT NULL,  -- Encrypted session key
    capabilities JSONB NOT NULL,
    established_at TIMESTAMP DEFAULT NOW(),
    expires_at TIMESTAMP NOT NULL,
    last_activity_at TIMESTAMP DEFAULT NOW(),
    status VARCHAR(20) DEFAULT 'ACTIVE',  -- ACTIVE, EXPIRED, TERMINATED
    FOREIGN KEY (remote_org) REFERENCES verified_organizations(org_id)
);

CREATE INDEX idx_sessions_remote_org ON federation_sessions(remote_org, status);
CREATE INDEX idx_sessions_expires ON federation_sessions(expires_at) WHERE status = 'ACTIVE';
```

#### 1.3 Trust Score Engine
**Implementation:**
```typescript
// src/trust/trust-score-engine.ts
import { Organization, Collaboration, TrustScore } from './types';

export class TrustScoreEngine {
  private db: Database;
  private cache: Redis;

  async calculateScore(orgId: string): Promise<TrustScore> {
    // Check cache first
    const cached = await this.cache.get(`trust:${orgId}`);
    if (cached) return JSON.parse(cached);

    // Component scores
    const identity = await this.verifyIdentity(orgId);
    const compliance = await this.checkCompliance(orgId);
    const history = await this.calculateHistoricalSuccess(orgId);
    const sla = await this.calculateSLAReliability(orgId);
    const security = await this.checkSecurityHistory(orgId);

    // Weighted formula
    const score = (
      identity * 0.20 +
      compliance * 0.25 +
      history * 0.30 +
      sla * 0.15 +
      security * 0.10
    ) * 100;

    const trustScore: TrustScore = {
      org_id: orgId,
      score: Math.round(score * 100) / 100,
      components: { identity, compliance, history, sla, security },
      tier: this.determineTier(score),
      last_updated: new Date()
    };

    // Cache for 1 hour
    await this.cache.setex(`trust:${orgId}`, 3600, JSON.stringify(trustScore));

    return trustScore;
  }

  private determineTier(score: number): string {
    if (score >= 85) return 'VERIFIED_PARTNER';
    if (score >= 70) return 'TRUSTED';
    if (score >= 50) return 'UNVERIFIED';
    return 'BLOCKED';
  }
}
```

---

### 2. Message Router & Queue

**Purpose:** Route messages between agents across orgs with encryption and audit logging.

**Technology Stack:**
- **Message Queue:** RabbitMQ with federation plugin
- **Encryption:** libsodium (NaCl) for end-to-end encryption
- **Audit:** PostgreSQL + Elasticsearch

**Architecture:**

#### 2.1 RabbitMQ Federation Setup
```yaml
# rabbitmq.conf
federation_upstream.manufacturer {
    uri = amqps://manufacturer.com:5671
    exchange = cross-org.manufacturer
    trust_user_id = false
    max_hops = 1
}

federation_upstream.supplier {
    uri = amqps://supplier.com:5671
    exchange = cross-org.supplier
    trust_user_id = false
    max_hops = 1
}

# Policies for federation
rabbitmqctl set_policy federate-me \
    "^cross-org\." \
    '{"federation-upstream-set":"all"}' \
    --apply-to exchanges
```

#### 2.2 Message Schema (Protocol Buffers)
```protobuf
// cross_org_message.proto
syntax = "proto3";

package cfn.crossorg;

message CrossOrgMessage {
  string message_id = 1;
  string from_org = 2;
  string from_agent = 3;
  string to_org = 4;
  string to_agent = 5;

  MessageType type = 6;
  bytes encrypted_payload = 7;  // NaCl encrypted
  string signature = 8;  // Ed25519 signature

  int64 timestamp = 9;
  string nonce = 10;  // Replay protection

  map<string, string> metadata = 11;
}

enum MessageType {
  TASK_REQUEST = 0;
  TASK_RESPONSE = 1;
  DATA_QUERY = 2;
  DATA_RESPONSE = 3;
  NEGOTIATION_PROPOSAL = 4;
  NEGOTIATION_COUNTER = 5;
  NEGOTIATION_ACCEPT = 6;
  WORKFLOW_STATUS = 7;
}
```

#### 2.3 Encryption Service
```typescript
// src/encryption/nacl-encryption.ts
import * as nacl from 'tweetnacl';
import { decodeBase64, encodeBase64 } from 'tweetnacl-util';

export class MessageEncryption {
  /**
   * Encrypt message for recipient using their public key.
   * Uses NaCl box (X25519 + XSalsa20 + Poly1305).
   */
  encryptForRecipient(
    message: string,
    recipientPublicKey: string,
    senderSecretKey: string
  ): { encrypted: string; nonce: string } {
    const nonce = nacl.randomBytes(nacl.box.nonceLength);
    const messageBytes = new TextEncoder().encode(message);

    const encrypted = nacl.box(
      messageBytes,
      nonce,
      decodeBase64(recipientPublicKey),
      decodeBase64(senderSecretKey)
    );

    return {
      encrypted: encodeBase64(encrypted),
      nonce: encodeBase64(nonce)
    };
  }

  /**
   * Decrypt message from sender using their public key.
   */
  decryptFromSender(
    encrypted: string,
    nonce: string,
    senderPublicKey: string,
    recipientSecretKey: string
  ): string {
    const decrypted = nacl.box.open(
      decodeBase64(encrypted),
      decodeBase64(nonce),
      decodeBase64(senderPublicKey),
      decodeBase64(recipientSecretKey)
    );

    if (!decrypted) {
      throw new DecryptionError('Failed to decrypt message');
    }

    return new TextDecoder().decode(decrypted);
  }

  /**
   * Sign message with Ed25519.
   */
  signMessage(message: string, secretKey: string): string {
    const messageBytes = new TextEncoder().encode(message);
    const signature = nacl.sign.detached(
      messageBytes,
      decodeBase64(secretKey)
    );

    return encodeBase64(signature);
  }

  /**
   * Verify message signature.
   */
  verifySignature(
    message: string,
    signature: string,
    publicKey: string
  ): boolean {
    const messageBytes = new TextEncoder().encode(message);

    return nacl.sign.detached.verify(
      messageBytes,
      decodeBase64(signature),
      decodeBase64(publicKey)
    );
  }
}
```

---

### 3. Negotiation & Cost Settlement Engine

**Purpose:** Automate resource negotiation and financial settlement across orgs.

**Technology Stack:**
- **Blockchain:** Ethereum (smart contracts for escrow)
- **Payment:** Stripe Connect for fiat settlement
- **Database:** PostgreSQL for transaction history

**Components:**

#### 3.1 Smart Contract (Solidity)
```solidity
// contracts/CrossOrgEscrow.sol
pragma solidity ^0.8.0;

contract CrossOrgEscrow {
    struct Contract {
        address requester;
        address provider;
        uint256 amount;
        string resourceType;
        uint256 quantity;
        uint256 deadline;
        bool delivered;
        bool fundsReleased;
        bool disputed;
    }

    mapping(bytes32 => Contract) public contracts;

    event ContractCreated(bytes32 contractId, address requester, address provider, uint256 amount);
    event DeliveryConfirmed(bytes32 contractId);
    event FundsReleased(bytes32 contractId, uint256 amount);
    event DisputeRaised(bytes32 contractId);

    /**
     * Create new escrow contract.
     * Requester deposits funds which are locked until delivery.
     */
    function createContract(
        bytes32 contractId,
        address provider,
        string memory resourceType,
        uint256 quantity,
        uint256 deadline
    ) public payable {
        require(contracts[contractId].requester == address(0), "Contract already exists");
        require(msg.value > 0, "Must deposit funds");

        contracts[contractId] = Contract({
            requester: msg.sender,
            provider: provider,
            amount: msg.value,
            resourceType: resourceType,
            quantity: quantity,
            deadline: deadline,
            delivered: false,
            fundsReleased: false,
            disputed: false
        });

        emit ContractCreated(contractId, msg.sender, provider, msg.value);
    }

    /**
     * Provider marks delivery complete.
     */
    function confirmDelivery(bytes32 contractId) public {
        Contract storage c = contracts[contractId];
        require(msg.sender == c.provider, "Only provider can confirm delivery");
        require(!c.delivered, "Already delivered");

        c.delivered = true;

        emit DeliveryConfirmed(contractId);
    }

    /**
     * Requester approves delivery and releases funds.
     */
    function releaseFunds(bytes32 contractId) public {
        Contract storage c = contracts[contractId];
        require(msg.sender == c.requester, "Only requester can release funds");
        require(c.delivered, "Not yet delivered");
        require(!c.fundsReleased, "Already released");

        c.fundsReleased = true;

        payable(c.provider).transfer(c.amount);

        emit FundsReleased(contractId, c.amount);
    }

    /**
     * Either party can raise dispute.
     */
    function raiseDispute(bytes32 contractId) public {
        Contract storage c = contracts[contractId];
        require(
            msg.sender == c.requester || msg.sender == c.provider,
            "Not a party to this contract"
        );

        c.disputed = true;

        emit DisputeRaised(contractId);
    }

    /**
     * Timeout: Auto-release funds if requester doesn't approve within deadline.
     */
    function timeoutRelease(bytes32 contractId) public {
        Contract storage c = contracts[contractId];
        require(c.delivered, "Not yet delivered");
        require(!c.fundsReleased, "Already released");
        require(block.timestamp > c.deadline + 7 days, "Deadline not reached");

        c.fundsReleased = true;

        payable(c.provider).transfer(c.amount);

        emit FundsReleased(contractId, c.amount);
    }
}
```

#### 3.2 Negotiation Engine (TypeScript)
```typescript
// src/negotiation/negotiation-engine.ts

export class NegotiationEngine {
  private db: Database;
  private blockchain: EthereumClient;

  async negotiate(request: NegotiationRequest): Promise<NegotiationResult> {
    const negotiation: Negotiation = {
      id: generateUUID(),
      requester_org: request.requester_org,
      provider_org: request.provider_org,
      resource: request.resource,
      status: 'PROPOSED',
      rounds: [],
      created_at: new Date()
    };

    // Round 1: Send initial proposal
    await this.sendProposal(request.provider_org, request.initial_terms);

    negotiation.rounds.push({
      round: 1,
      actor: 'requester',
      type: 'PROPOSAL',
      terms: request.initial_terms
    });

    // Negotiation loop
    let maxRounds = 10;
    let currentRound = 2;

    while (currentRound <= maxRounds) {
      // Wait for response (60s timeout)
      const response = await this.waitForResponse(
        negotiation.id,
        timeout_ms: 60000
      );

      if (!response) {
        negotiation.status = 'TIMEOUT';
        break;
      }

      negotiation.rounds.push({
        round: currentRound,
        actor: 'provider',
        type: response.type,
        terms: response.terms
      });

      if (response.type === 'ACCEPT') {
        // Agreement reached
        negotiation.status = 'ACCEPTED';
        negotiation.final_terms = response.terms;

        // Create smart contract
        const contract = await this.createSmartContract(
          negotiation.requester_org,
          negotiation.provider_org,
          response.terms
        );

        negotiation.contract_id = contract.id;
        break;
      }

      if (response.type === 'REJECT') {
        negotiation.status = 'REJECTED';
        break;
      }

      // Counter-offer
      const evaluation = this.evaluateCounterOffer(
        request.initial_terms,
        response.terms,
        currentRound
      );

      if (evaluation.decision === 'ACCEPT') {
        await this.sendAcceptance(negotiation.provider_org, response.terms);
        negotiation.status = 'ACCEPTED';
        negotiation.final_terms = response.terms;

        const contract = await this.createSmartContract(
          negotiation.requester_org,
          negotiation.provider_org,
          response.terms
        );

        negotiation.contract_id = contract.id;
        break;
      }

      const counterOffer = this.generateCounterOffer(
        request.initial_terms,
        response.terms,
        currentRound
      );

      await this.sendCounterOffer(negotiation.provider_org, counterOffer);

      negotiation.rounds.push({
        round: currentRound + 1,
        actor: 'requester',
        type: 'COUNTER',
        terms: counterOffer
      });

      currentRound += 2;
    }

    // Store negotiation history
    await this.db.query(
      `INSERT INTO negotiations (id, requester_org, provider_org, status, rounds, contract_id, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        negotiation.id,
        negotiation.requester_org,
        negotiation.provider_org,
        negotiation.status,
        JSON.stringify(negotiation.rounds),
        negotiation.contract_id,
        negotiation.created_at
      ]
    );

    return {
      success: negotiation.status === 'ACCEPTED',
      contract_id: negotiation.contract_id,
      final_terms: negotiation.final_terms,
      rounds: negotiation.rounds.length
    };
  }

  private async createSmartContract(
    requester: string,
    provider: string,
    terms: Terms
  ): Promise<{ id: string }> {
    const contractId = this.generateContractId(requester, provider, terms);

    // Deploy smart contract on blockchain
    const tx = await this.blockchain.contracts.CrossOrgEscrow.createContract(
      contractId,
      provider,
      terms.resource,
      terms.quantity,
      terms.deadline,
      { value: ethers.utils.parseEther(terms.cost.toString()) }
    );

    await tx.wait();

    return { id: contractId };
  }
}
```

---

## API Design

### gRPC Service Definitions

```protobuf
// federation.proto
service FederationService {
  rpc DiscoverOrganizations(DiscoveryRequest) returns (stream Organization);
  rpc InitiateHandshake(HandshakeRequest) returns (HandshakeResponse);
  rpc TerminateSession(SessionTerminationRequest) returns (Empty);
  rpc GetTrustScore(TrustScoreRequest) returns (TrustScore);
}

service CrossOrgMessaging {
  rpc SendMessage(CrossOrgMessage) returns (MessageReceipt);
  rpc StreamMessages(MessageStreamRequest) returns (stream CrossOrgMessage);
  rpc AcknowledgeMessage(MessageAck) returns (Empty);
}

service ResourceNegotiation {
  rpc ProposeTerms(NegotiationProposal) returns (NegotiationResponse);
  rpc CounterOffer(NegotiationCounter) returns (NegotiationResponse);
  rpc AcceptTerms(NegotiationAcceptance) returns (ContractDetails);
}

service WorkflowOrchestration {
  rpc DelegateTask(TaskDelegation) returns (TaskReceipt);
  rpc GetTaskStatus(TaskStatusRequest) returns (TaskStatus);
  rpc CancelTask(TaskCancellation) returns (Empty);
}
```

---

## Security Model

### Key Management

**Key Types:**
1. **Organization Identity Key (Ed25519):**
   - Generated once per org
   - Used for signing all messages
   - Stored in HSM or AWS Secrets Manager
   - Rotation: Annual with backward compatibility

2. **Session Keys (X25519):**
   - Generated per federation session
   - Used for message encryption
   - Ephemeral (24-hour lifetime)
   - Rotation: Automatic on session renewal

3. **TLS Certificates:**
   - Issued by Let's Encrypt or internal CA
   - Used for mTLS connections
   - Rotation: 90-day automatic renewal

**Key Storage:**
```yaml
# AWS Secrets Manager structure
secrets:
  - name: cfn/federation/org-identity-key
    value: { private: "...", public: "..." }
    rotation: ANNUAL

  - name: cfn/federation/session-keys/{session_id}
    value: { key: "...", expires: "2024-11-18T10:00:00Z" }
    rotation: ON_EXPIRY
```

---

## Scalability

### Horizontal Scaling

**Federation Gateway:**
- **Load Balancer:** NGINX (5 instances)
- **API Servers:** Node.js (10 instances, auto-scaling)
- **Message Queue:** RabbitMQ cluster (3 nodes)
- **Target:** 10,000 concurrent federation sessions

**Database Scaling:**
- **PostgreSQL:** Primary + 2 read replicas
- **Partitioning:** Monthly partitions for audit logs
- **Connection Pooling:** PgBouncer (1,000 connections)

**Message Queue:**
- **RabbitMQ:** 3-node cluster with mirrored queues
- **Throughput:** 50,000 messages/second
- **Durability:** Persistent messages with replication

---

## Monitoring

### Metrics

```yaml
# Prometheus metrics
cfn_federation_sessions_active: 245
cfn_federation_messages_sent_total: 1.2M
cfn_federation_messages_received_total: 980K
cfn_federation_negotiation_success_rate: 0.82
cfn_federation_trust_score_average: 76.5
cfn_federation_message_latency_p95_ms: 180
```

### Alerts

```yaml
- alert: FederationSessionFailureRate
  expr: rate(cfn_federation_handshake_failures[5m]) > 0.1
  severity: warning
  notify: ops-team

- alert: MessageDeliveryFailure
  expr: rate(cfn_federation_message_delivery_failures[5m]) > 0.05
  severity: critical
  notify: ops-team, engineering-oncall
```

---

## Deployment

### Kubernetes Deployment

```yaml
# k8s/federation-gateway.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: federation-gateway
spec:
  replicas: 5
  selector:
    matchLabels:
      app: federation-gateway
  template:
    spec:
      containers:
      - name: gateway
        image: cfn/federation-gateway:v1.0.0
        ports:
        - containerPort: 443
        env:
        - name: ORG_ID
          value: "manufacturer.com"
        - name: IDENTITY_KEY
          valueFrom:
            secretKeyRef:
              name: org-identity-key
              key: private
        resources:
          requests:
            cpu: 1000m
            memory: 2Gi
          limits:
            cpu: 4000m
            memory: 8Gi
---
apiVersion: v1
kind: Service
metadata:
  name: federation-gateway
spec:
  type: LoadBalancer
  selector:
    app: federation-gateway
  ports:
  - port: 443
    targetPort: 443
```

---

## Migration Path

### Phase 1: Foundation (Weeks 1-4)
- Deploy federation gateway with mTLS
- Implement identity verification
- Build message router with encryption
- Create trust score engine

### Phase 2: Integration (Weeks 5-8)
- Integrate with CFN v3 orchestrator
- Build negotiation engine
- Deploy smart contracts to testnet
- Create partner portal

### Phase 3: Production (Weeks 9-12)
- Onboard first 10 partner orgs
- Deploy to mainnet (Ethereum)
- Enable cost settlement
- Monitor and optimize

---

**Document Version:** 1.0
**Last Updated:** 2024-11-17
**Author:** CFN System Architect
**Estimated Implementation:** 12 weeks
**Cost Estimate:** $200K engineering + $50K infrastructure
