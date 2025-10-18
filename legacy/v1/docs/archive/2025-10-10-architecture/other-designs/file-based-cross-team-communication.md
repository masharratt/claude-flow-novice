# File-Based Cross-Team Communication

## Overview

The File-Based Cross-Team Communication system extends the proven file-based coordination patterns to enable reliable, high-performance communication between parallel CFN teams while maintaining transparency, fault tolerance, and auditability.

## Architecture Components

### 1. Multi-Team File System Architecture

```typescript
interface MultiTeamFileSystem {
  // Session management
  sessionId: string;
  basePath: string;
  sessionMetadata: SessionMetadata;

  // Team channels
  teamChannels: Map<string, TeamChannel>;
  globalCoordinationChannel: GlobalCoordinationChannel;
  crossTeamChannels: Map<string, CrossTeamChannel>;

  // Communication infrastructure
  messageRouter: FileBasedMessageRouter;
  lockManager: DistributedLockManager;
  eventBus: FileBasedEventBus;

  // Monitoring and persistence
  communicationMetrics: CommunicationMetricsCollector;
  auditLogger: FileBasedAuditLogger;
}

interface SessionMetadata {
  sessionId: string;
  startTime: number;
  participatingTeams: string[];
  sessionConfig: SessionConfiguration;
  currentPhase: string;
  phaseHistory: PhaseHistoryEntry[];
  communicationProtocol: CommunicationProtocol;
}
```

### 2. Team Channel Architecture

```typescript
class TeamChannel {
  private teamId: string;
  private channelPath: string;
  private messageQueue: FileBasedMessageQueue;
  private stateManager: TeamStateManager;
  private eventHandlers: Map<string, EventHandler>;

  constructor(teamId: string, basePath: string) {
    this.teamId = teamId;
    this.channelPath = `${basePath}/teams/${teamId}`;
    this.initializeChannelStructure();
  }

  private initializeChannelStructure(): void {
    const structure = [
      `${this.channelPath}/messages/`,           // Message queue
      `${this.channelPath}/state/`,             // Team state
      `${this.channelPath}/outbound/`,          // Outbound messages
      `${this.channelPath}/inbound/`,           // Inbound messages
      `${this.channelPath}/events/`,            // Team events
      `${this.channelPath}/locks/`,             // Coordination locks
      `${this.channelPath}/artifacts/`,         // Shared artifacts
      `${this.channelPath}/metrics/`            // Team metrics
    ];

    structure.forEach(dir => {
      fs.mkdirSync(dir, { recursive: true });
    });
  }

  async publishMessage(message: TeamMessage): Promise<void> {
    const messagePath = `${this.channelPath}/messages/${message.messageId}.json`;
    const lockPath = `${messagePath}.lock`;

    const lock = new FileLock(lockPath);

    try {
      await lock.acquire();

      const messageData = {
        ...message,
        teamId: this.teamId,
        timestamp: Date.now(),
        signature: await this.generateMessageSignature(message)
      };

      await fs.writeFile(messagePath, JSON.stringify(messageData, null, 2));

      // Update message queue
      await this.messageQueue.enqueue(messageData);

      // Trigger message handlers
      await this.triggerMessageHandlers(messageData);

      // Log message publication
      await this.logMessageEvent('published', messageData);

    } finally {
      await lock.release();
    }
  }

  async subscribeToMessages(
    messageType: string,
    handler: MessageHandler
  ): Promise<string> {

    const subscriptionId = generateId('subscription');
    const subscription = {
      subscriptionId,
      teamId: this.teamId,
      messageType,
      handler,
      createdAt: Date.now(),
      lastProcessed: 0
    };

    this.eventHandlers.set(subscriptionId, subscription);

    // Set up file watcher for new messages
    await this.setupMessageWatcher(messageType, subscription);

    return subscriptionId;
  }

  async broadcastToOtherTeams(
    message: CrossTeamMessage,
    targetTeams?: string[]
  ): Promise<BroadcastResult> {

    const broadcastId = generateId('broadcast');
    const results: BroadcastTeamResult[] = [];

    const targetTeamIds = targetTeams || await this.getAllActiveTeams();

    for (const targetTeamId of targetTeamIds) {
      if (targetTeamId === this.teamId) continue; // Don't broadcast to self

      try {
        const result = await this.sendToTeam(targetTeamId, message);
        results.push({
          teamId: targetTeamId,
          success: true,
          messageId: result.messageId,
          deliveryTime: result.deliveryTime
        });
      } catch (error) {
        results.push({
          teamId: targetTeamId,
          success: false,
          error: error.message,
          retryCount: 0
        });
      }
    }

    const broadcastResult: BroadcastResult = {
      broadcastId,
      fromTeam: this.teamId,
      toTeams: targetTeamIds,
      results,
      successRate: results.filter(r => r.success).length / results.length,
      timestamp: Date.now()
    };

    // Store broadcast result for audit
    await this.storeBroadcastResult(broadcastResult);

    return broadcastResult;
  }

  private async sendToTeam(
    targetTeamId: string,
    message: CrossTeamMessage
  ): Promise<MessageDeliveryResult> {

    const targetChannelPath = `${this.channelPath}/../${targetTeamId}`;
    const messagePath = `${targetChannelPath}/inbound/from-${this.teamId}-${message.messageId}.json`;
    const lockPath = `${messagePath}.lock`;

    const lock = new FileLock(lockPath);

    try {
      await lock.acquire();

      const messageData = {
        messageId: message.messageId,
        fromTeam: this.teamId,
        toTeam: targetTeamId,
        messageType: message.messageType,
        payload: message.payload,
        priority: message.priority || 'normal',
        timestamp: Date.now(),
        requiresAck: message.requiresAck || false,
        expiry: message.expiry || (Date.now() + 24 * 60 * 60 * 1000) // 24 hours default
      };

      await fs.writeFile(messagePath, JSON.stringify(messageData, null, 2));

      // Create notification for target team
      await this.createMessageNotification(targetTeamId, messageData);

      return {
        messageId: message.messageId,
        deliveryTime: Date.now(),
        status: 'delivered'
      };

    } finally {
      await lock.release();
    }
  }
}
```

### 3. Global Coordination Channel

```typescript
class GlobalCoordinationChannel {
  private channelPath: string;
  private coordinationState: GlobalCoordinationState;
  private eventSubscribers: Map<string, EventSubscriber>;
  private phaseManager: PhaseManager;

  constructor(basePath: string) {
    this.channelPath = `${basePath}/global`;
    this.initializeGlobalChannel();
  }

  private initializeGlobalChannel(): void {
    const structure = [
      `${this.channelPath}/phases/`,             // Phase coordination
      `${this.channelPath}/consensus/`,          // Global consensus data
      `${this.channelPath}/conflicts/`,          // Conflict resolution
      `${this.channelPath}/dependencies/`,       // Cross-team dependencies
      `${this.channelPath}/timeline/`,           // Execution timeline
      `${this.channelPath}/events/`,             // Global events
      `${this.channelPath}/locks/`,              // Global locks
      `${this.channelPath}/metrics/`             // Global metrics
    ];

    structure.forEach(dir => {
      fs.mkdirSync(dir, { recursive: true });
    });

    this.phaseManager = new PhaseManager(`${this.channelPath}/phases`);
  }

  async publishPhaseUpdate(phaseUpdate: PhaseUpdate): Promise<void> {
    const phaseFile = `${this.channelPath}/phases/phase-${phaseUpdate.phaseId}.json`;
    const lockPath = `${phaseFile}.lock`;

    const lock = new FileLock(lockPath);

    try {
      await lock.acquire();

      const phaseData = {
        phaseId: phaseUpdate.phaseId,
        phaseType: phaseUpdate.phaseType,
        status: phaseUpdate.status,
        participatingTeams: phaseUpdate.participatingTeams,
        startTime: phaseUpdate.startTime,
        endTime: phaseUpdate.endTime,
        dependencies: phaseUpdate.dependencies,
        artifacts: phaseUpdate.artifacts,
        metrics: phaseUpdate.metrics,
        timestamp: Date.now()
      };

      await fs.writeFile(phaseFile, JSON.stringify(phaseData, null, 2));

      // Update global phase state
      await this.phaseManager.updatePhaseState(phaseData);

      // Notify subscribed teams
      await this.notifyPhaseUpdate(phaseData);

    } finally {
      await lock.release();
    }
  }

  async publishConsensusData(consensusData: GlobalConsensusData): Promise<void> {
    const consensusFile = `${this.channelPath}/consensus/consensus-${consensusData.phaseId}.json`;
    const lockPath = `${consensusFile}.lock`;

    const lock = new FileLock(lockPath);

    try {
      await lock.acquire();

      const consensusPayload = {
        phaseId: consensusData.phaseId,
        consensusRound: consensusData.consensusRound,
        participatingTeams: consensusData.participatingTeams,
        consensusScore: consensusData.consensusScore,
        consensusThreshold: consensusData.consensusThreshold,
        consensusAchieved: consensusData.consensusAchieved,
        teamContributions: consensusData.teamContributions,
        conflicts: consensusData.conflicts,
        resolutions: consensusData.resolutions,
        timestamp: Date.now()
      };

      await fs.writeFile(consensusFile, JSON.stringify(consensusPayload, null, 2));

      // Create consensus notification
      await this.createConsensusNotification(consensusPayload);

    } finally {
      await lock.release();
    }
  }

  async registerConflict(conflict: CrossTeamConflict): Promise<string> {
    const conflictId = generateId('conflict');
    const conflictFile = `${this.channelPath}/conflicts/conflict-${conflictId}.json`;
    const lockPath = `${conflictFile}.lock`;

    const lock = new FileLock(lockPath);

    try {
      await lock.acquire();

      const conflictData = {
        conflictId,
        type: conflict.type,
        severity: conflict.severity,
        involvedTeams: conflict.involvedTeams,
        description: conflict.description,
        conflictingArtifacts: conflict.conflictingArtifacts,
        detectedAt: Date.now(),
        status: 'active',
        resolutionStrategy: conflict.resolutionStrategy,
        escalationLevel: conflict.escalationLevel
      };

      await fs.writeFile(conflictFile, JSON.stringify(conflictData, null, 2));

      // Create conflict notification
      await this.createConflictNotification(conflictData);

      return conflictId;

    } finally {
      await lock.release();
    }
  }

  async updateDependency(
    dependencyId: string,
    update: DependencyUpdate
  ): Promise<void> {

    const dependencyFile = `${this.channelPath}/dependencies/dependency-${dependencyId}.json`;
    const lockPath = `${dependencyFile}.lock`;

    const lock = new FileLock(lockPath);

    try {
      await lock.acquire();

      let dependencyData;
      try {
        const existing = JSON.parse(await fs.readFile(dependencyFile, 'utf8'));
        dependencyData = { ...existing, ...update };
      } catch (error) {
        // Dependency doesn't exist, create new
        dependencyData = {
          dependencyId,
          ...update,
          createdAt: Date.now()
        };
      }

      dependencyData.updatedAt = Date.now();
      dependencyData.updateHistory = dependencyData.updateHistory || [];
      dependencyData.updateHistory.push({
        timestamp: Date.now(),
        updateType: update.updateType,
        updatedBy: update.updatedBy,
        changes: update.changes
      });

      await fs.writeFile(dependencyFile, JSON.stringify(dependencyData, null, 2));

      // Notify relevant teams of dependency update
      await this.notifyDependencyUpdate(dependencyData);

    } finally {
      await lock.release();
    }
  }

  async getGlobalState(): Promise<GlobalCoordinationState> {
    const stateFile = `${this.channelPath}/global-state.json`;
    const lockPath = `${stateFile}.lock`;

    const lock = new FileLock(lockPath);

    try {
      await lock.acquire();

      try {
        const stateData = JSON.parse(await fs.readFile(stateFile, 'utf8'));
        return stateData;
      } catch (error) {
        // State file doesn't exist, return initial state
        const initialState = {
          sessionId: this.extractSessionId(),
          currentPhase: null,
          activeTeams: [],
          phaseHistory: [],
          globalMetrics: {},
          lastUpdated: Date.now()
        };

        await fs.writeFile(stateFile, JSON.stringify(initialState, null, 2));
        return initialState;
      }

    } finally {
      await lock.release();
    }
  }
}
```

### 4. Message Routing and Delivery

```typescript
class FileBasedMessageRouter {
  private routingTable: Map<string, RouteRule>;
  private messageQueue: FileBasedMessageQueue;
  private deliveryTracker: MessageDeliveryTracker;
  private retryManager: MessageRetryManager;

  constructor(basePath: string) {
    this.routingTable = new Map();
    this.messageQueue = new FileBasedMessageQueue(`${basePath}/queue`);
    this.deliveryTracker = new MessageDeliveryTracker(`${basePath}/delivery`);
    this.retryManager = new MessageRetryManager();
  }

  async routeMessage(message: TeamMessage): Promise<RouteResult> {
    const routes = await this.resolveRoutes(message);

    const results: DeliveryResult[] = [];

    for (const route of routes) {
      try {
        const result = await this.deliverMessage(message, route);
        results.push(result);
      } catch (error) {
        results.push({
          route: route,
          success: false,
          error: error.message,
          retryScheduled: await this.scheduleRetry(message, route, error)
        });
      }
    }

    return {
      messageId: message.messageId,
      routes: results,
      successRate: results.filter(r => r.success).length / results.length,
      timestamp: Date.now()
    };
  }

  private async resolveRoutes(message: TeamMessage): Promise<RouteRule[]> {
    const routes: RouteRule[] = [];

    // Check for explicit routing rules
    const explicitRoutes = Array.from(this.routingTable.values()).filter(rule =>
      this.matchesRoutingRule(message, rule)
    );

    if (explicitRoutes.length > 0) {
      routes.push(...explicitRoutes);
    }

    // Apply default routing based on message type
    const defaultRoute = this.getDefaultRoute(message.messageType);
    if (defaultRoute) {
      routes.push(defaultRoute);
    }

    return routes;
  }

  private async deliverMessage(
    message: TeamMessage,
    route: RouteRule
  ): Promise<DeliveryResult> {

    const deliveryId = generateId('delivery');
    const startTime = Date.now();

    try {
      switch (route.type) {
        case 'team-broadcast':
          return await this.deliverToTeam(message, route.targetTeamId);
        case 'global-coordination':
          return await this.deliverToGlobal(message, route.targetChannel);
        case 'cross-team-sync':
          return await this.deliverToMultipleTeams(message, route.targetTeams);
        default:
          throw new Error(`Unknown route type: ${route.type}`);
      }
    } catch (error) {
      const deliveryTime = Date.now() - startTime;

      await this.deliveryTracker.recordDelivery({
        deliveryId,
        messageId: message.messageId,
        route: route,
        success: false,
        error: error.message,
        deliveryTime,
        timestamp: Date.now()
      });

      throw error;
    }
  }

  private async deliverToTeam(
    message: TeamMessage,
    targetTeamId: string
  ): Promise<DeliveryResult> {

    const targetPath = `${this.messageQueue.basePath}/../teams/${targetTeamId}/inbound`;
    const messagePath = `${targetPath}/${message.messageId}.json`;
    const lockPath = `${messagePath}.lock`;

    const lock = new FileLock(lockPath);

    try {
      await lock.acquire();

      const deliveryPayload = {
        messageId: message.messageId,
        messageType: message.messageType,
        fromTeam: message.teamId,
        toTeam: targetTeamId,
        payload: message.payload,
        priority: message.priority,
        timestamp: Date.now(),
        deliveryId: generateId('delivery')
      };

      await fs.writeFile(messagePath, JSON.stringify(deliveryPayload, null, 2));

      // Create delivery notification
      await this.createDeliveryNotification(targetTeamId, deliveryPayload);

      const deliveryTime = Date.now();

      await this.deliveryTracker.recordDelivery({
        deliveryId: deliveryPayload.deliveryId,
        messageId: message.messageId,
        route: { type: 'team-broadcast', targetTeamId },
        success: true,
        deliveryTime,
        timestamp: Date.now()
      });

      return {
        route: { type: 'team-broadcast', targetTeamId },
        success: true,
        deliveryId: deliveryPayload.deliveryId,
        deliveryTime
      };

    } finally {
      await lock.release();
    }
  }

  async setupRoutingRules(rules: RoutingRuleDefinition[]): Promise<void> {
    for (const rule of rules) {
      const routeRule: RouteRule = {
        ruleId: generateId('route'),
        name: rule.name,
        priority: rule.priority,
        conditions: rule.conditions,
        actions: rule.actions,
        createdAt: Date.now()
      };

      this.routingTable.set(routeRule.ruleId, routeRule);

      // Persist routing rule
      await this.persistRoutingRule(routeRule);
    }
  }

  private async persistRoutingRule(rule: RouteRule): Promise<void> {
    const rulesFile = `${this.messageQueue.basePath}/../routing/rules.json`;
    const lockPath = `${rulesFile}.lock`;

    const lock = new FileLock(lockPath);

    try {
      await lock.acquire();

      let rules;
      try {
        rules = JSON.parse(await fs.readFile(rulesFile, 'utf8'));
      } catch (error) {
        rules = [];
      }

      rules.push(rule);
      await fs.writeFile(rulesFile, JSON.stringify(rules, null, 2));

    } finally {
      await lock.release();
    }
  }
}
```

### 5. Distributed Lock Management

```typescript
class DistributedLockManager {
  private lockPath: string;
  private activeLocks: Map<string, DistributedLock>;
  private lockCleanupInterval: NodeJS.Timeout;

  constructor(basePath: string) {
    this.lockPath = `${basePath}/locks`;
    this.activeLocks = new Map();
    this.initializeLockDirectory();
    this.startLockCleanup();
  }

  private initializeLockDirectory(): void {
    fs.mkdirSync(this.lockPath, { recursive: true });
  }

  async acquireLock(
    lockName: string,
    requester: string,
    options: LockOptions = {}
  ): Promise<LockAcquisitionResult> {

    const lockId = generateId('lock');
    const lockFile = `${this.lockPath}/${lockName}.lock`;
    const lockDataPath = `${this.lockPath}/${lockName}.data`;

    const maxRetries = options.maxRetries || 10;
    const retryDelay = options.retryDelay || 100;
    const timeout = options.timeout || 30000; // 30 seconds default

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        // Try to create lock file atomically
        const lockData = {
          lockId,
          lockName,
          requester,
          acquiredAt: Date.now(),
          expiresAt: Date.now() + timeout,
          attempt: attempt + 1,
          priority: options.priority || 'normal'
        };

        await fs.writeFile(lockFile, JSON.stringify(lockData, { flag: 'wx' }));

        // Successfully acquired lock
        const distributedLock: DistributedLock = {
          lockId,
          lockName,
          requester,
          acquiredAt: lockData.acquiredAt,
          expiresAt: lockData.expiresAt,
          timeout,
          autoRenew: options.autoRenew || false,
          metadata: options.metadata || {}
        };

        this.activeLocks.set(lockName, distributedLock);

        // Persist lock data
        await fs.writeFile(lockDataPath, JSON.stringify(distributedLock, null, 2));

        // Start auto-renewal if requested
        if (options.autoRenew) {
          this.startAutoRenewal(distributedLock);
        }

        return {
          success: true,
          lockId,
          acquiredAt: lockData.acquiredAt,
          expiresAt: lockData.expiresAt,
          attempt: attempt + 1
        };

      } catch (error) {
        if (error.code === 'EEXIST') {
          // Lock exists, check if it's stale
          const isStale = await this.isLockStale(lockFile);
          if (isStale) {
            await this.forceReleaseLock(lockName);
            continue; // Retry after cleaning up stale lock
          }

          // Lock is valid, wait and retry
          if (attempt < maxRetries - 1) {
            await this.sleep(retryDelay * Math.pow(2, attempt));
            continue;
          }

          return {
            success: false,
            error: `Lock acquisition failed after ${maxRetries} attempts`,
            attempt: attempt + 1
          };
        }

        throw error;
      }
    }

    return {
      success: false,
      error: `Lock acquisition failed after ${maxRetries} attempts`,
      attempt: maxRetries
    };
  }

  async releaseLock(lockName: string, lockId?: string): Promise<boolean> {
    const distributedLock = this.activeLocks.get(lockName);

    if (!distributedLock) {
      return false; // Lock not found
    }

    if (lockId && distributedLock.lockId !== lockId) {
      return false; // Wrong lock ID
    }

    const lockFile = `${this.lockPath}/${lockName}.lock`;
    const lockDataPath = `${this.lockPath}/${lockName}.data`;

    try {
      // Stop auto-renewal if active
      this.stopAutoRenewal(distributedLock);

      // Remove lock files
      await fs.unlink(lockFile);
      await fs.unlink(lockDataPath);

      // Remove from active locks
      this.activeLocks.delete(lockName);

      return true;

    } catch (error) {
      console.error(`Error releasing lock ${lockName}:`, error);
      return false;
    }
  }

  async isLockStale(lockFile: string): Promise<boolean> {
    try {
      const lockData = JSON.parse(await fs.readFile(lockFile, 'utf8'));
      const now = Date.now();

      // Lock is stale if it has expired
      if (now > lockData.expiresAt) {
        return true;
      }

      // Check if lock holder process is still alive (if PID is available)
      if (lockData.pid) {
        try {
          // Try to check if process exists
          process.kill(lockData.pid, 0);
          return false; // Process is alive
        } catch (error) {
          if (error.code === 'ESRCH') {
            return true; // Process doesn't exist
          }
        }
      }

      return false;

    } catch (error) {
      // If we can't read the lock file, consider it stale
      return true;
    }
  }

  private async forceReleaseLock(lockName: string): Promise<void> {
    const lockFile = `${this.lockPath}/${lockName}.lock`;
    const lockDataPath = `${this.lockPath}/${lockName}.data`;

    try {
      await fs.unlink(lockFile);
      await fs.unlink(lockDataPath);
    } catch (error) {
      // Ignore errors during cleanup
    }

    this.activeLocks.delete(lockName);
  }

  private startAutoRenewal(distributedLock: DistributedLock): void {
    const renewalInterval = Math.floor(distributedLock.timeout * 0.7); // Renew at 70% of timeout

    const renewalTimer = setInterval(async () => {
      try {
        await this.renewLock(distributedLock.lockName, distributedLock.lockId);
      } catch (error) {
        console.error(`Auto-renewal failed for lock ${distributedLock.lockName}:`, error);
        this.stopAutoRenewal(distributedLock);
      }
    }, renewalInterval);

    distributedLock.renewalTimer = renewalTimer;
  }

  private stopAutoRenewal(distributedLock: DistributedLock): void {
    if (distributedLock.renewalTimer) {
      clearInterval(distributedLock.renewalTimer);
      distributedLock.renewalTimer = undefined;
    }
  }

  private async renewLock(lockName: string, lockId: string): Promise<void> {
    const distributedLock = this.activeLocks.get(lockName);

    if (!distributedLock || distributedLock.lockId !== lockId) {
      throw new Error('Lock not found or invalid lock ID');
    }

    const newExpiresAt = Date.now() + distributedLock.timeout;
    distributedLock.expiresAt = newExpiresAt;

    const lockDataPath = `${this.lockPath}/${lockName}.data`;
    const lockFile = `${this.lockPath}/${lockName}.lock`;

    // Update lock data
    await fs.writeFile(lockDataPath, JSON.stringify(distributedLock, null, 2));

    // Update lock file timestamp
    const lockData = JSON.parse(await fs.readFile(lockFile, 'utf8'));
    lockData.expiresAt = newExpiresAt;
    await fs.writeFile(lockFile, JSON.stringify(lockData, null, 2));
  }

  private startLockCleanup(): void {
    this.lockCleanupInterval = setInterval(async () => {
      await this.cleanupExpiredLocks();
    }, 60000); // Check every minute
  }

  private async cleanupExpiredLocks(): Promise<void> {
    const now = Date.now();
    const expiredLocks: string[] = [];

    this.activeLocks.forEach((lock, lockName) => {
      if (now > lock.expiresAt) {
        expiredLocks.push(lockName);
      }
    });

    for (const lockName of expiredLocks) {
      await this.forceReleaseLock(lockName);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

### 6. Event Bus and Notification System

```typescript
class FileBasedEventBus {
  private eventPath: string;
  private eventSubscribers: Map<string, EventSubscriber[]>;
  private eventProcessor: EventProcessor;

  constructor(basePath: string) {
    this.eventPath = `${basePath}/events`;
    this.eventSubscribers = new Map();
    this.initializeEventSystem();
  }

  private initializeEventSystem(): void {
    const structure = [
      `${this.eventPath}/global/`,            // Global events
      `${this.eventPath}/teams/`,             // Team-specific events
      `${this.eventPath}/phases/`,            // Phase events
      `${this.eventPath}/conflicts/`,         // Conflict events
      `${this.eventPath}/subscriptions/`,     // Event subscriptions
      `${this.eventPath}/processed/`          // Processed events
    ];

    structure.forEach(dir => {
      fs.mkdirSync(dir, { recursive: true });
    });

    this.eventProcessor = new EventProcessor(this.eventPath);
  }

  async publishEvent(event: CrossTeamEvent): Promise<string> {
    const eventId = generateId('event');
    const eventFile = `${this.getEventPath(event.type)}/${eventId}.json`;
    const lockPath = `${eventFile}.lock`;

    const lock = new FileLock(lockPath);

    try {
      await lock.acquire();

      const eventData = {
        eventId,
        eventType: event.eventType,
        sourceTeam: event.sourceTeam,
        targetTeams: event.targetTeams || [],
        payload: event.payload,
        priority: event.priority || 'normal',
        timestamp: Date.now(),
        requiresAck: event.requiresAck || false,
        expiry: event.expiry || (Date.now() + 24 * 60 * 60 * 1000)
      };

      await fs.writeFile(eventFile, JSON.stringify(eventData, null, 2));

      // Process event immediately
      await this.eventProcessor.processEvent(eventData);

      return eventId;

    } finally {
      await lock.release();
    }
  }

  async subscribeToEvent(
    eventType: string,
    subscriber: EventSubscriber
  ): Promise<string> {

    const subscriptionId = generateId('subscription');
    const subscription = {
      subscriptionId,
      eventType,
      subscriberId: subscriber.subscriberId,
      subscriberType: subscriber.subscriberType,
      handler: subscriber.handler,
      filter: subscriber.filter || (() => true),
      createdAt: Date.now(),
      lastProcessed: 0,
      active: true
    };

    // Store subscription
    await this.storeSubscription(subscription);

    // Add to active subscribers
    const subscribers = this.eventSubscribers.get(eventType) || [];
    subscribers.push(subscription);
    this.eventSubscribers.set(eventType, subscribers);

    // Set up file watcher for new events
    await this.setupEventWatcher(eventType, subscription);

    return subscriptionId;
  }

  private getEventPath(eventType: string): string {
    const eventTypeCategory = this.getEventTypeCategory(eventType);
    return `${this.eventPath}/${eventTypeCategory}`;
  }

  private getEventTypeCategory(eventType: string): string {
    if (eventType.startsWith('team-')) return 'teams';
    if (eventType.startsWith('phase-')) return 'phases';
    if (eventType.startsWith('conflict-')) return 'conflicts';
    return 'global';
  }

  private async setupEventWatcher(
    eventType: string,
    subscription: EventSubscriber
  ): Promise<void> {

    const eventPath = this.getEventPath(eventType);
    const watcher = fs.watch(eventPath, async (eventType, filename) => {
      if (eventType === 'rename' && filename && !filename.endsWith('.lock')) {
        try {
          const eventFile = `${eventPath}/${filename}`;
          const eventData = JSON.parse(await fs.readFile(eventFile, 'utf8'));

          // Check if event matches subscription filter
          if (subscription.filter(eventData)) {
            await subscription.handler(eventData);
          }

        } catch (error) {
          console.error(`Error processing event ${filename}:`, error);
        }
      }
    });

    // Store watcher reference for cleanup
    subscription.watcher = watcher;
  }

  async unsubscribe(subscriptionId: string): Promise<boolean> {
    // Find and remove subscription
    let removed = false;

    this.eventSubscribers.forEach((subscribers, eventType) => {
      const index = subscribers.findIndex(sub => sub.subscriptionId === subscriptionId);
      if (index !== -1) {
        const subscription = subscribers[index];
        subscription.active = false;

        // Clean up file watcher
        if (subscription.watcher) {
          subscription.watcher.close();
        }

        subscribers.splice(index, 1);
        removed = true;
      }
    });

    if (removed) {
      // Remove from storage
      await this.removeSubscription(subscriptionId);
    }

    return removed;
  }
}
```

### 7. Performance Monitoring and Metrics

```typescript
class CommunicationMetricsCollector {
  private metricsPath: string;
  private metricsCache: Map<string, CommunicationMetrics>;
  private collectionInterval: NodeJS.Timeout;

  constructor(basePath: string) {
    this.metricsPath = `${basePath}/metrics`;
    this.metricsCache = new Map();
    this.initializeMetricsCollection();
  }

  private initializeMetricsCollection(): void {
    fs.mkdirSync(this.metricsPath, { recursive: true });

    // Start periodic metrics collection
    this.collectionInterval = setInterval(async () => {
      await this.collectMetrics();
    }, 30000); // Collect every 30 seconds
  }

  async recordMessageMetrics(metrics: MessageMetrics): Promise<void> {
    const metricsFile = `${this.metricsPath}/messages-${Date.now()}.jsonl`;
    const metricsLine = JSON.stringify({
      ...metrics,
      timestamp: Date.now()
    }) + '\n';

    await fs.appendFile(metricsFile, metricsLine, 'utf8');

    // Update cache
    this.updateMetricsCache('messages', metrics);
  }

  async recordTeamMetrics(teamId: string, metrics: TeamCommunicationMetrics): Promise<void> {
    const metricsFile = `${this.metricsPath}/team-${teamId}-${Date.now()}.jsonl`;
    const metricsLine = JSON.stringify({
      teamId,
      ...metrics,
      timestamp: Date.now()
    }) + '\n';

    await fs.appendFile(metricsFile, metricsLine, 'utf8');

    // Update cache
    this.updateMetricsCache(`team-${teamId}`, metrics);
  }

  async recordConsensusMetrics(metrics: ConsensusCommunicationMetrics): Promise<void> {
    const metricsFile = `${this.metricsPath}/consensus-${Date.now()}.jsonl`;
    const metricsLine = JSON.stringify({
      ...metrics,
      timestamp: Date.now()
    }) + '\n';

    await fs.appendFile(metricsFile, metricsLine, 'utf8');

    // Update cache
    this.updateMetricsCache('consensus', metrics);
  }

  async generatePerformanceReport(
    timeRange: TimeRange
  ): Promise<CommunicationPerformanceReport> {

    const startTime = timeRange.startTime;
    const endTime = timeRange.endTime || Date.now();

    // Collect metrics from files
    const messageMetrics = await this.collectMessageMetrics(startTime, endTime);
    const teamMetrics = await this.collectTeamMetrics(startTime, endTime);
    const consensusMetrics = await this.collectConsensusMetrics(startTime, endTime);

    // Calculate performance indicators
    const performanceIndicators = this.calculatePerformanceIndicators(
      messageMetrics,
      teamMetrics,
      consensusMetrics
    );

    // Generate recommendations
    const recommendations = this.generateRecommendations(performanceIndicators);

    return {
      timeRange,
      messageMetrics,
      teamMetrics,
      consensusMetrics,
      performanceIndicators,
      recommendations,
      generatedAt: Date.now()
    };
  }

  private calculatePerformanceIndicators(
    messageMetrics: MessageMetrics[],
    teamMetrics: TeamCommunicationMetrics[],
    consensusMetrics: ConsensusCommunicationMetrics[]
  ): PerformanceIndicators {

    // Message performance
    const avgMessageLatency = this.calculateAverage(
      messageMetrics.map(m => m.latency)
    );
    const messageSuccessRate = this.calculateSuccessRate(messageMetrics);
    const messageThroughput = this.calculateThroughput(messageMetrics);

    // Team performance
    const teamActivityLevels = teamMetrics.map(metrics => ({
      teamId: metrics.teamId,
      activityLevel: this.calculateTeamActivityLevel(metrics),
      communicationEfficiency: this.calculateTeamCommunicationEfficiency(metrics)
    }));

    // Consensus performance
    const consensusEfficiency = this.calculateConsensusEfficiency(consensusMetrics);
    const consensusReliability = this.calculateConsensusReliability(consensusMetrics);

    return {
      messagePerformance: {
        averageLatency: avgMessageLatency,
        successRate: messageSuccessRate,
        throughput: messageThroughput,
        errorRate: 1 - messageSuccessRate
      },
      teamPerformance: teamActivityLevels,
      consensusPerformance: {
        efficiency: consensusEfficiency,
        reliability: consensusReliability,
        averageDuration: this.calculateAverage(
          consensusMetrics.map(c => c.duration)
        )
      },
      overallScore: this.calculateOverallPerformanceScore(
        avgMessageLatency,
        messageSuccessRate,
        consensusEfficiency,
        consensusReliability
      )
    };
  }

  private generateRecommendations(
    indicators: PerformanceIndicators
  ): PerformanceRecommendation[] {

    const recommendations: PerformanceRecommendation[] = [];

    // Message performance recommendations
    if (indicators.messagePerformance.averageLatency > 5000) { // 5 seconds
      recommendations.push({
        type: 'optimization',
        priority: 'high',
        category: 'message-latency',
        description: 'Message latency is above optimal threshold',
        suggestion: 'Consider optimizing file I/O operations or reducing message size',
        impact: 'high'
      });
    }

    if (indicators.messagePerformance.successRate < 0.95) { // 95%
      recommendations.push({
        type: 'reliability',
        priority: 'critical',
        category: 'message-delivery',
        description: 'Message delivery success rate is below optimal',
        suggestion: 'Investigate failed deliveries and improve error handling',
        impact: 'critical'
      });
    }

    // Consensus performance recommendations
    if (indicators.consensusPerformance.efficiency < 0.8) { // 80%
      recommendations.push({
        type: 'process',
        priority: 'medium',
        category: 'consensus-efficiency',
        description: 'Consensus process efficiency can be improved',
        suggestion: 'Optimize validation strategies and reduce unnecessary consensus rounds',
        impact: 'medium'
      });
    }

    // Team activity recommendations
    const inactiveTeams = indicators.teamPerformance.filter(team =>
      team.activityLevel < 0.5
    );

    if (inactiveTeams.length > 0) {
      recommendations.push({
        type: 'coordination',
        priority: 'medium',
        category: 'team-activity',
        description: `${inactiveTeams.length} teams showing low activity levels`,
        suggestion: 'Investigate team communication patterns and potential bottlenecks',
        impact: 'medium'
      });
    }

    return recommendations;
  }

  private calculateAverage(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }

  private calculateSuccessRate(metrics: { success: boolean; }[]): number {
    if (metrics.length === 0) return 1;
    const successful = metrics.filter(m => m.success).length;
    return successful / metrics.length;
  }

  private calculateThroughput(metrics: MessageMetrics[]): number {
    if (metrics.length === 0) return 0;
    const timeRange = Math.max(...metrics.map(m => m.timestamp)) -
                      Math.min(...metrics.map(m => m.timestamp));
    return timeRange > 0 ? metrics.length / (timeRange / 1000) : 0; // messages per second
  }
}
```

## Usage Examples

### 1. Basic Cross-Team Communication

```typescript
async function setupCrossTeamCommunication(
  sessionId: string,
  teamConfigurations: TeamConfiguration[]
): Promise<CrossTeamCommunicationSystem> {

  // Initialize file-based communication system
  const commSystem = new FileBasedCrossTeamCommunication(sessionId);

  // Create team channels
  const teamChannels = new Map<string, TeamChannel>();
  for (const teamConfig of teamConfigurations) {
    const channel = await commSystem.createTeamChannel(teamConfig.teamId);
    teamChannels.set(teamConfig.teamId, channel);
  }

  // Set up global coordination channel
  const globalChannel = commSystem.getGlobalCoordinationChannel();

  // Configure message routing
  const routingRules = [
    {
      name: 'consensus-messages',
      priority: 1,
      conditions: { messageType: 'consensus-data' },
      actions: [{ type: 'broadcast-to-all-teams' }]
    },
    {
      name: 'conflict-notifications',
      priority: 1,
      conditions: { messageType: 'conflict-detected' },
      actions: [{ type: 'broadcast-to-involved-teams' }]
    },
    {
      name: 'phase-updates',
      priority: 2,
      conditions: { messageType: 'phase-update' },
      actions: [{ type: 'publish-to-global-channel' }]
    }
  ];

  await commSystem.setupRoutingRules(routingRules);

  return {
    teamChannels,
    globalChannel,
    messageRouter: commSystem.getMessageRouter(),
    lockManager: commSystem.getLockManager(),
    eventBus: commSystem.getEventBus()
  };
}
```

### 2. Real-time Communication Monitoring

```typescript
async function monitorCommunicationHealth(
  commSystem: CrossTeamCommunicationSystem
): Promise<CommunicationHealthReport> {

  const metricsCollector = new CommunicationMetricsCollector(commSystem.getSessionId());

  // Collect current metrics
  const currentMetrics = await metricsCollector.getCurrentMetrics();

  // Generate performance report for last hour
  const performanceReport = await metricsCollector.generatePerformanceReport({
    startTime: Date.now() - 60 * 60 * 1000, // Last hour
    endTime: Date.now()
  });

  // Check system health
  const healthCheck = await commSystem.performHealthCheck();

  return {
    currentMetrics,
    performanceReport,
    healthCheck,
    recommendations: generateHealthRecommendations(currentMetrics, performanceReport),
    timestamp: Date.now()
  };
}
```

This File-Based Cross-Team Communication system provides a robust, scalable foundation for multi-team CFN coordination using proven file-based patterns. The system ensures reliable message delivery, efficient coordination, and comprehensive monitoring while maintaining the transparency and auditability required for complex multi-team workflows.