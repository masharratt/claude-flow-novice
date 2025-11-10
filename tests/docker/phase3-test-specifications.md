# Phase 3 Test Specifications: Scalability & Reliability

**Version**: 1.0
**Created**: 2025-11-08
**Test Environment**: Kubernetes cluster with auto-scaling and Redis cluster
**Success Threshold**: 100% of tests passing with 99.99% availability targets

## 📋 Test Suite Overview

### Primary Objectives
- Validate Kubernetes deployment architecture and pod management
- Verify auto-scaling capabilities (HPA and cluster auto-scaling)
- Test Redis cluster high availability and failover scenarios
- Ensure load testing meets scalability targets (100+ concurrent agents)
- Validate disaster recovery and backup procedures

### Test Environment Setup
```bash
# Kubernetes Test Cluster Setup
kubectl create namespace cfn-test
kubectl config set-context --current --namespace=cfn-test

# Deploy test infrastructure
kubectl apply -f k8s/test/redis-cluster-test.yaml
kubectl apply -f k8s/test/cfn-agents-test.yaml
kubectl apply -f k8s/test/monitoring-test.yaml

# Wait for cluster readiness
kubectl wait --for=condition=available --timeout=300s deployment/cfn-coordinator
kubectl wait --for=condition=available --timeout=300s deployment/cfn-agent-pool
kubectl wait --for=condition=ready --timeout=300s rediscluster/redis-cluster
```

---

## 🧪 Test Suite 1: Kubernetes Deployment Architecture

### Test 1.1: Pod Scheduling and Service Discovery

**File**: `test/docker/phase3/k8s-pod-scheduling.test.js`

**Objective**: Validate Kubernetes pod scheduling, service discovery, and networking

**Test Scenarios**:
```javascript
describe('Kubernetes Pod Scheduling and Service Discovery', () => {
  beforeAll(async () => {
    // Deploy test architecture
    await deployKubernetesTestStack();
    await waitForClusterReadiness();
  });

  afterAll(async () => {
    // Cleanup test resources
    await cleanupKubernetesTestStack();
  });

  test('All pods should schedule correctly across nodes', async () => {
    const expectedPods = {
      'cfn-coordinator': { replicas: 2, ready: 2 },
      'cfn-agent-pool': { replicas: 5, ready: 5 },
      'redis-cluster': { replicas: 6, ready: 6 },
      'monitoring-stack': { replicas: 3, ready: 3 }
    };

    const podStatus = {};

    for (const [deployment, expected] of Object.entries(expectedPods)) {
      const status = await getDeploymentStatus(deployment);
      podStatus[deployment] = status;

      // Success Criteria
      expect(status.replicas).toBe(expected.replicas);
      expect(status.readyReplicas).toBe(expected.ready);
      expect(status.availableReplicas).toBe(expected.ready);
      expect(status.conditions.Ready).toBe('True');
    }

    // Verify pod distribution across nodes
    const nodeDistribution = await getPodNodeDistribution();
    expect(nodeDistribution.uniqueNodes).toBeGreaterThan(1); // Pods spread across multiple nodes
    expect(nodeDistribution.maxPodsPerNode).toBeLessThan(Math.ceil(16 / nodeDistribution.uniqueNodes * 1.5));
  });

  test('Service discovery should work across all services', async () => {
    const services = ['cfn-coordinator-service', 'cfn-agent-pool-service', 'redis-cluster-service'];
    const connectivityResults = {};

    for (const service of services) {
      const testPod = await createTestPod('connectivity-test');

      // Test DNS resolution
      const dnsResult = await executeInPod(testPod, `nslookup ${service}`);

      // Test network connectivity
      const connectivityResult = await executeInPod(testPod, `nc -zv ${service} 6379 || nc -zv ${service} 3000`);

      connectivityResults[service] = {
        dnsResolution: dnsResult.exitCode === 0,
        networkConnectivity: connectivityResult.exitCode === 0
      };

      await cleanupTestPod(testPod);
    }

    // Success Criteria
    for (const [service, result] of Object.entries(connectivityResults)) {
      expect(result.dnsResolution).toBe(true);
      expect(result.networkConnectivity).toBe(true);
    }
  });

  test('Pod health checks and readiness probes should work correctly', async () => {
    const testScenarios = [
      { pod: 'cfn-coordinator', readinessPath: '/health/ready', livenessPath: '/health/live' },
      { pod: 'cfn-agent-pool', readinessPath: '/agent/health', livenessPath: '/agent/health' },
      { pod: 'redis-cluster', readinessPort: 6379, livenessPort: 6379 }
    ];

    for (const scenario of testScenarios) {
      // Test healthy pods
      const healthyPods = await getHealthyPods(scenario.pod);
      expect(healthyPods.length).toBeGreaterThan(0);

      for (const pod of healthyPods) {
        const readinessStatus = await checkPodReadiness(pod, scenario.readinessPath);
        const livenessStatus = await checkPodLiveness(pod, scenario.livenessPath);

        // Success Criteria
        expect(readinessStatus.ready).toBe(true);
        expect(livenessStatus.healthy).toBe(true);
      }

      // Test unhealthy scenario
      const testPod = await createUnhealthyPod(scenario.pod);
      await waitForPodStatus(testPod, 'NotReady', 60);

      const unhealthyStatus = await getPodStatus(testPod);
      expect(unhealthyStatus.conditions.Ready).toBe('False');

      await cleanupTestPod(testPod);
    }
  });

  test('Resource limits and requests should be enforced correctly', async () => {
    const testPods = await launchResourceTestPods([
      { name: 'cpu-test', cpuRequest: '250m', cpuLimit: '1000m', memoryRequest: '512Mi', memoryLimit: '2Gi' },
      { name: 'memory-test', cpuRequest: '100m', cpuLimit: '500m', memoryRequest: '256Mi', memoryLimit: '1Gi' }
    ]);

    for (const podConfig of testPods) {
      // Monitor resource usage
      const resourceMetrics = await monitorPodResources(podConfig.name, 120000); // 2 minutes

      // Verify resource constraints are enforced
      expect(resourceMetrics.maxCPUUsage).toBeLessThanOrEqual(parseFloat(podConfig.cpuLimit));
      expect(resourceMetrics.maxMemoryUsage).toBeLessThanOrEqual(parseMemory(podConfig.memoryLimit));

      // Verify resource requests are guaranteed
      expect(resourceMetrics.minCPUUsage).toBeGreaterThanOrEqual(parseFloat(podConfig.cpuRequest) * 0.8);
      expect(resourceMetrics.minMemoryUsage).toBeGreaterThanOrEqual(parseMemory(podConfig.memoryRequest) * 0.9);
    }

    // Cleanup test pods
    for (const podConfig of testPods) {
      await cleanupTestPod(podConfig.name);
    }
  });
});
```

**Validation Metrics**:
- ✅ Pod scheduling success rate = 100%
- ✅ Service discovery success rate = 100%
- ✅ Health check functionality = 100%
- ✅ Resource limit enforcement = 100%
- ✅ Pod distribution across multiple nodes
- ✅ Network connectivity between all services
- ✅ DNS resolution success rate = 100%

---

### Test 1.2: Persistent Volume and Storage Management

**File**: `test/docker/phase3/k8s-storage-management.test.js`

**Objective**: Validate persistent volumes, storage classes, and data persistence

**Test Scenarios**:
```javascript
describe('Kubernetes Storage Management', () => {
  test('Persistent volumes should provision and mount correctly', async () => {
    const storageClasses = ['fast-ssd', 'standard-storage'];
    const volumeTests = [];

    for (const storageClass of storageClasses) {
      const pvcName = `test-pvc-${storageClass}-${Date.now()}`;

      // Create PVC
      const pvc = await createPersistentVolumeClaim({
        name: pvcName,
        storageClass,
        size: '5Gi',
        accessMode: 'ReadWriteOnce'
      });

      // Create pod using PVC
      const podName = `test-pod-${storageClass}-${Date.now()}`;
      const pod = await createPodWithPVC(podName, pvcName);

      // Wait for pod to be ready and PVC to be bound
      await waitForPodReady(podName, 60);
      await waitForPVCBound(pvcName, 60);

      // Test volume mount and write operations
      const writeTest = await executeInPod(pod, 'echo "test data" > /mnt/data/test.txt && cat /mnt/data/test.txt');

      // Verify data persistence by recreating pod
      await deletePod(podName);
      await recreatePodWithPVC(podName, pvcName);
      await waitForPodReady(podName, 60);

      const readTest = await executeInPod(pod, 'cat /mnt/data/test.txt');

      volumeTests.push({
        storageClass,
        pvcName,
        podName,
        writeSuccess: writeTest.exitCode === 0 && writeTest.output.includes('test data'),
        readSuccess: readTest.exitCode === 0 && readTest.output.includes('test data'),
        pvcStatus: await getPVCStatus(pvcName)
      });

      // Cleanup
      await deletePod(podName);
      await deletePVC(pvcName);
    }

    // Success Criteria
    for (const test of volumeTests) {
      expect(test.writeSuccess).toBe(true);
      expect(test.readSuccess).toBe(true);
      expect(test.pvcStatus.status).toBe('Bound');
      expect(test.pvcStatus.capacity).toBe('5Gi');
    }
  });

  test('Storage performance should meet requirements', async () => {
    const performancePod = await createPerformanceTestPod();
    await waitForPodReady(performancePod, 60);

    const performanceTests = [
      { name: 'sequential-write', command: 'dd if=/dev/zero of=/mnt/data/seq-write bs=1M count=1024 oflag=direct' },
      { name: 'sequential-read', command: 'dd if=/mnt/data/seq-write of=/dev/null bs=1M iflag=direct' },
      { name: 'random-write', command: 'fio --name=randwrite --ioengine=libaio --iodepth=1 --rw=randwrite --bs=4k --direct=1 --size=1G --numjobs=1 --runtime=60 --time_based --group_reporting' },
      { name: 'random-read', command: 'fio --name=randread --ioengine=libaio --iodepth=1 --rw=randread --bs=4k --direct=1 --size=1G --numjobs=1 --runtime=60 --time_based --group_reporting' }
    ];

    const performanceResults = {};

    for (const test of performanceTests) {
      const startTime = Date.now();
      const result = await executeInPod(performancePod, test.command);
      const duration = Date.now() - startTime;

      performanceResults[test.name] = {
        exitCode: result.exitCode,
        duration,
        output: result.output,
        throughput: parseThroughput(result.output)
      };

      // Cleanup between tests
      await executeInPod(performancePod, 'rm -f /mnt/data/*');
    }

    // Success Criteria
    expect(performanceResults['sequential-write'].throughput).toBeGreaterThan(100); // >100 MB/s
    expect(performanceResults['sequential-read'].throughput).toBeGreaterThan(200); // >200 MB/s
    expect(performanceResults['random-write'].throughput).toBeGreaterThan(50);  // >50 MB/s
    expect(performanceResults['random-read'].throughput).toBeGreaterThan(100);   // >100 MB/s

    await deletePod(performancePod);
  });

  test('Backup and restore procedures should work correctly', async () => {
    const testData = {
      files: [
        { name: 'config.json', content: '{"version": "1.0", "environment": "test"}' },
        { name: 'user-data.csv', content: 'id,name,email\n1,John,john@test.com\n2,Jane,jane@test.com' },
        { name: 'logs.txt', content: 'Log entry 1\nLog entry 2\nLog entry 3' }
      ],
      directories: ['backups', 'temp', 'exports']
    };

    // Create test data
    const dataPod = await createDataTestPod();
    await waitForPodReady(dataPod, 60);

    for (const file of testData.files) {
      await executeInPod(dataPod, `echo '${file.content}' > /mnt/data/${file.name}`);
    }

    for (const dir of testData.directories) {
      await executeInPod(dataPod, `mkdir -p /mnt/data/${dir}`);
    }

    // Create backup
    const backupName = `backup-${Date.now()}`;
    const backupResult = await createVolumeSnapshot(dataPod, '/mnt/data', backupName);
    expect(backupResult.success).toBe(true);

    // Corrupt data
    await executeInPod(dataPod, 'rm -rf /mnt/data/*');
    await executeInPod(dataPod, 'echo "corrupted" > /mnt/data/corrupted.txt');

    // Verify data is corrupted
    const corruptedCheck = await executeInPod(dataPod, 'ls -la /mnt/data');
    expect(corruptedCheck.output).toContain('corrupted.txt');
    expect(corruptedCheck.output.split('\n').length).toBeLessThan(5); // Only corrupted file remains

    // Restore from backup
    const restoreResult = await restoreVolumeSnapshot(dataPod, '/mnt/data', backupName);
    expect(restoreResult.success).toBe(true);

    // Verify data restoration
    for (const file of testData.files) {
      const restoredContent = await executeInPod(dataPod, `cat /mnt/data/${file.name}`);
      expect(restoredContent.exitCode).toBe(0);
      expect(restoredContent.output.trim()).toBe(file.content);
    }

    for (const dir of testData.directories) {
      const dirExists = await executeInPod(dataPod, `test -d /mnt/data/${dir}`);
      expect(dirExists.exitCode).toBe(0);
    }

    // Cleanup
    await deletePod(dataPod);
    await deleteVolumeSnapshot(backupName);
  });
});
```

**Validation Metrics**:
- ✅ PVC provisioning success rate = 100%
- ✅ Volume mounting success rate = 100%
- ✅ Data persistence verification = 100%
- ✅ Storage performance benchmarks met
- ✅ Backup creation success rate = 100%
- ✅ Data restore success rate = 100%
- ✅ Sequential write throughput >100 MB/s
- ✅ Sequential read throughput >200 MB/s

---

## 🧪 Test Suite 2: Auto-Scaling Capabilities

### Test 2.1: Horizontal Pod Autoscaler (HPA) Testing

**File**: `test/docker/phase3/hpa-auto-scaling.test.js`

**Objective**: Validate HPA functionality under various load conditions

**Test Scenarios**:
```javascript
describe('Horizontal Pod Autoscaler Testing', () => {
  test('HPA should scale up based on CPU utilization', async () => {
    const deploymentName = 'cfn-agent-pool';
    const hpaName = 'cfn-agent-pool-hpa';

    // Get initial HPA status
    const initialHPA = await getHPAStatus(hpaName);
    const initialReplicas = initialHPA.status.currentReplicas;

    expect(initialReplicas).toBe(5); // Starting with 5 replicas
    expect(initialHPA.status.desiredReplicas).toBe(5);

    // Generate CPU load
    await generateCPULoad(deploymentName, 80, 300000); // 80% CPU for 5 minutes

    // Monitor HPA scaling
    const scalingMetrics = await monitorHPAScaling(hpaName, 600000); // Monitor for 10 minutes

    // Success Criteria
    expect(scalingMetrics.maxReplicas).toBeGreaterThan(initialReplicas);
    expect(scalingMetrics.scaleUpTime).toBeLessThan(300000); // Scale up within 5 minutes
    expect(scalingMetrics.finalReplicas).toBeLessThanOrEqual(20); // Respect max replicas limit
    expect(scalingMetrics.stabilizationTime).toBeLessThan(60000); // Stabilize within 1 minute
  });

  test('HPA should scale down based on reduced load', async () => {
    const deploymentName = 'cfn-agent-pool';
    const hpaName = 'cfn-agent-pool-hpa';

    // First scale up with high load
    await generateCPULoad(deploymentName, 80, 180000); // 80% CPU for 3 minutes
    await waitForScaleUp(hpaName, 10, 300000); // Wait for scale up to 10 replicas

    const scaledUpReplicas = await getCurrentReplicas(deploymentName);
    expect(scaledUpReplicas).toBeGreaterThan(5);

    // Reduce load to minimal
    await stopLoadGeneration(deploymentName);
    await new Promise(resolve => setTimeout(resolve, 600000)); // Wait 10 minutes for scale down

    // Monitor scale down
    const scaleDownMetrics = await monitorHPAScaleDown(hpaName, 600000);

    // Success Criteria
    expect(scaleDownMetrics.finalReplicas).toBeLessThanOrEqual(5); // Back to baseline
    expect(scaleDownMetrics.scaleDownTime).toBeLessThan(600000); // Scale down within 10 minutes
    expect(scaleDownMetrics.scaleDownEvents.length).toBeGreaterThan(0);
  });

  test('HPA should respond to custom metrics', async () => {
    const deploymentName = 'cfn-agent-pool';
    const hpaName = 'cfn-agent-pool-custom-hpa';

    // Configure HPA with custom metrics (queue depth, active connections)
    await configureCustomMetricsHPA(hpaName, {
      metrics: [
        { type: 'External', external: { metric: { name: 'queue_depth' }, target: { type: 'Value', value: '10' } } },
        { type: 'External', external: { metric: { name: 'active_connections' }, target: { type: 'Value', value: '100' } } }
      ]
    });

    // Generate custom metric load
    await generateQueueDepth(50); // 50 items in queue
    await generateActiveConnections(200); // 200 active connections

    // Monitor scaling based on custom metrics
    const customScalingMetrics = await monitorHPAScaling(hpaName, 600000);

    // Success Criteria
    expect(customScalingMetrics.maxReplicas).toBeGreaterThan(5);
    expect(customScalingMetrics.customMetricsTriggered).toContain('queue_depth');
    expect(customScalingMetrics.customMetricsTriggered).toContain('active_connections');

    // Verify metric collection
    const queueDepthMetric = await getCustomMetric('queue_depth');
    const activeConnectionsMetric = await getCustomMetric('active_connections');

    expect(queueDepthMetric.value).toBe(50);
    expect(activeConnectionsMetric.value).toBe(200);

    // Cleanup
    await deleteHPA(hpaName);
  });

  test('HPA should handle scaling thresholds and policies correctly', async () => {
    const deploymentName = 'cfn-coordinator';
    const hpaName = 'cfn-coordinator-hpa';

    // Configure HPA with specific scaling policies
    await configureAdvancedHPA(hpaName, {
      minReplicas: 2,
      maxReplicas: 10,
      metrics: [{ type: 'Resource', resource: { name: 'cpu', target: { type: 'Utilization', averageUtilization: 70 } } }],
      behavior: {
        scaleUp: {
          stabilizationWindowSeconds: 60,
          policies: [{ type: 'Percent', value: 100, periodSeconds: 15 }],
          selectPolicy: 'Max'
        },
        scaleDown: {
          stabilizationWindowSeconds: 300,
          policies: [{ type: 'Percent', value: 10, periodSeconds: 60 }],
          selectPolicy: 'Min'
        }
      }
    });

    // Test rapid scale-up scenarios
    const rapidLoadTests = [
      { load: 90, duration: 60000, expectedReplicas: 4 },
      { load: 95, duration: 60000, expectedReplicas: 6 },
      { load: 98, duration: 60000, expectedReplicas: 8 }
    ];

    for (const test of rapidLoadTests) {
      await generateCPULoad(deploymentName, test.load, test.duration);
      const replicas = await waitForScaleUp(hpaName, test.expectedReplicas, 120000);

      // Success Criteria
      expect(replicas).toBeGreaterThanOrEqual(test.expectedReplicas);

      // Verify scaling policies are respected
      const hpaStatus = await getHPAStatus(hpaName);
      expect(hpaStatus.spec.behavior.scaleUp.policies.length).toBeGreaterThan(0);
      expect(hpaStatus.spec.behavior.scaleDown.policies.length).toBeGreaterThan(0);
    }

    // Test gradual scale-down
    await stopLoadGeneration(deploymentName);
    await new Promise(resolve => setTimeout(resolve, 600000)); // Wait for scale down

    const finalReplicas = await getCurrentReplicas(deploymentName);
    expect(finalReplicas).toBeLessThanOrEqual(4); // Should scale down gradually
  });
});
```

**Validation Metrics**:
- ✅ HPA scale-up time <5 minutes
- ✅ HPA scale-down time <10 minutes
- ✅ Scaling accuracy within ±1 replica of target
- ✅ Custom metrics integration = 100%
- ✅ Scaling policy compliance = 100%
- ✅ Stabilization window effectiveness = 100%
- ✅ Resource threshold responsiveness <2 minutes

---

### Test 2.2: Cluster Auto-Scaling Testing

**File**: `test/docker/phase3/cluster-auto-scaling.test.js`

**Objective**: Validate cluster auto-scaling and node provisioning

**Test Scenarios**:
```javascript
describe('Cluster Auto-Scaling Testing', () => {
  test('Cluster should auto-scale when resource utilization is high', async () => {
    // Get initial cluster state
    const initialClusterState = await getClusterState();
    const initialNodes = initialClusterState.nodes.length;
    const initialCapacity = initialClusterState.totalCapacity;

    // Generate load that exceeds current cluster capacity
    const overloadScenarios = [
      { deployment: 'cfn-agent-pool', replicas: 20, cpuPerReplica: '500m', memoryPerReplica: '1Gi' },
      { deployment: 'load-generator', replicas: 10, cpuPerReplica: '1000m', memoryPerReplica: '2Gi' }
    ];

    for (const scenario of overloadScenarios) {
      await scaleDeployment(scenario.deployment, scenario.replicas);
      await setResourceRequests(scenario.deployment, scenario.cpuPerReplica, scenario.memoryPerReplica);
    }

    // Monitor cluster scaling
    const clusterScalingMetrics = await monitorClusterScaling(900000); // 15 minutes

    // Success Criteria
    expect(clusterScalingMetrics.finalNodes).toBeGreaterThan(initialNodes);
    expect(clusterScalingMetrics.scaleUpTime).toBeLessThan(600000); // Scale up within 10 minutes
    expect(clusterScalingMetrics.newNodesReady).toBe(true);
    expect(clusterScalingMetrics.podsScheduledOnNewNodes).toBeGreaterThan(0);

    // Verify new nodes are properly configured
    const newNodes = clusterScalingMetrics.newNodes;
    for (const node of newNodes) {
      expect(node.ready).toBe(true);
      expect(node.labels['node-role.kubernetes.io/worker']).toBe('true');
      expect(node.capacity.cpu).toBeGreaterThan(0);
      expect(node.capacity.memory).toBeGreaterThan(0);
    }
  });

  test('Cluster should scale down when resource utilization is low', async () => {
    // First scale up to create multiple nodes
    await generateClusterOverload(20, 600000); // 20 replicas for 10 minutes
    await waitForClusterScaleUp(5, 600000); // Wait for 5 nodes total

    const scaledUpState = await getClusterState();
    const scaledUpNodes = scaledUpState.nodes.length;

    // Reduce load significantly
    await scaleDeployment('cfn-agent-pool', 2); // Back to minimal replicas
    await deleteDeployment('load-generator');
    await awaitPodEvictionAndTermination(600000); // Wait for pod termination

    // Monitor cluster scale down
    const clusterScaleDownMetrics = await monitorClusterScaleDown(900000); // 15 minutes

    // Success Criteria
    expect(clusterScaleDownMetrics.finalNodes).toBeLessThan(scaledUpNodes);
    expect(clusterScaleDownMetrics.scaleDownTime).toBeLessThan(600000); // Scale down within 10 minutes
    expect(clusterScaleDownMetrics.nodesTerminated).toBeGreaterThan(0);

    // Verify pods are rescheduled properly
    const finalPodStatus = await getAllPodsStatus();
    expect(finalPodStatus.unschedulable).toBe(0);
    expect(finalPodStatus.pending).toBe(0);
  });

  test('Node drain and termination should handle pod eviction gracefully', async () => {
    // Select a node for termination testing
    const testNode = await selectWorkerNodeForTesting();
    const podsOnNode = await getPodsOnNode(testNode.name);

    expect(podsOnNode.length).toBeGreaterThan(0);

    // Initiate node drain
    await drainNode(testNode.name);

    // Monitor pod eviction and rescheduling
    const drainMetrics = await monitorNodeDrain(testNode.name, 600000);

    // Success Criteria
    expect(drainMetrics.allPodsEvicted).toBe(true);
    expect(drainMetrics.podsRescheduled).toBe(podsOnNode.length);
    expect(drainMetrics.dataLoss).toBe(false);
    expect(drainMetrics.drainTime).toBeLessThan(300000); // Drain within 5 minutes

    // Verify pods are running on other nodes
    const podsAfterDrain = await getPodsStatus();
    const runningPods = podsAfterDrain.filter(p => p.status === 'Running');

    for (const originalPod of podsOnNode) {
      const correspondingPod = runningPods.find(p =>
        p.labels.app === originalPod.labels.app &&
        p.name !== originalPod.name
      );
      expect(correspondingPod).toBeDefined();
    }

    // Terminate the drained node
    await terminateNode(testNode.name);
    await waitForNodeTermination(testNode.name, 120000);
  });

  test('Auto-scaling should respect node pools and instance types', async () => {
    // Configure multiple node pools
    const nodePools = [
      { name: 'general-purpose', instanceType: 't3.medium', minSize: 2, maxSize: 10 },
      { name: 'compute-optimized', instanceType: 'c5.large', minSize: 1, maxSize: 5 },
      { name: 'memory-optimized', instanceType: 'r5.large', minSize: 1, maxSize: 5 }
    ];

    for (const pool of nodePools) {
      await configureNodePool(pool);
    }

    // Generate specific workloads for different node pools
    const workloads = [
      { deployment: 'cpu-intensive', nodePool: 'compute-optimized', replicas: 3, cpuRequest: '800m' },
      { deployment: 'memory-intensive', nodePool: 'memory-optimized', replicas: 2, memoryRequest: '4Gi' },
      { deployment: 'balanced', nodePool: 'general-purpose', replicas: 5, cpuRequest: '300m', memoryRequest: '1Gi' }
    ];

    for (const workload of workloads) {
      await deployWorkloadWithNodePool(workload);
    }

    // Monitor node pool scaling
    const nodePoolMetrics = await monitorNodePoolScaling(900000);

    // Success Criteria
    for (const pool of nodePools) {
      const poolMetric = nodePoolMetrics[pool.name];
      expect(poolMetric).toBeDefined();
      expect(poolMetric.nodesCreated).toBeGreaterThan(0);
      expect(poolMetric.correctInstanceType).toBe(true);
      expect(poolMetric.workloadsScheduled).toBeGreaterThan(0);
    }

    // Verify workloads are running on appropriate node types
    for (const workload of workloads) {
      const pods = await getPodsByDeployment(workload.deployment);
      for (const pod of pods) {
        const node = await getNodeForPod(pod.name);
        const nodePool = getNodePoolForNode(node.name);
        expect(nodePool).toBe(workload.nodePool);
      }
    }
  });
});
```

**Validation Metrics**:
- ✅ Cluster scale-up time <10 minutes
- ✅ Cluster scale-down time <10 minutes
- ✅ Node drain success rate = 100%
- ✅ Pod rescheduling success rate = 100%
- ✅ Node pool targeting accuracy = 100%
- ✅ Instance type compliance = 100%
- ✅ Data loss during node operations = 0%

---

## 🧪 Test Suite 3: High Availability and Disaster Recovery

### Test 3.1: Redis Cluster High Availability

**File**: `test/docker/phase3/redis-cluster-ha.test.js`

**Objective**: Validate Redis cluster failover, replication, and data consistency

**Test Scenarios**:
```javascript
describe('Redis Cluster High Availability', () => {
  test('Redis cluster should handle master node failure gracefully', async () => {
    // Get initial cluster state
    const initialClusterState = await getRedisClusterState();
    const masterNodes = initialClusterState.nodes.filter(n => n.role === 'master');
    const replicaNodes = initialClusterState.nodes.filter(n => n.role === 'replica');

    expect(masterNodes.length).toBe(3); // 3 master nodes
    expect(replicaNodes.length).toBe(3); // 3 replica nodes

    // Select a master node for failure testing
    const masterToFail = masterNodes[0];
    const masterReplicas = replicaNodes.filter(r => r.masterId === masterToFail.id);
    expect(masterReplicas.length).toBeGreaterThan(0);

    // Write test data to cluster
    const testData = Array.from({length: 1000}, (_, i) => ({
      key: `test-key-${i}`,
      value: `test-value-${i}-${Date.now()}`
    }));

    for (const data of testData) {
      await redisSet(data.key, data.value);
    }

    // Verify data is written
    const initialDataCheck = await verifyRedisData(testData);
    expect(initialDataCheck.success).toBe(true);
    expect(initialDataCheck.verifiedKeys).toBe(testData.length);

    // Kill the master node
    await killRedisNode(masterToFail.id);

    // Monitor failover process
    const failoverMetrics = await monitorRedisFailover(masterToFail.id, 300000);

    // Success Criteria
    expect(failoverMetrics.failoverCompleted).toBe(true);
    expect(failoverMetrics.failoverTime).toBeLessThan(30000); // <30 seconds
    expect(failoverMetrics.newMasterElected).toBe(true);
    expect(failoverMetrics.clusterState).toBe('ok');

    // Verify cluster availability after failover
    const postFailoverState = await getRedisClusterState();
    expect(postFailoverState.nodes.filter(n => n.role === 'master').length).toBe(3);
    expect(postFailoverState.clusterHealth).toBe('ok');

    // Verify data integrity after failover
    const postFailoverDataCheck = await verifyRedisData(testData);
    expect(postFailoverDataCheck.success).toBe(true);
    expect(postFailoverDataCheck.verifiedKeys).toBe(testData.length);

    // Test read/write operations after failover
    const newTestData = { key: 'post-failover-test', value: `value-${Date.now()}` };
    await redisSet(newTestData.key, newTestData.value);
    const retrievedValue = await redisGet(newTestData.key);
    expect(retrievedValue).toBe(newTestData.value);
  });

  test('Redis cluster should handle network partitions correctly', async () => {
    // Get initial cluster state
    const clusterState = await getRedisClusterState();
    const nodes = clusterState.nodes;

    // Create network partition between nodes
    const partitionGroups = [
      [nodes[0].id, nodes[1].id], // Group 1
      [nodes[2].id, nodes[3].id], // Group 2
      [nodes[4].id, nodes[5].id]  // Group 3
    ];

    // Simulate network partition
    for (const group of partitionGroups) {
      await createNetworkPartition(group);
    }

    // Monitor cluster behavior during partition
    const partitionMetrics = await monitorNetworkPartition(600000); // 10 minutes

    // Success Criteria
    expect(partitionMetrics.clusterAvailability).toBe(true); // At least one partition should remain available
    expect(partitionMetrics.dataConsistencyMaintained).toBe(true);
    expect(partitionMetrics.splitBrainPrevented).toBe(true);

    // Write data during partition
    const partitionTestData = Array.from({length: 100}, (_, i) => ({
      key: `partition-test-${i}`,
      value: `partition-value-${i}-${Date.now()}`
    }));

    const availablePartition = partitionMetrics.availablePartitions[0];
    for (const data of partitionTestData) {
      await redisSetOnNode(availablePartition, data.key, data.value);
    }

    // Heal network partition
    for (const group of partitionGroups) {
      await healNetworkPartition(group);
    }

    // Monitor cluster recovery
    const recoveryMetrics = await monitorClusterRecovery(300000);

    // Success Criteria
    expect(recoveryMetrics.clusterReformed).toBe(true);
    expect(recoveryMetrics.recoveryTime).toBeLessThan(60000); // <1 minute
    expect(recoveryMetrics.dataSyncCompleted).toBe(true);
    expect(recoveryMetrics.finalClusterState).toBe('ok');

    // Verify data consistency after recovery
    const finalClusterState = await getRedisClusterState();
    expect(finalClusterState.nodes.length).toBe(6);
    expect(finalClusterState.clusterHealth).toBe('ok');

    const recoveredDataCheck = await verifyRedisData(partitionTestData);
    expect(recoveredDataCheck.success).toBe(true);
  });

  test('Redis cluster should maintain data consistency under high load', async () => {
    // Generate high write load
    const loadGenerator = new RedisLoadGenerator();
    const highLoadTest = {
      operationsPerSecond: 1000,
      duration: 600000, // 10 minutes
      keySize: 100,
      valueSize: 1000,
      readWriteRatio: 0.7 // 70% writes, 30% reads
    };

    const loadTestResults = await loadGenerator.runHighLoadTest(highLoadTest);

    // Success Criteria
    expect(loadTestResults.successfulOperations).toBeGreaterThan(highLoadTest.operationsPerSecond * highLoadTest.duration / 1000 * 0.95); // >95% success rate
    expect(loadTestResults.averageLatency).toBeLessThan(100); // <100ms average latency
    expect(loadTestResults.errorRate).toBeLessThan(0.05); // <5% error rate

    // Verify data consistency across all nodes
    const consistencyCheck = await verifyCrossNodeConsistency();
    expect(consistencyCheck.allNodesConsistent).toBe(true);
    expect(consistencyCheck.inconsistentKeys).toBe(0);

    // Monitor cluster health during high load
    const healthMetrics = await monitorClusterHealth(highLoadTest.duration);
    expect(healthMetrics.averageMemoryUsage).toBeLessThan(80); // <80% memory usage
    expect(healthMetrics.averageCPUUsage).toBeLessThan(70); // <70% CPU usage
    expect(healthMetrics.networkLatency).toBeLessThan(50); // <50ms network latency
  });

  test('Redis cluster backup and recovery should work correctly', async () => {
    // Generate comprehensive test dataset
    const comprehensiveDataset = {
      stringData: Array.from({length: 10000}, (_, i) => ({
        key: `string-${i}`,
        value: `string-value-${i}-${Math.random().toString(36).substr(2, 9)}`
      })),
      hashData: Array.from({length: 1000}, (_, i) => ({
        key: `hash-${i}`,
        fields: Array.from({length: 10}, (_, j) => ({
          field: `field-${j}`,
          value: `hash-value-${i}-${j}`
        }))
      })),
      listData: Array.from({length: 500}, (_, i) => ({
        key: `list-${i}`,
        values: Array.from({length: 20}, (_, j) => `list-value-${i}-${j}`)
      })),
      setData: Array.from({length: 300}, (_, i) => ({
        key: `set-${i}`,
        members: Array.from({length: 15}, (_, j) => `set-member-${i}-${j}`)
      }))
    };

    // Write all data to Redis
    await writeComprehensiveDataset(comprehensiveDataset);

    // Verify data is written correctly
    const preBackupVerification = await verifyComprehensiveDataset(comprehensiveDataset);
    expect(preBackupVerification.success).toBe(true);
    expect(preBackupVerification.totalKeys).toBeGreaterThan(10000);

    // Create cluster backup
    const backupResult = await createRedisClusterBackup({
      name: `cluster-backup-${Date.now()}`,
      includeRDB: true,
      includeAOF: true,
      compression: true
    });

    expect(backupResult.success).toBe(true);
    expect(backupResult.backupSize).toBeGreaterThan(0);

    // Simulate catastrophic failure
    await simulateCatastrophicFailure();

    // Verify cluster is down
    const postFailureState = await getRedisClusterState();
    expect(postFailureState.clusterHealth).toBe('down');

    // Restore from backup
    const restoreResult = await restoreRedisClusterBackup(backupResult.backupId);

    expect(restoreResult.success).toBe(true);
    expect(restoreResult.restoredNodes).toBe(6);
    expect(restoreResult.clusterState).toBe('ok');

    // Verify data integrity after restore
    const postRestoreVerification = await verifyComprehensiveDataset(comprehensiveDataset);
    expect(postRestoreVerification.success).toBe(true);
    expect(postRestoreVerification.totalKeys).toBe(preBackupVerification.totalKeys);
    expect(postRestoreVerification.dataIntegrity).toBe(100);

    // Test cluster functionality after restore
    const functionalityTest = await testClusterFunctionality();
    expect(functionalityTest.readOperations).toBe(true);
    expect(functionalityTest.writeOperations).toBe(true);
    expect(functionalityTest.clusterCoordination).toBe(true);
  });
});
```

**Validation Metrics**:
- ✅ Master failover time <30 seconds
- ✅ Data consistency during failover = 100%
- ✅ Network partition recovery <1 minute
- ✅ High load success rate >95%
- ✅ Cross-node data consistency = 100%
- ✅ Backup creation success rate = 100%
- ✅ Data restore success rate = 100%
- ✅ Post-restore data integrity = 100%

---

## 🚀 Test Execution Framework

### Kubernetes Test Pipeline
```yaml
# .github/workflows/phase3-k8s-testing.yml
name: Phase 3 Kubernetes Testing
on:
  push:
    paths: ['k8s/**', 'test/docker/phase3/**']
  pull_request:
    paths: ['k8s/**', 'test/docker/phase3/**']

jobs:
  k8s-deployment-test:
    runs-on: ubuntu-latest
    services:
      k3s:
        image: rancher/k3s:latest
        options: --privileged

    steps:
      - uses: actions/checkout@v3
      - name: Setup Kubernetes
        run: |
          curl -sfL https://get.k3s.io | sh -
          sudo kubectl config use-context k3s-default

      - name: Deploy test infrastructure
        run: |
          kubectl create namespace cfn-test
          kubectl apply -f k8s/test/

      - name: Run deployment tests
        run: npm run test:phase3:k8s-deployment

      - name: Run auto-scaling tests
        run: npm run test:phase3:auto-scaling

      - name: Run HA tests
        run: npm run test:phase3:high-availability

      - name: Generate cluster report
        run: npm run test:phase3:cluster-report

      - name: Upload test artifacts
        uses: actions/upload-artifact@v3
        if: always()
        with:
          name: phase3-k8s-results
          path: |
            test-results/
            cluster-logs/
            k8s-test-reports.json

  load-testing:
    runs-on: ubuntu-larger
    if: github.ref == 'refs/heads/main'
    needs: k8s-deployment-test
    timeout-minutes: 180

    steps:
      - uses: actions/checkout@v3
      - name: Setup production cluster
        run: |
          # Setup or connect to real K8s cluster
          aws eks update-kubeconfig --name cfn-test-cluster
          kubectl apply -f k8s/production/

      - name: Run comprehensive load tests
        run: npm run test:phase3:load-test-comprehensive
        timeout-minutes: 120

      - name: Run disaster recovery tests
        run: npm run test:phase3:disaster-recovery
        timeout-minutes: 90

      - name: Cleanup cluster
        if: always()
        run: kubectl delete namespace cfn-test --ignore-not-found=true
```

### Test Execution Commands
```bash
# Run all Phase 3 tests
npm run test:phase3

# Run specific test suites
npm run test:phase3:k8s-deployment
npm run test:phase3:auto-scaling
npm run test:phase3:high-availability
npm run test:phase3:redis-cluster
npm run test:phase3:disaster-recovery

# Run with specific configurations
npm run test:phase3 -- --cluster-type=gke
npm run test:phase3 -- --nodes=10 --instance-type=m5.large
npm run test:phase3 -- --load-test-duration=3600
npm run test:phase3 -- --skip-cleanup

# Generate reports
npm run test:phase3:cluster-report
npm run test:phase3:performance-report
npm run test:phase3:scalability-report
npm run test:phase3:reliability-report
```

---

## 📊 Success Criteria Summary

### Kubernetes Deployment Metrics
- **Pod Scheduling Success Rate**: 100%
- **Service Discovery Success Rate**: 100%
- **Health Check Success Rate**: 100%
- **Resource Limit Enforcement**: 100%
- **Storage Performance**: Sequential write >100 MB/s, read >200 MB/s
- **Data Persistence**: 100% across pod restarts
- **Backup/Restore Success Rate**: 100%

### Auto-Scaling Metrics
- **HPA Scale-Up Time**: <5 minutes
- **HPA Scale-Down Time**: <10 minutes
- **Cluster Scale-Up Time**: <10 minutes
- **Cluster Scale-Down Time**: <10 minutes
- **Scaling Accuracy**: ±1 replica of target
- **Custom Metrics Integration**: 100%
- **Node Drain Success Rate**: 100%
- **Pod Rescheduling Success Rate**: 100%

### High Availability Metrics
- **Redis Failover Time**: <30 seconds
- **Network Partition Recovery**: <1 minute
- **Data Consistency**: 100% during failures
- **Cluster Recovery Time**: <5 minutes
- **Backup Creation Time**: <10 minutes
- **Data Restore Time**: <30 minutes
- **Post-Restore Data Integrity**: 100%
- **System Availability**: ≥99.99%

### Load Testing Metrics
- **Concurrent Agent Capacity**: 100+ simultaneous agents
- **Task Throughput**: 1000+ tasks/hour
- **Response Time**: <2 seconds average
- **Error Rate**: <1% under peak load
- **Resource Utilization**: CPU <80%, Memory <80% under load
- **Network Latency**: <50ms inter-node
- **Data Consistency**: 100% under high load

### Automated Validation Requirements
- All tests must pass without manual intervention
- Cluster metrics automatically collected and analyzed
- Load testing must simulate production scenarios
- Failure scenarios must be automatically tested
- Recovery procedures must be automatically verified
- Performance benchmarks must be met consistently
- Data integrity must be validated after each operation

---

**Document Version**: 1.0
**Last Updated**: 2025-11-08
**Next Review**: After Phase 3 implementation completion