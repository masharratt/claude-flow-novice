# CFN Loop Docker Forgiveness Testing Guide

## Overview

The CFN Loop Docker forgiveness testing framework validates the resilience and fault tolerance of CFN Loop operations in containerized environments. This comprehensive test suite builds on the CLI foundation and adds Docker-specific failure scenarios and recovery mechanisms.

## Architecture

### Test Components

1. **Core Test Script** (`tests/test-cfn-forgiveness-docker-hello-world.sh`)
   - Main test execution engine
   - 8 Docker-specific forgiveness mechanisms
   - Combined scenario testing
   - Detailed metrics collection and reporting

2. **Docker Compose Configuration** (`tests/docker/docker-compose.forgiveness.yml`)
   - Multi-container orchestration
   - Resource-constrained test environments
   - Failure simulation services
   - Monitoring and logging stack

3. **Test Runner** (`tests/docker/run-docker-forgiveness-tests.sh`)
   - Multiple test modes (standalone/compose)
   - Prerequisites validation
   - Environment setup and cleanup
   - Comprehensive reporting

4. **Redis Configuration** (`tests/docker/redis-forgiveness.conf`)
   - Optimized for failure testing
   - Memory management for coordination
   - Persistence and recovery settings

## Docker-Specific Forgiveness Mechanisms

### 1. Container Resource Constraints Forgiveness

**Purpose**: Test CFN Loop behavior under container resource pressure

**Scenarios**:
- **Memory Constraint Forgiveness**: Tests response to OOM conditions and memory limits
- **CPU Constraint Forgiveness**: Validates behavior under CPU throttling
- **Combined Resource Pressure**: Simulates multi-dimensional resource exhaustion

**Test Implementation**:
```bash
# Memory constraint test
run_container_hello_world_task "memory_test" 90 "64m" "0.2"

# CPU constraint test
run_container_hello_world_task "cpu_test" 90 "256m" "0.1"

# Combined pressure test
# Start stress containers + test container
```

**Validation Criteria**:
- Tasks complete successfully within resource constraints
- Graceful degradation when resources are limited
- Recovery after resource pressure is relieved
- Container isolation maintained

### 2. Container Network Issues Forgiveness

**Purpose**: Validate network resilience in containerized environments

**Scenarios**:
- **Network Partition Simulation**: Tests behavior during network splits
- **DNS Resolution Failures**: Validates fallback for name resolution issues
- **Port Conflict Resolution**: Tests handling of port allocation conflicts

**Test Implementation**:
```bash
# Network partition test
docker run --network-restricted container
# Test communication with Redis

# DNS failure test
docker run --dns invalid-dns container
# Validate fallback mechanisms
```

**Validation Criteria**:
- Graceful handling of network partitions
- DNS resolution fallback mechanisms
- Port conflict automatic resolution
- Service discovery resilience

### 3. Docker Daemon Failures Forgiveness

**Purpose**: Test resilience to Docker daemon and API issues

**Scenarios**:
- **Docker Daemon Timeout**: Tests timeout handling and retry mechanisms
- **Container Restart Loop Prevention**: Validates automatic restart policies
- **Docker API Rate Limiting**: Tests behavior under API throttling

**Test Implementation**:
```bash
# Daemon timeout test
export DOCKER_CLIENT_TIMEOUT=5
# Test operations with short timeouts

# Restart loop test
# Create failing container, test restart policies
```

**Validation Criteria**:
- Proper timeout and retry handling
- Prevention of infinite restart loops
- Graceful degradation under API rate limits
- Recovery from daemon connectivity issues

### 4. Container Image Issues Forgiveness

**Purpose**: Validate handling of Docker image-related failures

**Scenarios**:
- **Missing Image Fallback**: Tests behavior when required images are unavailable
- **Corrupted Image Detection**: Validates image integrity checking
- **Large Image Loading Timeout**: Tests handling of slow image pulls

**Test Implementation**:
```bash
# Missing image fallback
docker run non-existent-image  # Should fail gracefully
# Fallback to working image

# Corrupted image test
# Simulate corruption, test rebuild mechanisms
```

**Validation Criteria**:
- Graceful fallback to alternative images
- Automatic image rebuilding when corrupted
- Timeout handling for large image downloads
- Image caching and optimization

### 5. Volume Mount Failures Forgiveness

**Purpose**: Test resilience to storage and volume mounting issues

**Scenarios**:
- **Non-Existent Volume Handling**: Tests behavior with missing volumes
- **Read-Only Volume Fallback**: Validates write permission failures
- **Permission Denied Volume Access**: Tests access control issues

**Test Implementation**:
```bash
# Non-existent volume test
docker run -v /non-existent:/app container
# Should fallback to internal storage

# Permission test
docker run -v /restricted-dir:/app:rw container
# Should handle permission denied gracefully
```

**Validation Criteria**:
- Automatic volume creation when missing
- Fallback to internal storage for permission issues
- Read-only volume handling
- Cleanup of temporary storage

### 6. Container Lifecycle Events Forgiveness

**Purpose**: Validate handling of container lifecycle events

**Scenarios**:
- **Unexpected Termination Handling**: Tests response to container crashes
- **Container Restart Recovery**: Validates restart policy effectiveness
- **Graceful Shutdown with Signal Handling**: Tests SIGTERM/SIGINT handling

**Test Implementation**:
```bash
# Unexpected termination test
docker run --restart=unless-stopped container
# Kill container, test restart behavior

# Graceful shutdown test
docker kill --signal TERM container
# Validate graceful shutdown handling
```

**Validation Criteria**:
- Proper signal handling and graceful shutdown
- Restart policy effectiveness
- State preservation across restarts
- Cleanup after unexpected termination

### 7. Multi-Container Coordination Forgiveness

**Purpose**: Test coordination mechanisms between multiple containers

**Scenarios**:
- **Container Communication Failure**: Tests inter-container communication resilience
- **Redis Coordination Failure**: Validates coordination service fallbacks
- **Service Discovery Forgiveness**: Tests service discovery mechanisms

**Test Implementation**:
```bash
# Communication failure test
# Start producer/consumer containers
# Stop producer, test consumer fallback

# Redis coordination test
# Test Redis-based coordination under pressure
```

**Validation Criteria**:
- Resilient inter-container communication
- Coordination service fallback mechanisms
- Service discovery with fallback options
- Graceful handling of service unavailability

### 8. Container Resource Isolation Forgiveness

**Purpose**: Validate resource isolation between containers

**Scenarios**:
- **Memory Isolation Under Pressure**: Tests memory isolation guarantees
- **CPU Isolation with Contention**: Validates CPU isolation effectiveness
- **Network Bandwidth Isolation**: Tests network resource isolation

**Test Implementation**:
```bash
# Memory isolation test
# Start memory-intensive containers
# Test isolation under pressure

# CPU isolation test
# Start CPU-intensive containers
# Validate CPU allocation fairness
```

**Validation Criteria**:
- Resource isolation effectiveness
- Fair resource allocation under contention
- Prevention of resource starvation
- Performance isolation guarantees

## Test Modes

### Standalone Mode

**Command**: `./tests/test-cfn-forgiveness-docker-hello-world.sh`

**Description**: Runs Docker forgiveness tests without Docker Compose
- Direct Docker container management
- Individual container testing
- Resource constraint simulation
- Network failure injection

**Use Cases**:
- Quick validation of Docker-specific features
- Development and debugging
- CI/CD pipeline integration

### Docker Compose Modes

#### Basic Mode
**Command**: `./tests/docker/run-docker-forgiveness-tests.sh compose-basic`

**Description**: Tests basic Docker Compose orchestration
- Redis coordination service
- CFN coordinator container
- Service health checks
- Network connectivity

#### Stress Mode
**Command**: `./tests/docker/run-docker-forgiveness-tests.sh compose-stress`

**Description**: Tests system under resource pressure
- Memory and CPU stress generators
- Resource-constrained agent containers
- Resource isolation validation
- Performance monitoring

#### Network Failure Mode
**Command**: `./tests/docker/run-docker-forgiveness-tests.sh compose-network-failure`

**Description**: Tests network resilience
- Network partition simulation
- Service discovery fallbacks
- Communication recovery
- DNS resolution testing

#### Volume Failure Mode
**Command**: `./tests/docker/run-docker-forgiveness-tests.sh compose-volume-failure`

**Description**: Tests storage resilience
- Volume mount failures
- Permission issues
- Fallback storage mechanisms
- Cleanup procedures

#### Monitoring Mode
**Command**: `./tests/docker/run-docker-forgiveness-tests.sh compose-with-monitoring`

**Description**: Tests with full monitoring stack
- cAdvisor for container metrics
- Fluent-bit for log aggregation
- Resource usage tracking
- Performance monitoring

#### All Tests Mode
**Command**: `./tests/docker/run-docker-forgiveness-tests.sh compose-all`

**Description**: Runs comprehensive test suite
- All failure scenarios
- Full monitoring stack
- Combined scenarios
- Detailed reporting

## Test Execution

### Prerequisites

1. **Docker Environment**:
   ```bash
   # Check Docker version
   docker --version  # Should be 20.10+

   # Check Docker daemon
   docker info       # Should show daemon info
   ```

2. **Docker Compose**:
   ```bash
   # Check Docker Compose
   docker-compose --version  # Should be 1.29+
   ```

3. **System Resources**:
   - Minimum 2GB RAM
   - 10GB available disk space
   - Stable network connectivity

### Running Tests

#### Standalone Tests
```bash
# Run standalone Docker forgiveness tests
cd /path/to/cfn-flow-novice
./tests/test-cfn-forgiveness-docker-hello-world.sh

# Check results
ls /tmp/cfn-docker-forgiveness-test-*/
```

#### Docker Compose Tests
```bash
# Run specific test mode
./tests/docker/run-docker-forgiveness-tests.sh compose-stress

# Run all tests
./tests/docker/run-docker-forgiveness-tests.sh compose-all

# Get help
./tests/docker/run-docker-forgiveness-tests.sh --help
```

### Test Output

#### Console Output
- Real-time test progress
- Success/failure indicators
- Recovery time metrics
- Resource usage statistics

#### Report Files
- **Markdown Report**: Comprehensive test results with analysis
- **JSON Metrics**: Machine-readable test data
- **Container Logs**: Individual container execution logs
- **Resource Stats**: Container resource usage statistics

#### Artifacts Location
```
/tmp/cfn-docker-forgiveness-test-<timestamp>/
├── docker-forgiveness-report.md     # Main report
├── container-stats/                  # Resource metrics
├── docker-logs/                      # Container logs
├── failures/                         # Failure condition markers
└── telemetry/                        # CFN Loop telemetry data
```

## Validation Criteria

### Success Metrics

#### Recovery Time
- **Excellent**: < 5 seconds
- **Good**: 5-15 seconds
- **Acceptable**: 15-30 seconds
- **Needs Improvement**: > 30 seconds

#### Success Rate
- **Excellent**: 95-100%
- **Good**: 85-94%
- **Acceptable**: 70-84%
- **Needs Improvement**: < 70%

#### Resource Efficiency
- **Memory**: Within allocated limits
- **CPU**: Fair allocation under contention
- **Network**: Graceful degradation under pressure
- **Storage**: Proper cleanup and no leaks

### Failure Analysis

#### Common Failure Patterns
1. **Resource Exhaustion**: Memory/CPU limits too restrictive
2. **Network Issues**: DNS resolution or connectivity problems
3. **Permission Errors**: Volume mount or access issues
4. **Image Problems**: Missing or corrupted Docker images
5. **Daemon Issues**: Docker API timeouts or rate limiting

#### Troubleshooting Guide

##### Resource Issues
```bash
# Check container resource usage
docker stats

# Monitor system resources
htop
iostat -x 1

# Adjust resource limits
docker run --memory=512m --cpus=0.5 ...
```

##### Network Issues
```bash
# Check network connectivity
docker network ls
docker network inspect cfn-forgiveness-network

# Test DNS resolution
docker exec container nslookup service-name

# Check port availability
docker exec container netstat -tlnp
```

##### Volume Issues
```bash
# Check volume mounts
docker volume ls
docker inspect container | jq '.Mounts'

# Test volume permissions
docker exec container ls -la /mount/point

# Clean up volumes
docker volume prune
```

##### Image Issues
```bash
# Check available images
docker images | grep cfn-forgiveness

# Rebuild test images
docker build -t cfn-forgiveness-test .

# Clean up unused images
docker image prune
```

## Best Practices

### Test Development
1. **Isolation**: Each test should be independent
2. **Cleanup**: Proper resource cleanup after each test
3. **Logging**: Comprehensive logging for debugging
4. **Metrics**: Collect performance and recovery metrics
5. **Documentation**: Clear test descriptions and validation criteria

### Production Deployment
1. **Resource Limits**: Set appropriate memory and CPU limits
2. **Health Checks**: Implement container health checks
3. **Restart Policies**: Configure appropriate restart policies
4. **Monitoring**: Deploy monitoring and logging stack
5. **Backup**: Regular backup of persistent data

### CI/CD Integration
1. **Parallel Execution**: Run tests in parallel where possible
2. **Artifact Collection**: Collect test artifacts for analysis
3. **Failure Notification**: Alert on test failures
4. **Trend Analysis**: Track test performance over time
5. **Automated Cleanup**: Automated cleanup of test resources

## Extending the Test Suite

### Adding New Forgiveness Mechanisms

1. **Create Test Function**:
   ```bash
   test_new_mechanism() {
       log_docker_test_start "New Forgiveness Mechanism"
       # Implement test scenarios
       # Validate results
       # Report metrics
   }
   ```

2. **Add to Mechanisms List**:
   ```bash
   DOCKER_FORGIVENESS_MECHANISMS+=("new_mechanism")
   ```

3. **Update Docker Compose** (if needed):
   ```yaml
   new-test-service:
     image: cfn-forgiveness-test
     # Service configuration
   ```

4. **Add Validation Criteria**:
   ```bash
   if [[ test_passed ]]; then
       log_docker_success "New mechanism working"
   else
       log_docker_error "New mechanism failed"
   fi
   ```

### Adding New Test Modes

1. **Create Test Mode Function**:
   ```bash
   run_compose_new_tests() {
       # Implement test scenarios
       # Collect metrics
       # Return success/failure
   }
   ```

2. **Update Runner**:
   ```bash
   case "$TEST_MODE" in
       "compose-new")
           run_compose_new_tests
           ;;
   esac
   ```

3. **Add Documentation**:
   - Update this guide
   - Add usage examples
   - Document validation criteria

## Performance Benchmarks

### Expected Performance Characteristics

| Test Category | Recovery Time | Success Rate | Resource Usage |
|---------------|---------------|--------------|----------------|
| Resource Constraints | 5-15s | 90%+ | Within limits |
| Network Failures | 10-30s | 85%+ | Graceful degradation |
| Docker Daemon Issues | 15-45s | 80%+ | Automatic recovery |
| Image Issues | 30-60s | 75%+ | Fallback mechanisms |
| Volume Issues | 5-20s | 95%+ | Alternative storage |
| Lifecycle Events | 5-10s | 95%+ | Restart policies |
| Multi-Container Coordination | 10-30s | 85%+ | Fallback coordination |
| Resource Isolation | N/A | 100% | Isolation guarantees |

### Performance Monitoring

#### Container Metrics
- CPU usage percentage
- Memory usage and limits
- Network I/O
- Block I/O

#### Application Metrics
- Task completion time
- Recovery time after failure
- Success rate under stress
- Resource efficiency

#### System Metrics
- Host resource usage
- Docker daemon performance
- Network connectivity
- Storage performance

## Troubleshooting

### Common Issues

#### Test Environment Setup
```bash
# Permission denied errors
sudo usermod -aG docker $USER
# Logout and login again

# Docker daemon not running
sudo systemctl start docker
sudo systemctl enable docker
```

#### Resource Constraints
```bash
# Out of memory errors
# Increase available memory or reduce test container limits
docker run --memory=1g ...

# CPU throttling
# Adjust CPU limits or reduce concurrent tests
docker run --cpus=1.0 ...
```

#### Network Issues
```bash
# Network connectivity problems
# Check Docker network configuration
docker network ls
docker network inspect network-name

# DNS resolution issues
# Check DNS configuration
docker exec container cat /etc/resolv.conf
```

#### Volume Mount Issues
```bash
# Permission denied on volume mounts
# Check volume permissions
ls -la /path/to/volume
# Adjust permissions as needed
sudo chmod 755 /path/to/volume
```

### Debug Commands

#### Container Debugging
```bash
# Inspect container
docker inspect container-name

# View container logs
docker logs container-name

# Execute commands in container
docker exec -it container-name /bin/sh

# View container processes
docker exec container-name ps aux
```

#### Resource Monitoring
```bash
# Real-time container stats
docker stats

# System resource usage
htop
iostat -x 1
free -h

# Disk usage
df -h
docker system df
```

#### Network Debugging
```bash
# Network connectivity test
docker exec container-name ping service-name

# Port connectivity test
docker exec container-name nc -zv service-name port

# DNS resolution test
docker exec container-name nslookup service-name
```

## Conclusion

The CFN Loop Docker forgiveness testing framework provides comprehensive validation of container resilience and fault tolerance. By systematically testing various failure scenarios and recovery mechanisms, it ensures that CFN Loop can operate reliably in production containerized environments.

The framework is designed to be:
- **Comprehensive**: Covers all major Docker-specific failure scenarios
- **Automated**: Minimal manual intervention required
- **Extensible**: Easy to add new test scenarios
- **Production-Ready**: Suitable for CI/CD integration
- **Observable**: Detailed metrics and reporting

Regular execution of these tests helps maintain the reliability and resilience of CFN Loop deployments in Docker environments.