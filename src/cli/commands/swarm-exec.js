#!/usr/bin/env node

/**
 * CLI Swarm Execution Interface
 *
 * Direct CLI interface for swarm execution without MCP dependency
 * Supports up to 50 concurrent agents via CLI with Redis persistence
 */

import { Command } from 'commander';
import { executeSwarm } from '../simple-commands/swarm-executor.js';
import { connectRedis, saveSwarmState, loadSwarmState, listActiveSwarms } from '../utils/redis-client.js';
import { validateArgs, validateSwarmConfig, validateOutputConfig } from '../utils/arg-validator.js';
import { formatAndOutput, createFormatter } from '../utils/output-formatter.js';

const program = new Command();

// Configure CLI program
program
  .name('swarm-exec')
  .description('Direct CLI interface for swarm execution without MCP dependency')
  .version('1.0.0');

/**
 * Execute a new swarm with direct CLI interface
 */
program
  .command('execute <objective>')
  .alias('exec')
  .description('Execute a new swarm with the given objective')
  .option('-s, --strategy <type>', 'Execution strategy (auto, development, research, testing, analysis, optimization, maintenance)', 'auto')
  .option('-m, --mode <type>', 'Coordination mode (centralized, distributed, hierarchical, mesh, hybrid)', 'centralized')
  .option('-a, --max-agents <number>', 'Maximum number of agents (1-50)', '5')
  .option('-t, --timeout <minutes>', 'Swarm timeout in minutes', '60')
  .option('-f, --output-format <format>', 'Output format (json, text, stream)', 'text')
  .option('-o, --output-file <path>', 'Save output to file')
  .option('--redis-host <host>', 'Redis server host', 'localhost')
  .option('--redis-port <port>', 'Redis server port', '6379')
  .option('--redis-password <password>', 'Redis password')
  .option('--persist', 'Enable Redis persistence', 'true')
  .option('--monitor', 'Enable real-time monitoring')
  .option('--verbose', 'Enable verbose logging')
  .action(async (objective, options) => {
    try {
      // Validate arguments
      const validation = validateArgs({ objective, ...options });
      if (!validation.valid) {
        console.error('❌ Validation errors:');
        validation.errors.forEach(error => console.error(`  • ${error}`));
        process.exit(1);
      }

      // Parse and validate configuration
      const maxAgents = parseInt(options.maxAgents);
      if (maxAgents > 50) {
        console.error('❌ Maximum agents cannot exceed 50 for CLI interface');
        process.exit(1);
      }

      const config = {
        strategy: options.strategy,
        mode: options.mode,
        maxAgents: maxAgents,
        timeout: parseInt(options.timeout),
        outputFormat: options.outputFormat,
        outputFile: options.outputFile,
        monitor: options.monitor || false,
        verbose: options.verbose || false,
        redis: {
          host: options.redisHost,
          port: parseInt(options.redisPort),
          password: options.redisPassword,
        },
        persist: options.persist === 'true'
      };

      // Validate swarm configuration
      const configValidation = validateSwarmConfig(config);
      if (!configValidation.valid) {
        console.error('❌ Configuration errors:');
        configValidation.errors.forEach(error => console.error(`  • ${error}`));
        process.exit(1);
      }

      // Connect to Redis if persistence is enabled
      let redisClient = null;
      if (config.persist) {
        try {
          redisClient = await connectRedis(config.redis);
          console.log('✅ Connected to Redis for persistence');
        } catch (error) {
          console.warn('⚠️  Redis connection failed, continuing without persistence');
          config.persist = false;
        }
      }

      // Generate unique swarm ID
      const swarmId = `swarm_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

      console.log(`🚀 Starting swarm execution...`);
      console.log(`📋 Objective: ${objective}`);
      console.log(`🆔 Swarm ID: ${swarmId}`);
      console.log(`🎯 Strategy: ${config.strategy}`);
      console.log(`🏗️  Mode: ${config.mode}`);
      console.log(`🤖 Max Agents: ${config.maxAgents}`);
      console.log(`⏰ Timeout: ${config.timeout} minutes`);

      if (config.persist) {
        console.log(`💾 Persistence: Enabled (Redis)`);
      }

      // Initialize swarm state in Redis if enabled
      if (redisClient) {
        const initialState = {
          id: swarmId,
          objective,
          config,
          status: 'initializing',
          startTime: Date.now(),
          agents: [],
          tasks: [],
          results: null
        };
        await saveSwarmState(redisClient, swarmId, initialState);
      }

      // Execute swarm
      const result = await executeSwarm(objective, {
        ...config,
        id: swarmId,
        redisClient
      });

      // Save final state to Redis if enabled
      if (redisClient) {
        const finalState = {
          ...result,
          id: swarmId,
          endTime: Date.now(),
          status: result.success ? 'completed' : 'failed'
        };
        await saveSwarmState(redisClient, swarmId, finalState);
        await redisClient.quit();
      }

      // Validate output configuration
      const outputValidation = validateOutputConfig(config.outputFormat, config.outputFile);
      if (!outputValidation.valid) {
        console.error('❌ Output configuration errors:');
        outputValidation.errors.forEach(error => console.error(`  • ${error}`));
        process.exit(1);
      }

      // Prepare output data
      const outputData = {
        type: result.success ? 'swarm_completed' : 'swarm_failed',
        swarmId,
        objective,
        success: result.success,
        summary: result.summary,
        timestamp: new Date().toISOString(),
        config: {
          strategy: config.strategy,
          mode: config.mode,
          maxAgents: config.maxAgents,
          timeout: config.timeout
        },
        ...(result.success ? {} : { error: result.error })
      };

      // Handle output based on format using the formatter
      const formatterOptions = {
        verbose: config.verbose,
        timestamp: true,
        outputFile: config.outputFile
      };

      if (config.outputFormat === 'stream') {
        // Create stream formatter for real-time updates
        const streamFormatter = createFormatter({ ...formatterOptions, streaming: true });
        streamFormatter.startStreaming();
        streamFormatter.write(outputData, 'stream');
        streamFormatter.stopStreaming();
      } else {
        // Use standard formatter for text/json output
        formatAndOutput(outputData, config.outputFormat, formatterOptions);
      }

      if (!result.success) {
        process.exit(1);
      }

    } catch (error) {
      console.error(`❌ Execution error: ${error.message}`);
      if (options.verbose) {
        console.error(error.stack);
      }
      process.exit(1);
    }
  });

/**
 * Recover a swarm from Redis persistence
 */
program
  .command('recover [swarmId]')
  .description('Recover and resume a swarm from Redis persistence')
  .option('--redis-host <host>', 'Redis server host', 'localhost')
  .option('--redis-port <port>', 'Redis server port', '6379')
  .option('--redis-password <password>', 'Redis password')
  .option('--list', 'List all recoverable swarms')
  .action(async (swarmId, options) => {
    try {
      const redisConfig = {
        host: options.redisHost,
        port: parseInt(options.redisPort),
        password: options.redisPassword,
      };

      const redisClient = await connectRedis(redisConfig);
      console.log('✅ Connected to Redis');

      if (options.list) {
        // List all recoverable swarms
        const swarms = await listActiveSwarms(redisClient);

        if (swarms.length === 0) {
          console.log('📭 No recoverable swarms found');
        } else {
          console.log(`📋 Found ${swarms.length} recoverable swarms:`);
          swarms.forEach(swarm => {
            console.log(`  • ${swarm.id} - ${swarm.status} - ${swarm.objective}`);
            console.log(`    Started: ${new Date(swarm.startTime).toLocaleString()}`);
            if (swarm.endTime) {
              console.log(`    Ended: ${new Date(swarm.endTime).toLocaleString()}`);
            }
          });
        }
      } else if (swarmId) {
        // Recover specific swarm
        const swarmState = await loadSwarmState(redisClient, swarmId);

        if (!swarmState) {
          console.error(`❌ Swarm '${swarmId}' not found`);
          process.exit(1);
        }

        console.log(`🔄 Recovering swarm: ${swarmId}`);
        console.log(`📋 Objective: ${swarmState.objective}`);
        console.log(`📊 Status: ${swarmState.status}`);
        console.log(`⏰ Started: ${new Date(swarmState.startTime).toLocaleString()}`);

        if (swarmState.status === 'completed') {
          console.log(`✅ Swarm already completed`);
          console.log(`📊 Results:`, JSON.stringify(swarmState.results, null, 2));
        } else if (swarmState.status === 'failed') {
          console.log(`❌ Swarm failed previously`);
          console.log(`📊 Error:`, swarmState.error);
        } else {
          console.log(`🔄 Resuming swarm execution...`);

          // Resume execution with current state
          const result = await executeSwarm(swarmState.objective, {
            ...swarmState.config,
            id: swarmId,
            redisClient,
            resume: true,
            previousState: swarmState
          });

          // Update state in Redis
          const updatedState = {
            ...swarmState,
            ...result,
            endTime: Date.now(),
            status: result.success ? 'completed' : 'failed'
          };
          await saveSwarmState(redisClient, swarmId, updatedState);

          if (result.success) {
            console.log(`✅ Swarm recovery completed successfully!`);
          } else {
            console.log(`❌ Swarm recovery failed: ${result.error}`);
          }
        }
      } else {
        console.error('❌ Please provide a swarm ID or use --list to see available swarms');
        process.exit(1);
      }

      await redisClient.quit();
    } catch (error) {
      console.error(`❌ Recovery error: ${error.message}`);
      process.exit(1);
    }
  });

/**
 * Check status of swarms
 */
program
  .command('status [swarmId]')
  .description('Check status of active or completed swarms')
  .option('--redis-host <host>', 'Redis server host', 'localhost')
  .option('--redis-port <port>', 'Redis server port', '6379')
  .option('--redis-password <password>', 'Redis password')
  .option('--all', 'Show all swarms (active and completed)')
  .option('--format <format>', 'Output format (text, json)', 'text')
  .action(async (swarmId, options) => {
    try {
      const redisConfig = {
        host: options.redisHost,
        port: parseInt(options.redisPort),
        password: options.redisPassword,
      };

      const redisClient = await connectRedis(redisConfig);

      if (swarmId) {
        // Show specific swarm status
        const swarmState = await loadSwarmState(redisClient, swarmId);

        if (!swarmState) {
          console.error(`❌ Swarm '${swarmId}' not found`);
          process.exit(1);
        }

        const statusInfo = {
          id: swarmState.id,
          objective: swarmState.objective,
          status: swarmState.status,
          startTime: swarmState.startTime,
          endTime: swarmState.endTime,
          duration: swarmState.endTime ? swarmState.endTime - swarmState.startTime : Date.now() - swarmState.startTime,
          agents: swarmState.agents?.length || 0,
          tasks: {
            total: swarmState.tasks?.length || 0,
            completed: swarmState.tasks?.filter(t => t.status === 'completed').length || 0,
            inProgress: swarmState.tasks?.filter(t => t.status === 'in_progress').length || 0
          },
          config: swarmState.config
        };

        if (options.format === 'json') {
          console.log(JSON.stringify(statusInfo, null, 2));
        } else {
          console.log(`📊 Swarm Status: ${swarmId}`);
          console.log(`📋 Objective: ${statusInfo.objective}`);
          console.log(`📊 Status: ${statusInfo.status}`);
          console.log(`⏰ Started: ${new Date(statusInfo.startTime).toLocaleString()}`);
          if (statusInfo.endTime) {
            console.log(`⏰ Ended: ${new Date(statusInfo.endTime).toLocaleString()}`);
          }
          console.log(`⏱️  Duration: ${Math.round(statusInfo.duration / 1000)}s`);
          console.log(`🤖 Agents: ${statusInfo.agents}`);
          console.log(`📋 Tasks: ${statusInfo.tasks.completed}/${statusInfo.tasks.total} completed`);
        }
      } else {
        // List all swarms
        const swarms = await listActiveSwarms(redisClient, options.all);

        if (swarms.length === 0) {
          console.log('📭 No swarms found');
        } else {
          if (options.format === 'json') {
            console.log(JSON.stringify(swarms, null, 2));
          } else {
            console.log(`📋 Found ${swarms.length} swarms:`);
            swarms.forEach(swarm => {
              const duration = swarm.endTime ?
                Math.round((swarm.endTime - swarm.startTime) / 1000) :
                Math.round((Date.now() - swarm.startTime) / 1000);

              console.log(`  • ${swarm.id} - ${swarm.status}`);
              console.log(`    Objective: ${swarm.objective}`);
              console.log(`    Duration: ${duration}s`);
              console.log(`    Started: ${new Date(swarm.startTime).toLocaleString()}`);
              if (swarm.endTime) {
                console.log(`    Ended: ${new Date(swarm.endTime).toLocaleString()}`);
              }
              console.log('');
            });
          }
        }
      }

      await redisClient.quit();
    } catch (error) {
      console.error(`❌ Status check error: ${error.message}`);
      process.exit(1);
    }
  });

// Error handling
program.on('command:*', () => {
  console.error('❌ Invalid command');
  program.help();
});

// Parse command line arguments
program.parse();

// Export for testing
export { program };