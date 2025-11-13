#!/usr/bin/env tsx
/**
 * CFN Runtime Environment Generator
 *
 * Generates type-safe environment variable configurations from cfn-runtime.contract.yml
 * Output formats: .env (KEY=value), .sh (bash exports), .json (Node.js imports)
 *
 * Usage: tsx scripts/generate-cfn-runtime-env.ts
 * Output: docker/runtime/cfn-runtime.{env,sh,json}
 */

import * as fs from "fs";
import * as path from "path";
import YAML from "js-yaml";

// Type definitions for the runtime contract
interface EnvVariable {
  name: string;
  required: boolean;
  default?: string;
  computed?: string;
  description: string;
  scope: ("agent" | "coordinator" | "orchestrator")[];
  legacy_alias?: string;
  allowed_values?: string[];
}

interface RuntimeCategory {
  [key: string]: EnvVariable;
}

interface RuntimeContract {
  version: string;
  description: string;
  timestamp: string;
  [key: string]: RuntimeCategory | string;
}

interface GeneratedEnv {
  [key: string]: string;
}

interface GeneratedJson {
  version: string;
  generated: string;
  variables: {
    [key: string]: {
      value: string;
      description: string;
      required: boolean;
    };
  };
}

// Utility to resolve computed values
function resolveComputedValue(
  computed: string,
  variables: GeneratedEnv
): string {
  let resolved = computed;
  const matches = computed.match(/\$\{([^}]+)\}/g) || [];

  for (const match of matches) {
    const varName = match.slice(2, -1);
    const value = variables[varName];

    if (!value) {
      throw new Error(
        `Cannot compute ${computed}: missing variable ${varName}`
      );
    }

    resolved = resolved.replace(match, value);
  }

  return resolved;
}

// Validate contract structure
function validateContract(contract: Record<string, unknown>): void {
  if (!contract.version) {
    throw new Error("Contract must include 'version' field");
  }
}

// Extract all variables from contract
function extractVariables(contract: Record<string, unknown>): EnvVariable[] {
  const variables: EnvVariable[] = [];

  for (const [categoryName, categoryData] of Object.entries(contract)) {
    // Skip metadata fields
    if (
      [
        "version",
        "description",
        "timestamp",
        "computed_values",
        "last_updated",
      ].includes(categoryName)
    ) {
      continue;
    }

    if (
      typeof categoryData === "object" &&
      categoryData !== null &&
      !Array.isArray(categoryData)
    ) {
      for (const [varNameOrKey, varData] of Object.entries(categoryData)) {
        if (typeof varData === "object" && varData !== null) {
          // Handle both old format (with 'name' field) and new format (key is the name)
          const v = varData as unknown as Record<string, unknown>;

          // Create normalized variable
          const normalizedVar: EnvVariable = {
            name: (v.name as string) || varNameOrKey,
            required: (v.required as boolean) ?? false,
            description: (v.description as string) || "",
            scope: (v.scope as ("agent" | "coordinator" | "orchestrator")[]) || [
              "agent",
            ],
            default:
              v.default === null
                ? undefined
                : (v.default as string | undefined),
            computed: (v.computed as string | undefined),
            legacy_alias:
              (v.legacy_aliases as string[])?.length > 0
                ? ((v.legacy_aliases as string[])[0])
                : (v.legacy_alias as string | undefined),
          };

          variables.push(normalizedVar);
        }
      }
    }
  }

  return variables;
}

// Generate .env format
function generateEnvFile(variables: GeneratedEnv): string {
  const lines: string[] = [
    "# CFN Runtime Environment Variables",
    "# Generated from docker/runtime/cfn-runtime.contract.yml",
    `# Timestamp: ${new Date().toISOString()}`,
    "",
  ];

  for (const [key, value] of Object.entries(variables)) {
    lines.push(`${key}=${value}`);
  }

  return lines.join("\n") + "\n";
}

// Generate .sh format with bash exports
function generateShFile(
  variables: GeneratedEnv,
  contract: RuntimeContract
): string {
  const lines: string[] = [
    "#!/bin/bash",
    "# CFN Runtime Environment Script",
    "# Generated from docker/runtime/cfn-runtime.contract.yml",
    `# Timestamp: ${new Date().toISOString()}`,
    "# Source this file to load environment variables",
    "",
    "set -euo pipefail",
    "",
  ];

  // Extract legacy aliases from original contract
  const legacyAliases = new Map<string, string[]>();

  for (const [categoryName, categoryData] of Object.entries(contract)) {
    if (
      [
        "version",
        "description",
        "timestamp",
        "computed_values",
        "last_updated",
      ].includes(categoryName)
    ) {
      continue;
    }

    if (
      typeof categoryData === "object" &&
      categoryData !== null &&
      !Array.isArray(categoryData)
    ) {
      for (const [varNameOrKey, varData] of Object.entries(categoryData)) {
        if (typeof varData === "object" && varData !== null) {
          const v = varData as unknown as Record<string, unknown>;
          const varName = (v.name as string) || varNameOrKey;

          // Handle legacy_aliases array or legacy_alias string
          const aliases: string[] = [];
          if (Array.isArray(v.legacy_aliases)) {
            aliases.push(...(v.legacy_aliases as string[]));
          } else if (v.legacy_alias && typeof v.legacy_alias === "string") {
            aliases.push(v.legacy_alias);
          }

          if (aliases.length > 0) {
            legacyAliases.set(varName, aliases);
          }
        }
      }
    }
  }

  // Generate exports with defaults
  for (const [key, value] of Object.entries(variables)) {
    const escapedValue = value.replace(/"/g, '\\"');
    lines.push(`export ${key}="\${${key}:-${escapedValue}}"`);

    // Add legacy aliases if exist
    const aliases = legacyAliases.get(key);
    if (aliases && aliases.length > 0) {
      for (const alias of aliases) {
        lines.push(`export ${alias}="\${${key}}" # legacy alias`);
      }
    }
  }

  lines.push("");

  return lines.join("\n");
}

// Generate .json format
function generateJsonFile(
  variables: GeneratedEnv,
  contract: RuntimeContract
): GeneratedJson {
  const jsonVariables: GeneratedJson["variables"] = {};

  // Re-extract variables with descriptions for JSON output
  for (const [categoryName, categoryData] of Object.entries(contract)) {
    if (
      [
        "version",
        "description",
        "timestamp",
        "computed_values",
        "last_updated",
      ].includes(categoryName)
    ) {
      continue;
    }

    if (
      typeof categoryData === "object" &&
      categoryData !== null &&
      !Array.isArray(categoryData)
    ) {
      for (const [varNameOrKey, varData] of Object.entries(categoryData)) {
        if (typeof varData === "object" && varData !== null) {
          const v = varData as unknown as Record<string, unknown>;
          const varName = (v.name as string) || varNameOrKey;

          jsonVariables[varName] = {
            value: variables[varName] || "",
            description: (v.description as string) || "",
            required: (v.required as boolean) ?? false,
          };
        }
      }
    }
  }

  return {
    version: contract.version,
    generated: new Date().toISOString(),
    variables: jsonVariables,
  };
}

// Main generator function
async function generateRuntimeEnv(): Promise<void> {
  const contractPath = path.join(
    process.cwd(),
    "docker/runtime/cfn-runtime.contract.yml"
  );
  const outputDir = path.join(process.cwd(), "docker/runtime");

  // Validate output directory
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Read contract
  if (!fs.existsSync(contractPath)) {
    throw new Error(
      `Contract file not found: ${contractPath}\nPlease create docker/runtime/cfn-runtime.contract.yml`
    );
  }

  const contractYaml = fs.readFileSync(contractPath, "utf-8");
  const contract = YAML.load(contractYaml) as RuntimeContract;

  validateContract(contract);

  // Extract and process variables
  const variables = extractVariables(contract);

  if (variables.length === 0) {
    throw new Error("No environment variables found in contract");
  }

  // Build generated environment object
  const generatedEnv: GeneratedEnv = {};

  for (const variable of variables) {
    // Determine value: computed > default > error if required
    let value: string;

    if (variable.computed) {
      // Will be resolved after defaults are set
      continue;
    } else if (variable.default !== undefined) {
      value = variable.default;
    } else if (variable.required) {
      throw new Error(
        `Required variable ${variable.name} has no default value`
      );
    } else {
      value = "";
    }

    generatedEnv[variable.name] = value;
  }

  // Now resolve computed values
  for (const variable of variables) {
    if (variable.computed) {
      generatedEnv[variable.name] = resolveComputedValue(
        variable.computed,
        generatedEnv
      );
    }
  }

  // Validate required variables
  for (const variable of variables) {
    if (variable.required && !generatedEnv[variable.name]) {
      throw new Error(
        `Required variable ${variable.name} could not be generated`
      );
    }
  }

  // Generate output files
  const envContent = generateEnvFile(generatedEnv);
  const shContent = generateShFile(generatedEnv, contract);
  const jsonContent = generateJsonFile(generatedEnv, contract);

  // Write .env file
  const envPath = path.join(outputDir, "cfn-runtime.env");
  fs.writeFileSync(envPath, envContent, "utf-8");
  console.log(`Generated: ${envPath}`);

  // Write .sh file
  const shPath = path.join(outputDir, "cfn-runtime.sh");
  fs.writeFileSync(shPath, shContent, "utf-8");
  fs.chmodSync(shPath, 0o755); // Make executable
  console.log(`Generated: ${shPath}`);

  // Write .json file
  const jsonPath = path.join(outputDir, "cfn-runtime.json");
  fs.writeFileSync(
    jsonPath,
    JSON.stringify(jsonContent, null, 2) + "\n",
    "utf-8"
  );
  console.log(`Generated: ${jsonPath}`);

  // Summary
  console.log(`\nGeneration Summary:`);
  console.log(`  Variables processed: ${variables.length}`);
  console.log(`  Contract version: ${contract.version}`);
  console.log(`  Output directory: ${outputDir}`);
  console.log(`  Format: .env (legacy), .sh (bash), .json (Node.js)`);
}

// Execute generator
generateRuntimeEnv().catch((error) => {
  console.error("Generation failed:", error.message);
  process.exit(1);
});
