import * as fs from "fs/promises";
import * as path from "path";
import Ajv from "ajv";
import * as lodash from "lodash";

interface ConfigSchema {
  redis: {
    host: string;
    port: number;
    password?: string;
  };
  agent: {
    default_strategy: string;
    max_concurrent_agents: number;
    log_level: "debug" | "info" | "warn" | "error";
  };
  security: {
    enabled: boolean;
    max_retry_attempts: number;
  };
}

class ConfigManager {
  private static _instance: ConfigManager | null = null;
  private configPath: string;
  private schemaPath: string;
  private ajv: Ajv;

  private constructor() {
    this.configPath = path.join(
      process.env.HOME || "",
      ".claude-flow-config.json",
    );
    this.schemaPath = path.join(
      __dirname,
      "../../.claude/skills/config-management/config.json",
    );
    this.ajv = new Ajv();
  }

  public static getInstance(): ConfigManager {
    if (!ConfigManager._instance) {
      ConfigManager._instance = new ConfigManager();
    }
    return ConfigManager._instance;
  }

  private async readConfig(): Promise<ConfigSchema> {
    try {
      const configContent = await fs.readFile(this.configPath, "utf-8");
      return JSON.parse(configContent) as ConfigSchema;
    } catch (error) {
      // If config doesn't exist, create from schema
      return this.resetToDefaults();
    }
  }

  private async writeConfig(config: ConfigSchema): Promise<void> {
    const schemaContent = await fs.readFile(this.schemaPath, "utf-8");
    const schema = JSON.parse(schemaContent);

    const validate = this.ajv.compile(schema);
    if (!validate(config)) {
      throw new Error(
        "Invalid configuration: " + this.ajv.errorsText(validate.errors),
      );
    }

    await fs.writeFile(
      this.configPath,
      JSON.stringify(config, null, 2),
      "utf-8",
    );
  }

  public async getValue(keyPath: string): Promise<any> {
    const config = await this.readConfig();
    const value = lodash.get(config, keyPath);

    if (value === undefined) {
      // Check if it's a custom key path not in the schema
      const customConfig = await this.readCustomConfig();
      return lodash.get(customConfig, keyPath);
    }

    return value;
  }

  private async readCustomConfig(): Promise<Record<string, any>> {
    try {
      const customConfigPath = path.join(
        process.env.HOME || "",
        ".claude-flow-custom-config.json",
      );
      const customConfigContent = await fs.readFile(customConfigPath, "utf-8");
      return JSON.parse(customConfigContent);
    } catch (error) {
      // If custom config doesn't exist or can't be read, return empty object
      return {};
    }
  }

  public async set(key: keyof ConfigSchema, value: ConfigSchema[keyof ConfigSchema]): Promise<void> {
    const config = await this.readConfig();

    // Type assertion to handle full object
    if (typeof value === "object" && value !== null) {
      config[key] = value;
    } else {
      throw new Error("Invalid configuration value");
    }

    await this.writeConfig(config);
  }

  public async getAll(): Promise<ConfigSchema> {
    return this.readConfig();
  }

  public async resetToDefaults(): Promise<ConfigSchema> {
    const schemaContent = await fs.readFile(this.schemaPath, "utf-8");
    const schema = JSON.parse(schemaContent);

    // Extract default values from the schema
    const defaultConfig: ConfigSchema = {
      redis: {
        host: schema.properties.redis.properties.host.default,
        port: schema.properties.redis.properties.port.default,
      },
      agent: {
        default_strategy:
          schema.properties.agent.properties.default_strategy.default,
        max_concurrent_agents:
          schema.properties.agent.properties.max_concurrent_agents.default,
        log_level: schema.properties.agent.properties.log_level.default,
      },
      security: {
        enabled: schema.properties.security.properties.enabled.default,
        max_retry_attempts:
          schema.properties.security.properties.max_retry_attempts.default,
      },
    };

    await this.writeConfig(defaultConfig);
    return defaultConfig;
  }
}

export default ConfigManager;