#!/usr/bin/env node
/**
 * SQLite Memory CLI - Agent-accessible memory operations
 * Provides simple CLI access to SQLite memory system with 5-level ACL
 *
 * Usage:
 *   memory-cli set --key <key> --value <value> --acl <level>
 *   memory-cli get --key <key>
 *   memory-cli delete --key <key>
 *   memory-cli query --pattern <glob>
 *   memory-cli list --acl <level>
 */

import { SQLiteMemorySystem } from "../memory/sqlite-memory-system.js";
import { AccessLevel } from "../memory/memory-adapter.js";
import path from "path";
import fs from "fs";

interface CliArgs {
  command: string;
  key?: string;
  value?: string;
  acl?: number;
  pattern?: string;
  format?: "json" | "text";
}

interface MemoryConfig {
  dbPath: string;
  encryptionKey?: string;
  aclLevels: {
    [key: string]: number;
  };
}

class MemoryCli {
  private memory: SQLiteMemorySystem;
  private config: MemoryConfig;

  constructor(configPath?: string) {
    // Load configuration
    const defaultConfigPath = path.join(
      process.cwd(),
      ".claude/skills/sqlite-memory/config.json",
    );

    const configFile = configPath || defaultConfigPath;

    if (fs.existsSync(configFile)) {
      this.config = JSON.parse(fs.readFileSync(configFile, "utf8"));
    } else {
      // Default configuration
      this.config = {
        dbPath: path.join(
          process.cwd(),
          ".artifacts/memory/swarm-memory.sqlite",
        ),
        aclLevels: {
          agent: AccessLevel.READ,
          team: AccessLevel.WRITE,
          swarm: AccessLevel.ADMIN,
          project: AccessLevel.SYSTEM,
          system: AccessLevel.ROOT,
        },
      };
    }

    // Initialize SQLite memory system
    this.memory = new SQLiteMemorySystem(
      this.config.dbPath,
      this.config.encryptionKey,
    );
  }

  async initialize(): Promise<void> {
    await this.memory.initialize();
  }

  async set(
    key: string,
    value: string,
    acl: number = AccessLevel.READ,
  ): Promise<void> {
    try {
      // Parse value as JSON if possible
      let parsedValue: any;
      try {
        parsedValue = JSON.parse(value);
      } catch {
        parsedValue = value;
      }

      await this.memory.store(key, parsedValue, acl);

      this.output({
        success: true,
        operation: "set",
        key,
        acl,
        aclLevel: this.getAclLevelName(acl),
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      this.outputError("set", error);
    }
  }

  async get(key: string): Promise<void> {
    try {
      const value = await this.memory.retrieve(key);

      if (value === null) {
        this.output({
          success: false,
          operation: "get",
          key,
          error: "Key not found",
          timestamp: new Date().toISOString(),
        });
      } else {
        this.output({
          success: true,
          operation: "get",
          key,
          value,
          timestamp: new Date().toISOString(),
        });
      }
    } catch (error) {
      this.outputError("get", error);
    }
  }

  async delete(key: string): Promise<void> {
    try {
      // SQLiteMemorySystem doesn't have delete method, so we'll add it
      // For now, we'll set the value to null with a special marker
      await this.memory.store(
        key,
        { __deleted__: true, deletedAt: Date.now() },
        AccessLevel.SYSTEM,
      );

      this.output({
        success: true,
        operation: "delete",
        key,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      this.outputError("delete", error);
    }
  }

  async query(pattern: string): Promise<void> {
    try {
      // This requires additional implementation in SQLiteMemorySystem
      // For now, we'll return a placeholder response
      this.output({
        success: false,
        operation: "query",
        pattern,
        error: "Query operation not yet implemented in SQLiteMemorySystem",
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      this.outputError("query", error);
    }
  }

  async list(acl?: number): Promise<void> {
    try {
      // This requires additional implementation in SQLiteMemorySystem
      // For now, we'll return a placeholder response
      this.output({
        success: false,
        operation: "list",
        acl,
        error: "List operation not yet implemented in SQLiteMemorySystem",
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      this.outputError("list", error);
    }
  }

  private getAclLevelName(level: number): string {
    const levels = [
      "NONE",
      "READ/AGENT",
      "WRITE/TEAM",
      "ADMIN/SWARM",
      "SYSTEM/PROJECT",
      "ROOT/SYSTEM",
    ];
    return levels[level] || "UNKNOWN";
  }

  private output(data: any): void {
    console.log(JSON.stringify(data, null, 2));
  }

  private outputError(operation: string, error: any): void {
    this.output({
      success: false,
      operation,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
    process.exit(1);
  }
}

// Parse CLI arguments
function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  const parsed: CliArgs = {
    command: args[0] || "help",
    format: "json",
  };

  for (let i = 1; i < args.length; i += 2) {
    const flag = args[i];
    const value = args[i + 1];

    switch (flag) {
      case "--key":
      case "-k":
        parsed.key = value;
        break;
      case "--value":
      case "-v":
        parsed.value = value;
        break;
      case "--acl":
      case "-a":
        parsed.acl = parseInt(value, 10);
        break;
      case "--pattern":
      case "-p":
        parsed.pattern = value;
        break;
      case "--format":
      case "-f":
        parsed.format = value as "json" | "text";
        break;
    }
  }

  return parsed;
}

function showHelp(): void {
  console.log(`
SQLite Memory CLI - Agent-accessible memory operations

USAGE:
  memory-cli <command> [options]

COMMANDS:
  set       Store a value in memory
  get       Retrieve a value from memory
  delete    Delete a value from memory
  query     Query values by pattern
  list      List all keys (optionally filtered by ACL)
  help      Show this help message

OPTIONS:
  --key, -k <key>        Memory key
  --value, -v <value>    Value to store (JSON or string)
  --acl, -a <level>      Access control level (0-5)
  --pattern, -p <glob>   Glob pattern for query
  --format, -f <format>  Output format (json|text)

ACL LEVELS:
  0 = NONE
  1 = READ/AGENT     (encrypted, agent-specific)
  2 = WRITE/TEAM     (shared within team)
  3 = ADMIN/SWARM    (swarm-level coordination)
  4 = SYSTEM/PROJECT (project-wide access)
  5 = ROOT/SYSTEM    (system-level access)

EXAMPLES:
  # Store agent state
  memory-cli set --key "agent/worker-1/state" --value '{"progress":50}' --acl 1

  # Retrieve agent state
  memory-cli get --key "agent/worker-1/state"

  # Store swarm coordination data
  memory-cli set --key "swarm/phase-1/status" --value '{"complete":true}' --acl 3

  # Delete a key
  memory-cli delete --key "agent/worker-1/state"

  # Query by pattern
  memory-cli query --pattern "agent/*/state"

  # List all keys at swarm level
  memory-cli list --acl 3
`);
}

// Main execution
async function main() {
  const args = parseArgs();

  if (
    args.command === "help" ||
    args.command === "--help" ||
    args.command === "-h"
  ) {
    showHelp();
    process.exit(0);
  }

  const cli = new MemoryCli();
  await cli.initialize();

  switch (args.command) {
    case "set":
      if (!args.key || args.value === undefined) {
        console.error("Error: --key and --value are required for set command");
        process.exit(1);
      }
      await cli.set(args.key, args.value, args.acl || AccessLevel.READ);
      break;

    case "get":
      if (!args.key) {
        console.error("Error: --key is required for get command");
        process.exit(1);
      }
      await cli.get(args.key);
      break;

    case "delete":
      if (!args.key) {
        console.error("Error: --key is required for delete command");
        process.exit(1);
      }
      await cli.delete(args.key);
      break;

    case "query":
      if (!args.pattern) {
        console.error("Error: --pattern is required for query command");
        process.exit(1);
      }
      await cli.query(args.pattern);
      break;

    case "list":
      await cli.list(args.acl);
      break;

    default:
      console.error(`Error: Unknown command '${args.command}'`);
      showHelp();
      process.exit(1);
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
