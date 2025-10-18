// template-copier.js - Copy template files instead of generating them dynamically

import { existsSync } from '../../node-compat.js';
import { promises as fs } from 'fs';
import { dirname, join, relative } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Find the templates directory (bundled or local)
 * @param {string} templateType - Template type (basic-swarm, fleet-manager, etc.)
 * @returns {Promise<string>} Path to templates directory
 */
async function findTemplatesDirectory(templateType = 'basic-swarm') {
  // Try multiple possible template locations
  const possiblePaths = [
    // 1. Bundled templates (npm package installed)
    join(__dirname, '..', '..', '..', '..', 'templates', templateType),
    // 2. Source templates during development
    join(__dirname, 'templates'),
    // 3. Legacy templates location
    join(__dirname, 'templates', templateType),
    // 4. Project root templates
    join(process.cwd(), 'templates', templateType),
  ];

  for (const path of possiblePaths) {
    try {
      await fs.access(path);
      return path;
    } catch (err) {
      continue;
    }
  }

  // Fallback to local templates directory
  return join(__dirname, 'templates');
}

/**
 * Copy template files from the templates directory to the target directory
 * @param {string} targetDir - The directory to copy templates to
 * @param {Object} options - Options for template copying
 * @param {string} options.template - Template type (basic-swarm, fleet-manager, event-bus, custom-agent)
 * @param {boolean} options.sparc - Whether to include SPARC templates
 * @param {boolean} options.enhanced - Whether to use enhanced templates
 * @param {boolean} options.minimal - Whether to use minimal templates
 * @param {boolean} options.optimized - Whether to use optimized templates
 * @param {boolean} options.dryRun - Whether to perform a dry run
 * @param {boolean} options.force - Whether to overwrite existing files
 * @param {string[]} options.selectedModes - Selected SPARC modes to copy
 * @returns {Promise<{success: boolean, copiedFiles: string[], errors: string[]}>}
 */
export async function copyTemplates(targetDir, options = {}) {
  const results = {
    success: true,
    copiedFiles: [],
    errors: [],
  };

  try {
    // Determine templates directory (bundled or local)
    const templatesDir = await findTemplatesDirectory(options.template || 'basic-swarm');

    // Determine which template variants to use
    const templateVariant =
      options.verify || options.pair
        ? 'verification'
        : options.optimized
          ? 'optimized'
          : options.enhanced
            ? 'enhanced'
            : options.minimal
              ? 'minimal'
              : options.sparc
                ? 'sparc'
                : 'full';

    // Core files to copy
    const coreFiles = [
      {
        source: 'CLAUDE.md',
        destination: 'CLAUDE.md',
        useVariant: true,
      },
      {
        source: 'memory-bank.md',
        destination: 'memory-bank.md',
        useVariant: true,
      },
      {
        source: 'coordination.md',
        destination: 'coordination.md',
        useVariant: true,
      },
    ];

    // Copy core files
    for (const file of coreFiles) {
      // Skip files if requested
      if (options.skipClaudeMd && file.destination === 'CLAUDE.md') continue;
      if (options.skipSettings && file.destination.includes('settings')) continue;

      const sourceFile =
        file.useVariant && existsSync(join(templatesDir, `${file.source}.${templateVariant}`))
          ? `${file.source}.${templateVariant}`
          : file.source;

      const sourcePath = join(templatesDir, sourceFile);
      const destPath = join(targetDir, file.destination);

      if (await copyFile(sourcePath, destPath, options)) {
        results.copiedFiles.push(file.destination);
      } else if (!options.dryRun) {
        results.errors.push(`Failed to copy ${file.destination}`);
      }
    }

    // Copy .claude directory structure
    if (options.enhanced || !options.minimal) {
      const claudeDir = join(targetDir, '.claude');

      // Copy settings.json unless skipped
      if (!options.skipSettings) {
        const settingsSource =
          options.verify || options.pair
            ? 'settings.json.verification'
            : options.enhanced
              ? 'settings.json.enhanced'
              : 'settings.json';
        const settingsPath = join(templatesDir, settingsSource);
        const settingsDest = join(claudeDir, 'settings.json');

        if (!options.dryRun) {
          await fs.mkdir(claudeDir, { recursive: true });
        }

        if (await copyFile(settingsPath, settingsDest, options)) {
          results.copiedFiles.push('.claude/settings.json');
        }
      } else if (!options.dryRun) {
        // Still create the directory even if skipping settings
        await fs.mkdir(claudeDir, { recursive: true });
      }

      // Copy command templates
      if (options.sparc || options.enhanced) {
        await copyCommandTemplates(templatesDir, targetDir, options, results);
      }

      // Copy helper scripts (enhanced mode only)
      if (options.enhanced) {
        await copyHelperScripts(templatesDir, targetDir, options, results);
      }
    }

    // Copy SPARC-specific files
    if (options.sparc) {
      await copySparcTemplates(templatesDir, targetDir, options, results);
    }

    // Copy wrapper scripts
    await copyWrapperScripts(templatesDir, targetDir, options, results);

    // Create directory structure
    await createDirectoryStructure(targetDir, options);

    // Create README files for memory directories
    await createMemoryReadmeFiles(targetDir, options, results);
  } catch (err) {
    results.success = false;
    results.errors.push(`Template copy failed: ${err.message}`);
  }

  return results;
}

/**
 * Copy a single file with options
 */
async function copyFile(source, destination, options) {
  try {
    // Check if source exists
    if (!existsSync(source)) {
      // Try reading from templates directory as fallback
      const templateContent = await getTemplateContent(source);
      if (templateContent) {
        if (!options.dryRun) {
          await fs.writeFile(destination, templateContent);
        }
        console.log(
          `  ${options.dryRun ? '[DRY RUN] Would create' : '✓ Created'} ${relative(process.cwd(), destination)}`,
        );
        return true;
      }
      console.log(`  ⚠️  Template not found: ${relative(process.cwd(), source)}`);
      return false;
    }

    // Check if destination exists and handle force flag
    if (existsSync(destination) && !options.force) {
      console.log(
        `  ⚠️  File already exists: ${relative(process.cwd(), destination)} (use --force to overwrite)`,
      );
      return false;
    }

    if (!options.dryRun) {
      // Ensure destination directory exists
      await fs.mkdir(dirname(destination), { recursive: true });

      // Copy the file
      const content = await fs.readFile(source, 'utf8');
      await fs.writeFile(destination, content);

      // Preserve file permissions for executable scripts
      if (source.endsWith('.sh') || source.includes('claude-flow')) {
        await fs.chmod(destination, 0o755);
      }
    }

    console.log(
      `  ${options.dryRun ? '[DRY RUN] Would copy' : '✓ Copied'} ${relative(process.cwd(), destination)}`,
    );
    return true;
  } catch (err) {
    console.log(`  ❌ Failed to copy ${relative(process.cwd(), destination)}: ${err.message}`);
    return false;
  }
}

/**
 * Copy command templates
 */
async function copyCommandTemplates(templatesDir, targetDir, options, results) {
  const commandsSourceDir = join(templatesDir, 'commands');
  const commandsDestDir = join(targetDir, '.claude', 'commands');

  if (!existsSync(commandsSourceDir)) {
    // Use generated command templates as fallback
    return await generateCommandTemplates(targetDir, options, results);
  }

  try {
    if (!options.dryRun) {
      await fs.mkdir(commandsDestDir, { recursive: true });
    }

    // Copy command categories
    const categories = await fs.readdir(commandsSourceDir);

    for (const category of categories) {
      const categoryPath = join(commandsSourceDir, category);
      const stat = await fs.stat(categoryPath);

      if (stat.isDirectory()) {
        const destCategoryPath = join(commandsDestDir, category);

        if (!options.dryRun) {
          await fs.mkdir(destCategoryPath, { recursive: true });
        }

        // Copy files in category
        const files = await fs.readdir(categoryPath);
        for (const file of files) {
          const sourcePath = join(categoryPath, file);
          const destPath = join(destCategoryPath, file);

          if (await copyFile(sourcePath, destPath, options)) {
            results.copiedFiles.push(join('.claude', 'commands', category, file));
          }
        }
      }
    }
  } catch (err) {
    results.errors.push(`Failed to copy command templates: ${err.message}`);
  }
}

/**
 * Copy SPARC templates
 */
async function copySparcTemplates(templatesDir, targetDir, options, results) {
  const sparcDir = join(targetDir, '.claude', 'commands', 'sparc');

  try {
    if (!options.dryRun) {
      await fs.mkdir(sparcDir, { recursive: true });
    }

    // Get SPARC mode templates
    const { createSparcModeTemplates, createSparcModesOverview } = await import(
      './templates/sparc-modes.js'
    );
    const sparcTemplates = createSparcModeTemplates();

    // Filter templates if selectedModes is specified
    const templatesToCreate = options.selectedModes
      ? Object.entries(sparcTemplates).filter(([filename]) => {
          const mode = filename.replace('.md', '');
          return options.selectedModes.includes(mode);
        })
      : Object.entries(sparcTemplates);

    // Write SPARC mode files
    for (const [filename, content] of templatesToCreate) {
      const destPath = join(sparcDir, filename);

      if (!options.dryRun) {
        await fs.writeFile(destPath, content);
      }

      console.log(
        `  ${options.dryRun ? '[DRY RUN] Would create' : '✓ Created'} .claude/commands/sparc/${filename}`,
      );
      results.copiedFiles.push(join('.claude', 'commands', 'sparc', filename));
    }

    // Create sparc-modes.md overview
    const overviewPath = join(sparcDir, 'sparc-modes.md');
    if (!options.dryRun) {
      await fs.writeFile(overviewPath, createSparcModesOverview());
    }
    console.log(
      `  ${options.dryRun ? '[DRY RUN] Would create' : '✓ Created'} .claude/commands/sparc/sparc-modes.md`,
    );
    results.copiedFiles.push('.claude/commands/sparc/sparc-modes.md');

    // Copy swarm templates
    await copySwarmTemplates(templatesDir, targetDir, options, results);
  } catch (err) {
    results.errors.push(`Failed to copy SPARC templates: ${err.message}`);
  }
}

/**
 * Copy swarm strategy templates
 */
async function copySwarmTemplates(templatesDir, targetDir, options, results) {
  const swarmDir = join(targetDir, '.claude', 'commands', 'swarm');

  try {
    if (!options.dryRun) {
      await fs.mkdir(swarmDir, { recursive: true });
    }

    // Get swarm strategy templates
    const { createSwarmStrategyTemplates } = await import('./templates/sparc-modes.js');
    const swarmTemplates = createSwarmStrategyTemplates();

    // Write swarm strategy files
    for (const [filename, content] of Object.entries(swarmTemplates)) {
      const destPath = join(swarmDir, filename);

      if (!options.dryRun) {
        await fs.writeFile(destPath, content);
      }

      console.log(
        `  ${options.dryRun ? '[DRY RUN] Would create' : '✓ Created'} .claude/commands/swarm/${filename}`,
      );
      results.copiedFiles.push(join('.claude', 'commands', 'swarm', filename));
    }
  } catch (err) {
    results.errors.push(`Failed to copy swarm templates: ${err.message}`);
  }
}

/**
 * Copy helper scripts (enhanced mode)
 */
async function copyHelperScripts(templatesDir, targetDir, options, results) {
  const helpersDir = join(targetDir, '.claude', 'helpers');

  try {
    if (!options.dryRun) {
      await fs.mkdir(helpersDir, { recursive: true });
    }

    const helpers = [
      'setup-mcp.sh',
      'quick-start.sh',
      'github-setup.sh',
      'github-safe.js',
      'checkpoint-manager.sh',
      'standard-checkpoint-hooks.sh',
    ];
    const { createHelperScript } = await import('./templates/enhanced-templates.js');

    for (const helper of helpers) {
      const content = createHelperScript(helper);
      if (content) {
        const destPath = join(helpersDir, helper);

        if (!options.dryRun) {
          await fs.writeFile(destPath, content);
          await fs.chmod(destPath, 0o755);
        }

        console.log(
          `  ${options.dryRun ? '[DRY RUN] Would create' : '✓ Created'} .claude/helpers/${helper}`,
        );
        results.copiedFiles.push(join('.claude', 'helpers', helper));
      }
    }
  } catch (err) {
    results.errors.push(`Failed to copy helper scripts: ${err.message}`);
  }
}

/**
 * Copy wrapper scripts
 */
async function copyWrapperScripts(templatesDir, targetDir, options, results) {
  try {
    // Unix wrapper
    const unixWrapperPath = join(targetDir, 'claude-flow');
    const unixWrapperSource = join(templatesDir, 'claude-flow-universal');

    if (await copyFile(unixWrapperSource, unixWrapperPath, options)) {
      if (!options.dryRun) {
        await fs.chmod(unixWrapperPath, 0o755);
      }
      results.copiedFiles.push('claude-flow');
    }

    // Windows batch wrapper
    const batchWrapperPath = join(targetDir, 'claude-flow.bat');
    const batchWrapperSource = join(templatesDir, 'claude-flow.bat');

    if (await copyFile(batchWrapperSource, batchWrapperPath, options)) {
      results.copiedFiles.push('claude-flow.bat');
    }

    // PowerShell wrapper
    const psWrapperPath = join(targetDir, 'claude-flow.ps1');
    const psWrapperSource = join(templatesDir, 'claude-flow.ps1');

    if (await copyFile(psWrapperSource, psWrapperPath, options)) {
      results.copiedFiles.push('claude-flow.ps1');
    }
  } catch (err) {
    results.errors.push(`Failed to copy wrapper scripts: ${err.message}`);
  }
}

/**
 * Create directory structure
 */
async function createDirectoryStructure(targetDir, options) {
  const directories = [
    'memory',
    'memory/agents',
    'memory/sessions',
    'coordination',
    'coordination/memory_bank',
    'coordination/subtasks',
    'coordination/orchestration',
    '.claude',
    '.claude/commands',
    '.claude/logs',
    '.swarm', // For memory persistence
  ];

  if (options.sparc) {
    directories.push('.claude/commands/sparc', '.claude/commands/swarm');
  }

  for (const dir of directories) {
    const dirPath = join(targetDir, dir);
    try {
      if (!options.dryRun) {
        await fs.mkdir(dirPath, { recursive: true });
      }
      console.log(`  ${options.dryRun ? '[DRY RUN] Would create' : '✓ Created'} ${dir}/ directory`);
    } catch (err) {
      if (err.code !== 'EEXIST') {
        console.log(`  ❌ Failed to create ${dir}/: ${err.message}`);
      }
    }
  }
}

/**
 * Create README files for memory directories
 */
async function createMemoryReadmeFiles(targetDir, options, results) {
  const { createAgentsReadme, createSessionsReadme } = await import('./templates/readme-files.js');

  const readmeFiles = [
    { path: 'memory/agents/README.md', content: createAgentsReadme() },
    { path: 'memory/sessions/README.md', content: createSessionsReadme() },
  ];

  for (const { path, content } of readmeFiles) {
    const fullPath = join(targetDir, path);

    try {
      if (!options.dryRun) {
        await fs.mkdir(dirname(fullPath), { recursive: true });
        await fs.writeFile(fullPath, content);
      }
      console.log(`  ${options.dryRun ? '[DRY RUN] Would create' : '✓ Created'} ${path}`);
      results.copiedFiles.push(path);
    } catch (err) {
      results.errors.push(`Failed to create ${path}: ${err.message}`);
    }
  }

  // Initialize persistence database
  const dbPath = join(targetDir, 'memory', 'claude-flow-data.json');
  const initialData = {
    agents: [],
    tasks: [],
    lastUpdated: Date.now(),
  };

  try {
    if (!options.dryRun) {
      await fs.writeFile(dbPath, JSON.stringify(initialData, null, 2));
    }
    console.log(
      `  ${options.dryRun ? '[DRY RUN] Would create' : '✓ Created'} memory/claude-flow-data.json (persistence database)`,
    );
    results.copiedFiles.push('memory/claude-flow-data.json');
  } catch (err) {
    results.errors.push(`Failed to create persistence database: ${err.message}`);
  }
}

/**
 * Get template content from template file (BUNDLED OR LOCAL)
 */
async function getTemplateContent(templatePath) {
  const filename = templatePath.split('/').pop();

  // Try to read from the actual template file
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);

  // Try multiple possible template locations
  // Priority: bundled templates > local templates > dist templates
  const templatePaths = [
    // 1. Bundled templates (npm package)
    join(__dirname, '..', '..', '..', '..', 'templates', 'basic-swarm', filename),
    // 2. Source location during development
    join(__dirname, 'templates', filename),
    // 3. Dist location (files copied directly)
    join(__dirname, filename),
    // 4. Relative to project root
    join(process.cwd(), 'templates', 'basic-swarm', filename),
  ];

  for (const actualTemplatePath of templatePaths) {
    try {
      const content = await fs.readFile(actualTemplatePath, 'utf8');
      console.log(`  ✓ Using template from ${actualTemplatePath}`);
      return content;
    } catch (err) {
      // Try next path
      continue;
    }
  }

  // NO FALLBACK TO GENERATION - Template file must exist
  console.log(`  ⚠️  Template file not found for ${filename}`);
  console.log(`  💡 Template files must be present in templates/ or src/cli/simple-commands/init/templates/`);
  return null;
}

/**
 * Generate command templates as fallback
 */
async function generateCommandTemplates(targetDir, options, results) {
  const { COMMAND_STRUCTURE, createCommandDoc } = await import('./templates/enhanced-templates.js');

  for (const [category, commands] of Object.entries(COMMAND_STRUCTURE)) {
    const categoryDir = join(targetDir, '.claude', 'commands', category);

    try {
      if (!options.dryRun) {
        await fs.mkdir(categoryDir, { recursive: true });

        // Create category README
        const categoryReadme = `# ${category.charAt(0).toUpperCase() + category.slice(1)} Commands

Commands for ${category} operations in Claude Flow.

## Available Commands

${commands.map((cmd) => `- [${cmd}](./${cmd}.md)`).join('\n')}
`;
        await fs.writeFile(join(categoryDir, 'README.md'), categoryReadme);
      }

      // Create individual command docs
      for (const command of commands) {
        const doc = createCommandDoc(category, command);
        if (doc) {
          const docPath = join(categoryDir, `${command}.md`);
          if (!options.dryRun) {
            await fs.writeFile(docPath, doc);
          }
          results.copiedFiles.push(join('.claude', 'commands', category, `${command}.md`));
        }
      }

      console.log(
        `  ${options.dryRun ? '[DRY RUN] Would create' : '✓ Created'} ${commands.length} ${category} command docs`,
      );
    } catch (err) {
      results.errors.push(`Failed to generate ${category} command templates: ${err.message}`);
    }
  }
}
