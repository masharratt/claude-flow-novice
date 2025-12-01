import { client } from "@/trigger";
import { eventTrigger } from "@trigger.dev/sdk";
import { execSync } from "child_process";
import Redis from "ioredis";
import fs from "fs";
import path from "path";
import { logger, LogLevel } from "../utils/logging";
import { recordHealthCheck } from "../utils/metrics";

interface HealthCheckResult {
  checkType: string;
  success: boolean;
  message: string;
  errorType?: string;
  duration: number;
}

async function checkDocker(): Promise<HealthCheckResult> {
  const startTime = Date.now();
  try {
    execSync("docker info", { stdio: "pipe", timeout: 5000 });
    const duration = (Date.now() - startTime) / 1000;
    return {
      checkType: "docker",
      success: true,
      message: "Docker daemon is accessible",
      duration,
    };
  } catch (error) {
    const duration = (Date.now() - startTime) / 1000;
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      checkType: "docker",
      success: false,
      message: `Docker daemon check failed: ${errorMessage}`,
      errorType: "connection_error",
      duration,
    };
  }
}

async function checkRedis(): Promise<HealthCheckResult> {
  const startTime = Date.now();
  let redis: Redis | null = null;

  try {
    const redisHost = process.env.REDIS_HOST || "localhost";
    const redisPort = parseInt(process.env.REDIS_PORT || "6379", 10);

    redis = new Redis({
      host: redisHost,
      port: redisPort,
      connectTimeout: 5000,
      maxRetriesPerRequest: 1,
    });

    await redis.ping();
    const duration = (Date.now() - startTime) / 1000;

    return {
      checkType: "redis",
      success: true,
      message: `Redis is accessible at ${redisHost}:${redisPort}`,
      duration,
    };
  } catch (error) {
    const duration = (Date.now() - startTime) / 1000;
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      checkType: "redis",
      success: false,
      message: `Redis check failed: ${errorMessage}`,
      errorType: "connection_error",
      duration,
    };
  } finally {
    if (redis) {
      redis.disconnect();
    }
  }
}

async function checkWorkspaceVolume(): Promise<HealthCheckResult> {
  const startTime = Date.now();
  try {
    const workspaceBase = process.env.CFN_WORKSPACE_BASE || "/tmp/cfn-workspaces";

    // Check if workspace directory exists and is writable
    if (!fs.existsSync(workspaceBase)) {
      fs.mkdirSync(workspaceBase, { recursive: true });
    }

    const testFile = path.join(workspaceBase, `.health-check-${Date.now()}`);
    fs.writeFileSync(testFile, "health check test");
    const content = fs.readFileSync(testFile, "utf-8");
    fs.unlinkSync(testFile);

    if (content !== "health check test") {
      throw new Error("File content mismatch");
    }

    const duration = (Date.now() - startTime) / 1000;
    return {
      checkType: "workspace_volume",
      success: true,
      message: `Workspace volume is accessible at ${workspaceBase}`,
      duration,
    };
  } catch (error) {
    const duration = (Date.now() - startTime) / 1000;
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      checkType: "workspace_volume",
      success: false,
      message: `Workspace volume check failed: ${errorMessage}`,
      errorType: "filesystem_error",
      duration,
    };
  }
}

async function checkDiskSpace(): Promise<HealthCheckResult> {
  const startTime = Date.now();
  try {
    const output = execSync("df -h /", { encoding: "utf-8", timeout: 5000 });
    const lines = output.trim().split("\n");
    const dataLine = lines[1];
    const parts = dataLine.split(/\s+/);
    const usagePercent = parseInt(parts[4].replace("%", ""), 10);

    const duration = (Date.now() - startTime) / 1000;

    if (usagePercent > 90) {
      return {
        checkType: "disk_space",
        success: false,
        message: `Disk usage critical: ${usagePercent}%`,
        errorType: "disk_full",
        duration,
      };
    } else if (usagePercent > 80) {
      return {
        checkType: "disk_space",
        success: true,
        message: `Disk usage warning: ${usagePercent}%`,
        duration,
      };
    } else {
      return {
        checkType: "disk_space",
        success: true,
        message: `Disk usage healthy: ${usagePercent}%`,
        duration,
      };
    }
  } catch (error) {
    const duration = (Date.now() - startTime) / 1000;
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      checkType: "disk_space",
      success: false,
      message: `Disk space check failed: ${errorMessage}`,
      errorType: "command_error",
      duration,
    };
  }
}

client.defineJob({
  id: "health-check",
  name: "System Health Check",
  version: "1.0.0",
  trigger: eventTrigger({
    name: "health.check.scheduled",
    schema: {
      type: "object",
      properties: {
        scheduled: { type: "boolean" },
      },
    },
  }),
  run: async (payload, io, ctx) => {
    logger.info("Starting system health check", {
      taskId: ctx.run.id,
      scheduled: payload.scheduled,
    });

    // Run all health checks in parallel
    const checks = await Promise.all([
      checkDocker(),
      checkRedis(),
      checkWorkspaceVolume(),
      checkDiskSpace(),
    ]);

    // Record metrics for each check
    for (const check of checks) {
      recordHealthCheck(
        check.checkType,
        check.duration,
        check.success,
        check.errorType
      );

      // Log structured result
      if (check.success) {
        logger.info(`Health check passed: ${check.checkType}`, {
          checkType: check.checkType,
          duration: check.duration,
          message: check.message,
        });
      } else {
        logger.error(`Health check failed: ${check.checkType}`, {
          checkType: check.checkType,
          duration: check.duration,
          message: check.message,
          errorType: check.errorType,
        });
      }
    }

    // Calculate overall health
    const failedChecks = checks.filter((c) => !c.success);
    const allPassed = failedChecks.length === 0;

    const summary = {
      timestamp: new Date().toISOString(),
      overallStatus: allPassed ? "healthy" : "unhealthy",
      totalChecks: checks.length,
      passedChecks: checks.length - failedChecks.length,
      failedChecks: failedChecks.length,
      checks,
    };

    if (allPassed) {
      logger.info("System health check completed: healthy", {
        summary,
      });
    } else {
      logger.warn("System health check completed: unhealthy", {
        summary,
        failedChecks: failedChecks.map((c) => ({
          type: c.checkType,
          message: c.message,
          errorType: c.errorType,
        })),
      });
    }

    return summary;
  },
});

// Schedule health check to run every 5 minutes
// This would be configured in Trigger.dev dashboard or via API
export const healthCheckSchedule = {
  jobId: "health-check",
  cron: "*/5 * * * *", // Every 5 minutes
  payload: { scheduled: true },
};
