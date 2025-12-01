/**
 * Trigger.dev Job: Test Single Agent Container Spawning
 *
 * Phase 1: Single Agent Spawn Testing
 *
 * This job spawns a single CFN agent in an isolated Docker container
 * to validate container execution, resource limits, and output capture.
 *
 * Requirements:
 * - Container network: cfn-network
 * - Resource limits: 2 CPU, 4GB RAM
 * - Volume: /workspace:/workspace (read/write)
 * - Auto-remove: true (--rm for cleanup)
 * - Image: cfn-agent:test
 *
 * Environment variables passed to agent:
 * - TASK_ID: Unique task identifier from trigger.dev
 * - AGENT_TYPE: Type of agent being spawned
 *
 * Success criteria:
 * - Agent container spawns successfully
 * - Container executes CLI agent command
 * - stdout/stderr captured in job logs
 * - Container exits cleanly with --rm
 * - Exit code propagated to trigger.dev
 */

import { validatedConfig, getValidatedConfig } from "../index.js";
import { z } from "zod";
import { spawn } from "child_process";
import { AgentSpawnError, AgentSpawnResult } from "../types.js";
import { validateVolumeMount } from "../config.js";

/**
 * Utility to execute Docker commands with parameterized arguments
 * Prevents shell injection by using spawn instead of exec
 * @param args Docker command arguments array
 * @returns Promise resolving to stdout, stderr, and exit code
 */
function execDockerCommand(args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';

    const process = spawn('docker', args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 30 * 60 * 1000, // 30 minutes
    });

    process.stdout.on('data', (data: Buffer) => {
      stdout += data.toString();
    });

    process.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    process.on('close', (code: number) => {
      resolve({
        stdout,
        stderr,
        exitCode: code || 0,
      });
    });

    process.on('error', (err: Error) => {
      reject(err);
    });
  });
}

/**
 * Payload schema for test.agent.spawn event
 */
const TestAgentSpawnSchema = z.object({
  agentType: z.string().describe("Type of agent to spawn (e.g., backend-developer, frontend-developer)"),
  taskDescription: z.string().describe("Task description for the agent to execute"),
});

/**
 * Container spawning result with metadata
 */
interface ContainerResult {
  stdout: string;
  stderr: string;
  containerName: string;
  exitCode: number;
  executionTimeMs: number;
}

/**
 * Test Single Agent Job
 *
 * Spawns a single agent container for Phase 1 validation testing.
 */
interface TestAgentSpawnPayload {
  agentType: string;
  taskDescription: string;
}

export const testSingleAgentJob = {
  id: "test-single-agent",
  name: "Test Single Agent Container Spawning",
  version: "0.1.0",
  trigger: {
    event: {
      name: "test.agent.spawn",
      schema: TestAgentSpawnSchema,
    },
  },
  run: async (payload: TestAgentSpawnPayload, io: any, ctx: any) => {
    const { agentType, taskDescription } = payload;

    // Generate unique container name
    const containerName = `cfn-agent-${ctx.run.id}-${Date.now()}`;
    const startTime = Date.now();

    io.logger.info("Spawning agent container", {
      containerName,
      agentType,
      taskId: ctx.run.id,
      taskDescription,
    });

    try {
      // Validate workspace volume mount before spawning
      const config = getValidatedConfig();
      const volumeValidation = validateVolumeMount(config.workspacePath, '/workspace', 'rw');

      if (!volumeValidation.valid) {
        const error = new AgentSpawnError({
          message: `Volume validation failed: ${volumeValidation.error}`,
          containerName,
          exitCode: 1,
          stdout: '',
          stderr: volumeValidation.error || 'Unknown volume error',
          executionTimeMs: Date.now() - startTime,
          recoverable: false,
        });

        io.logger.error("Volume validation failed", {
          containerName,
          error: volumeValidation.error,
          workspacePath: config.workspacePath,
        });

        throw error;
      }

      io.logger.debug("Volume validation passed", {
        workspacePath: config.workspacePath,
        containerPath: '/workspace',
      });
      // Spawn agent container with resource limits and network configuration
      const result = await (io as any).runTask(
        "spawn-agent-container",
        async () => {
          // Build Docker command arguments (parameterized to prevent shell injection)
          const dockerArgs = [
            'run',
            '--rm',
            '--name', containerName,
            '--network', 'cfn-network',
            '--cpus=2',
            '--memory=4g',
            '-e', `TASK_ID=${ctx.run.id}`,
            '-e', `AGENT_TYPE=${agentType}`,
            '-v', '/workspace:/workspace',
            'cfn-agent:test',
            agentType,
            '--task', taskDescription, // Parameterized argument, not shell interpolation
          ];

          io.logger.info("Spawning Docker container", {
            containerName,
            agentType,
            taskId: ctx.run.id,
          });

          try {
            // Execute Docker command with parameterized arguments (safe from shell injection)
            const { stdout, stderr, exitCode } = await execDockerCommand(dockerArgs);

            const executionTimeMs = Date.now() - startTime;

            if (exitCode === 0) {
              io.logger.info("Agent container completed successfully", {
                containerName,
                executionTimeMs,
                stdoutLength: stdout.length,
                stderrLength: stderr.length,
              });
            } else {
              io.logger.warn("Agent container exited with non-zero code", {
                containerName,
                exitCode,
                executionTimeMs,
                stderr: stderr.slice(0, 500), // Log first 500 chars
              });
            }

            return {
              stdout,
              stderr,
              containerName,
              exitCode,
              executionTimeMs,
            };
          } catch (execError: any) {
            // Handle container execution errors (spawn failures, timeouts, etc.)
            const executionTimeMs = Date.now() - startTime;
            const errorMessage = execError.message || 'Unknown error';

            const error = new AgentSpawnError({
              message: `Container execution failed: ${errorMessage}`,
              containerName,
              exitCode: execError.code || 1,
              stdout: '',
              stderr: errorMessage,
              executionTimeMs,
              recoverable: execError.code === 'ETIMEDOUT' || execError.code === 'ENOENT',
            });

            io.logger.error("Agent container execution failed", {
              containerName,
              executionTimeMs,
              error: error.toJSON(),
            });

            throw error;
          }
        },
        {
          name: `Spawn ${agentType}`,
          description: `Spawning ${agentType} agent with task: ${taskDescription}`,
        }
      );

      // Log final results
      io.logger.info("Agent execution completed", {
        containerName: result.containerName,
        exitCode: result.exitCode,
        executionTimeMs: result.executionTimeMs,
        success: result.exitCode === 0,
      });

      // Return results as strongly-typed AgentSpawnResult
      const agentResult: AgentSpawnResult = {
        success: result.exitCode === 0,
        exitCode: result.exitCode,
        containerName: result.containerName,
        executionTimeMs: result.executionTimeMs,
        agentType,
        taskId: ctx.run.id,
        stdout: result.stdout,
        stderr: result.stderr,
        startTime: new Date(startTime),
        endTime: new Date(),
      };

      return {
        ...agentResult,
        output: {
          stdout: result.stdout,
          stderr: result.stderr,
        },
      };
    } catch (error: any) {
      // Handle unexpected job-level errors with proper typing
      const executionTimeMs = Date.now() - startTime;

      // Check if it's an AgentSpawnError for logging
      if (error instanceof AgentSpawnError) {
        io.logger.error("Agent spawn error", {
          containerName,
          error: error.toJSON(),
        });
      } else {
        io.logger.error("Job execution failed", {
          error: error.message,
          stack: error.stack,
          containerName,
          executionTimeMs,
        });
      }

      throw error;
    }
  }
};

/**
 * Export job for registration with trigger.dev
 */
export default testSingleAgentJob;
