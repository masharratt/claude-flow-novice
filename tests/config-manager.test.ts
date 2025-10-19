import fs from "fs/promises";
import path from "path";
import { jest } from "@jest/globals";
import ConfigManager from "../src/cli/config-manager";

// Mocking fs and path to prevent actual file system operations
jest.mock("fs/promises", () => ({
  readFile: jest.fn(),
  writeFile: jest.fn(),
}));
jest.mock("path", () => ({
  join: jest.fn(),
}));

describe("ConfigManager", () => {
  let configManager: ConfigManager;
  const mockConfigPath = "/mock/config/path/.claude-flow-config.json";
  const mockSchemaPath = "/mock/schema/path/config.json";

  const mockSchema = {
    properties: {
      redis: {
        properties: {
          host: { default: "localhost" },
          port: { default: 6379 }
        }
      },
      agent: {
        properties: {
          default_strategy: { default: "development" },
          max_concurrent_agents: { default: 5 },
          log_level: { default: "info" }
        }
      },
      security: {
        properties: {
          enabled: { default: true },
          max_retry_attempts: { default: 3 }
        }
      }
    }
  };

  const mockConfig = {
    redis: {
      host: "localhost",
      port: 6379
    },
    agent: {
      default_strategy: "development",
      max_concurrent_agents: 5,
      log_level: "info"
    },
    security: {
      enabled: true,
      max_retry_attempts: 3
    }
  };

  beforeEach(() => {
    // Reset mocks
    jest.resetAllMocks();

    // @ts-ignore: Mocking path methods
    path.join.mockReturnValueOnce(mockConfigPath).mockReturnValueOnce(mockSchemaPath);

    // @ts-ignore: Mocking file system methods
    fs.readFile.mockImplementation(async (path) => {
      if (path === mockConfigPath) {
        return JSON.stringify(mockConfig);
      }
      if (path === mockSchemaPath) {
        return JSON.stringify(mockSchema);
      }
      throw new Error("File not found");
    });

    // @ts-ignore: Mocking write file
    fs.writeFile.mockResolvedValue(undefined);

    // Use reflection to instantiate private constructor
    configManager = ConfigManager["instance"] || new (ConfigManager as any)();
  });

  test("getInstance returns a singleton instance", () => {
    const anotherInstance = ConfigManager.getInstance();
    expect(anotherInstance).toBe(configManager);
  });

  test("getValue returns entire config object when no subkey specified", async () => {
    const result = await configManager.getAll();
    expect(result).toEqual(mockConfig);
  });

  test("getValue returns specific config value when subkey is specified", async () => {
    const hostValue = await configManager.getValue("redis.host");
    expect(hostValue).toBe("localhost");
  });

  test("set updates configuration", async () => {
    await configManager.set("redis", {
      host: "newhost",
      port: 9999
    });

    // @ts-ignore: Verify writeFile was called
    expect(fs.writeFile).toHaveBeenCalledWith(
      mockConfigPath,
      expect.stringContaining('"host": "newhost"'),
      "utf-8"
    );
  });

  test("resetToDefaults restores default configuration", async () => {
    const defaults = await configManager.resetToDefaults();
    expect(defaults).toEqual(mockConfig);

    // @ts-ignore: Verify writeFile was called with default config
    expect(fs.writeFile).toHaveBeenCalledWith(
      mockConfigPath,
      expect.stringContaining(JSON.stringify(mockConfig, null, 2)),
      "utf-8"
    );
  });

  test("throws error when setting invalid configuration", async () => {
    await expect(
      configManager.set("agent", "invalid" as any)
    ).rejects.toThrow("Invalid configuration value");
  });
});