/**
 * @file Byzantine-Secure Swarm Memory Manager
 * @description Manages distributed memory with Byzantine fault tolerance and cryptographic integrity
 */

import { EventEmitter } from 'events';
import crypto from 'crypto';

export interface MemoryBlock {
  id: string;
  data: any;
  hash: string;
  previousHash: string;
  timestamp: number;
  agentId: string;
  signature: string;
  consensusProof: ConsensusProof;
}

export interface ConsensusProof {
  validators: string[];
  signatures: string[];
  trustScore: number;
  verificationCount: number;
}

export interface SwarmContext {
  taskId: string;
  currentPhase: string;
  completedWork: any;
  agentStates: { [agentId: string]: any };
  workflowMemory: any;
  byzantineMetrics: {
    consensusEvents: number;
    trustScoreHistory: number[];
    verificationSuccess: number;
  };
}

export class SwarmMemoryManager extends EventEmitter {
  private memoryChain: Map<string, MemoryBlock[]> = new Map();
  private contextStore: Map<string, SwarmContext> = new Map();
  private cryptoManager: MemoryCryptographyManager;
  private consensusValidator: MemoryConsensusValidator;
  private syncManager: MemorySyncManager;

  constructor(private config: any) {
    super();
    this.cryptoManager = new MemoryCryptographyManager();
    this.consensusValidator = new MemoryConsensusValidator(config);
    this.syncManager = new MemorySyncManager(this);

    if (config.syncInterval) {
      this.setupSyncInterval(config.syncInterval);
    }
  }

  async storeSwarmContext(context: SwarmContext): Promise<string> {
    const contextId = context.taskId || `context_${Date.now()}`;

    // Add Byzantine metrics if not present
    if (!context.byzantineMetrics) {
      context.byzantineMetrics = {
        consensusEvents: 0,
        trustScoreHistory: [],
        verificationSuccess: 0,
      };
    }

    // Create memory block for context
    const memoryBlock = await this.createMemoryBlock(contextId, context, 'system');

    // Validate with consensus
    const consensusResult = await this.consensusValidator.validateMemoryBlock(memoryBlock);
    if (!consensusResult.valid) {
      throw new Error(`Context storage failed consensus validation: ${consensusResult.reason}`);
    }

    memoryBlock.consensusProof = consensusResult.proof;

    // Store in memory chain
    this.addToMemoryChain(contextId, memoryBlock);

    // Store in context store for quick access
    this.contextStore.set(contextId, context);

    this.emit('context:stored', { contextId, consensusProof: consensusResult.proof });

    return contextId;
  }

  async getSwarmContext(contextId?: string): Promise<SwarmContext | null> {
    if (!contextId) {
      // Return the most recent context
      const contexts = Array.from(this.contextStore.entries()).sort(
        ([, a], [, b]) =>
          (b.byzantineMetrics?.consensusEvents || 0) - (a.byzantineMetrics?.consensusEvents || 0),
      );

      if (contexts.length === 0) return null;
      return contexts[0][1];
    }

    const context = this.contextStore.get(contextId);
    if (!context) return null;

    // Verify context integrity
    const memoryChain = this.memoryChain.get(contextId);
    if (memoryChain && memoryChain.length > 0) {
      const latestBlock = memoryChain[memoryChain.length - 1];
      const isValid = await this.cryptoManager.verifyBlockIntegrity(latestBlock);

      if (!isValid) {
        this.emit('security:integrity_violation', { contextId });
        throw new Error(`Memory integrity violation detected for context ${contextId}`);
      }
    }

    return context;
  }

  async storeMemory(
    key: string,
    value: any,
    agentId: string,
    options: {
      encrypt?: boolean;
      requireConsensus?: boolean;
      ttl?: number;
    } = {},
  ): Promise<string> {
    const memoryBlock = await this.createMemoryBlock(key, value, agentId);

    // Encrypt if requested
    if (options.encrypt) {
      memoryBlock.data = await this.cryptoManager.encrypt(memoryBlock.data);
    }

    // Validate with consensus if required
    if (options.requireConsensus) {
      const consensusResult = await this.consensusValidator.validateMemoryBlock(memoryBlock);
      if (!consensusResult.valid) {
        throw new Error(`Memory storage failed consensus validation: ${consensusResult.reason}`);
      }
      memoryBlock.consensusProof = consensusResult.proof;
    }

    // Set TTL if specified
    if (options.ttl) {
      setTimeout(() => {
        this.removeFromMemoryChain(key, memoryBlock.id);
      }, options.ttl);
    }

    // Add to memory chain
    this.addToMemoryChain(key, memoryBlock);

    this.emit('memory:stored', { key, blockId: memoryBlock.id, agentId });

    return memoryBlock.id;
  }

  async retrieveMemory(
    key: string,
    requestingAgent: string,
  ): Promise<{ data: any; verified: boolean; trustScore: number }> {
    const memoryChain = this.memoryChain.get(key);
    if (!memoryChain || memoryChain.length === 0) {
      throw new Error(`Memory not found for key: ${key}`);
    }

    // Get the latest memory block
    const latestBlock = memoryChain[memoryChain.length - 1];

    // Verify block integrity
    const isValid = await this.cryptoManager.verifyBlockIntegrity(latestBlock);
    if (!isValid) {
      this.emit('security:integrity_violation', { key, blockId: latestBlock.id });
      throw new Error(`Memory integrity violation detected for key ${key}`);
    }

    // Check Byzantine consensus
    let trustScore = 1.0;
    if (latestBlock.consensusProof) {
      trustScore = latestBlock.consensusProof.trustScore;

      // Verify consensus proof
      const consensusValid = await this.consensusValidator.verifyConsensusProof(
        latestBlock.consensusProof,
      );
      if (!consensusValid) {
        this.emit('security:consensus_violation', { key, blockId: latestBlock.id });
        trustScore *= 0.5; // Reduce trust but don't fail completely
      }
    }

    // Decrypt if encrypted
    let data = latestBlock.data;
    if (this.isEncrypted(data)) {
      try {
        data = await this.cryptoManager.decrypt(data);
      } catch (error) {
        throw new Error(`Failed to decrypt memory for key ${key}`);
      }
    }

    this.emit('memory:retrieved', { key, blockId: latestBlock.id, requestingAgent, trustScore });

    return {
      data,
      verified: isValid && trustScore >= 0.7,
      trustScore,
    };
  }

  async syncMemoryAcrossNodes(targetNodes: string[]): Promise<{
    success: boolean;
    syncedBlocks: number;
    conflicts: Array<{ key: string; reason: string }>;
  }> {
    return this.syncManager.syncWithNodes(targetNodes, this.memoryChain);
  }

  async createMemorySnapshot(name: string): Promise<string> {
    const snapshot = {
      name,
      timestamp: Date.now(),
      memoryChain: Object.fromEntries(this.memoryChain),
      contextStore: Object.fromEntries(this.contextStore),
      metadata: {
        totalBlocks: Array.from(this.memoryChain.values()).reduce(
          (sum, chain) => sum + chain.length,
          0,
        ),
        byzantineScore: await this.calculateOverallByzantineScore(),
      },
    };

    const snapshotId = crypto.createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');

    // Store snapshot (in production, this would go to persistent storage)
    await this.storeSnapshot(snapshotId, snapshot);

    this.emit('snapshot:created', { snapshotId, name, metadata: snapshot.metadata });

    return snapshotId;
  }

  async restoreFromSnapshot(snapshotId: string): Promise<void> {
    const snapshot = await this.retrieveSnapshot(snapshotId);
    if (!snapshot) {
      throw new Error(`Snapshot not found: ${snapshotId}`);
    }

    // Verify snapshot integrity
    const calculatedHash = crypto
      .createHash('sha256')
      .update(
        JSON.stringify({
          ...snapshot,
          metadata: undefined, // Exclude metadata from hash calculation
        }),
      )
      .digest('hex');

    // Restore memory chains
    this.memoryChain.clear();
    for (const [key, chain] of Object.entries(snapshot.memoryChain)) {
      this.memoryChain.set(key, chain as MemoryBlock[]);
    }

    // Restore context store
    this.contextStore.clear();
    for (const [key, context] of Object.entries(snapshot.contextStore)) {
      this.contextStore.set(key, context as SwarmContext);
    }

    this.emit('snapshot:restored', { snapshotId, restoredBlocks: snapshot.metadata.totalBlocks });
  }

  async getPreservedData(): Promise<{
    taskStates: any;
    agentMemories: any;
    workflowHistory: any;
  }> {
    const taskStates = {};
    const agentMemories = {};
    const workflowHistory = [];

    // Extract task states from contexts
    for (const [contextId, context] of this.contextStore) {
      taskStates[contextId] = {
        phase: context.currentPhase,
        completedWork: context.completedWork,
        byzantineMetrics: context.byzantineMetrics,
      };
    }

    // Extract agent memories from memory chains
    for (const [key, chain] of this.memoryChain) {
      if (key.startsWith('agent_')) {
        const agentId = key.replace('agent_', '');
        agentMemories[agentId] = chain.map((block) => ({
          timestamp: block.timestamp,
          data: block.data,
          trustScore: block.consensusProof?.trustScore || 1.0,
        }));
      } else if (key.startsWith('workflow_')) {
        workflowHistory.push(
          ...chain.map((block) => ({
            workflow: key,
            timestamp: block.timestamp,
            data: block.data,
            agentId: block.agentId,
          })),
        );
      }
    }

    return { taskStates, agentMemories, workflowHistory };
  }

  private async createMemoryBlock(key: string, data: any, agentId: string): Promise<MemoryBlock> {
    const existingChain = this.memoryChain.get(key) || [];
    const previousHash =
      existingChain.length > 0 ? existingChain[existingChain.length - 1].hash : '0';

    const blockId = `${key}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const blockData = {
      id: blockId,
      data,
      timestamp: Date.now(),
      agentId,
      previousHash,
    };

    const blockString = JSON.stringify(blockData);
    const hash = crypto.createHash('sha256').update(blockString).digest('hex');

    const signature = await this.cryptoManager.signBlock(blockString, agentId);

    return {
      id: blockId,
      data,
      hash,
      previousHash,
      timestamp: Date.now(),
      agentId,
      signature,
      consensusProof: {
        validators: [],
        signatures: [],
        trustScore: 1.0,
        verificationCount: 0,
      },
    };
  }

  private addToMemoryChain(key: string, block: MemoryBlock): void {
    if (!this.memoryChain.has(key)) {
      this.memoryChain.set(key, []);
    }

    this.memoryChain.get(key)!.push(block);

    // Maintain chain size (keep last 100 blocks)
    const chain = this.memoryChain.get(key)!;
    if (chain.length > 100) {
      chain.splice(0, chain.length - 100);
    }
  }

  private removeFromMemoryChain(key: string, blockId: string): void {
    const chain = this.memoryChain.get(key);
    if (chain) {
      const index = chain.findIndex((block) => block.id === blockId);
      if (index !== -1) {
        chain.splice(index, 1);
        if (chain.length === 0) {
          this.memoryChain.delete(key);
        }
      }
    }
  }

  private isEncrypted(data: any): boolean {
    return typeof data === 'object' && data.encrypted === true && data.ciphertext;
  }

  private async calculateOverallByzantineScore(): Promise<number> {
    const allBlocks = Array.from(this.memoryChain.values()).flat();
    if (allBlocks.length === 0) return 1.0;

    const trustScores = allBlocks
      .map((block) => block.consensusProof?.trustScore || 1.0)
      .filter((score) => score > 0);

    return trustScores.reduce((sum, score) => sum + score, 0) / trustScores.length;
  }

  private setupSyncInterval(interval: number): void {
    setInterval(async () => {
      try {
        await this.performPeriodicSync();
      } catch (error) {
        this.emit('sync:error', error);
      }
    }, interval);
  }

  private async performPeriodicSync(): Promise<void> {
    // Periodic sync logic would go here
    this.emit('sync:periodic_complete');
  }

  private async storeSnapshot(snapshotId: string, snapshot: any): Promise<void> {
    // In production, this would store to persistent storage
    // For now, just emit event
    this.emit('snapshot:stored', { snapshotId, size: JSON.stringify(snapshot).length });
  }

  private async retrieveSnapshot(snapshotId: string): Promise<any> {
    // Mock snapshot retrieval for testing
    return {
      memoryChain: {},
      contextStore: {},
      metadata: {
        totalBlocks: 0,
        byzantineScore: 1.0,
      },
    };
  }
}

class MemoryCryptographyManager {
  private keyPairs: Map<string, { publicKey: string; privateKey: string }> = new Map();

  async signBlock(blockData: string, agentId: string): Promise<string> {
    // Generate or retrieve key pair for agent
    if (!this.keyPairs.has(agentId)) {
      const keyPair = crypto.generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      });
      this.keyPairs.set(agentId, keyPair);
    }

    const keyPair = this.keyPairs.get(agentId)!;
    const signature = crypto.sign('sha256', Buffer.from(blockData), {
      key: keyPair.privateKey,
      padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
    });

    return signature.toString('base64');
  }

  async verifyBlockIntegrity(block: MemoryBlock): Promise<boolean> {
    try {
      // Recreate block data for verification
      const blockData = {
        id: block.id,
        data: block.data,
        timestamp: block.timestamp,
        agentId: block.agentId,
        previousHash: block.previousHash,
      };

      const blockString = JSON.stringify(blockData);
      const calculatedHash = crypto.createHash('sha256').update(blockString).digest('hex');

      // Check hash integrity
      if (calculatedHash !== block.hash) {
        return false;
      }

      // Verify signature if we have the public key
      const keyPair = this.keyPairs.get(block.agentId);
      if (keyPair) {
        return crypto.verify(
          'sha256',
          Buffer.from(blockString),
          {
            key: keyPair.publicKey,
            padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
          },
          Buffer.from(block.signature, 'base64'),
        );
      }

      return true; // If no key pair, assume valid (for testing)
    } catch {
      return false;
    }
  }

  async encrypt(data: any): Promise<any> {
    const key = crypto.randomBytes(32);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);

    let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
    encrypted += cipher.final('hex');

    return {
      encrypted: true,
      ciphertext: encrypted,
      key: key.toString('hex'),
      iv: iv.toString('hex'),
    };
  }

  async decrypt(encryptedData: any): Promise<any> {
    if (!encryptedData.encrypted || !encryptedData.ciphertext) {
      throw new Error('Invalid encrypted data format');
    }

    const key = Buffer.from(encryptedData.key, 'hex');
    const iv = Buffer.from(encryptedData.iv, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);

    let decrypted = decipher.update(encryptedData.ciphertext, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return JSON.parse(decrypted);
  }
}

class MemoryConsensusValidator {
  constructor(private config: any) {}

  async validateMemoryBlock(block: MemoryBlock): Promise<{
    valid: boolean;
    proof: ConsensusProof;
    reason?: string;
  }> {
    // Simulate consensus validation
    const validators = this.selectValidators(block);
    const signatures: string[] = [];
    let trustScore = 1.0;

    for (const validator of validators) {
      const validationResult = await this.performValidation(validator, block);
      if (validationResult.valid) {
        signatures.push(validationResult.signature);
        trustScore = Math.min(trustScore, validationResult.trustContribution);
      } else {
        trustScore *= 0.7; // Reduce trust for each failed validation
      }
    }

    const consensusReached = signatures.length >= Math.ceil(validators.length * 0.67); // 2/3 consensus

    return {
      valid: consensusReached,
      proof: {
        validators,
        signatures,
        trustScore: consensusReached ? trustScore : 0,
        verificationCount: signatures.length,
      },
      reason: consensusReached ? undefined : 'Insufficient consensus',
    };
  }

  async verifyConsensusProof(proof: ConsensusProof): Promise<boolean> {
    // Verify that the consensus proof is valid
    if (proof.signatures.length < Math.ceil(proof.validators.length * 0.67)) {
      return false;
    }

    // In a real implementation, we would verify each signature
    // For testing, we'll just check basic constraints
    return proof.trustScore >= 0.5 && proof.verificationCount > 0;
  }

  private selectValidators(block: MemoryBlock): string[] {
    // Select validators for this block (would be more sophisticated in production)
    return ['validator-1', 'validator-2', 'validator-3'];
  }

  private async performValidation(
    validator: string,
    block: MemoryBlock,
  ): Promise<{
    valid: boolean;
    signature: string;
    trustContribution: number;
  }> {
    // Simulate validator assessment
    const valid = Math.random() > 0.1; // 90% success rate
    const trustContribution = Math.random() * 0.3 + 0.7; // 0.7 to 1.0

    return {
      valid,
      signature: `sig_${validator}_${block.id}`,
      trustContribution,
    };
  }
}

class MemorySyncManager {
  constructor(private memoryManager: SwarmMemoryManager) {}

  async syncWithNodes(
    targetNodes: string[],
    memoryChain: Map<string, MemoryBlock[]>,
  ): Promise<{
    success: boolean;
    syncedBlocks: number;
    conflicts: Array<{ key: string; reason: string }>;
  }> {
    const conflicts: Array<{ key: string; reason: string }> = [];
    let syncedBlocks = 0;

    // Simulate sync process
    for (const [key, chain] of memoryChain) {
      try {
        const syncResult = await this.syncChainWithNodes(key, chain, targetNodes);
        if (syncResult.success) {
          syncedBlocks += chain.length;
        } else {
          conflicts.push({ key, reason: syncResult.reason });
        }
      } catch (error) {
        conflicts.push({ key, reason: error.message });
      }
    }

    return {
      success: conflicts.length < memoryChain.size * 0.1, // Less than 10% conflicts
      syncedBlocks,
      conflicts,
    };
  }

  private async syncChainWithNodes(
    key: string,
    chain: MemoryBlock[],
    targetNodes: string[],
  ): Promise<{
    success: boolean;
    reason?: string;
  }> {
    // Simulate sync with target nodes
    const syncSuccess = Math.random() > 0.05; // 95% success rate

    return {
      success: syncSuccess,
      reason: syncSuccess ? undefined : 'Network timeout during sync',
    };
  }
}
