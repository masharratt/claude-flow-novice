import { z } from 'zod';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

export interface FullStackSwarmConfig {
  swarm: SwarmConfig;
  agents: AgentPoolConfig;
  adapters: AdapterConfig;
  testing: TestingConfig;
  deployment: DeploymentConfig;
  monitoring: MonitoringConfig;
  security: SecurityConfig;
}

export interface SwarmConfig {
  maxAgents: number;
  minAgents: number;
  defaultComplexityThreshold: number;
  messageTimeoutMs: number;
  retryAttempts: number;
  enableBackwardCompatibility: boolean;
  routingStrategy: 'broadcast' | 'targeted' | 'intelligent';
}

export interface AgentPoolConfig {
  warmPoolSize: number;
  coldPoolTimeoutMs: number;
  maxIdleTime: number;
  spawnTimeoutMs: number;
  healthCheckIntervalMs: number;
  enablePrewarming: boolean;
}

export interface AdapterConfig {
  chrome: ChromeAdapterConfig;
  shadcn: ShadcnAdapterConfig;
  playwright: PlaywrightAdapterConfig;
}

export interface ChromeAdapterConfig {
  enabled: boolean;
  version: string;
  retryOnVersionMismatch: boolean;
  maxRetries: number;
  timeoutMs: number;
  headless: boolean;
  devtools: boolean;
}

export interface ShadcnAdapterConfig {
  enabled: boolean;
  cacheEnabled: boolean;
  cacheTimeoutMs: number;
  maxCacheSize: number;
  defaultTheme: string;
  customThemePath?: string;
  componentLibraryPath: string;
}

export interface PlaywrightAdapterConfig {
  enabled: boolean;
  browsers: string[];
  headless: boolean;
  slowMo: number;
  timeout: number;
}

export interface TestingConfig {
  enabled: boolean;
  e2eEnabled: boolean;
  unitTestEnabled: boolean;
  integrationTestEnabled: boolean;
  coverageThreshold: number;
  testTimeoutMs: number;
  parallelTests: boolean;
  maxWorkers: number;
  retainArtifacts: boolean;
  screenshotOnFailure: boolean;
}

export interface DeploymentConfig {
  environment: 'development' | 'staging' | 'production';
  cicdIntegration: boolean;
  automatedDeployment: boolean;
  rollbackOnFailure: boolean;
  healthChecksEnabled: boolean;
  deploymentTimeoutMs: number;
}

export interface MonitoringConfig {
  enabled: boolean;
  metricsCollection: boolean;
  realTimeUpdates: boolean;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  performanceTracking: boolean;
  alerting: AlertingConfig;
}

export interface AlertingConfig {
  enabled: boolean;
  thresholds: {
    errorRate: number;
    responseTime: number;
    memoryUsage: number;
    cpuUsage: number;
  };
  notifications: {
    email?: string;
    slack?: string;
    webhook?: string;
  };
}

export interface SecurityConfig {
  enableSandboxing: boolean;
  allowedDomains: string[];
  blockedCommands: string[];
  maxExecutionTime: number;
  enableAuditLog: boolean;
  auditLogPath: string;
}

const ConfigSchema = z.object({
  swarm: z.object({
    maxAgents: z.number().min(2).max(20),
    minAgents: z.number().min(1).max(10),
    defaultComplexityThreshold: z.number().min(0).max(1),
    messageTimeoutMs: z.number().positive(),
    retryAttempts: z.number().min(0).max(5),
    enableBackwardCompatibility: z.boolean(),
    routingStrategy: z.enum(['broadcast', 'targeted', 'intelligent']),
  }),
  agents: z.object({
    warmPoolSize: z.number().min(1).max(5),
    coldPoolTimeoutMs: z.number().positive(),
    maxIdleTime: z.number().positive(),
    spawnTimeoutMs: z.number().positive(),
    healthCheckIntervalMs: z.number().positive(),
    enablePrewarming: z.boolean(),
  }),
  adapters: z.object({
    chrome: z.object({
      enabled: z.boolean(),
      version: z.string(),
      retryOnVersionMismatch: z.boolean(),
      maxRetries: z.number().min(0).max(5),
      timeoutMs: z.number().positive(),
      headless: z.boolean(),
      devtools: z.boolean(),
    }),
    shadcn: z.object({
      enabled: z.boolean(),
      cacheEnabled: z.boolean(),
      cacheTimeoutMs: z.number().positive(),
      maxCacheSize: z.number().positive(),
      defaultTheme: z.string(),
      customThemePath: z.string().optional(),
      componentLibraryPath: z.string(),
    }),
    playwright: z.object({
      enabled: z.boolean(),
      browsers: z.array(z.string()),
      headless: z.boolean(),
      slowMo: z.number().min(0),
      timeout: z.number().positive(),
    }),
  }),
  testing: z.object({
    enabled: z.boolean(),
    e2eEnabled: z.boolean(),
    unitTestEnabled: z.boolean(),
    integrationTestEnabled: z.boolean(),
    coverageThreshold: z.number().min(0).max(100),
    testTimeoutMs: z.number().positive(),
    parallelTests: z.boolean(),
    maxWorkers: z.number().positive(),
    retainArtifacts: z.boolean(),
    screenshotOnFailure: z.boolean(),
  }),
  deployment: z.object({
    environment: z.enum(['development', 'staging', 'production']),
    cicdIntegration: z.boolean(),
    automatedDeployment: z.boolean(),
    rollbackOnFailure: z.boolean(),
    healthChecksEnabled: z.boolean(),
    deploymentTimeoutMs: z.number().positive(),
  }),
  monitoring: z.object({
    enabled: z.boolean(),
    metricsCollection: z.boolean(),
    realTimeUpdates: z.boolean(),
    logLevel: z.enum(['debug', 'info', 'warn', 'error']),
    performanceTracking: z.boolean(),
    alerting: z.object({
      enabled: z.boolean(),
      thresholds: z.object({
        errorRate: z.number().min(0).max(1),
        responseTime: z.number().positive(),
        memoryUsage: z.number().min(0).max(100),
        cpuUsage: z.number().min(0).max(100),
      }),
      notifications: z.object({
        email: z.string().email().optional(),
        slack: z.string().url().optional(),
        webhook: z.string().url().optional(),
      }),
    }),
  }),
  security: z.object({
    enableSandboxing: z.boolean(),
    allowedDomains: z.array(z.string()),
    blockedCommands: z.array(z.string()),
    maxExecutionTime: z.number().positive(),
    enableAuditLog: z.boolean(),
    auditLogPath: z.string(),
  }),
});

export class FullStackConfigManager {
  private config: FullStackSwarmConfig;
  private configPath: string;

  constructor(configPath?: string) {
    this.configPath = configPath || this.getDefaultConfigPath();
    this.config = this.loadConfig();
  }

  private getDefaultConfigPath(): string {
    const homeConfig = join(homedir(), '.claude-flow', 'fullstack-config.json');
    const localConfig = join(process.cwd(), '.claude-flow', 'fullstack-config.json');

    if (existsSync(localConfig)) return localConfig;
    if (existsSync(homeConfig)) return homeConfig;

    return localConfig;
  }

  private getDefaultConfig(): FullStackSwarmConfig {
    return {
      swarm: {
        maxAgents: 10,
        minAgents: 2,
        defaultComplexityThreshold: 0.5,
        messageTimeoutMs: 30000,
        retryAttempts: 3,
        enableBackwardCompatibility: true,
        routingStrategy: 'intelligent',
      },
      agents: {
        warmPoolSize: 2,
        coldPoolTimeoutMs: 60000,
        maxIdleTime: 300000,
        spawnTimeoutMs: 10000,
        healthCheckIntervalMs: 30000,
        enablePrewarming: true,
      },
      adapters: {
        chrome: {
          enabled: true,
          version: 'latest',
          retryOnVersionMismatch: true,
          maxRetries: 3,
          timeoutMs: 30000,
          headless: true,
          devtools: false,
        },
        shadcn: {
          enabled: true,
          cacheEnabled: true,
          cacheTimeoutMs: 3600000, // 1 hour
          maxCacheSize: 100,
          defaultTheme: 'default',
          componentLibraryPath: './src/components/ui',
        },
        playwright: {
          enabled: true,
          browsers: ['chromium', 'firefox', 'webkit'],
          headless: true,
          slowMo: 0,
          timeout: 30000,
        },
      },
      testing: {
        enabled: true,
        e2eEnabled: true,
        unitTestEnabled: true,
        integrationTestEnabled: true,
        coverageThreshold: 80,
        testTimeoutMs: 60000,
        parallelTests: true,
        maxWorkers: 4,
        retainArtifacts: true,
        screenshotOnFailure: true,
      },
      deployment: {
        environment: 'development',
        cicdIntegration: false,
        automatedDeployment: false,
        rollbackOnFailure: true,
        healthChecksEnabled: true,
        deploymentTimeoutMs: 300000,
      },
      monitoring: {
        enabled: true,
        metricsCollection: true,
        realTimeUpdates: true,
        logLevel: 'info',
        performanceTracking: true,
        alerting: {
          enabled: false,
          thresholds: {
            errorRate: 0.05,
            responseTime: 5000,
            memoryUsage: 80,
            cpuUsage: 80,
          },
          notifications: {},
        },
      },
      security: {
        enableSandboxing: true,
        allowedDomains: ['localhost', '127.0.0.1'],
        blockedCommands: ['rm -rf', 'format', 'del /f'],
        maxExecutionTime: 300000,
        enableAuditLog: true,
        auditLogPath: './logs/audit.log',
      },
    };
  }

  private loadConfig(): FullStackSwarmConfig {
    try {
      if (existsSync(this.configPath)) {
        const configData = JSON.parse(readFileSync(this.configPath, 'utf8'));
        const validatedConfig = ConfigSchema.parse(configData);
        return validatedConfig as FullStackSwarmConfig;
      }
    } catch (error) {
      console.warn(`Failed to load config from ${this.configPath}:`, error);
    }

    const defaultConfig = this.getDefaultConfig();
    this.saveConfig(defaultConfig);
    return defaultConfig;
  }

  public saveConfig(config?: FullStackSwarmConfig): void {
    const configToSave = config || this.config;

    try {
      ConfigSchema.parse(configToSave);
      const configDir = join(this.configPath, '..');

      if (!existsSync(configDir)) {
        require('fs').mkdirSync(configDir, { recursive: true });
      }

      writeFileSync(this.configPath, JSON.stringify(configToSave, null, 2), 'utf8');
      this.config = configToSave;
    } catch (error) {
      throw new Error(`Failed to save config: ${error}`);
    }
  }

  public getConfig(): FullStackSwarmConfig {
    return { ...this.config };
  }

  public updateConfig(updates: Partial<FullStackSwarmConfig>): void {
    const mergedConfig = this.mergeConfig(this.config, updates);
    this.saveConfig(mergedConfig);
  }

  private mergeConfig(base: FullStackSwarmConfig, updates: Partial<FullStackSwarmConfig>): FullStackSwarmConfig {
    const result = { ...base };

    for (const key in updates) {
      if (updates[key] && typeof updates[key] === 'object' && !Array.isArray(updates[key])) {
        result[key] = { ...result[key], ...updates[key] };
      } else if (updates[key] !== undefined) {
        result[key] = updates[key];
      }
    }

    return result;
  }

  public resetToDefaults(): void {
    this.saveConfig(this.getDefaultConfig());
  }

  public validateConfig(config: any): boolean {
    try {
      ConfigSchema.parse(config);
      return true;
    } catch {
      return false;
    }
  }

  public getConfigForEnvironment(env: 'development' | 'staging' | 'production'): FullStackSwarmConfig {
    const config = this.getConfig();

    // Environment-specific overrides
    const envOverrides: Record<string, Partial<FullStackSwarmConfig>> = {
      development: {
        adapters: {
          ...config.adapters,
          chrome: { ...config.adapters.chrome, headless: false, devtools: true },
        },
        monitoring: { ...config.monitoring, logLevel: 'debug' as const },
        security: { ...config.security, enableSandboxing: false },
      },
      staging: {
        deployment: { ...config.deployment, automatedDeployment: true },
        monitoring: { ...config.monitoring, alerting: { ...config.monitoring.alerting, enabled: true } },
      },
      production: {
        adapters: {
          ...config.adapters,
          chrome: { ...config.adapters.chrome, headless: true, devtools: false },
        },
        deployment: {
          ...config.deployment,
          automatedDeployment: true,
          rollbackOnFailure: true,
          healthChecksEnabled: true,
        },
        monitoring: {
          ...config.monitoring,
          alerting: { ...config.monitoring.alerting, enabled: true },
        },
        security: { ...config.security, enableSandboxing: true },
      },
    };

    const envConfig = envOverrides[env];
    if (!envConfig) return config;

    const merged = this.mergeConfig(config, envConfig);
    // Ensure all required properties are present by merging with defaults if needed
    const validated = this.mergeConfig(this.getDefaultConfig(), merged);
    return validated;
  }
}

export const configManager = new FullStackConfigManager();