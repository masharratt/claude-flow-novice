# Java Performance Optimization and JVM Tuning

This comprehensive guide covers Java performance optimization, JVM tuning, profiling, monitoring, and Claude Flow integration for building high-performance Java applications.

## Quick Start

### Basic Performance Monitoring

```java
@Component
public class PerformanceMonitor {

    @EventListener
    public void handleMethodExecution(MethodExecutionEvent event) {
        if (event.getDuration() > 1000) {
            log.warn("Slow method execution: {} took {}ms",
                event.getMethodName(), event.getDuration());
        }
    }
}
```

### With Claude Flow Integration

```bash
# Analyze performance bottlenecks with agents
npx claude-flow sparc run perf-analyzer "Analyze Java application performance bottlenecks"

# Optimize JVM settings
npx claude-flow sparc batch perf-analyzer,coder "Optimize JVM settings for production workload"
```

## JVM Memory Management

### 1. Heap Memory Optimization

```bash
# Basic heap settings
-Xms2g                    # Initial heap size
-Xmx8g                    # Maximum heap size
-XX:NewRatio=3           # Ratio of old to young generation
-XX:SurvivorRatio=8      # Ratio of eden to survivor space

# Advanced heap settings
-XX:+UseG1GC                           # Use G1 garbage collector
-XX:MaxGCPauseMillis=200              # Target GC pause time
-XX:G1HeapRegionSize=16m              # G1 region size
-XX:G1MixedGCCountTarget=8            # Mixed GC cycle target
-XX:G1OldCSetRegionThreshold=10       # Old generation collection threshold

# Memory analysis
-XX:+HeapDumpOnOutOfMemoryError       # Create heap dump on OOM
-XX:HeapDumpPath=/app/logs/heapdumps  # Heap dump location
-XX:+PrintGCDetails                   # Print GC information
-XX:+PrintGCTimeStamps               # Print GC timestamps
-Xloggc:/app/logs/gc.log             # GC log location
```

### 2. Garbage Collection Tuning

```java
// G1GC Configuration for low latency
@Configuration
public class G1GCConfiguration {

    @Bean
    @ConfigurationProperties("jvm.gc.g1")
    public G1GCSettings g1Settings() {
        return G1GCSettings.builder()
                .maxGCPauseMillis(200)
                .heapRegionSize("16m")
                .mixedGCCountTarget(8)
                .build();
    }
}

// JVM settings class for monitoring
@Component
public class JVMMetrics {

    private final MemoryMXBean memoryMXBean;
    private final List<GarbageCollectorMXBean> gcBeans;

    public JVMMetrics() {
        this.memoryMXBean = ManagementFactory.getMemoryMXBean();
        this.gcBeans = ManagementFactory.getGarbageCollectorMXBeans();
    }

    @Scheduled(fixedDelay = 30000)
    public void logMemoryUsage() {
        MemoryUsage heapUsage = memoryMXBean.getHeapMemoryUsage();
        MemoryUsage nonHeapUsage = memoryMXBean.getNonHeapMemoryUsage();

        log.info("Heap Memory: Used={}MB, Max={}MB, Usage={}%",
                heapUsage.getUsed() / 1024 / 1024,
                heapUsage.getMax() / 1024 / 1024,
                (heapUsage.getUsed() * 100.0) / heapUsage.getMax());

        log.info("Non-Heap Memory: Used={}MB, Max={}MB",
                nonHeapUsage.getUsed() / 1024 / 1024,
                nonHeapUsage.getMax() / 1024 / 1024);

        gcBeans.forEach(gcBean -> {
            log.info("GC {}: Collections={}, Time={}ms",
                    gcBean.getName(),
                    gcBean.getCollectionCount(),
                    gcBean.getCollectionTime());
        });
    }
}
```

### 3. Off-Heap Memory Management

```java
@Component
public class OffHeapCacheManager {

    private final Map<String, Object> cache;

    public OffHeapCacheManager() {
        // Using Chronicle Map for off-heap storage
        this.cache = ChronicleMap
                .of(String.class, Object.class)
                .entries(1_000_000)
                .averageKeySize(50)
                .averageValueSize(1000)
                .create();
    }

    public void put(String key, Object value) {
        cache.put(key, value);
    }

    public Object get(String key) {
        return cache.get(key);
    }

    @PreDestroy
    public void cleanup() {
        if (cache instanceof Closeable) {
            try {
                ((Closeable) cache).close();
            } catch (IOException e) {
                log.error("Error closing off-heap cache", e);
            }
        }
    }
}
```

## Application Performance Optimization

### 1. Connection Pool Tuning

```java
@Configuration
public class DatabasePerformanceConfig {

    @Bean
    @ConfigurationProperties("spring.datasource.hikari")
    public HikariConfig hikariConfig() {
        HikariConfig config = new HikariConfig();

        // Pool sizing
        config.setMaximumPoolSize(50);
        config.setMinimumIdle(10);
        config.setConnectionTimeout(30000);
        config.setIdleTimeout(600000);
        config.setMaxLifetime(1800000);

        // Performance optimizations
        config.setLeakDetectionThreshold(60000);
        config.setPrepStmtCacheSize(250);
        config.setPrepStmtCacheSqlLimit(2048);
        config.setCachePrepStmts(true);
        config.setUseServerPrepStmts(true);

        // Monitoring
        config.setMetricRegistry(new MetricRegistry());
        config.setHealthCheckRegistry(new HealthCheckRegistry());

        return config;
    }

    @Bean
    public DataSource dataSource(HikariConfig hikariConfig) {
        return new HikariDataSource(hikariConfig);
    }
}
```

### 2. Caching Strategies

```java
@Service
@CacheConfig(cacheNames = "users")
public class OptimizedUserService {

    @Autowired
    private RedisTemplate<String, Object> redisTemplate;

    @Cacheable(key = "#id", condition = "#id != null")
    public Optional<User> findById(Long id) {
        return userRepository.findById(id);
    }

    @CachePut(key = "#result.id")
    public User save(User user) {
        User saved = userRepository.save(user);

        // Warm related caches
        warmRelatedCaches(saved);

        return saved;
    }

    @CacheEvict(key = "#id")
    public void deleteById(Long id) {
        userRepository.deleteById(id);

        // Evict related caches
        evictRelatedCaches(id);
    }

    // Multi-level caching with Redis
    public List<User> findActiveUsers() {
        String cacheKey = "active_users";

        // Try L1 cache (local)
        List<User> users = (List<User>) localCache.get(cacheKey);
        if (users != null) {
            return users;
        }

        // Try L2 cache (Redis)
        users = (List<User>) redisTemplate.opsForValue().get(cacheKey);
        if (users != null) {
            localCache.put(cacheKey, users, Duration.ofMinutes(5));
            return users;
        }

        // Fetch from database
        users = userRepository.findByActiveTrue();

        // Cache in both levels
        redisTemplate.opsForValue().set(cacheKey, users, Duration.ofMinutes(30));
        localCache.put(cacheKey, users, Duration.ofMinutes(5));

        return users;
    }

    private void warmRelatedCaches(User user) {
        // Warm department cache
        if (user.getDepartment() != null) {
            departmentService.findById(user.getDepartment().getId());
        }

        // Warm user statistics cache
        statisticsService.getUserStatistics(user.getId());
    }
}
```

### 3. Asynchronous Processing

```java
@Configuration
@EnableAsync
public class AsyncConfiguration implements AsyncConfigurer {

    @Override
    @Bean(name = "taskExecutor")
    public Executor getAsyncExecutor() {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(10);
        executor.setMaxPoolSize(50);
        executor.setQueueCapacity(100);
        executor.setThreadNamePrefix("Async-");
        executor.setRejectedExecutionHandler(new ThreadPoolExecutor.CallerRunsPolicy());
        executor.setWaitForTasksToCompleteOnShutdown(true);
        executor.setAwaitTerminationSeconds(30);
        executor.initialize();
        return executor;
    }

    @Override
    public AsyncUncaughtExceptionHandler getAsyncUncaughtExceptionHandler() {
        return new SimpleAsyncUncaughtExceptionHandler();
    }
}

@Service
public class AsyncUserService {

    @Async("taskExecutor")
    public CompletableFuture<Void> processUserAsync(Long userId) {
        try {
            // Long-running user processing
            User user = userRepository.findById(userId)
                    .orElseThrow(() -> new UserNotFoundException(userId));

            // Process user data
            processUserData(user);

            // Send notifications
            notificationService.sendWelcomeEmail(user);

            return CompletableFuture.completedFuture(null);
        } catch (Exception e) {
            log.error("Error processing user {}", userId, e);
            return CompletableFuture.failedFuture(e);
        }
    }

    @Async
    @Retryable(value = {Exception.class}, maxAttempts = 3, backoff = @Backoff(delay = 1000))
    public CompletableFuture<Void> sendNotificationAsync(Long userId, String message) {
        // Async notification with retry
        notificationService.sendNotification(userId, message);
        return CompletableFuture.completedFuture(null);
    }

    // Parallel processing with CompletableFuture
    public CompletableFuture<UserProcessingResult> processUsersBatch(List<Long> userIds) {
        List<CompletableFuture<User>> futures = userIds.stream()
                .map(this::processUserAsync)
                .map(future -> future.thenApply(v -> getUserResult()))
                .collect(Collectors.toList());

        return CompletableFuture.allOf(futures.toArray(new CompletableFuture[0]))
                .thenApply(v -> futures.stream()
                        .map(CompletableFuture::join)
                        .collect(Collectors.toList()))
                .thenApply(UserProcessingResult::new);
    }
}
```

## Database Performance Optimization

### 1. JPA/Hibernate Optimization

```java
@Entity
@NamedEntityGraphs({
    @NamedEntityGraph(
        name = "User.summary",
        attributeNodes = {
            @NamedAttributeNode("department")
        }
    ),
    @NamedEntityGraph(
        name = "User.detailed",
        attributeNodes = {
            @NamedAttributeNode("department"),
            @NamedAttributeNode(value = "roles", subgraph = "role-permissions")
        },
        subgraphs = {
            @NamedSubgraph(
                name = "role-permissions",
                attributeNodes = @NamedAttributeNode("permissions")
            )
        }
    )
})
@Table(indexes = {
    @Index(name = "idx_user_email", columnList = "email"),
    @Index(name = "idx_user_active_created", columnList = "active, createdAt"),
    @Index(name = "idx_user_department", columnList = "department_id")
})
public class User {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, length = 255)
    private String email;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "department_id")
    private Department department;

    @OneToMany(mappedBy = "user", fetch = FetchType.LAZY, cascade = CascadeType.ALL)
    @BatchSize(size = 20)
    private List<UserRole> roles = new ArrayList<>();

    // Use @Formula for calculated fields
    @Formula("(SELECT COUNT(*) FROM user_logins ul WHERE ul.user_id = id)")
    private Long loginCount;
}

@Repository
public class OptimizedUserRepository {

    @PersistenceContext
    private EntityManager entityManager;

    // Use entity graphs to prevent N+1 queries
    public List<User> findUsersWithDepartments() {
        return entityManager.createQuery(
                "SELECT u FROM User u", User.class)
                .setHint("javax.persistence.fetchgraph",
                        entityManager.getEntityGraph("User.summary"))
                .getResultList();
    }

    // Use pagination with total count optimization
    public Page<User> findUsersOptimized(Pageable pageable) {
        // First, get the total count (if needed)
        Long total = null;
        if (pageable.isPaged()) {
            total = entityManager.createQuery(
                    "SELECT COUNT(u) FROM User u", Long.class)
                    .getSingleResult();
        }

        // Then get the actual data
        List<User> users = entityManager.createQuery(
                "SELECT u FROM User u ORDER BY u.id", User.class)
                .setFirstResult((int) pageable.getOffset())
                .setMaxResults(pageable.getPageSize())
                .setHint("javax.persistence.fetchgraph",
                        entityManager.getEntityGraph("User.summary"))
                .getResultList();

        return total != null ?
                new PageImpl<>(users, pageable, total) :
                new PageImpl<>(users);
    }

    // Use native queries for complex operations
    @Query(value = """
        SELECT u.* FROM users u
        JOIN departments d ON u.department_id = d.id
        WHERE d.active = true
        AND u.created_at >= :since
        ORDER BY u.created_at DESC
        """, nativeQuery = true)
    List<User> findRecentActiveUsers(@Param("since") LocalDateTime since);

    // Batch operations for better performance
    @Modifying
    @Query("UPDATE User u SET u.lastLoginAt = :loginTime WHERE u.id IN :userIds")
    void updateLastLoginTimes(@Param("userIds") List<Long> userIds,
                             @Param("loginTime") LocalDateTime loginTime);
}
```

### 2. Connection Pool Monitoring

```java
@Component
public class DatabasePerformanceMonitor {

    private final MeterRegistry meterRegistry;
    private final DataSource dataSource;

    @EventListener
    @Async
    public void handleSlowQuery(SlowQueryEvent event) {
        if (event.getExecutionTime() > 1000) {
            log.warn("Slow query detected: {} took {}ms",
                    event.getSql(), event.getExecutionTime());

            // Record metric
            Timer.Sample sample = Timer.start(meterRegistry);
            sample.stop(Timer.builder("database.query.slow")
                    .tag("query.type", event.getQueryType())
                    .register(meterRegistry));
        }
    }

    @Scheduled(fixedDelay = 30000)
    public void monitorConnectionPool() {
        if (dataSource instanceof HikariDataSource) {
            HikariDataSource hikariDS = (HikariDataSource) dataSource;
            HikariPoolMXBean poolBean = hikariDS.getHikariPoolMXBean();

            // Record connection pool metrics
            Gauge.builder("database.connections.active")
                    .register(meterRegistry, poolBean, HikariPoolMXBean::getActiveConnections);

            Gauge.builder("database.connections.idle")
                    .register(meterRegistry, poolBean, HikariPoolMXBean::getIdleConnections);

            Gauge.builder("database.connections.total")
                    .register(meterRegistry, poolBean, HikariPoolMXBean::getTotalConnections);

            // Log if pool utilization is high
            int activeConnections = poolBean.getActiveConnections();
            int totalConnections = poolBean.getTotalConnections();
            double utilization = (double) activeConnections / totalConnections;

            if (utilization > 0.8) {
                log.warn("High connection pool utilization: {}% ({}/{})",
                        Math.round(utilization * 100), activeConnections, totalConnections);
            }
        }
    }
}
```

## Profiling and Monitoring

### 1. Application Profiling

```java
@Component
@Profile("profiling")
public class PerformanceProfiler {

    private final MeterRegistry meterRegistry;
    private final List<Timer.Sample> activeSamples = new CopyOnWriteArrayList<>();

    @EventListener
    public void onMethodEntry(MethodEntryEvent event) {
        Timer.Sample sample = Timer.start(meterRegistry);
        sample.tags("class", event.getClassName(), "method", event.getMethodName());
        activeSamples.add(sample);

        // Store in thread local for method exit
        ThreadLocalProfiler.setSample(sample);
    }

    @EventListener
    public void onMethodExit(MethodExitEvent event) {
        Timer.Sample sample = ThreadLocalProfiler.getSample();
        if (sample != null) {
            sample.stop(Timer.builder("method.execution.time")
                    .tag("class", event.getClassName())
                    .tag("method", event.getMethodName())
                    .tag("success", String.valueOf(event.isSuccess()))
                    .register(meterRegistry));

            activeSamples.remove(sample);
            ThreadLocalProfiler.clear();
        }
    }

    // Custom profiling annotations
    @Target(ElementType.METHOD)
    @Retention(RetentionPolicy.RUNTIME)
    public @interface Profile {
        String value() default "";
        boolean logSlowExecution() default true;
        long slowThresholdMs() default 1000;
    }

    @Around("@annotation(profile)")
    public Object profileMethod(ProceedingJoinPoint joinPoint, Profile profile) throws Throwable {
        String methodName = joinPoint.getSignature().getName();
        String className = joinPoint.getTarget().getClass().getSimpleName();

        Timer.Sample sample = Timer.start(meterRegistry);

        try {
            Object result = joinPoint.proceed();

            sample.stop(Timer.builder("profiled.method.execution")
                    .tag("class", className)
                    .tag("method", methodName)
                    .tag("profile", profile.value())
                    .register(meterRegistry));

            return result;
        } catch (Exception e) {
            sample.stop(Timer.builder("profiled.method.execution")
                    .tag("class", className)
                    .tag("method", methodName)
                    .tag("profile", profile.value())
                    .tag("error", e.getClass().getSimpleName())
                    .register(meterRegistry));
            throw e;
        }
    }
}
```

### 2. Memory Profiling

```java
@Component
public class MemoryProfiler {

    private final MemoryMXBean memoryMXBean;
    private final MeterRegistry meterRegistry;

    public MemoryProfiler(MeterRegistry meterRegistry) {
        this.memoryMXBean = ManagementFactory.getMemoryMXBean();
        this.meterRegistry = meterRegistry;

        // Register memory gauges
        registerMemoryGauges();
    }

    private void registerMemoryGauges() {
        Gauge.builder("jvm.memory.heap.used")
                .register(meterRegistry, this, m -> m.memoryMXBean.getHeapMemoryUsage().getUsed());

        Gauge.builder("jvm.memory.heap.max")
                .register(meterRegistry, this, m -> m.memoryMXBean.getHeapMemoryUsage().getMax());

        Gauge.builder("jvm.memory.nonheap.used")
                .register(meterRegistry, this, m -> m.memoryMXBean.getNonHeapMemoryUsage().getUsed());
    }

    @Scheduled(fixedDelay = 60000)
    public void checkMemoryLeaks() {
        MemoryUsage heapUsage = memoryMXBean.getHeapMemoryUsage();
        long usedMemory = heapUsage.getUsed();
        long maxMemory = heapUsage.getMax();
        double usagePercentage = (double) usedMemory / maxMemory * 100;

        if (usagePercentage > 85) {
            log.warn("High memory usage detected: {}% ({} MB / {} MB)",
                    Math.round(usagePercentage),
                    usedMemory / 1024 / 1024,
                    maxMemory / 1024 / 1024);

            // Trigger memory analysis
            analyzeMemoryUsage();
        }
    }

    private void analyzeMemoryUsage() {
        // Capture memory snapshot
        List<MemoryPoolMXBean> memoryPools = ManagementFactory.getMemoryPoolMXBeans();

        memoryPools.forEach(pool -> {
            MemoryUsage usage = pool.getUsage();
            log.info("Memory Pool {}: Used={}MB, Max={}MB, Usage={}%",
                    pool.getName(),
                    usage.getUsed() / 1024 / 1024,
                    usage.getMax() / 1024 / 1024,
                    (usage.getUsed() * 100.0) / usage.getMax());
        });

        // Suggest GC if needed
        if (shouldSuggestGC()) {
            log.info("Suggesting garbage collection due to high memory usage");
            System.gc(); // Note: Use sparingly in production
        }
    }

    private boolean shouldSuggestGC() {
        MemoryUsage heapUsage = memoryMXBean.getHeapMemoryUsage();
        return (double) heapUsage.getUsed() / heapUsage.getMax() > 0.9;
    }
}
```

## Performance Testing

### 1. Microbenchmarks with JMH

```java
@BenchmarkMode(Mode.AverageTime)
@OutputTimeUnit(TimeUnit.MICROSECONDS)
@State(Scope.Benchmark)
@Fork(value = 2, jvmArgs = {"-Xms4G", "-Xmx4G"})
@Warmup(iterations = 5, time = 1, timeUnit = TimeUnit.SECONDS)
@Measurement(iterations = 5, time = 1, timeUnit = TimeUnit.SECONDS)
public class UserServiceBenchmark {

    @Param({"100", "1000", "10000"})
    private int userCount;

    private UserService userService;
    private List<CreateUserRequest> requests;

    @Setup
    public void setup() {
        // Initialize service with mocked dependencies
        UserRepository mockRepository = Mockito.mock(UserRepository.class);
        userService = new UserService(mockRepository);

        // Generate test data
        requests = IntStream.range(0, userCount)
                .mapToObj(i -> CreateUserRequest.builder()
                        .email("user" + i + "@example.com")
                        .firstName("User" + i)
                        .lastName("Test")
                        .build())
                .collect(Collectors.toList());

        // Configure mock responses
        when(mockRepository.save(any(User.class))).thenAnswer(invocation -> {
            User user = invocation.getArgument(0);
            user.setId((long) (Math.random() * 1000000));
            return user;
        });
    }

    @Benchmark
    public List<User> benchmarkBatchUserCreation() {
        return requests.stream()
                .map(userService::createUser)
                .collect(Collectors.toList());
    }

    @Benchmark
    @Group("concurrent")
    @GroupThreads(4)
    public User benchmarkConcurrentUserCreation() {
        CreateUserRequest request = requests.get(
                ThreadLocalRandom.current().nextInt(requests.size()));
        return userService.createUser(request);
    }

    @Benchmark
    public User benchmarkSingleUserCreation() {
        return userService.createUser(requests.get(0));
    }
}
```

### 2. Load Testing Infrastructure

```java
@Component
public class LoadTestManager {

    private final ExecutorService executorService;
    private final UserService userService;
    private final MeterRegistry meterRegistry;

    public LoadTestManager(UserService userService, MeterRegistry meterRegistry) {
        this.userService = userService;
        this.meterRegistry = meterRegistry;
        this.executorService = Executors.newFixedThreadPool(50);
    }

    public LoadTestResult runLoadTest(LoadTestConfig config) {
        List<CompletableFuture<TestResult>> futures = new ArrayList<>();
        CountDownLatch startLatch = new CountDownLatch(1);

        // Create concurrent test tasks
        for (int i = 0; i < config.getConcurrentUsers(); i++) {
            CompletableFuture<TestResult> future = CompletableFuture.supplyAsync(() -> {
                try {
                    startLatch.await(); // Wait for all threads to be ready
                    return executeUserScenario(config.getScenario());
                } catch (Exception e) {
                    return TestResult.error(e.getMessage());
                }
            }, executorService);

            futures.add(future);
        }

        // Start all threads simultaneously
        startLatch.countDown();

        // Wait for completion and collect results
        List<TestResult> results = futures.stream()
                .map(CompletableFuture::join)
                .collect(Collectors.toList());

        return LoadTestResult.builder()
                .totalRequests(results.size())
                .successfulRequests(results.stream().mapToInt(r -> r.isSuccess() ? 1 : 0).sum())
                .averageResponseTime(results.stream().mapToLong(TestResult::getResponseTime).average().orElse(0))
                .maxResponseTime(results.stream().mapToLong(TestResult::getResponseTime).max().orElse(0))
                .minResponseTime(results.stream().mapToLong(TestResult::getResponseTime).min().orElse(0))
                .errors(results.stream().filter(r -> !r.isSuccess()).collect(Collectors.toList()))
                .build();
    }

    private TestResult executeUserScenario(TestScenario scenario) {
        Timer.Sample sample = Timer.start(meterRegistry);

        try {
            switch (scenario.getType()) {
                case USER_CREATION:
                    return executeUserCreationScenario();
                case USER_RETRIEVAL:
                    return executeUserRetrievalScenario();
                case USER_UPDATE:
                    return executeUserUpdateScenario();
                default:
                    throw new IllegalArgumentException("Unknown scenario type: " + scenario.getType());
            }
        } finally {
            sample.stop(Timer.builder("load.test.scenario")
                    .tag("scenario", scenario.getType().name())
                    .register(meterRegistry));
        }
    }

    private TestResult executeUserCreationScenario() {
        long start = System.currentTimeMillis();

        try {
            CreateUserRequest request = CreateUserRequest.builder()
                    .email("loadtest" + System.nanoTime() + "@example.com")
                    .firstName("Load")
                    .lastName("Test")
                    .build();

            User created = userService.createUser(request);
            long responseTime = System.currentTimeMillis() - start;

            return TestResult.success(responseTime, created.getId().toString());
        } catch (Exception e) {
            long responseTime = System.currentTimeMillis() - start;
            return TestResult.error(responseTime, e.getMessage());
        }
    }
}
```

## Claude Flow Integration for Performance

### 1. Performance Analysis with Agents

```bash
# Analyze application performance
npx claude-flow sparc run perf-analyzer "Analyze Java application performance bottlenecks and memory leaks"

# Optimize database performance
npx claude-flow sparc run perf-analyzer "Optimize JPA queries and database connection pool settings"

# JVM tuning
npx claude-flow sparc batch perf-analyzer,coder "Tune JVM parameters for high-throughput application"

# Generate performance tests
npx claude-flow sparc run tester "Create comprehensive performance test suite with JMH and load testing"
```

### 2. MCP Integration for Performance Optimization

```bash
# Initialize performance optimization swarm
npx claude-flow mcp swarm_init --topology star --max-agents 6

# Spawn performance specialists
npx claude-flow mcp agent_spawn --type perf-analyzer --capabilities "jvm-tuning,memory-optimization"
npx claude-flow mcp agent_spawn --type perf-analyzer --capabilities "database-optimization,query-tuning"
npx claude-flow mcp agent_spawn --type coder --capabilities "caching,async-processing"
npx claude-flow mcp agent_spawn --type tester --capabilities "performance-testing,load-testing"
npx claude-flow mcp agent_spawn --type monitor --capabilities "apm,metrics,profiling"

# Orchestrate performance optimization
npx claude-flow mcp task_orchestrate --task "Optimize Java application performance" --strategy parallel
```

## Production Performance Monitoring

### 1. APM Integration

```java
@Configuration
public class APMConfiguration {

    @Bean
    public MeterRegistry meterRegistry() {
        return new PrometheusMeterRegistry(PrometheusConfig.DEFAULT);
    }

    @Bean
    public TimedAspect timedAspect(MeterRegistry meterRegistry) {
        return new TimedAspect(meterRegistry);
    }

    @Bean
    public CountedAspect countedAspect(MeterRegistry meterRegistry) {
        return new CountedAspect(meterRegistry);
    }
}

@RestController
@Timed(name = "user.controller", description = "User controller response time")
public class UserController {

    @GetMapping("/users/{id}")
    @Timed(name = "user.get.by.id", description = "Get user by ID response time")
    @Counted(name = "user.get.requests", description = "Number of get user requests")
    public ResponseEntity<User> getUser(@PathVariable Long id) {
        return userService.findById(id)
                .map(user -> ResponseEntity.ok(user))
                .orElse(ResponseEntity.notFound().build());
    }

    @PostMapping("/users")
    @Timed(name = "user.create", description = "Create user response time")
    @Counted(name = "user.create.requests", description = "Number of create user requests")
    public ResponseEntity<User> createUser(@RequestBody CreateUserRequest request) {
        User created = userService.createUser(request);
        return ResponseEntity.status(HttpStatus.CREATED).body(created);
    }
}
```

### 2. Custom Metrics and Alerts

```java
@Component
public class PerformanceMetrics {

    private final Counter requestCounter;
    private final Timer responseTimer;
    private final Gauge activeSessionsGauge;
    private final DistributionSummary requestSizeSummary;

    public PerformanceMetrics(MeterRegistry meterRegistry, SessionRegistry sessionRegistry) {
        this.requestCounter = Counter.builder("http.requests.total")
                .description("Total HTTP requests")
                .register(meterRegistry);

        this.responseTimer = Timer.builder("http.request.duration")
                .description("HTTP request duration")
                .register(meterRegistry);

        this.activeSessionsGauge = Gauge.builder("sessions.active")
                .description("Active user sessions")
                .register(meterRegistry, sessionRegistry, SessionRegistry::getActiveCount);

        this.requestSizeSummary = DistributionSummary.builder("http.request.size")
                .description("HTTP request size distribution")
                .register(meterRegistry);
    }

    @EventListener
    public void handleHttpRequest(HttpRequestEvent event) {
        requestCounter.increment(
                Tags.of(
                        Tag.of("method", event.getMethod()),
                        Tag.of("status", String.valueOf(event.getStatus())),
                        Tag.of("uri", event.getUri())
                )
        );

        responseTimer.record(event.getDuration(), TimeUnit.MILLISECONDS);
        requestSizeSummary.record(event.getRequestSize());

        // Alert on slow requests
        if (event.getDuration() > 5000) {
            alertService.sendAlert("Slow request detected: " + event.getUri() +
                    " took " + event.getDuration() + "ms");
        }
    }

    // Custom performance alerts
    @Scheduled(fixedDelay = 60000)
    public void checkPerformanceThresholds() {
        double errorRate = getErrorRate();
        double avgResponseTime = getAverageResponseTime();
        double cpuUsage = getCpuUsage();
        double memoryUsage = getMemoryUsage();

        if (errorRate > 0.05) { // 5% error rate
            alertService.sendAlert("High error rate detected: " + (errorRate * 100) + "%");
        }

        if (avgResponseTime > 2000) { // 2 second average response time
            alertService.sendAlert("High average response time: " + avgResponseTime + "ms");
        }

        if (cpuUsage > 0.8) { // 80% CPU usage
            alertService.sendAlert("High CPU usage: " + (cpuUsage * 100) + "%");
        }

        if (memoryUsage > 0.85) { // 85% memory usage
            alertService.sendAlert("High memory usage: " + (memoryUsage * 100) + "%");
        }
    }
}
```

## Performance Best Practices

### 1. Code Optimization Patterns

```java
// Use StringBuilder for string concatenation
public class OptimizedStringBuilder {

    // Bad: Creates multiple string objects
    public String buildUserInfo(User user) {
        return "User: " + user.getFirstName() + " " + user.getLastName() +
               " (" + user.getEmail() + ")";
    }

    // Good: Uses StringBuilder
    public String buildUserInfoOptimized(User user) {
        return new StringBuilder()
                .append("User: ")
                .append(user.getFirstName())
                .append(" ")
                .append(user.getLastName())
                .append(" (")
                .append(user.getEmail())
                .append(")")
                .toString();
    }
}

// Use streams efficiently
public class OptimizedStreams {

    // Parallel streams for CPU-intensive operations
    public List<UserDto> processUsersParallel(List<User> users) {
        return users.parallelStream()
                .filter(User::isActive)
                .map(this::processUser)
                .collect(Collectors.toList());
    }

    // Use primitive streams when possible
    public OptionalDouble getAverageAge(List<User> users) {
        return users.stream()
                .mapToInt(User::getAge)
                .average();
    }

    // Short-circuit operations
    public boolean hasActiveAdminUser(List<User> users) {
        return users.stream()
                .filter(User::isActive)
                .anyMatch(user -> user.getRoles().contains(Role.ADMIN));
    }
}

// Lazy initialization patterns
public class LazyInitialization {

    private volatile ExpensiveObject expensiveObject;

    // Double-checked locking
    public ExpensiveObject getExpensiveObject() {
        if (expensiveObject == null) {
            synchronized (this) {
                if (expensiveObject == null) {
                    expensiveObject = new ExpensiveObject();
                }
            }
        }
        return expensiveObject;
    }

    // Initialization-on-demand holder pattern
    private static class ExpensiveObjectHolder {
        private static final ExpensiveObject INSTANCE = new ExpensiveObject();
    }

    public static ExpensiveObject getInstance() {
        return ExpensiveObjectHolder.INSTANCE;
    }
}
```

### 2. Memory Management Best Practices

```java
// Object pooling for expensive objects
@Component
public class ObjectPoolManager {

    private final GenericObjectPool<ExpensiveObject> objectPool;

    public ObjectPoolManager() {
        GenericObjectPoolConfig<ExpensiveObject> config = new GenericObjectPoolConfig<>();
        config.setMaxTotal(50);
        config.setMaxIdle(10);
        config.setMinIdle(5);
        config.setTestOnBorrow(true);
        config.setTestOnReturn(true);

        this.objectPool = new GenericObjectPool<>(new ExpensiveObjectFactory(), config);
    }

    public ExpensiveObject borrowObject() throws Exception {
        return objectPool.borrowObject();
    }

    public void returnObject(ExpensiveObject obj) {
        objectPool.returnObject(obj);
    }

    @PreDestroy
    public void destroy() {
        objectPool.close();
    }
}

// WeakReference for caches
public class WeakReferenceCache<K, V> {

    private final Map<K, WeakReference<V>> cache = new ConcurrentHashMap<>();

    public V get(K key) {
        WeakReference<V> ref = cache.get(key);
        if (ref != null) {
            V value = ref.get();
            if (value == null) {
                cache.remove(key); // Clean up garbage collected entries
            }
            return value;
        }
        return null;
    }

    public void put(K key, V value) {
        cache.put(key, new WeakReference<>(value));
    }

    @Scheduled(fixedDelay = 300000) // Clean up every 5 minutes
    public void cleanUp() {
        cache.entrySet().removeIf(entry -> entry.getValue().get() == null);
    }
}
```

## Next Steps

- [Microservices Development](microservices.md)
- [Claude Flow Agent Coordination](claude-flow-integration.md)
- [Spring Boot Development](spring-boot.md)
- [Enterprise Java Development](enterprise-java.md)
- [Testing Strategies](testing.md)