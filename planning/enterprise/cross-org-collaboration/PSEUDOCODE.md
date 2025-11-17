# Cross-Organization Collaboration - Pseudocode

## Core Algorithms

### Algorithm 1: Federation Handshake Protocol

```python
class FederationProtocol:
    """
    Implements secure handshake between CFN instances from different organizations.
    Uses mTLS + JWT for authentication, Protocol Buffers for efficiency.
    """

    def __init__(self, org_config, certificate_path):
        self.org_id = org_config['org_id']
        self.private_key = load_private_key(org_config['private_key_path'])
        self.public_key = org_config['public_key']
        self.cert = load_certificate(certificate_path)
        self.trusted_cas = load_trusted_cas()

    async def discover_partners(self, service_type: str = None) -> List[Organization]:
        """
        Discover partner organizations via DNS-SD or federation registry.

        Discovery Methods:
        1. DNS-SD (mDNS): For local/private networks
        2. Central Registry: For public federation
        3. Manual Configuration: For enterprise partnerships
        """

        # Method 1: Query DNS for CFN federation endpoints
        dns_records = await dns.query(
            name="_cfn-federation._tcp.local",
            type="SRV"
        )

        discovered_orgs = []

        for record in dns_records:
            # Extract org info from DNS TXT record
            txt_data = await dns.query(record.name, type="TXT")
            org_info = parse_org_info(txt_data)

            # Verify organization identity
            if await self.verify_organization(org_info):
                discovered_orgs.append(org_info)

        # Method 2: Query central federation registry
        if not discovered_orgs:
            registry_orgs = await self.query_federation_registry(service_type)
            discovered_orgs.extend(registry_orgs)

        return discovered_orgs

    async def initiate_handshake(self, partner_org: Organization) -> FederationSession:
        """
        Establish secure federation session with partner organization.

        Handshake Steps:
        1. mTLS connection establishment
        2. Mutual certificate verification
        3. Capability exchange
        4. Session key negotiation
        5. Trust score verification
        """

        # Step 1: Establish mTLS connection
        ssl_context = ssl.create_default_context(ssl.Purpose.CLIENT_AUTH)
        ssl_context.load_cert_chain(self.cert, self.private_key)
        ssl_context.load_verify_locations(cafile=self.trusted_cas)
        ssl_context.check_hostname = True
        ssl_context.verify_mode = ssl.CERT_REQUIRED

        try:
            conn = await asyncio.open_connection(
                host=partner_org.federation_endpoint,
                port=443,
                ssl=ssl_context
            )
        except ssl.SSLError as e:
            raise FederationError(f"mTLS handshake failed: {e}")

        # Step 2: Verify partner certificate
        peer_cert = conn.getpeercert()
        if not self.verify_certificate(peer_cert, partner_org):
            raise FederationError("Partner certificate verification failed")

        # Step 3: Send handshake message
        handshake_msg = FederationHandshake(
            org_id=self.org_id,
            cfn_instance_id=os.environ['CFN_INSTANCE_ID'],
            public_key=self.public_key,
            capabilities=self.get_capabilities(),
            compliance_certifications=self.get_compliance_certs()
        )

        # Sign handshake with private key
        handshake_msg.signature = self.sign(handshake_msg, self.private_key)

        await conn.send(handshake_msg.SerializeToString())

        # Step 4: Receive partner handshake
        partner_handshake_data = await conn.recv(4096)
        partner_handshake = FederationHandshake()
        partner_handshake.ParseFromString(partner_handshake_data)

        # Verify partner signature
        if not self.verify_signature(partner_handshake, partner_org.public_key):
            raise FederationError("Partner handshake signature invalid")

        # Step 5: Negotiate session key (ECDH key exchange)
        session_key = self.negotiate_session_key(partner_handshake.public_key)

        # Step 6: Verify trust score
        trust_score = await self.get_trust_score(partner_org.org_id)
        if trust_score < 50:
            raise FederationError(f"Partner trust score too low: {trust_score}")

        # Step 7: Create session
        session = FederationSession(
            session_id=generate_uuid(),
            local_org=self.org_id,
            remote_org=partner_org.org_id,
            session_key=session_key,
            capabilities=partner_handshake.capabilities,
            established_at=datetime.utcnow(),
            expires_at=datetime.utcnow() + timedelta(hours=24)
        )

        # Store session
        await self.session_store.put(session.session_id, session)

        # Log handshake to audit trail
        await self.audit_logger.log({
            'event_type': 'FEDERATION_HANDSHAKE',
            'partner_org': partner_org.org_id,
            'session_id': session.session_id,
            'trust_score': trust_score
        })

        return session
```

### Algorithm 2: Cross-Org Message Routing

```python
class CrossOrgMessageRouter:
    """
    Routes messages between agents across organizational boundaries.
    Implements encryption, signature verification, and audit logging.
    """

    def __init__(self, message_queue, audit_logger):
        self.queue = message_queue
        self.audit = audit_logger
        self.sessions = {}  # Active federation sessions

    async def send_message(
        self,
        from_agent: str,
        to_org: str,
        to_agent: str,
        message_type: MessageType,
        payload: dict
    ) -> MessageReceipt:
        """
        Send message to agent in different organization.

        Security Flow:
        1. Look up federation session
        2. Encrypt payload with recipient's public key
        3. Sign message with sender's private key
        4. Add nonce for replay protection
        5. Route through message queue
        6. Log to audit trail
        """

        # Step 1: Get federation session
        session = self.sessions.get(to_org)
        if not session or session.is_expired():
            # Establish new session
            partner_org = await self.discover_org(to_org)
            session = await self.federation_protocol.initiate_handshake(partner_org)
            self.sessions[to_org] = session

        # Step 2: Encrypt payload
        recipient_public_key = session.get_recipient_public_key(to_agent)
        encrypted_payload = self.encrypt(
            data=json.dumps(payload),
            recipient_public_key=recipient_public_key
        )

        # Step 3: Build message
        message = CrossOrgMessage(
            message_id=generate_uuid(),
            from_org=self.org_id,
            from_agent=from_agent,
            to_org=to_org,
            to_agent=to_agent,
            type=message_type,
            payload=encrypted_payload,
            timestamp=int(time.time() * 1000),
            nonce=generate_nonce(),
            metadata={
                'session_id': session.session_id,
                'correlation_id': self.get_correlation_id()
            }
        )

        # Step 4: Sign message
        message.signature = self.sign(message, self.private_key)

        # Step 5: Check data sharing policy
        policy_decision = await self.data_sharing_policy.evaluate(
            data=payload,
            destination_org=to_org
        )

        if policy_decision.decision == "DENY":
            raise DataSharingViolation(policy_decision.reason)

        if policy_decision.anonymization_required:
            # Re-encrypt with anonymized payload
            anonymized_payload = self.anonymize_data(payload)
            message.payload = self.encrypt(anonymized_payload, recipient_public_key)

        # Step 6: Route message
        await self.queue.publish(
            exchange=f"cross-org.{to_org}",
            routing_key=f"agent.{to_agent}",
            message=message.SerializeToString()
        )

        # Step 7: Audit log
        await self.audit.log({
            'event_type': 'CROSS_ORG_MESSAGE_SENT',
            'message_id': message.message_id,
            'from_agent': from_agent,
            'to_org': to_org,
            'to_agent': to_agent,
            'message_type': message_type,
            'anonymized': policy_decision.anonymization_required
        })

        return MessageReceipt(
            message_id=message.message_id,
            status='SENT',
            timestamp=message.timestamp
        )

    async def receive_messages(self, agent_id: str) -> AsyncIterator[CrossOrgMessage]:
        """
        Receive messages from partner organizations.

        Verification Flow:
        1. Dequeue message from queue
        2. Verify sender signature
        3. Check replay attack (nonce + timestamp)
        4. Decrypt payload
        5. Validate against data sharing policy
        6. Deliver to agent
        """

        async for raw_message in self.queue.consume(f"agent.{agent_id}"):
            message = CrossOrgMessage()
            message.ParseFromString(raw_message)

            try:
                # Step 1: Verify session exists
                session = self.sessions.get(message.from_org)
                if not session:
                    raise InvalidSessionError(f"No session for {message.from_org}")

                # Step 2: Verify signature
                sender_public_key = session.get_sender_public_key(message.from_agent)
                if not self.verify_signature(message, sender_public_key):
                    raise SignatureVerificationError("Invalid message signature")

                # Step 3: Check replay attack
                if not self.is_message_fresh(message):
                    raise ReplayAttackDetected(f"Message too old or nonce reused")

                # Step 4: Decrypt payload
                decrypted_payload = self.decrypt(
                    encrypted_data=message.payload,
                    private_key=self.private_key
                )

                message.payload = decrypted_payload

                # Step 5: Validate data sharing policy
                policy_decision = await self.data_sharing_policy.evaluate_received(
                    data=decrypted_payload,
                    source_org=message.from_org
                )

                if policy_decision.decision == "DENY":
                    raise DataSharingViolation(policy_decision.reason)

                # Step 6: Audit log
                await self.audit.log({
                    'event_type': 'CROSS_ORG_MESSAGE_RECEIVED',
                    'message_id': message.message_id,
                    'from_org': message.from_org,
                    'from_agent': message.from_agent,
                    'to_agent': agent_id
                })

                # Step 7: Acknowledge receipt
                await self.queue.ack(raw_message)

                yield message

            except (SignatureVerificationError, ReplayAttackDetected) as e:
                # Security violation - log and reject
                await self.audit.log({
                    'event_type': 'SECURITY_VIOLATION',
                    'message_id': message.message_id,
                    'violation_type': type(e).__name__,
                    'from_org': message.from_org
                })

                await self.queue.reject(raw_message)
```

### Algorithm 3: Resource Negotiation Engine

```python
class ResourceNegotiationEngine:
    """
    Automated negotiation of resources between agents across orgs.
    Uses game theory and ML to optimize negotiation strategies.
    """

    def __init__(self, strategy='ai_powered'):
        self.strategy = strategy
        self.negotiation_history = []
        if strategy == 'ai_powered':
            self.model = load_negotiation_model()

    async def negotiate(
        self,
        requester_agent: str,
        provider_org: str,
        resource_request: ResourceRequest
    ) -> NegotiationResult:
        """
        Conduct automated resource negotiation.

        Negotiation Flow:
        1. Requester proposes terms
        2. Provider evaluates and responds (accept/counter/reject)
        3. Requester evaluates counter-offer
        4. Iterate until agreement or max rounds
        5. Lock terms in smart contract
        """

        negotiation = Negotiation(
            negotiation_id=generate_uuid(),
            requester_agent=requester_agent,
            provider_org=provider_org,
            resource=resource_request,
            status='PROPOSED',
            rounds=[]
        )

        # Round 1: Requester proposes initial terms
        initial_proposal = self.generate_proposal(resource_request)

        await self.send_proposal(provider_org, initial_proposal)

        negotiation.rounds.append({
            'round': 1,
            'actor': 'requester',
            'type': 'PROPOSAL',
            'terms': initial_proposal
        })

        # Negotiation loop (max 10 rounds)
        for round_num in range(2, 11):
            # Wait for provider response
            response = await self.wait_for_response(
                provider_org=provider_org,
                negotiation_id=negotiation.negotiation_id,
                timeout_seconds=60
            )

            if response.type == 'ACCEPT':
                # Provider accepted our terms
                negotiation.status = 'ACCEPTED'
                negotiation.final_terms = response.terms
                break

            elif response.type == 'REJECT':
                # Provider rejected - negotiation failed
                negotiation.status = 'REJECTED'
                negotiation.rejection_reason = response.reason
                break

            elif response.type == 'COUNTER':
                # Provider counter-offered
                negotiation.rounds.append({
                    'round': round_num,
                    'actor': 'provider',
                    'type': 'COUNTER',
                    'terms': response.terms
                })

                # Evaluate counter-offer
                evaluation = self.evaluate_counter_offer(
                    original_request=resource_request,
                    counter_offer=response.terms,
                    round=round_num
                )

                if evaluation.decision == 'ACCEPT':
                    # Accept provider's terms
                    await self.send_acceptance(provider_org, response.terms)
                    negotiation.status = 'ACCEPTED'
                    negotiation.final_terms = response.terms
                    break

                elif evaluation.decision == 'COUNTER':
                    # Make another counter-offer
                    new_proposal = self.generate_counter_offer(
                        our_last_proposal=initial_proposal,
                        their_counter=response.terms,
                        round=round_num
                    )

                    await self.send_counter_offer(provider_org, new_proposal)

                    negotiation.rounds.append({
                        'round': round_num + 1,
                        'actor': 'requester',
                        'type': 'COUNTER',
                        'terms': new_proposal
                    })

                else:  # evaluation.decision == 'REJECT'
                    # Reject provider's terms - negotiation failed
                    await self.send_rejection(provider_org, evaluation.reason)
                    negotiation.status = 'REJECTED'
                    break

            # Max rounds reached
            if round_num == 10:
                negotiation.status = 'TIMEOUT'

        # If accepted, create smart contract
        if negotiation.status == 'ACCEPTED':
            contract = await self.create_smart_contract(
                requester=requester_agent,
                provider=provider_org,
                terms=negotiation.final_terms
            )

            negotiation.contract_id = contract.id

        # Log negotiation outcome
        await self.audit_logger.log({
            'event_type': 'NEGOTIATION_COMPLETED',
            'negotiation_id': negotiation.negotiation_id,
            'status': negotiation.status,
            'rounds': len(negotiation.rounds),
            'contract_id': negotiation.contract_id if negotiation.status == 'ACCEPTED' else None
        })

        return NegotiationResult(
            success=(negotiation.status == 'ACCEPTED'),
            contract_id=negotiation.contract_id,
            final_terms=negotiation.final_terms,
            rounds=len(negotiation.rounds)
        )

    def generate_counter_offer(
        self,
        our_last_proposal: Terms,
        their_counter: Terms,
        round: int
    ) -> Terms:
        """
        Generate counter-offer using negotiation strategy.

        Strategies:
        - Fixed Price: No counters, reject if not acceptable
        - Concede Slowly: Move 10% toward their terms each round
        - AI-Powered: ML model predicts optimal counter
        """

        if self.strategy == 'ai_powered':
            # Use ML model to predict optimal counter
            features = self.extract_negotiation_features(
                our_proposal=our_last_proposal,
                their_counter=their_counter,
                round=round,
                history=self.negotiation_history
            )

            counter_offer = self.model.predict_counter_offer(features)

        elif self.strategy == 'concede_slowly':
            # Move 10% toward their terms
            counter_offer = Terms(
                price=our_last_proposal.price + 0.1 * (their_counter.price - our_last_proposal.price),
                quantity=our_last_proposal.quantity + 0.1 * (their_counter.quantity - our_last_proposal.quantity),
                deadline=interpolate_date(our_last_proposal.deadline, their_counter.deadline, 0.1)
            )

        else:  # fixed_price
            # No counter-offers, just reject
            return None

        return counter_offer
```

### Algorithm 4: Trust Score Calculation

```python
class TrustScoreEngine:
    """
    Calculate and maintain trust scores for partner organizations.
    Uses multiple signals: identity verification, compliance, history, performance.
    """

    def calculate_trust_score(self, org_id: str) -> TrustScore:
        """
        Calculate comprehensive trust score for organization.

        Formula:
        trust_score = (
          identity_verification * 0.20 +
          compliance_certification * 0.25 +
          historical_success_rate * 0.30 +
          response_time_reliability * 0.15 +
          data_breach_history * 0.10
        ) * 100
        """

        # Component 1: Identity Verification (0-1)
        identity_score = self.verify_org_identity(org_id)
        # Checks: domain ownership, DUNS number, legal entity verification

        # Component 2: Compliance Certification (0-1)
        compliance_score = self.check_compliance_certs(org_id)
        # Checks: SOC2, HIPAA, ISO27001, GDPR compliance

        # Component 3: Historical Success Rate (0-1)
        collaborations = self.get_collaboration_history(org_id)
        total = len(collaborations)
        successful = len([c for c in collaborations if c.success])
        historical_score = successful / total if total > 0 else 0.5  # Default to 0.5 for new orgs

        # Component 4: Response Time Reliability (0-1)
        sla_metrics = self.get_sla_metrics(org_id)
        sla_met = sla_metrics.requests_met_sla
        sla_total = sla_metrics.total_requests
        sla_score = sla_met / sla_total if sla_total > 0 else 0.5

        # Component 5: Data Breach History (0-1)
        breaches = self.get_breach_history(org_id, months=12)
        breach_score = max(0, 1 - (len(breaches) / 10))  # 10 breaches = 0 score

        # Weighted sum
        trust_score = (
            identity_score * 0.20 +
            compliance_score * 0.25 +
            historical_score * 0.30 +
            sla_score * 0.15 +
            breach_score * 0.10
        ) * 100

        # Determine tier
        if trust_score >= 85:
            tier = 'VERIFIED_PARTNER'
        elif trust_score >= 70:
            tier = 'TRUSTED'
        elif trust_score >= 50:
            tier = 'UNVERIFIED'
        else:
            tier = 'BLOCKED'

        return TrustScore(
            org_id=org_id,
            score=trust_score,
            components={
                'identity_verification': identity_score,
                'compliance_certification': compliance_score,
                'historical_success_rate': historical_score,
                'response_time_reliability': sla_score,
                'data_breach_history': breach_score
            },
            tier=tier,
            last_updated=datetime.utcnow()
        )

    async def update_trust_score_after_collaboration(
        self,
        org_id: str,
        collaboration: Collaboration
    ) -> TrustScore:
        """
        Update trust score based on collaboration outcome.

        Adjustments:
        - Successful collaboration: +2 points
        - Failed collaboration: -5 points
        - SLA breach: -3 points
        - Security violation: -10 points (and potential BLOCKED tier)
        """

        current_score = await self.get_trust_score(org_id)

        adjustment = 0

        if collaboration.success:
            adjustment += 2
        else:
            adjustment -= 5

        if collaboration.sla_breached:
            adjustment -= 3

        if collaboration.security_violations > 0:
            adjustment -= 10 * collaboration.security_violations

        # Apply adjustment
        new_score = max(0, min(100, current_score.score + adjustment))

        # Recalculate full score to update components
        updated_score = self.calculate_trust_score(org_id)
        updated_score.score = new_score  # Override with adjusted score

        # Store updated score
        await self.trust_store.put(org_id, updated_score)

        # Audit log
        await self.audit_logger.log({
            'event_type': 'TRUST_SCORE_UPDATED',
            'org_id': org_id,
            'old_score': current_score.score,
            'new_score': new_score,
            'adjustment': adjustment,
            'reason': 'collaboration_completed'
        })

        return updated_score
```

---

## Data Flow

### Flow 1: Cross-Org Agent Collaboration Request

```
┌─────────────────────┐
│ Agent A             │
│ (Org: manufacturer) │
└──────┬──────────────┘
       │
       │ 1. "Need supplier inventory for widget-a"
       ▼
┌─────────────────────┐
│ Message Router      │
│ (manufacturer)      │
└──────┬──────────────┘
       │
       │ 2. Look up federation session for supplier.com
       │    → Session exists, valid for 4 more hours
       │
       │ 3. Check data sharing policy
       │    → Product ID is PUBLIC, sharing allowed
       │
       │ 4. Encrypt message with supplier's public key
       │ 5. Sign message with manufacturer's private key
       ▼
┌─────────────────────┐
│ Message Queue       │
│ (RabbitMQ)          │
└──────┬──────────────┘
       │
       │ 6. Route to supplier.com exchange
       ▼
┌─────────────────────┐
│ Message Router      │
│ (supplier)          │
└──────┬──────────────┘
       │
       │ 7. Verify manufacturer's signature
       │ 8. Check replay attack (nonce, timestamp)
       │ 9. Decrypt message
       │ 10. Validate against supplier's data sharing policy
       ▼
┌─────────────────────┐
│ Agent B             │
│ (Org: supplier)     │
└──────┬──────────────┘
       │
       │ 11. Process request: "widget-a inventory = 3000 units"
       │ 12. Send response (same encryption flow)
       ▼
     (Response flows back to Agent A)
```

### Flow 2: Resource Negotiation

```
┌─────────────────────┐
│ Requester Agent     │
│ (Needs 100 GPU hrs) │
└──────┬──────────────┘
       │
       │ Round 1: Propose
       │ { resource: "GPU", qty: 100, max_cost: $500, deadline: "2024-11-24" }
       ▼
┌─────────────────────┐
│ Negotiation Engine  │
└──────┬──────────────┘
       │
       │ Send proposal to provider org
       ▼
┌─────────────────────┐
│ Provider Agent      │
└──────┬──────────────┘
       │
       │ Round 2: Counter
       │ { resource: "GPU", qty: 80, cost: $320, deadline: "2024-11-22" }
       ▼
┌─────────────────────┐
│ Negotiation Engine  │
└──────┬──────────────┘
       │
       │ Evaluate: ML model predicts 85% chance of success
       │ Decision: ACCEPT (terms within acceptable range)
       ▼
┌─────────────────────┐
│ Smart Contract      │
│ (Ethereum)          │
└──────┬──────────────┘
       │
       │ Lock $320 in escrow
       │ Terms: 80 GPU hours, delivered by 2024-11-22, SLA: 99.5% uptime
       ▼
┌─────────────────────┐
│ Provider delivers   │
│ GPU hours           │
└──────┬──────────────┘
       │
       │ Requester confirms receipt
       ▼
┌─────────────────────┐
│ Smart Contract      │
└──────┬──────────────┘
       │
       │ Release $320 to provider
       │ Update trust scores for both orgs (+2 points each)
       ▼
     (Negotiation complete)
```

---

## State Machines

### Federation Session State Machine

```
┌─────────────┐
│   INIT      │  ← New federation request
└──────┬──────┘
       │
       │ Initiate handshake
       ▼
┌─────────────┐
│ HANDSHAKING │  ← mTLS connection, certificate exchange
└──────┬──────┘
       │
       ├─ Handshake success ──────┐
       │                           ▼
       │                     ┌─────────────┐
       │                     │   ACTIVE    │  ← Session established
       │                     └──────┬──────┘
       │                            │
       │                            │ Messages flowing
       │                            │
       │                            ├─ Session expires ─────┐
       │                            │                        ▼
       │                            │                  ┌─────────────┐
       │                            │                  │  EXPIRED    │
       │                            │                  └──────┬──────┘
       │                            │                         │
       │                            │                         │ Renew or close
       │                            ▼                         ▼
       │                      (Continue)                  (Cleanup)
       │
       ├─ Handshake failure ──────┐
       │                           ▼
       │                     ┌─────────────┐
       │                     │   FAILED    │  ← Handshake failed
       │                     └──────┬──────┘
       │                            │
       │                            │ Retry (exponential backoff)
       │                            │ or give up
       └────────────────────────────┘

Special States:
┌─────────────┐
│  SUSPENDED  │  ← Trust score dropped below 50
└─────────────┘

┌─────────────┐
│ TERMINATED  │  ← Explicit termination by either party
└─────────────┘
```

### Negotiation State Machine

```
┌─────────────┐
│  PROPOSED   │  ← Initial proposal sent
└──────┬──────┘
       │
       │ Wait for response (60s timeout)
       ▼
┌─────────────┐
│  PENDING    │  ← Waiting for provider response
└──────┬──────┘
       │
       ├─ Provider accepts ────────┐
       │                            ▼
       │                      ┌─────────────┐
       │                      │  ACCEPTED   │  ← Agreement reached
       │                      └──────┬──────┘
       │                             │
       │                             │ Create smart contract
       │                             ▼
       │                       ┌─────────────┐
       │                       │  CONTRACTED │  ← Contract locked
       │                       └─────────────┘
       │
       ├─ Provider counters ───────┐
       │                            ▼
       │                      ┌─────────────┐
       │                      │ NEGOTIATING │  ← Back-and-forth
       │                      └──────┬──────┘
       │                             │
       │                             │ Iterate (max 10 rounds)
       │                             ▼
       │                        (Loop back to PENDING)
       │
       ├─ Provider rejects ────────┐
       │                            ▼
       │                      ┌─────────────┐
       │                      │  REJECTED   │  ← No agreement
       │                      └─────────────┘
       │
       └─ Timeout ─────────────────┐
                                    ▼
                              ┌─────────────┐
                              │   TIMEOUT   │  ← No response
                              └─────────────┘
```

---

## Integration with CFN v3

### Extending Orchestrator for Cross-Org

```typescript
// src/orchestrator/cross-org-coordinator.ts

import { FederationProtocol } from './federation-protocol';
import { CrossOrgMessageRouter } from './message-router';

export class CrossOrgCoordinator {
  constructor(
    private federation: FederationProtocol,
    private router: CrossOrgMessageRouter,
    private orchestrator: CFNOrchestrator
  ) {}

  /**
   * Extend CFN orchestrator to support cross-org task delegation.
   */
  async delegateTaskToPartner(
    partnerOrg: string,
    partnerAgent: string,
    task: string,
    context: Record<string, any>
  ): Promise<TaskResult> {
    // Step 1: Verify federation session
    const session = await this.federation.getSession(partnerOrg);
    if (!session) {
      session = await this.federation.initiateHandshake(partnerOrg);
    }

    // Step 2: Check trust score
    const trustScore = await this.getTrustScore(partnerOrg);
    if (trustScore < 70) {
      throw new InsufficientTrustError(
        `Partner ${partnerOrg} trust score too low: ${trustScore}`
      );
    }

    // Step 3: Prepare task request message
    const taskRequest = {
      task_id: generateUUID(),
      task_description: task,
      context: context,
      deadline: Date.now() + 3600000,  // 1 hour from now
      callback_endpoint: `${process.env.CFN_ENDPOINT}/cross-org/callback`
    };

    // Step 4: Send task request
    await this.router.sendMessage(
      from_agent=process.env.AGENT_ID,
      to_org=partnerOrg,
      to_agent=partnerAgent,
      message_type='TASK_REQUEST',
      payload=taskRequest
    );

    // Step 5: Wait for task completion (with timeout)
    const result = await this.waitForTaskCompletion(
      taskRequest.task_id,
      timeout_ms=3600000
    );

    // Step 6: Settle costs
    await this.settleCosts(partnerOrg, result.cost);

    return result;
  }

  /**
   * Handle incoming cross-org task requests.
   */
  async handleIncomingTaskRequest(message: CrossOrgMessage): Promise<void> {
    const taskRequest = JSON.parse(message.payload);

    // Step 1: Check if we have capability to handle task
    const capability = this.checkCapability(taskRequest.task_description);
    if (!capability) {
      await this.sendTaskRejection(
        message.from_org,
        message.from_agent,
        taskRequest.task_id,
        reason='Capability not available'
      );
      return;
    }

    // Step 2: Evaluate cost and negotiate if needed
    const cost = capability.estimateCost(taskRequest);

    if (cost > taskRequest.max_cost) {
      // Initiate negotiation
      await this.negotiationEngine.negotiate({
        requester_org: message.from_org,
        provider_org: process.env.ORG_ID,
        resource: capability.name,
        requested_terms: taskRequest,
        our_terms: { cost: cost }
      });
    }

    // Step 3: Execute task using CFN orchestrator
    const result = await this.orchestrator.executeTask(
      task=taskRequest.task_description,
      context=taskRequest.context
    );

    // Step 4: Send result back to requester
    await this.router.sendMessage(
      from_agent=process.env.AGENT_ID,
      to_org=message.from_org,
      to_agent=message.from_agent,
      message_type='TASK_RESPONSE',
      payload={
        task_id: taskRequest.task_id,
        result: result,
        cost: cost,
        completed_at: Date.now()
      }
    );
  }
}
```

---

## Testing Strategy

### Unit Tests

```python
def test_federation_handshake():
    """Test successful federation handshake between two orgs."""

    # Setup: Two CFN instances
    org_a = FederationProtocol(org_id='manufacturer.com', ...)
    org_b = FederationProtocol(org_id='supplier.com', ...)

    # Test: Org A initiates handshake with Org B
    session = await org_a.initiate_handshake(org_b.get_org_info())

    # Assertions
    assert session.local_org == 'manufacturer.com'
    assert session.remote_org == 'supplier.com'
    assert session.session_key is not None
    assert not session.is_expired()

def test_cross_org_message_encryption():
    """Test message encryption and decryption."""

    router = CrossOrgMessageRouter(...)

    # Test: Send encrypted message
    payload = {'data': 'sensitive info'}
    receipt = await router.send_message(
        from_agent='agent-a',
        to_org='partner.com',
        to_agent='agent-b',
        message_type='DATA_QUERY',
        payload=payload
    )

    # Assertions
    assert receipt.status == 'SENT'

    # Test: Receive and decrypt message
    async for message in router.receive_messages('agent-b'):
        decrypted = json.loads(message.payload)
        assert decrypted['data'] == 'sensitive info'
        break

def test_trust_score_calculation():
    """Test trust score calculation."""

    trust_engine = TrustScoreEngine()

    # Test: New org with no history
    score = trust_engine.calculate_trust_score('neworg.com')

    # Default score for new orgs (~50-60 depending on verification)
    assert 50 <= score.score <= 60
    assert score.tier == 'UNVERIFIED'

    # Test: Org with successful collaborations
    # Simulate 10 successful collaborations
    for i in range(10):
        await trust_engine.update_trust_score_after_collaboration(
            'neworg.com',
            Collaboration(success=True, sla_breached=False)
        )

    updated_score = trust_engine.calculate_trust_score('neworg.com')
    assert updated_score.score > 70  # Should move to TRUSTED tier
```

### Integration Tests

```bash
#!/bin/bash
# Test cross-org collaboration end-to-end

set -euo pipefail

# Start two CFN instances (manufacturer, supplier)
docker-compose -f docker-compose-test.yml up -d cfn-manufacturer cfn-supplier

# Wait for services
sleep 10

# Test 1: Federation handshake
echo "Test 1: Federation handshake"
curl -X POST http://localhost:3000/federation/handshake \
  -H "Content-Type: application/json" \
  -d '{
    "partner_org": "supplier.com",
    "partner_endpoint": "http://cfn-supplier:3000"
  }'

# Verify session created
SESSION_ID=$(curl http://localhost:3000/federation/sessions | jq -r '.[0].session_id')
if [ -z "$SESSION_ID" ]; then
  echo "FAIL: Federation session not created"
  exit 1
fi

echo "PASS: Federation handshake successful"

# Test 2: Cross-org message
echo "Test 2: Send cross-org message"
curl -X POST http://localhost:3000/cross-org/send \
  -H "Content-Type: application/json" \
  -d '{
    "to_org": "supplier.com",
    "to_agent": "inventory-manager",
    "message_type": "DATA_QUERY",
    "payload": {"product": "widget-a"}
  }'

# Wait for response
sleep 2

# Check message delivered
MESSAGES=$(curl http://localhost:3001/cross-org/messages | jq '. | length')
if [ "$MESSAGES" -lt 1 ]; then
  echo "FAIL: Message not delivered"
  exit 1
fi

echo "PASS: Cross-org message delivered"

echo "All integration tests passed!"
```

---

**Document Version:** 1.0
**Last Updated:** 2024-11-17
**Author:** CFN System Architect
