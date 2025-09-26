# Spring Boot Development with Cloud-Native Patterns

This guide covers comprehensive Spring Boot development with cloud-native patterns, containerization, and Claude Flow integration for modern Java applications.

## Quick Start

### Basic Spring Boot Application

```java
@SpringBootApplication
public class Application {
    public static void main(String[] args) {
        SpringApplication.run(Application.class, args);
    }
}
```

### With Claude Flow Integration

```bash
# Generate Spring Boot application with agents
npx claude-flow sparc run coder "Create Spring Boot REST API with JPA and security"

# Setup cloud-native patterns
npx claude-flow sparc batch architect,coder "Implement Spring Boot with cloud patterns"
```

## Core Spring Boot Components

### 1. REST Controllers

```java
@RestController
@RequestMapping("/api/users")
@Validated
public class UserController {

    private final UserService userService;

    public UserController(UserService userService) {
        this.userService = userService;
    }

    @GetMapping
    public ResponseEntity<Page<UserDto>> getUsers(
            @PageableDefault(size = 20) Pageable pageable) {
        Page<UserDto> users = userService.findAll(pageable);
        return ResponseEntity.ok(users);
    }

    @GetMapping("/{id}")
    public ResponseEntity<UserDto> getUser(@PathVariable Long id) {
        return userService.findById(id)
                .map(user -> ResponseEntity.ok(user))
                .orElse(ResponseEntity.notFound().build());
    }

    @PostMapping
    public ResponseEntity<UserDto> createUser(@Valid @RequestBody CreateUserRequest request) {
        UserDto created = userService.create(request);
        URI location = ServletUriComponentsBuilder
                .fromCurrentRequest()
                .path("/{id}")
                .buildAndExpand(created.getId())
                .toUri();
        return ResponseEntity.created(location).body(created);
    }

    @PutMapping("/{id}")
    public ResponseEntity<UserDto> updateUser(
            @PathVariable Long id,
            @Valid @RequestBody UpdateUserRequest request) {
        return userService.update(id, request)
                .map(user -> ResponseEntity.ok(user))
                .orElse(ResponseEntity.notFound().build());
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteUser(@PathVariable Long id) {
        userService.deleteById(id);
        return ResponseEntity.noContent().build();
    }
}
```

### 2. Service Layer

```java
@Service
@Transactional
public class UserService {

    private final UserRepository userRepository;
    private final UserMapper userMapper;
    private final ApplicationEventPublisher eventPublisher;

    public UserService(
            UserRepository userRepository,
            UserMapper userMapper,
            ApplicationEventPublisher eventPublisher) {
        this.userRepository = userRepository;
        this.userMapper = userMapper;
        this.eventPublisher = eventPublisher;
    }

    @Transactional(readOnly = true)
    public Page<UserDto> findAll(Pageable pageable) {
        return userRepository.findAll(pageable)
                .map(userMapper::toDto);
    }

    @Transactional(readOnly = true)
    public Optional<UserDto> findById(Long id) {
        return userRepository.findById(id)
                .map(userMapper::toDto);
    }

    public UserDto create(CreateUserRequest request) {
        User user = userMapper.toEntity(request);
        User saved = userRepository.save(user);

        // Publish domain event
        eventPublisher.publishEvent(new UserCreatedEvent(saved.getId()));

        return userMapper.toDto(saved);
    }

    public Optional<UserDto> update(Long id, UpdateUserRequest request) {
        return userRepository.findById(id)
                .map(user -> {
                    userMapper.updateEntity(request, user);
                    User saved = userRepository.save(user);
                    eventPublisher.publishEvent(new UserUpdatedEvent(saved.getId()));
                    return userMapper.toDto(saved);
                });
    }

    public void deleteById(Long id) {
        userRepository.deleteById(id);
        eventPublisher.publishEvent(new UserDeletedEvent(id));
    }
}
```

### 3. Data Layer with JPA

```java
@Entity
@Table(name = "users")
public class User {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true)
    private String email;

    @Column(nullable = false)
    private String firstName;

    @Column(nullable = false)
    private String lastName;

    @CreationTimestamp
    private LocalDateTime createdAt;

    @UpdateTimestamp
    private LocalDateTime updatedAt;

    // Constructors, getters, setters
}

@Repository
public interface UserRepository extends JpaRepository<User, Long>, JpaSpecificationExecutor<User> {

    Optional<User> findByEmail(String email);

    @Query("SELECT u FROM User u WHERE u.firstName LIKE %:name% OR u.lastName LIKE %:name%")
    Page<User> findByNameContaining(@Param("name") String name, Pageable pageable);

    @Modifying
    @Query("UPDATE User u SET u.lastLoginAt = :loginTime WHERE u.id = :id")
    void updateLastLoginTime(@Param("id") Long id, @Param("loginTime") LocalDateTime loginTime);
}
```

## Cloud-Native Patterns

### 1. Configuration Management

```yaml
# application.yml
spring:
  application:
    name: user-service
  profiles:
    active: ${SPRING_PROFILES_ACTIVE:dev}

  datasource:
    url: ${DATABASE_URL:jdbc:postgresql://localhost:5432/userdb}
    username: ${DATABASE_USERNAME:user}
    password: ${DATABASE_PASSWORD:password}
    hikari:
      maximum-pool-size: ${DB_POOL_SIZE:20}
      minimum-idle: ${DB_MIN_IDLE:5}

  jpa:
    hibernate:
      ddl-auto: ${JPA_DDL_AUTO:validate}
    show-sql: ${JPA_SHOW_SQL:false}

  redis:
    host: ${REDIS_HOST:localhost}
    port: ${REDIS_PORT:6379}
    password: ${REDIS_PASSWORD:}

  kafka:
    bootstrap-servers: ${KAFKA_BROKERS:localhost:9092}
    producer:
      retries: 3
      acks: all
    consumer:
      group-id: ${spring.application.name}
      auto-offset-reset: earliest

management:
  endpoints:
    web:
      exposure:
        include: health,info,metrics,prometheus
  endpoint:
    health:
      show-details: when-authorized
  metrics:
    export:
      prometheus:
        enabled: true

logging:
  level:
    com.example: ${LOG_LEVEL:INFO}
  pattern:
    console: "%d{HH:mm:ss.SSS} [%thread] %-5level %logger{36} - %msg%n"
```

### 2. Health Checks

```java
@Component
public class DatabaseHealthIndicator implements HealthIndicator {

    private final DataSource dataSource;

    public DatabaseHealthIndicator(DataSource dataSource) {
        this.dataSource = dataSource;
    }

    @Override
    public Health health() {
        try (Connection connection = dataSource.getConnection()) {
            if (connection.isValid(1)) {
                return Health.up()
                        .withDetail("database", "Available")
                        .withDetail("validationQuery", "SELECT 1")
                        .build();
            }
        } catch (SQLException ex) {
            return Health.down(ex)
                    .withDetail("database", "Unavailable")
                    .build();
        }
        return Health.down()
                .withDetail("database", "Validation failed")
                .build();
    }
}

@Component
public class ExternalServiceHealthIndicator implements HealthIndicator {

    private final WebClient webClient;

    @Override
    public Health health() {
        try {
            String response = webClient.get()
                    .uri("/health")
                    .retrieve()
                    .bodyToMono(String.class)
                    .timeout(Duration.ofSeconds(5))
                    .block();

            return Health.up()
                    .withDetail("external-service", "Available")
                    .withDetail("response", response)
                    .build();
        } catch (Exception ex) {
            return Health.down(ex)
                    .withDetail("external-service", "Unavailable")
                    .build();
        }
    }
}
```

### 3. Circuit Breaker Pattern

```java
@Component
public class ExternalApiClient {

    private final WebClient webClient;
    private final CircuitBreaker circuitBreaker;

    public ExternalApiClient(WebClient.Builder webClientBuilder, CircuitBreakerFactory circuitBreakerFactory) {
        this.webClient = webClientBuilder.baseUrl("https://api.example.com").build();
        this.circuitBreaker = circuitBreakerFactory.create("external-api");
    }

    public Mono<ApiResponse> callExternalApi(String endpoint) {
        return circuitBreaker.executeSupplier(() ->
            webClient.get()
                    .uri(endpoint)
                    .retrieve()
                    .bodyToMono(ApiResponse.class)
                    .timeout(Duration.ofSeconds(5))
        );
    }
}

@Configuration
public class CircuitBreakerConfig {

    @Bean
    public CircuitBreakerConfigCustomizer circuitBreakerCustomizer() {
        return CircuitBreakerConfigCustomizer.of("external-api", builder ->
            builder.slidingWindowSize(10)
                   .minimumNumberOfCalls(5)
                   .failureRateThreshold(50.0f)
                   .waitDurationInOpenState(Duration.ofSeconds(30))
                   .build()
        );
    }
}
```

### 4. Distributed Tracing

```java
@RestController
public class TracedController {

    @Autowired
    private Tracer tracer;

    @GetMapping("/api/traced")
    public ResponseEntity<String> tracedEndpoint() {
        Span span = tracer.nextSpan()
                .name("custom-operation")
                .tag("operation.type", "business-logic")
                .start();

        try (Tracer.SpanInScope ws = tracer.withSpanInScope(span)) {
            // Business logic
            span.tag("result", "success");
            return ResponseEntity.ok("Operation completed");
        } catch (Exception ex) {
            span.tag("error", ex.getMessage());
            throw ex;
        } finally {
            span.end();
        }
    }
}
```

## Containerization

### Dockerfile

```dockerfile
# Multi-stage build
FROM openjdk:17-jdk-slim as builder

WORKDIR /app
COPY pom.xml .
COPY src src

RUN apt-get update && apt-get install -y maven
RUN mvn clean package -DskipTests

FROM openjdk:17-jre-slim

RUN addgroup --system spring && adduser --system spring --ingroup spring
USER spring:spring

COPY --from=builder /app/target/*.jar app.jar

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8080/actuator/health || exit 1

ENTRYPOINT ["java", "-jar", "/app.jar"]
```

### Docker Compose

```yaml
version: '3.8'

services:
  app:
    build: .
    ports:
      - "8080:8080"
    environment:
      - SPRING_PROFILES_ACTIVE=docker
      - DATABASE_URL=jdbc:postgresql://db:5432/userdb
      - REDIS_HOST=redis
      - KAFKA_BROKERS=kafka:9092
    depends_on:
      - db
      - redis
      - kafka
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/actuator/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  db:
    image: postgres:15
    environment:
      POSTGRES_DB: userdb
      POSTGRES_USER: user
      POSTGRES_PASSWORD: password
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

  kafka:
    image: confluentinc/cp-kafka:latest
    environment:
      KAFKA_ZOOKEEPER_CONNECT: zookeeper:2181
      KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://kafka:9092
      KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: 1
    depends_on:
      - zookeeper

  zookeeper:
    image: confluentinc/cp-zookeeper:latest
    environment:
      ZOOKEEPER_CLIENT_PORT: 2181

volumes:
  postgres_data:
```

## Claude Flow Integration

### Spring Boot Development Workflow

```bash
# Initialize Spring Boot project with agents
npx claude-flow sparc run architect "Design Spring Boot microservice architecture"

# Generate boilerplate code
npx claude-flow sparc run coder "Create Spring Boot REST API with security"

# Setup database integration
npx claude-flow sparc run coder "Implement JPA entities and repositories"

# Create comprehensive tests
npx claude-flow sparc run tester "Generate unit and integration tests"

# Setup cloud-native features
npx claude-flow sparc batch architect,coder "Add health checks, metrics, and tracing"
```

### MCP Integration for Spring Boot

```bash
# Initialize development swarm
npx claude-flow mcp swarm_init --topology mesh --max-agents 6

# Spawn Spring Boot specialists
npx claude-flow mcp agent_spawn --type coder --capabilities "spring-boot,jpa,security"
npx claude-flow mcp agent_spawn --type architect --capabilities "microservices,cloud-native"
npx claude-flow mcp agent_spawn --type tester --capabilities "spring-test,testcontainers"

# Orchestrate development tasks
npx claude-flow mcp task_orchestrate --task "Build Spring Boot microservice" --strategy parallel
```

## Testing with Spring Boot

### Unit Tests

```java
@ExtendWith(MockitoExtension.class)
class UserServiceTest {

    @Mock
    private UserRepository userRepository;

    @Mock
    private UserMapper userMapper;

    @Mock
    private ApplicationEventPublisher eventPublisher;

    @InjectMocks
    private UserService userService;

    @Test
    void shouldCreateUser() {
        // Given
        CreateUserRequest request = new CreateUserRequest("test@example.com", "John", "Doe");
        User user = new User();
        User savedUser = new User();
        savedUser.setId(1L);
        UserDto userDto = new UserDto();

        when(userMapper.toEntity(request)).thenReturn(user);
        when(userRepository.save(user)).thenReturn(savedUser);
        when(userMapper.toDto(savedUser)).thenReturn(userDto);

        // When
        UserDto result = userService.create(request);

        // Then
        assertThat(result).isEqualTo(userDto);
        verify(eventPublisher).publishEvent(any(UserCreatedEvent.class));
    }
}
```

### Integration Tests

```java
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Testcontainers
class UserControllerIntegrationTest {

    @Container
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:15")
            .withDatabaseName("testdb")
            .withUsername("test")
            .withPassword("test");

    @Autowired
    private TestRestTemplate restTemplate;

    @Autowired
    private UserRepository userRepository;

    @DynamicPropertySource
    static void configureProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", postgres::getJdbcUrl);
        registry.add("spring.datasource.username", postgres::getUsername);
        registry.add("spring.datasource.password", postgres::getPassword);
    }

    @Test
    void shouldCreateUser() {
        // Given
        CreateUserRequest request = new CreateUserRequest("test@example.com", "John", "Doe");

        // When
        ResponseEntity<UserDto> response = restTemplate.postForEntity("/api/users", request, UserDto.class);

        // Then
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        assertThat(response.getBody().getEmail()).isEqualTo("test@example.com");

        // Verify database
        Optional<User> user = userRepository.findByEmail("test@example.com");
        assertThat(user).isPresent();
    }
}
```

## Performance Optimization

### JPA Performance

```java
@Entity
@NamedEntityGraph(
    name = "User.withProfile",
    attributeNodes = @NamedAttributeNode("profile")
)
public class User {
    // Entity definition
}

@Repository
public interface UserRepository extends JpaRepository<User, Long> {

    @EntityGraph("User.withProfile")
    @Query("SELECT u FROM User u WHERE u.active = true")
    List<User> findActiveUsersWithProfile();

    @Query("SELECT new com.example.dto.UserSummaryDto(u.id, u.email, u.firstName, u.lastName) " +
           "FROM User u WHERE u.createdAt >= :since")
    List<UserSummaryDto> findUserSummariesSince(@Param("since") LocalDateTime since);
}
```

### Caching

```java
@Service
@CacheConfig(cacheNames = "users")
public class UserService {

    @Cacheable(key = "#id")
    public Optional<UserDto> findById(Long id) {
        return userRepository.findById(id)
                .map(userMapper::toDto);
    }

    @CacheEvict(key = "#result.id")
    public UserDto create(CreateUserRequest request) {
        // Implementation
    }

    @CachePut(key = "#id")
    public Optional<UserDto> update(Long id, UpdateUserRequest request) {
        // Implementation
    }

    @CacheEvict(key = "#id")
    public void deleteById(Long id) {
        // Implementation
    }
}
```

## Security

### JWT Authentication

```java
@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final AuthenticationManager authenticationManager;
    private final JwtTokenProvider tokenProvider;
    private final UserService userService;

    @PostMapping("/login")
    public ResponseEntity<JwtAuthResponse> authenticateUser(@Valid @RequestBody LoginRequest request) {
        Authentication authentication = authenticationManager.authenticate(
                new UsernamePasswordAuthenticationToken(request.getEmail(), request.getPassword())
        );

        String token = tokenProvider.generateToken(authentication);
        return ResponseEntity.ok(new JwtAuthResponse(token));
    }

    @PostMapping("/register")
    public ResponseEntity<UserDto> registerUser(@Valid @RequestBody RegisterRequest request) {
        UserDto user = userService.create(request);
        return ResponseEntity.status(HttpStatus.CREATED).body(user);
    }
}

@Component
public class JwtTokenProvider {

    @Value("${app.jwt.secret}")
    private String jwtSecret;

    @Value("${app.jwt.expiration}")
    private int jwtExpirationInMs;

    public String generateToken(Authentication authentication) {
        UserPrincipal userPrincipal = (UserPrincipal) authentication.getPrincipal();
        Date expiryDate = new Date(System.currentTimeMillis() + jwtExpirationInMs);

        return Jwts.builder()
                .setSubject(Long.toString(userPrincipal.getId()))
                .setIssuedAt(new Date())
                .setExpiration(expiryDate)
                .signWith(SignatureAlgorithm.HS512, jwtSecret)
                .compact();
    }

    public boolean validateToken(String authToken) {
        try {
            Jwts.parser().setSigningKey(jwtSecret).parseClaimsJws(authToken);
            return true;
        } catch (JwtException | IllegalArgumentException ex) {
            return false;
        }
    }
}
```

## Monitoring and Observability

### Custom Metrics

```java
@Component
public class UserMetrics {

    private final Counter userCreatedCounter;
    private final Timer userCreationTimer;
    private final Gauge activeUsersGauge;

    public UserMetrics(MeterRegistry meterRegistry, UserRepository userRepository) {
        this.userCreatedCounter = Counter.builder("users_created_total")
                .description("Total number of users created")
                .register(meterRegistry);

        this.userCreationTimer = Timer.builder("user_creation_duration")
                .description("User creation duration")
                .register(meterRegistry);

        this.activeUsersGauge = Gauge.builder("users_active_total")
                .description("Total number of active users")
                .register(meterRegistry, userRepository, repo -> repo.countByActiveTrue());
    }

    public void recordUserCreated() {
        userCreatedCounter.increment();
    }

    public Timer.Sample startUserCreationTimer() {
        return Timer.start();
    }

    public void recordUserCreationTime(Timer.Sample sample) {
        sample.stop(userCreationTimer);
    }
}
```

## Next Steps

- [Enterprise Java Development](enterprise-java.md)
- [Testing Strategies](testing.md)
- [Performance Optimization](performance.md)
- [Microservices Development](microservices.md)
- [Claude Flow Agent Coordination](claude-flow-integration.md)