/**
 * Enterprise Secrets Management System
 * Supports dotenv-vault, AWS Secrets Manager, and secure .env handling
 *
 * @module SecretsManager
 * @security Phase 0 Debt Resolution - API Key Security
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/**
 * Secrets Manager Configuration
 */
const SECRETS_CONFIG = {
  providers: {
    dotenv: {
      enabled: true,
      path: '.env',
      vaultPath: '.env.vault',
      keyPath: '.env.keys'
    },
    aws: {
      enabled: false,
      region: process.env.AWS_REGION || 'us-east-1',
      secretName: process.env.AWS_SECRET_NAME || 'claude-flow-secrets'
    }
  },
  security: {
    minPasswordLength: 32,
    requireEncryption: true,
    rotationIntervalDays: 90,
    filePermissions: 0o600  // -rw------- (owner read/write only)
  },
  validation: {
    patterns: {
      apiKey: /^[a-zA-Z0-9\-_]{20,}$/,
      npmToken: /^npm_[a-zA-Z0-9]{36}$/,
      anthropicKey: /^sk-ant-api03-[a-zA-Z0-9\-_]{95}$/,
      zaiKey: /^[a-f0-9]{32}\.[a-zA-Z0-9]{16}$/
    },
    required: [
      'ANTHROPIC_API_KEY',
      'Z_AI_API_KEY',
      'REDIS_PASSWORD',
      'NPM_API_KEY'
    ]
  }
};

/**
 * SecretsManager Class
 * Handles secure secret storage, retrieval, and rotation
 */
class SecretsManager {
  constructor(options = {}) {
    this.config = { ...SECRETS_CONFIG, ...options };
    this.secrets = new Map();
    this.encryptionKey = null;
    this.initialized = false;
  }

  /**
   * Initialize secrets manager
   */
  async initialize() {
    if (this.initialized) {
      return;
    }

    // Load encryption key
    await this.loadEncryptionKey();

    // Load secrets from configured provider
    if (this.config.providers.dotenv.enabled) {
      await this.loadFromDotenv();
    }

    if (this.config.providers.aws.enabled) {
      await this.loadFromAWS();
    }

    // Validate required secrets
    this.validateRequiredSecrets();

    // Check file permissions
    await this.validateFilePermissions();

    this.initialized = true;
    console.log('✅ Secrets Manager initialized successfully');
  }

  /**
   * Load encryption key for secret encryption
   */
  async loadEncryptionKey() {
    const keyPath = path.join(process.cwd(), this.config.providers.dotenv.keyPath);

    if (fs.existsSync(keyPath)) {
      const keyData = fs.readFileSync(keyPath, 'utf8');
      this.encryptionKey = Buffer.from(keyData.trim(), 'hex');
    } else {
      // Generate new encryption key
      this.encryptionKey = crypto.randomBytes(32);
      fs.writeFileSync(keyPath, this.encryptionKey.toString('hex'), { mode: 0o600 });
      console.log('🔑 Generated new encryption key');
    }
  }

  /**
   * Load secrets from .env file
   */
  async loadFromDotenv() {
    const envPath = path.join(process.cwd(), this.config.providers.dotenv.path);

    if (!fs.existsSync(envPath)) {
      throw new Error(`.env file not found at ${envPath}`);
    }

    const envContent = fs.readFileSync(envPath, 'utf8');
    const lines = envContent.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      const [key, ...valueParts] = trimmed.split('=');
      const value = valueParts.join('=').trim();

      if (key && value) {
        this.secrets.set(key, value);
      }
    }

    console.log(`📄 Loaded ${this.secrets.size} secrets from .env`);
  }

  /**
   * Load secrets from AWS Secrets Manager
   */
  async loadFromAWS() {
    try {
      const AWS = require('aws-sdk');
      const secretsManager = new AWS.SecretsManager({
        region: this.config.providers.aws.region
      });

      const result = await secretsManager.getSecretValue({
        SecretId: this.config.providers.aws.secretName
      }).promise();

      const secrets = JSON.parse(result.SecretString);

      for (const [key, value] of Object.entries(secrets)) {
        this.secrets.set(key, value);
      }

      console.log(`☁️  Loaded ${Object.keys(secrets).length} secrets from AWS`);
    } catch (error) {
      if (error.code === 'ResourceNotFoundException') {
        console.warn('⚠️  AWS secret not found, using local secrets only');
      } else {
        throw error;
      }
    }
  }

  /**
   * Get secret value
   */
  getSecret(key, defaultValue = null) {
    // Check in-memory cache
    if (this.secrets.has(key)) {
      return this.secrets.get(key);
    }

    // Check process.env
    if (process.env[key]) {
      return process.env[key];
    }

    return defaultValue;
  }

  /**
   * Set secret value (in-memory only, use saveSecret for persistence)
   */
  setSecret(key, value) {
    this.secrets.set(key, value);
  }

  /**
   * Save secret to persistent storage
   */
  async saveSecret(key, value) {
    this.secrets.set(key, value);

    // Update .env file
    const envPath = path.join(process.cwd(), this.config.providers.dotenv.path);
    let envContent = '';

    if (fs.existsSync(envPath)) {
      envContent = fs.readFileSync(envPath, 'utf8');
    }

    // Check if key exists
    const lines = envContent.split('\n');
    let found = false;

    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith(`${key}=`)) {
        lines[i] = `${key}=${value}`;
        found = true;
        break;
      }
    }

    if (!found) {
      lines.push(`${key}=${value}`);
    }

    // Write back to file with secure permissions
    fs.writeFileSync(envPath, lines.join('\n'), { mode: 0o600 });
    console.log(`💾 Saved secret: ${key}`);
  }

  /**
   * Validate required secrets are present
   */
  validateRequiredSecrets() {
    const missing = [];

    for (const key of this.config.validation.required) {
      if (!this.secrets.has(key) && !process.env[key]) {
        missing.push(key);
      }
    }

    if (missing.length > 0) {
      console.warn(`⚠️  Missing required secrets: ${missing.join(', ')}`);
    }
  }

  /**
   * Validate API key format
   */
  validateApiKey(key, value) {
    const patterns = this.config.validation.patterns;

    switch (key) {
      case 'NPM_API_KEY':
        return patterns.npmToken.test(value);
      case 'ANTHROPIC_API_KEY':
        return patterns.anthropicKey.test(value);
      case 'Z_AI_API_KEY':
      case 'ZAI_API_KEY':
        return patterns.zaiKey.test(value);
      default:
        return patterns.apiKey.test(value);
    }
  }

  /**
   * Validate file permissions
   */
  async validateFilePermissions() {
    const envPath = path.join(process.cwd(), this.config.providers.dotenv.path);

    if (fs.existsSync(envPath)) {
      const stats = fs.statSync(envPath);
      const mode = stats.mode & 0o777;

      if (mode !== this.config.security.filePermissions) {
        console.warn(`⚠️  Fixing .env file permissions: ${mode.toString(8)} -> ${this.config.security.filePermissions.toString(8)}`);
        fs.chmodSync(envPath, this.config.security.filePermissions);
      }
    }
  }

  /**
   * Encrypt secret value
   */
  encryptSecret(value) {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.encryptionKey, iv);

    let encrypted = cipher.update(value, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();

    return {
      encrypted,
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex')
    };
  }

  /**
   * Decrypt secret value
   */
  decryptSecret(encryptedData) {
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      this.encryptionKey,
      Buffer.from(encryptedData.iv, 'hex')
    );

    decipher.setAuthTag(Buffer.from(encryptedData.authTag, 'hex'));

    let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  /**
   * Rotate API keys
   */
  async rotateApiKey(key, newValue) {
    if (!this.validateApiKey(key, newValue)) {
      throw new Error(`Invalid API key format for ${key}`);
    }

    // Store old value for rollback
    const oldValue = this.getSecret(key);

    try {
      // Save new value
      await this.saveSecret(key, newValue);

      // Create rotation record
      const rotationRecord = {
        key,
        timestamp: new Date().toISOString(),
        rotatedBy: process.env.USER || 'system'
      };

      await this.saveRotationRecord(rotationRecord);

      console.log(`🔄 Rotated API key: ${key}`);
      return true;
    } catch (error) {
      // Rollback on error
      if (oldValue) {
        await this.saveSecret(key, oldValue);
      }
      throw error;
    }
  }

  /**
   * Save rotation record
   */
  async saveRotationRecord(record) {
    const rotationLogPath = path.join(process.cwd(), 'memory', 'security', 'key-rotations.json');
    const dir = path.dirname(rotationLogPath);

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    }

    let rotations = [];
    if (fs.existsSync(rotationLogPath)) {
      rotations = JSON.parse(fs.readFileSync(rotationLogPath, 'utf8'));
    }

    rotations.push(record);

    fs.writeFileSync(rotationLogPath, JSON.stringify(rotations, null, 2), { mode: 0o600 });
  }

  /**
   * Check if secrets need rotation
   */
  async checkRotationRequired() {
    const rotationLogPath = path.join(process.cwd(), 'memory', 'security', 'key-rotations.json');

    if (!fs.existsSync(rotationLogPath)) {
      return this.config.validation.required;
    }

    const rotations = JSON.parse(fs.readFileSync(rotationLogPath, 'utf8'));
    const needRotation = [];

    const rotationThreshold = new Date();
    rotationThreshold.setDate(rotationThreshold.getDate() - this.config.security.rotationIntervalDays);

    for (const key of this.config.validation.required) {
      const lastRotation = rotations
        .filter(r => r.key === key)
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0];

      if (!lastRotation || new Date(lastRotation.timestamp) < rotationThreshold) {
        needRotation.push(key);
      }
    }

    return needRotation;
  }

  /**
   * Generate secure password for Redis
   */
  generateRedisPassword() {
    const length = this.config.security.minPasswordLength;
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+-=[]{}|;:,.<>?';

    let password = '';
    const randomBytes = crypto.randomBytes(length);

    for (let i = 0; i < length; i++) {
      password += chars[randomBytes[i] % chars.length];
    }

    return password;
  }

  /**
   * Initialize Redis authentication
   */
  async initializeRedisAuth() {
    let redisPassword = this.getSecret('REDIS_PASSWORD');

    if (!redisPassword) {
      redisPassword = this.generateRedisPassword();
      await this.saveSecret('REDIS_PASSWORD', redisPassword);
      console.log('🔐 Generated secure Redis password');
    }

    return redisPassword;
  }

  /**
   * Security audit report
   */
  async generateSecurityAudit() {
    const audit = {
      timestamp: new Date().toISOString(),
      secrets: {
        total: this.secrets.size,
        required: this.config.validation.required.length,
        missing: []
      },
      filePermissions: {},
      rotation: {
        needRotation: await this.checkRotationRequired()
      },
      recommendations: []
    };

    // Check required secrets
    for (const key of this.config.validation.required) {
      if (!this.getSecret(key)) {
        audit.secrets.missing.push(key);
      }
    }

    // Check file permissions
    const envPath = path.join(process.cwd(), this.config.providers.dotenv.path);
    if (fs.existsSync(envPath)) {
      const stats = fs.statSync(envPath);
      audit.filePermissions['.env'] = (stats.mode & 0o777).toString(8);
    }

    // Generate recommendations
    if (audit.secrets.missing.length > 0) {
      audit.recommendations.push({
        severity: 'HIGH',
        message: `Missing required secrets: ${audit.secrets.missing.join(', ')}`
      });
    }

    if (audit.rotation.needRotation.length > 0) {
      audit.recommendations.push({
        severity: 'MEDIUM',
        message: `Keys need rotation: ${audit.rotation.needRotation.join(', ')}`
      });
    }

    if (audit.filePermissions['.env'] !== '600') {
      audit.recommendations.push({
        severity: 'HIGH',
        message: `.env file has insecure permissions: ${audit.filePermissions['.env']}`
      });
    }

    return audit;
  }
}

// Singleton instance
let secretsManagerInstance = null;

/**
 * Get or create SecretsManager instance
 */
function getSecretsManager() {
  if (!secretsManagerInstance) {
    secretsManagerInstance = new SecretsManager();
  }
  return secretsManagerInstance;
}

module.exports = {
  SecretsManager,
  getSecretsManager,
  SECRETS_CONFIG
};
