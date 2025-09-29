# Microservices with Spring Cloud and Quarkus

This comprehensive guide covers building microservices architectures using Spring Cloud and Quarkus, including service discovery, configuration management, circuit breakers, and Claude Flow integration for distributed systems development.

## Quick Start

### Spring Cloud Microservice

```java
@SpringBootApplication
@EnableEurekaClient
@EnableConfigServer
public class UserServiceApplication {
    public static void main(String[] args) {
        SpringApplication.run(UserServiceApplication.class, args);
    }
}
```

### Quarkus Microservice

```java
@ApplicationScoped
@Path("/users")
public class UserResource {

    @Inject
    UserService userService;

    @GET
    @Produces(MediaType.APPLICATION_JSON)
    public List<User> getUsers() {
        return userService.getAllUsers();
    }
}
```

### With Claude Flow Integration

```bash
# Generate microservices architecture with agents
npx claude-flow-novice sparc run architect "Design Spring Cloud microservices architecture"

# Build distributed system
npx claude-flow-novice sparc batch architect,coder "Implement microservices with Spring Cloud and Quarkus"
```

## Spring Cloud Microservices

### 1. Service Discovery with Eureka

```java
// Eureka Server
@SpringBootApplication
@EnableEurekaServer
public class EurekaServerApplication {
    public static void main(String[] args) {
        SpringApplication.run(EurekaServerApplication.class, args);
    }
}

// eureka-server.yml
spring:
  application:
    name: eureka-server
server:
  port: 8761

eureka:
  instance:
    hostname: localhost
  client:
    register-with-eureka: false
    fetch-registry: false
    service-url:
      defaultZone: http://${eureka.instance.hostname}:${server.port}/eureka/

// User Service (Eureka Client)
@SpringBootApplication
@EnableEurekaClient
@EnableJpaRepositories
public class UserServiceApplication {

    public static void main(String[] args) {
        SpringApplication.run(UserServiceApplication.class, args);
    }

    @LoadBalanced
    @Bean
    public RestTemplate restTemplate() {
        return new RestTemplate();
    }

    @Bean
    public WebClient.Builder webClientBuilder() {
        return WebClient.builder();
    }
}

// user-service.yml
spring:
  application:
    name: user-service
  datasource:
    url: jdbc:postgresql://localhost:5432/userdb
    username: ${DB_USERNAME:user}
    password: ${DB_PASSWORD:password}

server:
  port: ${PORT:8081}

eureka:
  client:
    service-url:
      defaultZone: http://localhost:8761/eureka/
  instance:
    prefer-ip-address: true
    instance-id: ${spring.application.name}:${server.port}

management:
  endpoints:
    web:
      exposure:
        include: health,info,metrics
```

### 2. Configuration Management with Spring Cloud Config

```java
// Config Server
@SpringBootApplication
@EnableConfigServer
public class ConfigServerApplication {
    public static void main(String[] args) {
        SpringApplication.run(ConfigServerApplication.class, args);
    }
}

// config-server.yml
spring:
  application:
    name: config-server
  cloud:
    config:
      server:
        git:
          uri: https://github.com/your-org/microservices-config
          default-label: main
          search-paths: config
        health:
          repositories:
            config:
              label: main

server:
  port: 8888

eureka:
  client:
    service-url:
      defaultZone: http://localhost:8761/eureka/

// Configuration refresh endpoint
@RestController
@RefreshScope
public class ConfigController {

    @Value("${user.service.max-connections:10}")
    private int maxConnections;

    @Value("${user.service.timeout:5000}")
    private int timeout;

    @GetMapping("/config")
    public Map<String, Object> getConfig() {
        Map<String, Object> config = new HashMap<>();
        config.put("maxConnections", maxConnections);
        config.put("timeout", timeout);
        return config;
    }
}

// Automatic configuration refresh
@Component
public class ConfigRefreshListener {

    @EventListener
    public void handleRefreshEvent(RefreshRemoteApplicationEvent event) {
        log.info("Configuration refreshed for service: {}", event.getDestinationService());
    }
}
```

### 3. API Gateway with Spring Cloud Gateway

```java
@SpringBootApplication
@EnableEurekaClient
public class ApiGatewayApplication {
    public static void main(String[] args) {
        SpringApplication.run(ApiGatewayApplication.class, args);
    }
}

// Gateway configuration
@Configuration
public class GatewayConfig {

    @Bean
    public RouteLocator customRouteLocator(RouteLocatorBuilder builder) {
        return builder.routes()
                // User Service routes
                .route("user-service", r -> r
                        .path("/api/users/**")
                        .filters(f -> f
                                .stripPrefix(1)
                                .addRequestHeader("X-Gateway", "spring-cloud-gateway")
                                .addResponseHeader("X-Response-Time", String.valueOf(System.currentTimeMillis()))
                                .circuitBreaker(config -> config
                                        .setName("user-service-cb")
                                        .setFallbackUri("forward:/fallback/users")))
                        .uri("lb://user-service"))

                // Order Service routes
                .route("order-service", r -> r
                        .path("/api/orders/**")
                        .filters(f -> f
                                .stripPrefix(1)
                                .retry(config -> config
                                        .setRetries(3)
                                        .setMethods(HttpMethod.GET)
                                        .setBackoff(Duration.ofMillis(100), Duration.ofMillis(1000), 2, false)))
                        .uri("lb://order-service"))

                // Rate limiting
                .route("rate-limited", r -> r
                        .path("/api/public/**")
                        .filters(f -> f
                                .requestRateLimiter(config -> config
                                        .setRateLimiter(redisRateLimiter())
                                        .setKeyResolver(userKeyResolver())))
                        .uri("lb://public-service"))
                .build();
    }

    @Bean
    public RedisRateLimiter redisRateLimiter() {
        return new RedisRateLimiter(10, 20, 1); // 10 requests per second, burst of 20
    }

    @Bean
    @Primary
    public KeyResolver userKeyResolver() {
        return exchange -> exchange.getRequest()
                .getHeaders()
                .getFirst("X-User-ID")
                .map(Mono::just)
                .orElse(Mono.just("anonymous"));
    }
}

// Global filters
@Component
public class LoggingGlobalFilter implements GlobalFilter, Ordered {

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        String path = exchange.getRequest().getPath().value();
        String method = exchange.getRequest().getMethod().name();

        log.info("Request: {} {}", method, path);

        return chain.filter(exchange)
                .then(Mono.fromRunnable(() -> {
                    int statusCode = exchange.getResponse().getStatusCode().value();
                    log.info("Response: {} {} -> {}", method, path, statusCode);
                }));
    }

    @Override
    public int getOrder() {
        return -1; // Execute before other filters
    }
}

// Fallback controller
@RestController
public class FallbackController {

    @GetMapping("/fallback/users")
    public ResponseEntity<Map<String, String>> userServiceFallback() {
        Map<String, String> response = new HashMap<>();
        response.put("message", "User service is currently unavailable");
        response.put("status", "fallback");
        return ResponseEntity.ok(response);
    }
}
```

### 4. Circuit Breaker with Resilience4j

```java
@Service
public class OrderService {

    private final RestTemplate restTemplate;
    private final CircuitBreaker circuitBreaker;
    private final Retry retry;
    private final TimeLimiter timeLimiter;

    public OrderService(RestTemplate restTemplate, CircuitBreakerRegistry circuitBreakerRegistry,
                       RetryRegistry retryRegistry, TimeLimiterRegistry timeLimiterRegistry) {
        this.restTemplate = restTemplate;
        this.circuitBreaker = circuitBreakerRegistry.circuitBreaker("user-service");
        this.retry = retryRegistry.retry("user-service");
        this.timeLimiter = timeLimiterRegistry.timeLimiter("user-service");
    }

    @CircuitBreaker(name = "user-service", fallbackMethod = "getUserFallback")
    @Retry(name = "user-service")
    @TimeLimiter(name = "user-service")
    public CompletableFuture<User> getUser(Long userId) {
        return CompletableFuture.supplyAsync(() -> {
            String url = "http://user-service/api/users/" + userId;
            return restTemplate.getForObject(url, User.class);
        });
    }

    public CompletableFuture<User> getUserFallback(Long userId, Exception ex) {
        log.warn("Fallback triggered for user {}: {}", userId, ex.getMessage());
        return CompletableFuture.completedFuture(User.builder()
                .id(userId)
                .firstName("Unknown")
                .lastName("User")
                .email("unknown@example.com")
                .build());
    }

    // Reactive approach with WebClient
    @Component
    public static class ReactiveOrderService {

        private final WebClient webClient;

        public ReactiveOrderService(WebClient.Builder webClientBuilder) {
            this.webClient = webClientBuilder.baseUrl("http://user-service").build();
        }

        @CircuitBreaker(name = "user-service-reactive")
        @Retry(name = "user-service-reactive")
        public Mono<User> getUserReactive(Long userId) {
            return webClient.get()
                    .uri("/api/users/{id}", userId)
                    .retrieve()
                    .bodyToMono(User.class)
                    .timeout(Duration.ofSeconds(3))
                    .onErrorResume(ex -> {
                        log.warn("Error calling user service: {}", ex.getMessage());
                        return Mono.just(createFallbackUser(userId));
                    });
        }

        private User createFallbackUser(Long userId) {
            return User.builder()
                    .id(userId)
                    .firstName("Fallback")
                    .lastName("User")
                    .build();
        }
    }
}

// Circuit breaker configuration
resilience4j:
  circuitbreaker:
    instances:
      user-service:
        sliding-window-size: 10
        minimum-number-of-calls: 5
        failure-rate-threshold: 50
        wait-duration-in-open-state: 30s
        permitted-number-of-calls-in-half-open-state: 3
        automatic-transition-from-open-to-half-open-enabled: true

  retry:
    instances:
      user-service:
        max-attempts: 3
        wait-duration: 1s
        exponential-backoff-multiplier: 2

  timelimiter:
    instances:
      user-service:
        timeout-duration: 3s
```

### 5. Distributed Tracing with Sleuth and Zipkin

```java
// Tracing configuration
@Configuration
public class TracingConfiguration {

    @Bean
    public Sender sender() {
        return OkHttpSender.create("http://zipkin:9411/api/v2/spans");
    }

    @Bean
    public AsyncReporter<Span> spanReporter() {
        return AsyncReporter.create(sender());
    }

    @Bean
    public Sampler alwaysSampler() {
        return Sampler.create(1.0f); // Sample 100% of traces
    }
}

// Custom span creation
@Service
public class TracedUserService {

    private final UserRepository userRepository;
    private final Tracer tracer;

    public TracedUserService(UserRepository userRepository, Tracer tracer) {
        this.userRepository = userRepository;
        this.tracer = tracer;
    }

    public User createUser(CreateUserRequest request) {
        Span span = tracer.nextSpan()
                .name("user-creation")
                .tag("user.email", request.getEmail())
                .start();

        try (Tracer.SpanInScope ws = tracer.withSpanInScope(span)) {
            // Business logic
            User user = new User();
            user.setEmail(request.getEmail());
            user.setFirstName(request.getFirstName());
            user.setLastName(request.getLastName());

            // Add more spans for sub-operations
            Span validationSpan = tracer.nextSpan()
                    .name("user-validation")
                    .start();

            try (Tracer.SpanInScope validationScope = tracer.withSpanInScope(validationSpan)) {
                validateUser(user);
            } finally {
                validationSpan.end();
            }

            User saved = userRepository.save(user);
            span.tag("user.id", saved.getId().toString());

            return saved;
        } catch (Exception e) {
            span.tag("error", e.getMessage());
            throw e;
        } finally {
            span.end();
        }
    }

    @NewSpan("user-validation")
    public void validateUser(@SpanTag("user") User user) {
        // Validation logic
        if (user.getEmail() == null || !user.getEmail().contains("@")) {
            throw new IllegalArgumentException("Invalid email");
        }
    }
}

# application.yml for tracing
spring:
  sleuth:
    zipkin:
      base-url: http://zipkin:9411
    sampler:
      probability: 1.0 # Sample all requests
    web:
      skip-pattern: /actuator.*
  application:
    name: user-service

logging:
  pattern:
    level: "%5p [${spring.application.name:},%X{traceId:-},%X{spanId:-}]"
```

## Quarkus Microservices

### 1. Basic Quarkus Service

```java
// User Resource
@Path("/users")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
public class UserResource {

    @Inject
    UserService userService;

    @GET
    public List<User> getAllUsers() {
        return userService.findAll();
    }

    @GET
    @Path("/{id}")
    public Response getUser(@PathParam("id") Long id) {
        return userService.findById(id)
                .map(user -> Response.ok(user).build())
                .orElse(Response.status(Response.Status.NOT_FOUND).build());
    }

    @POST
    @Transactional
    public Response createUser(@Valid User user) {
        User created = userService.create(user);
        return Response.status(Response.Status.CREATED)
                .entity(created)
                .build();
    }

    @PUT
    @Path("/{id}")
    @Transactional
    public Response updateUser(@PathParam("id") Long id, @Valid User user) {
        return userService.update(id, user)
                .map(updated -> Response.ok(updated).build())
                .orElse(Response.status(Response.Status.NOT_FOUND).build());
    }

    @DELETE
    @Path("/{id}")
    @Transactional
    public Response deleteUser(@PathParam("id") Long id) {
        userService.deleteById(id);
        return Response.noContent().build();
    }
}

// User Service
@ApplicationScoped
public class UserService {

    @Inject
    UserRepository userRepository;

    @Inject
    Event<UserCreatedEvent> userCreatedEvent;

    public List<User> findAll() {
        return userRepository.listAll();
    }

    public Optional<User> findById(Long id) {
        return Optional.ofNullable(userRepository.findById(id));
    }

    public User create(User user) {
        userRepository.persist(user);
        userCreatedEvent.fire(new UserCreatedEvent(user.id));
        return user;
    }

    public Optional<User> update(Long id, User updatedUser) {
        return findById(id).map(user -> {
            user.firstName = updatedUser.firstName;
            user.lastName = updatedUser.lastName;
            user.email = updatedUser.email;
            return user;
        });
    }

    public void deleteById(Long id) {
        userRepository.deleteById(id);
    }
}

// User Entity
@Entity
@Table(name = "users")
public class User extends PanacheEntityBase {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    public Long id;

    @Column(nullable = false, unique = true)
    @NotBlank
    @Email
    public String email;

    @Column(nullable = false)
    @NotBlank
    public String firstName;

    @Column(nullable = false)
    @NotBlank
    public String lastName;

    @CreationTimestamp
    public LocalDateTime createdAt;

    @UpdateTimestamp
    public LocalDateTime updatedAt;
}

// User Repository with Panache
@ApplicationScoped
public class UserRepository implements PanacheRepository<User> {

    public Optional<User> findByEmail(String email) {
        return find("email", email).firstResultOptional();
    }

    public List<User> findByFirstName(String firstName) {
        return find("firstName", firstName).list();
    }

    public long countActive() {
        return count("active", true);
    }
}
```

### 2. Reactive Quarkus with Mutiny

```java
// Reactive User Resource
@Path("/users")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
public class ReactiveUserResource {

    @Inject
    ReactiveUserService userService;

    @GET
    public Uni<List<User>> getAllUsers() {
        return userService.findAll();
    }

    @GET
    @Path("/{id}")
    public Uni<Response> getUser(@PathParam("id") Long id) {
        return userService.findById(id)
                .map(user -> user != null ?
                    Response.ok(user).build() :
                    Response.status(Response.Status.NOT_FOUND).build());
    }

    @POST
    public Uni<Response> createUser(@Valid User user) {
        return userService.create(user)
                .map(created -> Response.status(Response.Status.CREATED)
                        .entity(created)
                        .build());
    }

    @GET
    @Path("/stream")
    @Produces(MediaType.SERVER_SENT_EVENTS)
    public Multi<User> streamUsers() {
        return userService.streamActiveUsers();
    }
}

// Reactive User Service
@ApplicationScoped
public class ReactiveUserService {

    @Inject
    ReactiveUserRepository userRepository;

    @Inject
    @Channel("user-events")
    Emitter<UserEvent> userEventEmitter;

    public Uni<List<User>> findAll() {
        return userRepository.listAll();
    }

    public Uni<User> findById(Long id) {
        return userRepository.findById(id);
    }

    public Uni<User> create(User user) {
        return userRepository.persist(user)
                .invoke(created -> {
                    // Emit event asynchronously
                    userEventEmitter.send(new UserCreatedEvent(created.id));
                });
    }

    public Multi<User> streamActiveUsers() {
        return Multi.createFrom().ticks().every(Duration.ofSeconds(5))
                .flatMap(tick -> userRepository.findActive().toMulti());
    }

    // Reactive HTTP client example
    @Inject
    @RestClient
    ExternalApiClient externalApiClient;

    public Uni<UserValidationResult> validateUserExternal(User user) {
        return externalApiClient.validateUser(user)
                .onFailure().retry().atMost(3)
                .onFailure().recoverWithItem(UserValidationResult.failed("External validation failed"));
    }
}

// Reactive Repository
@ApplicationScoped
public class ReactiveUserRepository implements PanacheRepositoryBase<User, Long> {

    public Uni<User> findByEmail(String email) {
        return find("email", email).firstResult();
    }

    public Uni<List<User>> findActive() {
        return find("active", true).list();
    }

    public Uni<Long> countByStatus(String status) {
        return count("status", status);
    }
}

// External API client
@RegisterRestClient(configKey = "external-api")
public interface ExternalApiClient {

    @POST
    @Path("/validate-user")
    Uni<UserValidationResult> validateUser(User user);

    @GET
    @Path("/users/{id}/status")
    Uni<UserStatus> getUserStatus(@PathParam("id") Long id);
}
```

### 3. Quarkus Native Compilation

```bash
# Build native executable
./mvnw package -Pnative

# Build native container image
./mvnw package -Pnative -Dquarkus.native.container-build=true

# Docker build for native
FROM quay.io/quarkus/ubi-quarkus-native-image:21.3-java17 AS build
COPY --chown=quarkus:quarkus mvnw /code/mvnw
COPY --chown=quarkus:quarkus .mvn /code/.mvn
COPY --chown=quarkus:quarkus pom.xml /code/
USER quarkus
WORKDIR /code
RUN ./mvnw dependency:go-offline -B

COPY src /code/src
RUN ./mvnw package -Pnative -DskipTests

FROM quay.io/quarkus/quarkus-micro-image:1.0
WORKDIR /work/
COPY --from=build /code/target/*-runner /work/application

EXPOSE 8080
USER 1001

CMD ["./application", "-Dquarkus.http.host=0.0.0.0"]
```

### 4. Quarkus Configuration and Profiles

```properties
# application.properties
quarkus.application.name=user-service
quarkus.http.port=8080

# Database configuration
quarkus.datasource.db-kind=postgresql
quarkus.datasource.username=${DB_USERNAME:user}
quarkus.datasource.password=${DB_PASSWORD:password}
quarkus.datasource.jdbc.url=jdbc:postgresql://localhost:5432/userdb

# Hibernate ORM
quarkus.hibernate-orm.database.generation=update
quarkus.hibernate-orm.log.sql=false

# Health checks
quarkus.smallrye-health.ui.enable=true

# Metrics
quarkus.micrometer.enabled=true
quarkus.micrometer.export.prometheus.enabled=true

# OpenAPI
quarkus.swagger-ui.always-include=true

# Native compilation
quarkus.native.additional-build-args=--initialize-at-run-time=org.apache.commons.logging.LogFactory

# Profile-specific configurations
%dev.quarkus.log.level=DEBUG
%dev.quarkus.hibernate-orm.log.sql=true

%test.quarkus.datasource.db-kind=h2
%test.quarkus.datasource.jdbc.url=jdbc:h2:mem:testdb

%prod.quarkus.log.level=INFO
%prod.quarkus.datasource.jdbc.url=${DATABASE_URL}
```

## Service Mesh with Istio

### 1. Istio Configuration

```yaml
# User Service Deployment
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
      version: v1
  template:
    metadata:
      labels:
        app: user-service
        version: v1
      annotations:
        sidecar.istio.io/inject: "true"
    spec:
      containers:
      - name: user-service
        image: user-service:latest
        ports:
        - containerPort: 8080
        env:
        - name: SPRING_PROFILES_ACTIVE
          value: "kubernetes"

---
# Service
apiVersion: v1
kind: Service
metadata:
  name: user-service
  labels:
    app: user-service
spec:
  ports:
  - port: 80
    targetPort: 8080
    name: http
  selector:
    app: user-service

---
# Virtual Service
apiVersion: networking.istio.io/v1beta1
kind: VirtualService
metadata:
  name: user-service
spec:
  hosts:
  - user-service
  http:
  - match:
    - headers:
        user-type:
          exact: premium
    route:
    - destination:
        host: user-service
        subset: v2
      weight: 100
  - route:
    - destination:
        host: user-service
        subset: v1
      weight: 90
    - destination:
        host: user-service
        subset: v2
      weight: 10

---
# Destination Rule
apiVersion: networking.istio.io/v1beta1
kind: DestinationRule
metadata:
  name: user-service
spec:
  host: user-service
  trafficPolicy:
    circuitBreaker:
      consecutiveErrors: 3
      interval: 30s
      baseEjectionTime: 30s
      maxEjectionPercent: 50
    loadBalancer:
      simple: LEAST_CONN
  subsets:
  - name: v1
    labels:
      version: v1
  - name: v2
    labels:
      version: v2

---
# Authorization Policy
apiVersion: security.istio.io/v1beta1
kind: AuthorizationPolicy
metadata:
  name: user-service-authz
spec:
  selector:
    matchLabels:
      app: user-service
  rules:
  - from:
    - source:
        principals: ["cluster.local/ns/default/sa/api-gateway"]
  - to:
    - operation:
        methods: ["GET", "POST", "PUT", "DELETE"]
```

### 2. Observability with Istio

```java
// Custom metrics for Istio
@Component
public class IstioMetrics {

    @EventListener
    public void handleHttpRequest(HttpRequestEvent event) {
        // Istio automatically collects these metrics
        // Custom business metrics can be added
        Metrics.counter("business.user.operations",
                "operation", event.getOperation(),
                "status", event.getStatus())
                .increment();
    }
}

// Distributed tracing configuration
@Configuration
public class TracingConfig {

    @Bean
    public JaegerTracer jaegerTracer() {
        return Configuration.fromEnv("user-service")
                .getTracer();
    }

    @Bean
    public TracingFilter tracingFilter() {
        return new TracingFilter(jaegerTracer());
    }
}
```

## Event-Driven Architecture

### 1. Event Sourcing with Apache Kafka

```java
// Event Store
@Service
public class EventStore {

    @Autowired
    private KafkaTemplate<String, DomainEvent> kafkaTemplate;

    public void saveEvent(DomainEvent event) {
        String topic = getTopicForEvent(event);
        String key = event.getAggregateId();

        kafkaTemplate.send(topic, key, event)
                .addCallback(
                    result -> log.info("Event saved: {}", event),
                    failure -> log.error("Failed to save event: {}", event, failure)
                );
    }

    private String getTopicForEvent(DomainEvent event) {
        return "events." + event.getClass().getSimpleName().toLowerCase();
    }
}

// Event Handlers
@Component
public class UserEventHandler {

    @KafkaListener(topics = "events.usercreated", groupId = "user-projection")
    public void handleUserCreated(UserCreatedEvent event) {
        log.info("Handling user created event: {}", event);
        // Update read models, send notifications, etc.
        updateUserProjection(event);
        sendWelcomeEmail(event);
    }

    @KafkaListener(topics = "events.userupdated", groupId = "user-projection")
    public void handleUserUpdated(UserUpdatedEvent event) {
        log.info("Handling user updated event: {}", event);
        updateUserProjection(event);
    }

    @KafkaListener(topics = "events.userdeleted", groupId = "user-projection")
    public void handleUserDeleted(UserDeletedEvent event) {
        log.info("Handling user deleted event: {}", event);
        removeUserProjection(event);
    }

    private void updateUserProjection(UserEvent event) {
        // Update read model
    }

    private void sendWelcomeEmail(UserCreatedEvent event) {
        // Send welcome email
    }

    private void removeUserProjection(UserDeletedEvent event) {
        // Remove from read model
    }
}

// Saga Pattern for distributed transactions
@Component
public class OrderSaga {

    @SagaOrchestrationStart
    @KafkaListener(topics = "commands.createorder", groupId = "order-saga")
    public void handleCreateOrder(CreateOrderCommand command) {
        // Step 1: Reserve inventory
        publishCommand(new ReserveInventoryCommand(command.getOrderId(), command.getItems()));
    }

    @SagaOrchestrationStep
    @KafkaListener(topics = "events.inventoryreserved", groupId = "order-saga")
    public void handleInventoryReserved(InventoryReservedEvent event) {
        // Step 2: Process payment
        publishCommand(new ProcessPaymentCommand(event.getOrderId(), event.getAmount()));
    }

    @SagaOrchestrationStep
    @KafkaListener(topics = "events.paymentprocessed", groupId = "order-saga")
    public void handlePaymentProcessed(PaymentProcessedEvent event) {
        // Step 3: Confirm order
        publishCommand(new ConfirmOrderCommand(event.getOrderId()));
    }

    @SagaOrchestrationCompensation
    @KafkaListener(topics = "events.paymentfailed", groupId = "order-saga")
    public void handlePaymentFailed(PaymentFailedEvent event) {
        // Compensate: Release inventory
        publishCommand(new ReleaseInventoryCommand(event.getOrderId()));
    }
}
```

### 2. CQRS Implementation

```java
// Command Side
@RestController
@RequestMapping("/api/users/commands")
public class UserCommandController {

    @Autowired
    private CommandBus commandBus;

    @PostMapping
    public ResponseEntity<String> createUser(@RequestBody CreateUserCommand command) {
        String userId = commandBus.send(command);
        return ResponseEntity.status(HttpStatus.ACCEPTED)
                .body(userId);
    }

    @PutMapping("/{id}")
    public ResponseEntity<Void> updateUser(@PathVariable String id,
                                         @RequestBody UpdateUserCommand command) {
        command.setUserId(id);
        commandBus.send(command);
        return ResponseEntity.accepted().build();
    }
}

// Query Side
@RestController
@RequestMapping("/api/users/queries")
public class UserQueryController {

    @Autowired
    private QueryBus queryBus;

    @GetMapping("/{id}")
    public ResponseEntity<UserView> getUser(@PathVariable String id) {
        GetUserQuery query = new GetUserQuery(id);
        UserView user = queryBus.send(query);
        return ResponseEntity.ok(user);
    }

    @GetMapping
    public ResponseEntity<List<UserView>> getUsers(@RequestParam(defaultValue = "0") int page,
                                                  @RequestParam(defaultValue = "20") int size) {
        GetUsersQuery query = new GetUsersQuery(page, size);
        List<UserView> users = queryBus.send(query);
        return ResponseEntity.ok(users);
    }
}

// Command Handlers
@Component
public class UserCommandHandler {

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private EventStore eventStore;

    @CommandHandler
    public String handle(CreateUserCommand command) {
        User user = User.create(command.getEmail(), command.getFirstName(), command.getLastName());

        userRepository.save(user);

        UserCreatedEvent event = new UserCreatedEvent(
            user.getId(),
            user.getEmail(),
            user.getFirstName(),
            user.getLastName()
        );
        eventStore.saveEvent(event);

        return user.getId();
    }

    @CommandHandler
    public void handle(UpdateUserCommand command) {
        User user = userRepository.findById(command.getUserId())
                .orElseThrow(() -> new UserNotFoundException(command.getUserId()));

        user.update(command.getFirstName(), command.getLastName());
        userRepository.save(user);

        UserUpdatedEvent event = new UserUpdatedEvent(
            user.getId(),
            user.getFirstName(),
            user.getLastName()
        );
        eventStore.saveEvent(event);
    }
}

// Query Handlers
@Component
public class UserQueryHandler {

    @Autowired
    private UserViewRepository userViewRepository;

    @QueryHandler
    public UserView handle(GetUserQuery query) {
        return userViewRepository.findById(query.getUserId())
                .orElseThrow(() -> new UserNotFoundException(query.getUserId()));
    }

    @QueryHandler
    public List<UserView> handle(GetUsersQuery query) {
        Pageable pageable = PageRequest.of(query.getPage(), query.getSize());
        return userViewRepository.findAll(pageable).getContent();
    }
}
```

## Claude Flow Integration for Microservices

### 1. Microservices Development Workflow

```bash
# Design microservices architecture
npx claude-flow-novice sparc run architect "Design Spring Cloud microservices architecture with service discovery"

# Generate individual services
npx claude-flow-novice sparc batch coder,tester "Create user microservice with Spring Boot and JPA"
npx claude-flow-novice sparc batch coder,tester "Create order microservice with Spring Boot and Kafka"
npx claude-flow-novice sparc batch coder,tester "Create notification microservice with Quarkus"

# Setup infrastructure components
npx claude-flow-novice sparc run coder "Create API Gateway with Spring Cloud Gateway"
npx claude-flow-novice sparc run coder "Setup Eureka service discovery"
npx claude-flow-novice sparc run coder "Configure Spring Cloud Config server"

# Implement cross-cutting concerns
npx claude-flow-novice sparc batch coder,reviewer "Add distributed tracing with Sleuth and Zipkin"
npx claude-flow-novice sparc batch coder,reviewer "Implement circuit breakers with Resilience4j"

# Create deployment manifests
npx claude-flow-novice sparc run architect "Create Kubernetes deployment manifests for microservices"
```

### 2. MCP Integration for Distributed Systems

```bash
# Initialize microservices development swarm
npx claude-flow-novice mcp swarm_init --topology mesh --max-agents 12

# Spawn microservices specialists
npx claude-flow-novice mcp agent_spawn --type architect --capabilities "microservices,spring-cloud,service-mesh"
npx claude-flow-novice mcp agent_spawn --type coder --capabilities "spring-boot,spring-cloud-gateway"
npx claude-flow-novice mcp agent_spawn --type coder --capabilities "quarkus,reactive,native"
npx claude-flow-novice mcp agent_spawn --type tester --capabilities "integration-testing,contract-testing"
npx claude-flow-novice mcp agent_spawn --type reviewer --capabilities "distributed-systems,performance"

# Spawn infrastructure specialists
npx claude-flow-novice mcp agent_spawn --type architect --capabilities "kubernetes,istio,helm"
npx claude-flow-novice mcp agent_spawn --type coder --capabilities "kafka,event-sourcing,cqrs"
npx claude-flow-novice mcp agent_spawn --type monitor --capabilities "prometheus,grafana,jaeger"

# Orchestrate microservices development
npx claude-flow-novice mcp task_orchestrate --task "Build complete microservices ecosystem" --strategy hierarchical
```

## Monitoring and Observability

### 1. Metrics and Monitoring

```java
// Custom metrics for microservices
@Component
public class MicroserviceMetrics {

    private final MeterRegistry meterRegistry;
    private final Counter serviceCallCounter;
    private final Timer serviceCallTimer;
    private final Gauge activeConnectionsGauge;

    public MicroserviceMetrics(MeterRegistry meterRegistry, ConnectionPool connectionPool) {
        this.meterRegistry = meterRegistry;

        this.serviceCallCounter = Counter.builder("microservice.calls.total")
                .description("Total service calls")
                .register(meterRegistry);

        this.serviceCallTimer = Timer.builder("microservice.call.duration")
                .description("Service call duration")
                .register(meterRegistry);

        this.activeConnectionsGauge = Gauge.builder("microservice.connections.active")
                .description("Active connections")
                .register(meterRegistry, connectionPool, ConnectionPool::getActiveCount);
    }

    @EventListener
    public void handleServiceCall(ServiceCallEvent event) {
        serviceCallCounter.increment(
            Tags.of(
                Tag.of("service", event.getServiceName()),
                Tag.of("method", event.getMethod()),
                Tag.of("status", event.getStatus())
            )
        );

        serviceCallTimer.record(event.getDuration(), TimeUnit.MILLISECONDS);
    }
}

// Health checks for microservices
@Component
public class MicroserviceHealthIndicator implements HealthIndicator {

    @Autowired
    private List<ExternalServiceClient> externalClients;

    @Override
    public Health health() {
        Health.Builder builder = Health.up();

        for (ExternalServiceClient client : externalClients) {
            try {
                boolean isHealthy = client.healthCheck();
                if (isHealthy) {
                    builder.withDetail(client.getServiceName(), "UP");
                } else {
                    builder.down().withDetail(client.getServiceName(), "DOWN");
                }
            } catch (Exception e) {
                builder.down().withDetail(client.getServiceName(), "ERROR: " + e.getMessage());
            }
        }

        return builder.build();
    }
}
```

### 2. Distributed Logging

```java
// Structured logging for microservices
@Component
public class StructuredLogger {

    private final Logger logger = LoggerFactory.getLogger(StructuredLogger.class);
    private final ObjectMapper objectMapper = new ObjectMapper();

    public void logServiceCall(String service, String method, long duration, String status) {
        try {
            Map<String, Object> logData = Map.of(
                "timestamp", Instant.now().toString(),
                "service", service,
                "method", method,
                "duration", duration,
                "status", status,
                "traceId", getCurrentTraceId(),
                "spanId", getCurrentSpanId()
            );

            logger.info("SERVICE_CALL {}", objectMapper.writeValueAsString(logData));
        } catch (Exception e) {
            logger.error("Failed to log service call", e);
        }
    }

    public void logBusinessEvent(String eventType, Map<String, Object> eventData) {
        try {
            Map<String, Object> logData = new HashMap<>(eventData);
            logData.put("timestamp", Instant.now().toString());
            logData.put("eventType", eventType);
            logData.put("traceId", getCurrentTraceId());

            logger.info("BUSINESS_EVENT {}", objectMapper.writeValueAsString(logData));
        } catch (Exception e) {
            logger.error("Failed to log business event", e);
        }
    }

    private String getCurrentTraceId() {
        // Get trace ID from Sleuth/Brave context
        TraceContext traceContext = CurrentTraceContext.current();
        return traceContext != null ? traceContext.traceIdString() : "unknown";
    }

    private String getCurrentSpanId() {
        // Get span ID from Sleuth/Brave context
        TraceContext traceContext = CurrentTraceContext.current();
        return traceContext != null ? traceContext.spanIdString() : "unknown";
    }
}
```

## Security in Microservices

### 1. JWT Token Propagation

```java
// JWT Token interceptor
@Component
public class JwtTokenInterceptor implements ClientHttpRequestInterceptor {

    @Override
    public ClientHttpResponse intercept(
            HttpRequest request,
            byte[] body,
            ClientHttpRequestExecution execution) throws IOException {

        String token = getCurrentJwtToken();
        if (token != null) {
            request.getHeaders().add("Authorization", "Bearer " + token);
        }

        return execution.execute(request, body);
    }

    private String getCurrentJwtToken() {
        SecurityContext context = SecurityContextHolder.getContext();
        Authentication auth = context.getAuthentication();

        if (auth instanceof JwtAuthenticationToken) {
            JwtAuthenticationToken jwtAuth = (JwtAuthenticationToken) auth;
            return jwtAuth.getToken().getTokenValue();
        }

        return null;
    }
}

// WebClient configuration with token propagation
@Configuration
public class WebClientConfig {

    @Bean
    public WebClient.Builder webClientBuilder() {
        return WebClient.builder()
                .filter(exchangeFilterFunction());
    }

    private ExchangeFilterFunction exchangeFilterFunction() {
        return ExchangeFilterFunction.ofRequestProcessor(clientRequest -> {
            String token = getCurrentJwtToken();
            if (token != null) {
                ClientRequest newRequest = ClientRequest.from(clientRequest)
                        .header("Authorization", "Bearer " + token)
                        .build();
                return Mono.just(newRequest);
            }
            return Mono.just(clientRequest);
        });
    }
}
```

### 2. Service-to-Service Authentication

```java
// OAuth2 client configuration
@Configuration
@EnableWebFluxSecurity
public class SecurityConfig {

    @Bean
    public ReactiveClientRegistrationRepository clientRegistrationRepository() {
        return new InMemoryReactiveClientRegistrationRepository(
            ClientRegistration.withRegistrationId("user-service")
                    .tokenUri("http://auth-service/oauth/token")
                    .clientId("user-service-client")
                    .clientSecret("user-service-secret")
                    .authorizationGrantType(AuthorizationGrantType.CLIENT_CREDENTIALS)
                    .build()
        );
    }

    @Bean
    public ReactiveOAuth2AuthorizedClientManager authorizedClientManager(
            ReactiveClientRegistrationRepository clientRegistrationRepository) {

        ReactiveOAuth2AuthorizedClientProvider authorizedClientProvider =
                ReactiveOAuth2AuthorizedClientProviderBuilder.builder()
                        .clientCredentials()
                        .build();

        DefaultReactiveOAuth2AuthorizedClientManager authorizedClientManager =
                new DefaultReactiveOAuth2AuthorizedClientManager(
                        clientRegistrationRepository,
                        new InMemoryReactiveOAuth2AuthorizedClientService(clientRegistrationRepository));

        authorizedClientManager.setAuthorizedClientProvider(authorizedClientProvider);

        return authorizedClientManager;
    }
}
```

## Testing Microservices

### 1. Contract Testing with Spring Cloud Contract

```groovy
// User service contract
Contract.make {
    description "should return user by ID"
    request {
        method GET()
        url "/api/users/1"
        headers {
            contentType(applicationJson())
        }
    }
    response {
        status OK()
        body([
            id: 1,
            email: "john.doe@example.com",
            firstName: "John",
            lastName: "Doe"
        ])
        headers {
            contentType(applicationJson())
        }
    }
}

// Contract test base class
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
public abstract class UserServiceContractTestBase {

    @Autowired
    private WebApplicationContext context;

    @MockBean
    private UserService userService;

    @BeforeEach
    public void setup() {
        RestAssuredMockMvc.webAppContextSetup(context);

        // Setup mock data
        User user = User.builder()
                .id(1L)
                .email("john.doe@example.com")
                .firstName("John")
                .lastName("Doe")
                .build();

        when(userService.findById(1L)).thenReturn(Optional.of(user));
    }
}
```

### 2. Integration Testing with TestContainers

```java
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Testcontainers
class MicroserviceIntegrationTest {

    @Container
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:15");

    @Container
    static KafkaContainer kafka = new KafkaContainer(DockerImageName.parse("confluentinc/cp-kafka:latest"));

    @Container
    static GenericContainer<?> redis = new GenericContainer<>("redis:7-alpine")
            .withExposedPorts(6379);

    @DynamicPropertySource
    static void configureProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", postgres::getJdbcUrl);
        registry.add("spring.datasource.username", postgres::getUsername);
        registry.add("spring.datasource.password", postgres::getPassword);

        registry.add("spring.kafka.bootstrap-servers", kafka::getBootstrapServers);

        registry.add("spring.redis.host", redis::getHost);
        registry.add("spring.redis.port", redis::getFirstMappedPort);
    }

    @Test
    void shouldProcessUserCreationEndToEnd() {
        // Test complete user creation flow including:
        // - REST API call
        // - Database persistence
        // - Kafka event publishing
        // - Redis caching
    }
}
```

## Best Practices

### 1. Data Management

- **Database per Service**: Each microservice owns its data
- **Eventual Consistency**: Accept eventual consistency between services
- **Event Sourcing**: Store events rather than current state
- **CQRS**: Separate read and write models

### 2. Communication Patterns

- **Synchronous**: REST, GraphQL for real-time queries
- **Asynchronous**: Message queues for loose coupling
- **Circuit Breakers**: Prevent cascade failures
- **Timeouts**: Set appropriate timeouts for all calls

### 3. Deployment Strategies

- **Blue-Green Deployment**: Zero-downtime deployments
- **Canary Deployment**: Gradual rollout to subset of users
- **Rolling Updates**: Update instances one by one
- **Feature Flags**: Control feature rollout independently

## Next Steps

- [Claude Flow Agent Coordination](claude-flow-integration.md)
- [Spring Boot Development](spring-boot.md)
- [Enterprise Java Development](enterprise-java.md)
- [Performance Optimization](performance.md)
- [Testing Strategies](testing.md)