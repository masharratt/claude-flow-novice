# Claude Flow Agent Coordination for Java Enterprise Development

This comprehensive guide covers integrating Claude Flow's AI agent orchestration system with Java enterprise development workflows, including automated code generation, testing, deployment, and continuous improvement processes.

## Quick Start

### Basic Claude Flow Setup for Java

```bash
# Install Claude Flow
npm install -g claude-flow@alpha

# Initialize Java project with agents
npx claude-flow sparc run architect "Design enterprise Java application with Spring Boot"

# Generate comprehensive code
npx claude-flow sparc batch coder,tester,reviewer "Build Java microservices with tests"
```

### MCP Integration

```bash
# Add Claude Flow MCP server
claude mcp add claude-flow npx claude-flow@alpha mcp start

# Initialize development swarm
npx claude-flow mcp swarm_init --topology mesh --max-agents 8
```

## Java Development Agents

### 1. Core Development Agents

```bash
# Backend Development Agent
npx claude-flow sparc run backend-dev "Create Spring Boot REST API with JPA"

# Database Architect Agent
npx claude-flow sparc run code-analyzer "Design PostgreSQL schema with JPA entities"

# Testing Engineer Agent
npx claude-flow sparc run tester "Generate comprehensive test suite with 90% coverage"

# Performance Analyst Agent
npx claude-flow sparc run perf-analyzer "Optimize JVM settings and database queries"

# Security Reviewer Agent
npx claude-flow sparc run reviewer "Implement security best practices and audit code"
```

### 2. Enterprise Specialists

```bash
# Enterprise Architect
npx claude-flow sparc run system-architect "Design microservices architecture with Spring Cloud"

# API Documentation Agent
npx claude-flow sparc run api-docs "Generate OpenAPI documentation with examples"

# DevOps Engineer
npx claude-flow sparc run cicd-engineer "Create CI/CD pipeline with Docker and Kubernetes"

# Migration Planner
npx claude-flow sparc run migration-planner "Plan migration from monolith to microservices"
```

## Automated Code Generation

### 1. Spring Boot Application Generation

```java
// Agent-generated Spring Boot application structure
@SpringBootApplication
@EnableJpaRepositories
@EnableEurekaClient
@EnableConfigServer
public class UserServiceApplication {

    public static void main(String[] args) {
        SpringApplication.run(UserServiceApplication.class, args);
    }

    @Bean
    @LoadBalanced
    public RestTemplate restTemplate() {
        return new RestTemplate();
    }

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }
}

// Generated with Claude Flow command:
// npx claude-flow sparc run coder "Create Spring Boot application with security, JPA, and Eureka client"
```

### 2. Entity and Repository Generation

```java
// Auto-generated JPA entities
@Entity
@Table(name = "users", indexes = {
    @Index(name = "idx_user_email", columnList = "email"),
    @Index(name = "idx_user_active", columnList = "active, createdAt")
})
@EntityListeners(AuditingEntityListener.class)
public class User {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, length = 255)
    @Email
    @NotBlank
    private String email;

    @Column(nullable = false, length = 100)
    @NotBlank
    @Size(min = 2, max = 100)
    private String firstName;

    @Column(nullable = false, length = 100)
    @NotBlank
    @Size(min = 2, max = 100)
    private String lastName;

    @Column(nullable = false)
    private Boolean active = true;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "department_id")
    private Department department;

    @OneToMany(mappedBy = "user", cascade = CascadeType.ALL, orphanRemoval = true)
    @BatchSize(size = 20)
    private List<UserRole> roles = new ArrayList<>();

    @CreatedDate
    @Column(nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @LastModifiedDate
    @Column(nullable = false)
    private LocalDateTime updatedAt;

    @Version
    private Long version;

    // Constructors, getters, setters, equals, hashCode
}

// Auto-generated repository with custom queries
@Repository
public interface UserRepository extends JpaRepository<User, Long>, JpaSpecificationExecutor<User> {

    @EntityGraph(attributePaths = {"department", "roles"})
    Optional<User> findByEmail(String email);

    @Query("SELECT u FROM User u WHERE u.active = true AND u.createdAt >= :since ORDER BY u.createdAt DESC")
    List<User> findRecentActiveUsers(@Param("since") LocalDateTime since);

    @Modifying
    @Query("UPDATE User u SET u.active = false WHERE u.lastLoginAt < :cutoffDate")
    int deactivateInactiveUsers(@Param("cutoffDate") LocalDateTime cutoffDate);

    Page<User> findByDepartmentIdAndActiveTrue(Long departmentId, Pageable pageable);

    @Query(value = "SELECT * FROM users u WHERE u.email ILIKE %:searchTerm% OR u.first_name ILIKE %:searchTerm% OR u.last_name ILIKE %:searchTerm%", nativeQuery = true)
    List<User> searchUsers(@Param("searchTerm") String searchTerm);
}

// Generated with:
// npx claude-flow sparc run coder "Create User entity with JPA annotations and repository with custom queries"
```

### 3. Service Layer Generation

```java
// Auto-generated service with best practices
@Service
@Transactional
@Validated
public class UserService {

    private final UserRepository userRepository;
    private final UserMapper userMapper;
    private final ApplicationEventPublisher eventPublisher;
    private final PasswordEncoder passwordEncoder;

    public UserService(UserRepository userRepository,
                      UserMapper userMapper,
                      ApplicationEventPublisher eventPublisher,
                      PasswordEncoder passwordEncoder) {
        this.userRepository = userRepository;
        this.userMapper = userMapper;
        this.eventPublisher = eventPublisher;
        this.passwordEncoder = passwordEncoder;
    }

    @Transactional(readOnly = true)
    @Cacheable(value = "users", key = "#id")
    public Optional<UserDto> findById(@NotNull Long id) {
        return userRepository.findById(id)
                .map(userMapper::toDto);
    }

    @Transactional(readOnly = true)
    public Page<UserDto> findAll(@NotNull Pageable pageable) {
        return userRepository.findAll(pageable)
                .map(userMapper::toDto);
    }

    @Transactional(readOnly = true)
    public Optional<UserDto> findByEmail(@NotBlank @Email String email) {
        return userRepository.findByEmail(email)
                .map(userMapper::toDto);
    }

    @CacheEvict(value = "users", key = "#result.id")
    @Retryable(value = {DataAccessException.class}, maxAttempts = 3)
    public UserDto createUser(@Valid CreateUserRequest request) {
        validateUniqueEmail(request.getEmail());

        User user = userMapper.toEntity(request);
        if (request.getPassword() != null) {
            user.setPassword(passwordEncoder.encode(request.getPassword()));
        }

        User savedUser = userRepository.save(user);

        // Publish domain event
        eventPublisher.publishEvent(new UserCreatedEvent(savedUser.getId(), savedUser.getEmail()));

        return userMapper.toDto(savedUser);
    }

    @CachePut(value = "users", key = "#id")
    public Optional<UserDto> updateUser(@NotNull Long id, @Valid UpdateUserRequest request) {
        return userRepository.findById(id)
                .map(user -> {
                    userMapper.updateEntity(request, user);
                    User savedUser = userRepository.save(user);

                    eventPublisher.publishEvent(new UserUpdatedEvent(savedUser.getId()));

                    return userMapper.toDto(savedUser);
                });
    }

    @CacheEvict(value = "users", key = "#id")
    public void deleteById(@NotNull Long id) {
        userRepository.findById(id)
                .ifPresent(user -> {
                    userRepository.delete(user);
                    eventPublisher.publishEvent(new UserDeletedEvent(id));
                });
    }

    private void validateUniqueEmail(String email) {
        if (userRepository.findByEmail(email).isPresent()) {
            throw new EmailAlreadyExistsException("Email already exists: " + email);
        }
    }

    @Async
    @EventListener
    public void handleUserCreated(UserCreatedEvent event) {
        // Async processing after user creation
        log.info("Processing user created event for user: {}", event.getUserId());
    }
}

// Generated with:
// npx claude-flow sparc run coder "Create UserService with transactions, caching, validation, and event publishing"
```

## Test Generation and Automation

### 1. Comprehensive Test Suite Generation

```java
// Auto-generated unit tests
@ExtendWith(MockitoExtension.class)
@DisplayName("User Service Unit Tests")
class UserServiceTest {

    @Mock private UserRepository userRepository;
    @Mock private UserMapper userMapper;
    @Mock private ApplicationEventPublisher eventPublisher;
    @Mock private PasswordEncoder passwordEncoder;

    @InjectMocks private UserService userService;

    @Nested
    @DisplayName("User Creation Tests")
    class UserCreationTests {

        @Test
        @DisplayName("Should create user successfully with valid data")
        void shouldCreateUserSuccessfully() {
            // Given
            CreateUserRequest request = CreateUserRequest.builder()
                    .email("john.doe@example.com")
                    .firstName("John")
                    .lastName("Doe")
                    .password("securePassword123")
                    .build();

            User user = new User();
            User savedUser = new User();
            savedUser.setId(1L);
            savedUser.setEmail("john.doe@example.com");

            UserDto expectedDto = UserDto.builder()
                    .id(1L)
                    .email("john.doe@example.com")
                    .firstName("John")
                    .lastName("Doe")
                    .build();

            when(userRepository.findByEmail(request.getEmail())).thenReturn(Optional.empty());
            when(userMapper.toEntity(request)).thenReturn(user);
            when(passwordEncoder.encode(request.getPassword())).thenReturn("encodedPassword");
            when(userRepository.save(user)).thenReturn(savedUser);
            when(userMapper.toDto(savedUser)).thenReturn(expectedDto);

            // When
            UserDto result = userService.createUser(request);

            // Then
            assertThat(result).isNotNull();
            assertThat(result.getId()).isEqualTo(1L);
            assertThat(result.getEmail()).isEqualTo("john.doe@example.com");

            verify(userRepository).save(user);
            verify(eventPublisher).publishEvent(any(UserCreatedEvent.class));
        }

        @Test
        @DisplayName("Should throw exception when email already exists")
        void shouldThrowExceptionWhenEmailExists() {
            // Given
            CreateUserRequest request = CreateUserRequest.builder()
                    .email("existing@example.com")
                    .firstName("John")
                    .lastName("Doe")
                    .build();

            User existingUser = new User();
            when(userRepository.findByEmail("existing@example.com")).thenReturn(Optional.of(existingUser));

            // When & Then
            assertThatThrownBy(() -> userService.createUser(request))
                    .isInstanceOf(EmailAlreadyExistsException.class)
                    .hasMessage("Email already exists: existing@example.com");

            verify(userRepository, never()).save(any(User.class));
            verify(eventPublisher, never()).publishEvent(any());
        }
    }

    @Nested
    @DisplayName("User Retrieval Tests")
    class UserRetrievalTests {

        @Test
        @DisplayName("Should find user by ID")
        void shouldFindUserById() {
            // Given
            Long userId = 1L;
            User user = createTestUser(userId, "test@example.com");
            UserDto expectedDto = createTestUserDto(userId, "test@example.com");

            when(userRepository.findById(userId)).thenReturn(Optional.of(user));
            when(userMapper.toDto(user)).thenReturn(expectedDto);

            // When
            Optional<UserDto> result = userService.findById(userId);

            // Then
            assertThat(result).isPresent();
            assertThat(result.get().getId()).isEqualTo(userId);
            assertThat(result.get().getEmail()).isEqualTo("test@example.com");
        }

        @Test
        @DisplayName("Should return empty when user not found")
        void shouldReturnEmptyWhenUserNotFound() {
            // Given
            Long userId = 999L;
            when(userRepository.findById(userId)).thenReturn(Optional.empty());

            // When
            Optional<UserDto> result = userService.findById(userId);

            // Then
            assertThat(result).isEmpty();
        }
    }

    // Helper methods
    private User createTestUser(Long id, String email) {
        User user = new User();
        user.setId(id);
        user.setEmail(email);
        user.setFirstName("Test");
        user.setLastName("User");
        return user;
    }

    private UserDto createTestUserDto(Long id, String email) {
        return UserDto.builder()
                .id(id)
                .email(email)
                .firstName("Test")
                .lastName("User")
                .build();
    }
}

// Generated with:
// npx claude-flow sparc run tester "Generate comprehensive unit tests for UserService with 90% coverage"
```

### 2. Integration Test Generation

```java
// Auto-generated integration tests
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Testcontainers
@TestPropertySource(locations = "classpath:application-integration-test.properties")
class UserServiceIntegrationTest {

    @Container
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:15")
            .withDatabaseName("testdb")
            .withUsername("test")
            .withPassword("test");

    @Container
    static RedisContainer redis = new RedisContainer("redis:7-alpine");

    @Autowired private TestRestTemplate restTemplate;
    @Autowired private UserRepository userRepository;
    @Autowired private TestEntityManager entityManager;

    @DynamicPropertySource
    static void configureProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", postgres::getJdbcUrl);
        registry.add("spring.datasource.username", postgres::getUsername);
        registry.add("spring.datasource.password", postgres::getPassword);

        registry.add("spring.redis.host", redis::getHost);
        registry.add("spring.redis.port", redis::getFirstMappedPort);
    }

    @Test
    @Transactional
    @Rollback
    void shouldCreateUserEndToEnd() {
        // Given
        CreateUserRequest request = CreateUserRequest.builder()
                .email("integration@example.com")
                .firstName("Integration")
                .lastName("Test")
                .password("password123")
                .build();

        // When
        ResponseEntity<UserDto> response = restTemplate.postForEntity(
                "/api/users", request, UserDto.class);

        // Then
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        assertThat(response.getBody()).isNotNull();
        assertThat(response.getBody().getEmail()).isEqualTo("integration@example.com");

        // Verify in database
        Optional<User> user = userRepository.findByEmail("integration@example.com");
        assertThat(user).isPresent();
        assertThat(user.get().getFirstName()).isEqualTo("Integration");
    }

    @Test
    void shouldHandleConcurrentUserCreation() throws InterruptedException {
        // Given
        int numberOfThreads = 10;
        ExecutorService executor = Executors.newFixedThreadPool(numberOfThreads);
        CountDownLatch latch = new CountDownLatch(numberOfThreads);
        AtomicInteger successCount = new AtomicInteger(0);
        AtomicInteger errorCount = new AtomicInteger(0);

        // When
        for (int i = 0; i < numberOfThreads; i++) {
            final int index = i;
            executor.submit(() -> {
                try {
                    CreateUserRequest request = CreateUserRequest.builder()
                            .email("concurrent" + index + "@example.com")
                            .firstName("Concurrent")
                            .lastName("User" + index)
                            .build();

                    ResponseEntity<UserDto> response = restTemplate.postForEntity(
                            "/api/users", request, UserDto.class);

                    if (response.getStatusCode().is2xxSuccessful()) {
                        successCount.incrementAndGet();
                    } else {
                        errorCount.incrementAndGet();
                    }
                } catch (Exception e) {
                    errorCount.incrementAndGet();
                } finally {
                    latch.countDown();
                }
            });
        }

        // Then
        latch.await(30, TimeUnit.SECONDS);
        executor.shutdown();

        assertThat(successCount.get()).isEqualTo(numberOfThreads);
        assertThat(errorCount.get()).isEqualTo(0);
    }
}

// Generated with:
// npx claude-flow sparc run tester "Create integration tests with TestContainers for complete user workflow"
```

## Performance Optimization with Agents

### 1. JVM Tuning Agent

```bash
# Analyze and optimize JVM settings
npx claude-flow sparc run perf-analyzer "Analyze JVM performance and generate optimized settings for production workload"

# Generated JVM configuration
#!/bin/bash
# Auto-generated JVM settings by Claude Flow Performance Analyzer

# Heap settings for 8GB system
JAVA_OPTS="$JAVA_OPTS -Xms2g"                     # Initial heap size
JAVA_OPTS="$JAVA_OPTS -Xmx6g"                     # Maximum heap size
JAVA_OPTS="$JAVA_OPTS -XX:NewRatio=3"             # Old to young generation ratio
JAVA_OPTS="$JAVA_OPTS -XX:SurvivorRatio=8"        # Eden to survivor space ratio

# G1 Garbage Collector settings
JAVA_OPTS="$JAVA_OPTS -XX:+UseG1GC"               # Use G1 garbage collector
JAVA_OPTS="$JAVA_OPTS -XX:MaxGCPauseMillis=200"   # Target GC pause time
JAVA_OPTS="$JAVA_OPTS -XX:G1HeapRegionSize=16m"   # G1 region size
JAVA_OPTS="$JAVA_OPTS -XX:G1MixedGCCountTarget=8" # Mixed GC cycle target

# Performance optimizations
JAVA_OPTS="$JAVA_OPTS -XX:+UseStringDeduplication"     # Deduplicate strings
JAVA_OPTS="$JAVA_OPTS -XX:+UseCompressedOops"          # Compress object pointers
JAVA_OPTS="$JAVA_OPTS -XX:+UseCompressedClassPointers" # Compress class pointers

# Monitoring and debugging
JAVA_OPTS="$JAVA_OPTS -XX:+HeapDumpOnOutOfMemoryError"        # Heap dump on OOM
JAVA_OPTS="$JAVA_OPTS -XX:HeapDumpPath=/app/logs/heapdumps"   # Heap dump location
JAVA_OPTS="$JAVA_OPTS -XX:+PrintGCDetails"                    # Print GC details
JAVA_OPTS="$JAVA_OPTS -XX:+PrintGCTimeStamps"                 # Print GC timestamps
JAVA_OPTS="$JAVA_OPTS -Xloggc:/app/logs/gc.log"               # GC log location

# JIT compiler optimizations
JAVA_OPTS="$JAVA_OPTS -XX:+TieredCompilation"                 # Enable tiered compilation
JAVA_OPTS="$JAVA_OPTS -XX:TieredStopAtLevel=4"                # Use C2 compiler

export JAVA_OPTS
```

### 2. Database Performance Agent

```java
// Auto-generated database optimization configurations
@Configuration
public class DatabasePerformanceConfig {

    // Generated by Claude Flow Performance Analyzer
    @Bean
    @Primary
    @ConfigurationProperties("spring.datasource.hikari")
    public HikariConfig hikariConfig() {
        HikariConfig config = new HikariConfig();

        // Connection pool optimization for high-load application
        config.setMaximumPoolSize(50);              // Based on CPU cores and load analysis
        config.setMinimumIdle(10);                  // Minimum connections to maintain
        config.setConnectionTimeout(30000);         // 30 seconds timeout
        config.setIdleTimeout(600000);              // 10 minutes idle timeout
        config.setMaxLifetime(1800000);             // 30 minutes max lifetime
        config.setLeakDetectionThreshold(60000);    // 1 minute leak detection

        // Performance optimizations
        config.setCachePrepStmts(true);              // Cache prepared statements
        config.setPrepStmtCacheSize(500);            // Cache size for prepared statements
        config.setPrepStmtCacheSqlLimit(2048);       // SQL limit for cached statements
        config.setUseServerPrepStmts(true);          // Use server-side prepared statements

        // Connection validation
        config.setConnectionTestQuery("SELECT 1");
        config.setValidationTimeout(5000);

        return config;
    }

    // JPA performance optimizations
    @Bean
    public LocalContainerEntityManagerFactoryBean entityManagerFactory(DataSource dataSource) {
        LocalContainerEntityManagerFactoryBean em = new LocalContainerEntityManagerFactoryBean();
        em.setDataSource(dataSource);
        em.setPackagesToScan("com.example.entity");

        HibernateJpaVendorAdapter vendorAdapter = new HibernateJpaVendorAdapter();
        em.setJpaVendorAdapter(vendorAdapter);

        Properties properties = new Properties();

        // Performance optimizations generated by agent analysis
        properties.setProperty("hibernate.jdbc.batch_size", "50");
        properties.setProperty("hibernate.order_inserts", "true");
        properties.setProperty("hibernate.order_updates", "true");
        properties.setProperty("hibernate.jdbc.batch_versioned_data", "true");
        properties.setProperty("hibernate.cache.use_second_level_cache", "true");
        properties.setProperty("hibernate.cache.use_query_cache", "true");
        properties.setProperty("hibernate.cache.region.factory_class",
                              "org.hibernate.cache.redis.RedisRegionFactory");

        em.setJpaProperties(properties);
        return em;
    }
}

// Generated with:
// npx claude-flow sparc run perf-analyzer "Optimize database connection pool and JPA settings for high-throughput application"
```

## CI/CD Pipeline Generation

### 1. GitHub Actions Workflow

```yaml
# Auto-generated CI/CD pipeline by Claude Flow
name: Java Enterprise CI/CD Pipeline

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main ]

env:
  REGISTRY: ghcr.io
  IMAGE_NAME: ${{ github.repository }}

jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: testdb
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
        ports:
          - 5432:5432

      redis:
        image: redis:7-alpine
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
        ports:
          - 6379:6379

    strategy:
      matrix:
        java-version: [17, 21]

    steps:
    - uses: actions/checkout@v4

    - name: Set up JDK ${{ matrix.java-version }}
      uses: actions/setup-java@v4
      with:
        java-version: ${{ matrix.java-version }}
        distribution: 'temurin'

    - name: Cache Maven dependencies
      uses: actions/cache@v3
      with:
        path: ~/.m2
        key: ${{ runner.os }}-m2-${{ hashFiles('**/pom.xml') }}
        restore-keys: ${{ runner.os }}-m2

    - name: Run tests
      run: ./mvnw clean test
      env:
        SPRING_PROFILES_ACTIVE: test
        DATABASE_URL: jdbc:postgresql://localhost:5432/testdb
        DATABASE_USERNAME: postgres
        DATABASE_PASSWORD: postgres
        REDIS_HOST: localhost
        REDIS_PORT: 6379

    - name: Run integration tests
      run: ./mvnw test -Dtest=**/*IntegrationTest

    - name: Generate test report
      uses: dorny/test-reporter@v1
      if: success() || failure()
      with:
        name: Maven Tests
        path: target/surefire-reports/*.xml
        reporter: java-junit

    - name: Code coverage
      run: ./mvnw jacoco:report

    - name: Upload coverage to Codecov
      uses: codecov/codecov-action@v3
      with:
        file: ./target/site/jacoco/jacoco.xml

  build:
    needs: test
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v4

    - name: Set up JDK 17
      uses: actions/setup-java@v4
      with:
        java-version: '17'
        distribution: 'temurin'

    - name: Build application
      run: ./mvnw clean package -DskipTests

    - name: Build Docker image
      run: docker build -t ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:${{ github.sha }} .

    - name: Log in to Container Registry
      uses: docker/login-action@v3
      with:
        registry: ${{ env.REGISTRY }}
        username: ${{ github.actor }}
        password: ${{ secrets.GITHUB_TOKEN }}

    - name: Push Docker image
      run: docker push ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:${{ github.sha }}

  deploy:
    needs: build
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
    - uses: actions/checkout@v4

    - name: Deploy to staging
      run: |
        echo "Deploying to staging environment"
        # Add deployment commands here

    - name: Run smoke tests
      run: |
        echo "Running smoke tests"
        # Add smoke test commands here

# Generated with:
# npx claude-flow sparc run cicd-engineer "Create comprehensive CI/CD pipeline for Java enterprise application"
```

### 2. Kubernetes Deployment

```yaml
# Auto-generated Kubernetes manifests
apiVersion: apps/v1
kind: Deployment
metadata:
  name: user-service
  labels:
    app: user-service
    version: v1
spec:
  replicas: 3
  selector:
    matchLabels:
      app: user-service
  template:
    metadata:
      labels:
        app: user-service
        version: v1
    spec:
      containers:
      - name: user-service
        image: ghcr.io/company/user-service:latest
        ports:
        - containerPort: 8080
        env:
        - name: SPRING_PROFILES_ACTIVE
          value: "kubernetes"
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: database-secret
              key: url
        - name: DATABASE_USERNAME
          valueFrom:
            secretKeyRef:
              name: database-secret
              key: username
        - name: DATABASE_PASSWORD
          valueFrom:
            secretKeyRef:
              name: database-secret
              key: password
        - name: JAVA_OPTS
          value: "-Xms1g -Xmx2g -XX:+UseG1GC -XX:MaxGCPauseMillis=200"
        resources:
          requests:
            memory: "1Gi"
            cpu: "500m"
          limits:
            memory: "2Gi"
            cpu: "1000m"
        livenessProbe:
          httpGet:
            path: /actuator/health/liveness
            port: 8080
          initialDelaySeconds: 60
          periodSeconds: 30
        readinessProbe:
          httpGet:
            path: /actuator/health/readiness
            port: 8080
          initialDelaySeconds: 30
          periodSeconds: 10
        volumeMounts:
        - name: logs
          mountPath: /app/logs
      volumes:
      - name: logs
        emptyDir: {}

---
apiVersion: v1
kind: Service
metadata:
  name: user-service
  labels:
    app: user-service
spec:
  selector:
    app: user-service
  ports:
  - port: 80
    targetPort: 8080
    protocol: TCP
  type: ClusterIP

---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: user-service-ingress
  annotations:
    kubernetes.io/ingress.class: nginx
    cert-manager.io/cluster-issuer: letsencrypt-prod
spec:
  tls:
  - hosts:
    - api.example.com
    secretName: api-tls
  rules:
  - host: api.example.com
    http:
      paths:
      - path: /api/users
        pathType: Prefix
        backend:
          service:
            name: user-service
            port:
              number: 80

# Generated with:
# npx claude-flow sparc run architect "Create production-ready Kubernetes deployment for Java microservice"
```

## Monitoring and Observability Integration

### 1. Application Metrics

```java
// Auto-generated monitoring configuration
@Configuration
@EnableConfigurationProperties(MonitoringProperties.class)
public class MonitoringConfiguration {

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

    @Bean
    public DatabaseMetrics databaseMetrics(DataSource dataSource, MeterRegistry meterRegistry) {
        return new DatabaseMetrics(dataSource, meterRegistry);
    }
}

@Component
public class BusinessMetrics {

    private final Counter userCreationCounter;
    private final Timer userCreationTimer;
    private final Gauge activeUsersGauge;

    public BusinessMetrics(MeterRegistry meterRegistry, UserRepository userRepository) {
        this.userCreationCounter = Counter.builder("business.users.created.total")
                .description("Total number of users created")
                .register(meterRegistry);

        this.userCreationTimer = Timer.builder("business.user.creation.duration")
                .description("User creation processing time")
                .register(meterRegistry);

        this.activeUsersGauge = Gauge.builder("business.users.active.total")
                .description("Total number of active users")
                .register(meterRegistry, userRepository, UserRepository::countByActiveTrue);
    }

    @EventListener
    public void handleUserCreated(UserCreatedEvent event) {
        userCreationCounter.increment();
    }

    public Timer.Sample startUserCreationTimer() {
        return Timer.start();
    }

    public void recordUserCreationTime(Timer.Sample sample) {
        sample.stop(userCreationTimer);
    }
}

// Generated with:
// npx claude-flow sparc run monitor "Create comprehensive monitoring with business and technical metrics"
```

### 2. Distributed Tracing

```java
// Auto-generated tracing configuration
@Configuration
public class TracingConfiguration {

    @Bean
    public Sender sender(@Value("${spring.zipkin.base-url}") String zipkinUrl) {
        return OkHttpSender.create(zipkinUrl + "/api/v2/spans");
    }

    @Bean
    public AsyncReporter<Span> spanReporter(Sender sender) {
        return AsyncReporter.create(sender);
    }

    @Bean
    public Sampler sampler(@Value("${spring.sleuth.sampler.probability:0.1}") float probability) {
        return Sampler.create(probability);
    }

    @Bean
    public BraveTracer braveTracer(AsyncReporter<Span> spanReporter, Sampler sampler) {
        return BraveTracer.create(
            Tracing.newBuilder()
                    .localServiceName("user-service")
                    .spanReporter(spanReporter)
                    .sampler(sampler)
                    .build()
        );
    }
}

@Component
public class CustomTracing {

    private final Tracer tracer;

    public CustomTracing(Tracer tracer) {
        this.tracer = tracer;
    }

    @NewSpan("user-business-logic")
    public void processUserBusinessLogic(@SpanTag("userId") Long userId) {
        Span span = tracer.nextSpan()
                .name("complex-business-operation")
                .tag("user.id", userId.toString())
                .start();

        try (Tracer.SpanInScope ws = tracer.withSpanInScope(span)) {
            // Business logic here
            span.tag("operation.result", "success");
        } catch (Exception e) {
            span.tag("error", e.getMessage());
            span.tag("operation.result", "error");
            throw e;
        } finally {
            span.end();
        }
    }
}

// Generated with:
// npx claude-flow sparc run monitor "Add distributed tracing with custom spans for business operations"
```

## Advanced Agent Workflows

### 1. Multi-Service Development

```bash
# Coordinate multiple services development
npx claude-flow mcp swarm_init --topology hierarchical --max-agents 15

# Spawn service-specific agents
npx claude-flow mcp agent_spawn --type coder --capabilities "user-service,spring-boot"
npx claude-flow mcp agent_spawn --type coder --capabilities "order-service,spring-boot"
npx claude-flow mcp agent_spawn --type coder --capabilities "notification-service,quarkus"
npx claude-flow mcp agent_spawn --type coder --capabilities "api-gateway,spring-cloud-gateway"

# Infrastructure agents
npx claude-flow mcp agent_spawn --type architect --capabilities "service-discovery,eureka"
npx claude-flow mcp agent_spawn --type architect --capabilities "configuration-management,spring-cloud-config"
npx claude-flow mcp agent_spawn --type architect --capabilities "kubernetes,helm,istio"

# Cross-cutting concerns agents
npx claude-flow mcp agent_spawn --type reviewer --capabilities "security,oauth2,jwt"
npx claude-flow mcp agent_spawn --type tester --capabilities "contract-testing,integration-testing"
npx claude-flow mcp agent_spawn --type monitor --capabilities "observability,prometheus,grafana"

# Orchestrate microservices development
npx claude-flow mcp task_orchestrate --task "Build complete microservices ecosystem with Spring Cloud" --strategy hierarchical --priority high
```

### 2. Continuous Improvement Workflow

```bash
# Performance optimization cycle
npx claude-flow sparc run perf-analyzer "Analyze production metrics and identify performance bottlenecks"

# Security audit cycle
npx claude-flow sparc run reviewer "Perform comprehensive security audit and generate remediation plan"

# Code quality improvement
npx claude-flow sparc batch reviewer,coder "Analyze code quality metrics and implement improvements"

# Test coverage enhancement
npx claude-flow sparc run tester "Analyze test coverage gaps and generate missing tests"

# Documentation updates
npx claude-flow sparc run api-docs "Update API documentation based on latest code changes"
```

## Best Practices for Agent Coordination

### 1. Agent Communication Patterns

```bash
# Use memory for agent coordination
npx claude-flow hooks session-start --session-id "microservices-dev-$(date +%s)"

# Agents store decisions and artifacts
npx claude-flow hooks post-edit --file "src/main/java/User.java" --memory-key "entities/user"
npx claude-flow hooks post-edit --file "src/test/java/UserTest.java" --memory-key "tests/user"

# Agents retrieve context from previous work
npx claude-flow hooks session-restore --session-id "microservices-dev-123456"
```

### 2. Quality Gates

```java
// Auto-generated quality checks
@Component
public class QualityGateService {

    public QualityReport runQualityChecks(String projectPath) {
        QualityReport report = new QualityReport();

        // Code coverage check
        CoverageResult coverage = checkCodeCoverage(projectPath);
        report.addCheck("code-coverage", coverage.getPercentage() >= 80);

        // Security scan
        SecurityScanResult security = runSecurityScan(projectPath);
        report.addCheck("security-scan", security.getVulnerabilities().isEmpty());

        // Performance benchmarks
        BenchmarkResult performance = runPerformanceBenchmarks(projectPath);
        report.addCheck("performance", performance.meetsThresholds());

        // Documentation completeness
        DocumentationResult docs = checkDocumentation(projectPath);
        report.addCheck("documentation", docs.getCompleteness() >= 0.9);

        return report;
    }
}

// Generated with:
// npx claude-flow sparc run reviewer "Create automated quality gates for continuous integration"
```

### 3. Rollback and Recovery

```bash
# Automated rollback procedures
npx claude-flow sparc run cicd-engineer "Create automated rollback procedures for failed deployments"

# Health check monitoring
npx claude-flow sparc run monitor "Implement comprehensive health checks with automatic recovery"

# Disaster recovery planning
npx claude-flow sparc run architect "Design disaster recovery procedures for microservices architecture"
```

## Integration with External Tools

### 1. IDE Integration

```json
{
  "name": "Claude Flow Java Development",
  "version": "1.0.0",
  "contributes": {
    "commands": [
      {
        "command": "claude-flow.generateTests",
        "title": "Generate Tests with Claude Flow"
      },
      {
        "command": "claude-flow.optimizePerformance",
        "title": "Optimize Performance"
      },
      {
        "command": "claude-flow.reviewSecurity",
        "title": "Security Review"
      }
    ]
  }
}
```

### 2. Build Tool Integration

```xml
<!-- Maven plugin for Claude Flow integration -->
<plugin>
    <groupId>com.claude-flow</groupId>
    <artifactId>claude-flow-maven-plugin</artifactId>
    <version>1.0.0</version>
    <executions>
        <execution>
            <id>generate-tests</id>
            <phase>generate-test-sources</phase>
            <goals>
                <goal>generate-tests</goal>
            </goals>
        </execution>
        <execution>
            <id>performance-analysis</id>
            <phase>verify</phase>
            <goals>
                <goal>analyze-performance</goal>
            </goals>
        </execution>
    </executions>
    <configuration>
        <agents>
            <agent>tester</agent>
            <agent>perf-analyzer</agent>
        </agents>
    </configuration>
</plugin>
```

## Next Steps

- [Project Setup](project-setup.md)
- [Spring Boot Development](spring-boot.md)
- [Enterprise Java Development](enterprise-java.md)
- [Testing Strategies](testing.md)
- [Performance Optimization](performance.md)
- [Microservices Development](microservices.md)