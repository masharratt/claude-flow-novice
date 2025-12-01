/**
 * Health Checks Library
 *
 * Liveness and readiness probes for production deployment.
 * Kubernetes-compatible health check endpoints.
 *
 * Phase 6: Production Hardening (Task 6.2)
 */

// Note: RuVectorClient type is not currently available in this module
// Removed import that references non-existent ruvector-client.js

export interface HealthCheckResult {
  status: "healthy" | "degraded" | "unhealthy";
  timestamp: number;
  checks: Record<string, {
    status: "pass" | "fail";
    message?: string;
    latency?: number;
  }>;
}

export interface ReadinessCheckResult extends HealthCheckResult {
  ready: boolean;
}

/**
 * Liveness Probe
 *
 * Checks if the coordinator process is alive and responsive.
 * Should return 200 if process is running, 500 otherwise.
 *
 * Kubernetes will restart the pod if this fails repeatedly.
 */
export async function checkLiveness(): Promise<HealthCheckResult> {
  const checks: Record<string, { status: "pass" | "fail"; message?: string }> = {};

  // Check 1: Process is running (implicit - if we reach here, it's running)
  checks.process = { status: "pass", message: "Process responsive" };

  // Check 2: Memory usage not excessive
  const memUsage = process.memoryUsage();
  const heapUsedMB = memUsage.heapUsed / 1024 / 1024;
  const heapTotalMB = memUsage.heapTotal / 1024 / 1024;
  const heapPercent = (heapUsedMB / heapTotalMB) * 100;

  if (heapPercent > 95) {
    checks.memory = { status: "fail", message: `Heap usage critical: ${heapPercent.toFixed(1)}%` };
  } else if (heapPercent > 85) {
    checks.memory = { status: "pass", message: `Heap usage high: ${heapPercent.toFixed(1)}%` };
  } else {
    checks.memory = { status: "pass", message: `Heap usage: ${heapPercent.toFixed(1)}%` };
  }

  // Check 3: Event loop not blocked
  const start = Date.now();
  await new Promise<void>((resolve: () => void) => setImmediate(resolve));
  const eventLoopDelay = Date.now() - start;

  if (eventLoopDelay > 1000) {
    checks.eventLoop = { status: "fail", message: `Event loop blocked: ${eventLoopDelay}ms` };
  } else if (eventLoopDelay > 100) {
    checks.eventLoop = { status: "pass", message: `Event loop slow: ${eventLoopDelay}ms` };
  } else {
    checks.eventLoop = { status: "pass", message: `Event loop responsive: ${eventLoopDelay}ms` };
  }

  // Determine overall status
  const hasFailures = Object.values(checks).some((c: any) => c.status === "fail");

  return {
    status: hasFailures ? "unhealthy" : "healthy",
    timestamp: Date.now(),
    checks: checks as HealthCheckResult["checks"]
  };
}

/**
 * Readiness Probe
 *
 * Checks if the coordinator is ready to accept requests.
 * Should return 200 if all dependencies are available, 503 otherwise.
 *
 * Kubernetes will remove the pod from load balancer if this fails.
 */
export async function checkReadiness(
  ruvectorClient?: any
): Promise<ReadinessCheckResult> {
  const checks: Record<string, { status: "pass" | "fail"; message?: string; latency?: number }> = {};

  // Check 1: Liveness (must be alive to be ready)
  const livenessResult = await checkLiveness();
  checks.liveness = {
    status: livenessResult.status === "healthy" ? "pass" : "fail",
    message: `Process ${livenessResult.status}`
  };

  // Check 2: RuVector availability (if client provided)
  if (ruvectorClient) {
    const ruvectorStart = Date.now();
    try {
      await ruvectorClient.healthCheck();
      const latency = Date.now() - ruvectorStart;
      checks.ruvector = { status: "pass", message: "RuVector connected", latency };
    } catch (error) {
      const latency = Date.now() - ruvectorStart;
      checks.ruvector = {
        status: "fail",
        message: `RuVector unavailable: ${error instanceof Error ? error.message : String(error)}`,
        latency
      };
    }
  }

  // Check 3: Trigger.dev API connectivity (basic check)
  const triggerUrl = process.env.TRIGGER_API_URL || "http://localhost:8030";
  const triggerStart = Date.now();
  try {
    const response = await fetch(`${triggerUrl}/api/v1/health`, {
      method: "GET",
      signal: AbortSignal.timeout(5000)
    }).catch(() => null);

    const latency = Date.now() - triggerStart;

    if (response && response.ok) {
      checks.triggerdev = { status: "pass", message: "Trigger.dev API accessible", latency };
    } else {
      checks.triggerdev = { status: "fail", message: "Trigger.dev API unhealthy", latency };
    }
  } catch (error) {
    const latency = Date.now() - triggerStart;
    checks.triggerdev = {
      status: "fail",
      message: `Trigger.dev API unreachable: ${error instanceof Error ? error.message : String(error)}`,
      latency
    };
  }

  // Check 4: Cerebras API key present (if using Cerebras provider)
  const cerebrasApiKey = process.env.CEREBRAS_API_KEY;
  if (cerebrasApiKey) {
    checks.cerebras = { status: "pass", message: "Cerebras API key configured" };
  } else {
    // Warning, not failure - other providers may be used
    checks.cerebras = { status: "pass", message: "Cerebras API key not configured (optional)" };
  }

  // Determine overall readiness
  const hasFailures = Object.values(checks).some(c => c.status === "fail");
  const ready = !hasFailures;

  return {
    status: hasFailures ? "unhealthy" : "healthy",
    timestamp: Date.now(),
    checks: checks as HealthCheckResult["checks"],
    ready
  };
}

/**
 * Startup Probe (Optional)
 *
 * Checks if the coordinator has completed initialization.
 * Useful for slow-starting applications.
 */
export async function checkStartup(
  ruvectorClient?: any
): Promise<HealthCheckResult> {
  const checks: Record<string, { status: "pass" | "fail"; message?: string }> = {};

  // Check 1: Environment variables loaded
  const requiredEnvVars = ["TRIGGER_API_URL", "TRIGGER_SECRET_KEY"];
  const missingVars = requiredEnvVars.filter(v => !process.env[v]);

  if (missingVars.length === 0) {
    checks.environment = { status: "pass", message: "Environment configured" };
  } else {
    checks.environment = {
      status: "fail",
      message: `Missing env vars: ${missingVars.join(", ")}`
    };
  }

  // Check 2: RuVector collections initialized (if client provided)
  if (ruvectorClient) {
    try {
      const collections = await ruvectorClient.listCollections();
      const requiredCollections = [
        "decomposition_plans",
        "validation_results",
        "error_patterns",
        "decision_history",
        "code_artifacts"
      ];

      const existingCollections = collections.map((c: any) => c.name);
      const missingCollections = requiredCollections.filter((c: string) => !existingCollections.includes(c));

      if (missingCollections.length === 0) {
        checks.ruvector_init = { status: "pass", message: "RuVector collections ready" };
      } else {
        checks.ruvector_init = {
          status: "fail",
          message: `Missing collections: ${missingCollections.join(", ")}`
        };
      }
    } catch (error) {
      checks.ruvector_init = {
        status: "fail",
        message: `RuVector initialization failed: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  // Determine overall startup status
  const hasFailures = Object.values(checks).some(c => c.status === "fail");

  return {
    status: hasFailures ? "unhealthy" : "healthy",
    timestamp: Date.now(),
    checks: checks as HealthCheckResult["checks"]
  };
}

/**
 * Format health check result for HTTP response
 */
export function formatHealthCheckResponse(result: HealthCheckResult | ReadinessCheckResult): {
  statusCode: number;
  body: string;
} {
  const statusCode = result.status === "healthy" ? 200 :
                     result.status === "degraded" ? 200 :
                     503;

  return {
    statusCode,
    body: JSON.stringify(result, null, 2)
  };
}

/**
 * Simple HTTP server for health checks (for standalone deployment)
 */
export function createHealthCheckServer(
  port: number = 8080,
  ruvectorClient?: any
): void {
  const http = require("http");

  const server = http.createServer(async (req: any, res: any) => {
    res.setHeader("Content-Type", "application/json");

    if (req.url === "/health/live") {
      const result = await checkLiveness();
      const { statusCode, body } = formatHealthCheckResponse(result);
      res.writeHead(statusCode);
      res.end(body);
    } else if (req.url === "/health/ready") {
      const result = await checkReadiness(ruvectorClient);
      const { statusCode, body } = formatHealthCheckResponse(result);
      res.writeHead(statusCode);
      res.end(body);
    } else if (req.url === "/health/startup") {
      const result = await checkStartup(ruvectorClient);
      const { statusCode, body } = formatHealthCheckResponse(result);
      res.writeHead(statusCode);
      res.end(body);
    } else {
      res.writeHead(404);
      res.end(JSON.stringify({ error: "Not found" }));
    }
  });

  server.listen(port, () => {
    console.log(`Health check server listening on port ${port}`);
    console.log(`  - Liveness:  http://localhost:${port}/health/live`);
    console.log(`  - Readiness: http://localhost:${port}/health/ready`);
    console.log(`  - Startup:   http://localhost:${port}/health/startup`);
  });
}
