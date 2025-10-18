#!/usr/bin/env node

/**
 * CFN Claude Sync Slash Command
 * Usage: /cfn-claude-sync [--dry-run] [--verbose]
 *
 * Synchronizes CFN Loop configuration from CLAUDE.md to slash command files.
 * Ensures single source of truth (DRY principle) for CFN Loop rules.
 *
 * Extracts from CLAUDE.md:
 * - Consensus threshold (≥90%)
 * - Confidence gate (≥75%)
 * - Loop 2/3 iteration limits
 * - Complexity tiers and agent counts
 * - GOAP decision types
 * - Autonomous execution rules
 */

import { SlashCommand } from "../core/slash-command.js";
import fs from "fs";
import path from "path";

export class CfnClaudeSyncCommand extends SlashCommand {
  constructor() {
    super(
      "cfn-claude-sync",
      "Sync CFN Loop rules from CLAUDE.md to slash command files (DRY principle enforcement)",
    );
  }

  getUsage() {
    return "/cfn-claude-sync [--dry-run] [--verbose]";
  }

  getExamples() {
    return [
      "/cfn-claude-sync",
      "/cfn-claude-sync --dry-run",
      "/cfn-claude-sync --verbose",
    ];
  }

  async execute(args, context) {
    const options = this.parseArgs(args);

    try {
      const projectRoot = process.cwd();
      const claudeMdPath = path.join(projectRoot, "CLAUDE.md");

      // Step 1: Verify CLAUDE.md exists
      if (!fs.existsSync(claudeMdPath)) {
        return this.formatResponse({
          success: false,
          error: "CLAUDE.md not found in project root",
          path: claudeMdPath,
          suggestion:
            "Please ensure CLAUDE.md exists before running sync command",
        });
      }

      // Step 2: Extract CFN Loop configuration from CLAUDE.md
      const config = this.extractCfnConfig(claudeMdPath, options.verbose);

      if (options.verbose) {
        console.log("📋 Extracted Configuration:");
        console.log(JSON.stringify(config, null, 2));
      }

      // Step 3: Identify target files
      const targetFiles = this.getTargetFiles(projectRoot);

      if (options.verbose) {
        console.log("\n📂 Target Files:");
        console.log(
          `  Markdown templates: ${targetFiles.markdown.length} files`,
        );
        console.log(
          `  JavaScript generators: ${targetFiles.javascript.length} files`,
        );
      }

      // Step 4: Analyze required changes
      const changes = this.analyzeChanges(targetFiles, config, options.verbose);

      // Step 5: Dry run or apply changes
      if (options.dryRun) {
        return this.formatDryRunReport(config, changes);
      } else {
        const results = await this.applyChanges(
          targetFiles,
          config,
          changes,
          options.verbose,
        );
        return this.formatSyncReport(config, results);
      }
    } catch (error) {
      return this.formatResponse({
        success: false,
        error: error.message,
        stack: options.verbose ? error.stack : undefined,
      });
    }
  }

  parseArgs(args) {
    const options = {
      dryRun: false,
      verbose: false,
    };

    for (const arg of args) {
      if (arg === "--dry-run") {
        options.dryRun = true;
      } else if (arg === "--verbose") {
        options.verbose = true;
      }
    }

    return options;
  }

  extractCfnConfig(claudeMdPath, verbose) {
    const content = fs.readFileSync(claudeMdPath, "utf-8");

    // Extract CFN Loop section
    const cfnSectionMatch = content.match(
      /## 🔄 MANDATORY CFN LOOP[\s\S]*?(?=\n## [^#]|$)/,
    );

    if (!cfnSectionMatch) {
      throw new Error(
        "Could not find '## 🔄 MANDATORY CFN LOOP' section in CLAUDE.md",
      );
    }

    const cfnSection = cfnSectionMatch[0];

    // Extract configuration values with robust regex patterns
    const config = {
      consensusThreshold: this.extractValue(
        cfnSection,
        /≥(\d+)%.*consensus/i,
        "90",
      ),
      confidenceGate: this.extractValue(
        cfnSection,
        /ALL agents ≥(\d+)%|≥(\d+)%.*confidence/i,
        "75",
      ),
      loop2MaxIterations: this.extractValue(
        cfnSection,
        /Loop 2.*[Mm]ax.*?(\d+)|Loop 2.*\(.*?(\d+).*iterations\)/i,
        "10",
      ),
      loop3MaxIterations: this.extractValue(
        cfnSection,
        /Loop 3.*[Mm]ax.*?(\d+)|Loop 3.*\(.*?(\d+).*iterations\)/i,
        "10",
      ),

      // Complexity tiers
      complexityTiers: {
        simple: this.extractComplexityTier(cfnSection, "Simple", "2-3", "mesh"),
        medium: this.extractComplexityTier(cfnSection, "Medium", "4-6", "mesh"),
        complex: this.extractComplexityTier(
          cfnSection,
          "Complex",
          "8-12",
          "hierarchical",
        ),
        enterprise: this.extractComplexityTier(
          cfnSection,
          "Enterprise",
          "15-20",
          "hierarchical",
        ),
      },

      // GOAP decision types
      goapDecisions: ["PROCEED", "DEFER", "ESCALATE"],

      // Autonomous rules
      autonomousRules: [
        "NO approval needed for retries",
        "IMMEDIATE relaunch on consensus failure",
        "AUTO-TRANSITION on phase completion",
      ],
    };

    if (verbose) {
      console.log("✅ Successfully extracted CFN Loop configuration");
    }

    return config;
  }

  extractValue(text, pattern, fallback) {
    const match = text.match(pattern);
    if (match) {
      // Return first captured group that's not undefined
      for (let i = 1; i < match.length; i++) {
        if (match[i] !== undefined) {
          return match[i];
        }
      }
    }
    return fallback;
  }

  extractComplexityTier(text, tierName, defaultAgents, defaultTopology) {
    // Try to find agent count for this tier
    const agentPattern = new RegExp(
      `\\*\\*${tierName}\\*\\*.*?(\\d+-?\\d*)\\s+agents`,
      "i",
    );
    const agentMatch = text.match(agentPattern);

    // Try to find topology for this tier
    const topologyPattern = new RegExp(
      `${tierName}.*?(mesh|hierarchical)`,
      "i",
    );
    const topologyMatch = text.match(topologyPattern);

    return {
      agents: agentMatch ? agentMatch[1] : defaultAgents,
      topology: topologyMatch
        ? topologyMatch[1].toLowerCase()
        : defaultTopology,
    };
  }

  getTargetFiles(projectRoot) {
    return {
      markdown: [
        ".claude/commands/cfn-loop.md",
        ".claude/commands/cfn-loop-epic.md",
        ".claude/commands/cfn-loop-sprints.md",
        ".claude/commands/cfn-loop-single.md",
      ].map((f) => path.join(projectRoot, f)),

      javascript: [
        "src/slash-commands/cfn-loop.js",
        "src/slash-commands/cfn-loop-epic.js",
        "src/slash-commands/cfn-loop-sprints.js",
        "src/slash-commands/cfn-loop-single.js",
      ].map((f) => path.join(projectRoot, f)),
    };
  }

  analyzeChanges(targetFiles, config, verbose) {
    const changes = {
      markdown: [],
      javascript: [],
    };

    // Analyze markdown files
    for (const file of targetFiles.markdown) {
      if (!fs.existsSync(file)) {
        if (verbose) console.log(`⚠️  Skipping missing file: ${file}`);
        continue;
      }

      const content = fs.readFileSync(file, "utf-8");
      const fileChanges = [];

      // Check consensus threshold
      const consensusPattern = /≥(\d+)%.*consensus/gi;
      let match;
      while ((match = consensusPattern.exec(content)) !== null) {
        if (match[1] !== config.consensusThreshold) {
          fileChanges.push({
            line: this.getLineNumber(content, match.index),
            type: "consensus_threshold",
            current: match[1],
            expected: config.consensusThreshold,
          });
        }
      }

      // Check confidence gate
      const confidencePattern = /ALL agents ≥(\d+)%/gi;
      while ((match = confidencePattern.exec(content)) !== null) {
        if (match[1] !== config.confidenceGate) {
          fileChanges.push({
            line: this.getLineNumber(content, match.index),
            type: "confidence_gate",
            current: match[1],
            expected: config.confidenceGate,
          });
        }
      }

      if (fileChanges.length > 0) {
        changes.markdown.push({ file, changes: fileChanges });
      }
    }

    // Analyze JavaScript files
    for (const file of targetFiles.javascript) {
      if (!fs.existsSync(file)) {
        if (verbose) console.log(`⚠️  Skipping missing file: ${file}`);
        continue;
      }

      const content = fs.readFileSync(file, "utf-8");
      const fileChanges = [];

      // Check maxLoop2 default
      const loop2Pattern = /maxLoop2:\s*(\d+)/g;
      let match;
      while ((match = loop2Pattern.exec(content)) !== null) {
        if (match[1] !== config.loop2MaxIterations) {
          fileChanges.push({
            line: this.getLineNumber(content, match.index),
            type: "loop2_max",
            current: match[1],
            expected: config.loop2MaxIterations,
          });
        }
      }

      // Check maxLoop3 default
      const loop3Pattern = /maxLoop3:\s*(\d+)/g;
      while ((match = loop3Pattern.exec(content)) !== null) {
        if (match[1] !== config.loop3MaxIterations) {
          fileChanges.push({
            line: this.getLineNumber(content, match.index),
            type: "loop3_max",
            current: match[1],
            expected: config.loop3MaxIterations,
          });
        }
      }

      if (fileChanges.length > 0) {
        changes.javascript.push({ file, changes: fileChanges });
      }
    }

    return changes;
  }

  getLineNumber(content, charIndex) {
    return content.substring(0, charIndex).split("\n").length;
  }

  async applyChanges(targetFiles, config, changes, verbose) {
    const results = {
      updated: [],
      errors: [],
      skipped: [],
    };

    // Create backup directory
    const backupDir = path.join(
      process.cwd(),
      ".claude",
      "backups",
      `cfn-sync-${Date.now()}`,
    );
    fs.mkdirSync(backupDir, { recursive: true });

    // Apply markdown changes
    for (const fileChange of changes.markdown) {
      try {
        const { file } = fileChange;
        let content = fs.readFileSync(file, "utf-8");

        // Backup original
        const backupPath = path.join(backupDir, path.basename(file));
        fs.writeFileSync(backupPath, content);

        // Apply replacements
        content = content.replace(
          /≥(\d+)%(\s*.*?consensus)/gi,
          `≥${config.consensusThreshold}%$2`,
        );
        content = content.replace(
          /ALL agents ≥(\d+)%/gi,
          `ALL agents ≥${config.confidenceGate}%`,
        );

        fs.writeFileSync(file, content);
        results.updated.push({
          file,
          changes: fileChange.changes.length,
        });

        if (verbose) {
          console.log(
            `✅ Updated ${path.basename(file)} (${fileChange.changes.length} changes)`,
          );
        }
      } catch (error) {
        results.errors.push({ file: fileChange.file, error: error.message });
      }
    }

    // Apply JavaScript changes
    for (const fileChange of changes.javascript) {
      try {
        const { file } = fileChange;
        let content = fs.readFileSync(file, "utf-8");

        // Backup original
        const backupPath = path.join(backupDir, path.basename(file));
        fs.writeFileSync(backupPath, content);

        // Apply replacements
        content = content.replace(
          /maxLoop2:\s*\d+/g,
          `maxLoop2: ${config.loop2MaxIterations}`,
        );
        content = content.replace(
          /maxLoop3:\s*\d+/g,
          `maxLoop3: ${config.loop3MaxIterations}`,
        );

        fs.writeFileSync(file, content);
        results.updated.push({
          file,
          changes: fileChange.changes.length,
        });

        if (verbose) {
          console.log(
            `✅ Updated ${path.basename(file)} (${fileChange.changes.length} changes)`,
          );
        }
      } catch (error) {
        results.errors.push({ file: fileChange.file, error: error.message });
      }
    }

    return results;
  }

  formatDryRunReport(config, changes) {
    const totalChanges =
      changes.markdown.reduce((sum, f) => sum + f.changes.length, 0) +
      changes.javascript.reduce((sum, f) => sum + f.changes.length, 0);

    let report = `
🔍 **CFN Claude Sync (DRY RUN)**

**Extracted from CLAUDE.md:**
- Consensus threshold: ≥${config.consensusThreshold}%
- Confidence gate: ≥${config.confidenceGate}%
- Loop 2 max iterations: ${config.loop2MaxIterations}
- Loop 3 max iterations: ${config.loop3MaxIterations}

**Changes to be made:**
`;

    for (const fileChange of changes.markdown) {
      report += `\n  ${path.basename(fileChange.file)}:\n`;
      for (const change of fileChange.changes) {
        report += `    Line ${change.line}: ${change.current}% → ${config.consensusThreshold}% (${change.type})\n`;
      }
    }

    for (const fileChange of changes.javascript) {
      report += `\n  ${path.basename(fileChange.file)}:\n`;
      for (const change of fileChange.changes) {
        report += `    Line ${change.line}: ${change.current} → ${change.expected} (${change.type})\n`;
      }
    }

    report += `\n**Total files to update:** ${changes.markdown.length + changes.javascript.length}`;
    report += `\n**Total changes:** ${totalChanges}`;
    report += `\n\nRun without --dry-run to apply changes.`;

    return this.formatResponse({
      success: true,
      dryRun: true,
      report: report,
      config: config,
      changes: changes,
    });
  }

  formatSyncReport(config, results) {
    let report = `
✅ **CFN Claude Sync Complete**

**Updated files:**
`;

    for (const update of results.updated) {
      report += `  ✅ ${path.basename(update.file)} (${update.changes} changes)\n`;
    }

    if (results.errors.length > 0) {
      report += `\n**Errors:**\n`;
      for (const error of results.errors) {
        report += `  ❌ ${path.basename(error.file)}: ${error.error}\n`;
      }
    }

    if (results.skipped.length > 0) {
      report += `\n**Skipped:**\n`;
      for (const skip of results.skipped) {
        report += `  ⚠️  ${path.basename(skip)}\n`;
      }
    }

    report += `
**Configuration now synchronized:**
- Consensus threshold: ≥${config.consensusThreshold}%
- Confidence gate: ≥${config.confidenceGate}%
- Loop 2 max: ${config.loop2MaxIterations} iterations
- Loop 3 max: ${config.loop3MaxIterations} iterations

**Next steps:**
1. Review changes: git diff
2. Run tests: npm test
3. Validate: /cfn-loop "test task" --dry-run
4. Commit: git commit -m "chore: sync CFN Loop from CLAUDE.md"
`;

    return this.formatResponse({
      success: true,
      report: report,
      config: config,
      results: results,
    });
  }
}

// Register command
export default CfnClaudeSyncCommand;
