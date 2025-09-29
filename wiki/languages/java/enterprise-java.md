# Enterprise Java Development with JEE/Jakarta EE

This guide covers comprehensive Enterprise Java development using Jakarta EE (formerly Java EE), including modern patterns, cloud deployment, and Claude Flow integration for large-scale enterprise applications.

## Quick Start

### Jakarta EE Application Structure

```java
@ApplicationScoped
@Startup
public class ApplicationBootstrap {

    @PostConstruct
    public void initialize() {
        // Application initialization logic
    }
}
```

### With Claude Flow Integration

```bash
# Generate Jakarta EE application with agents
npx claude-flow-novice sparc run architect "Design Jakarta EE enterprise application"

# Setup enterprise patterns
npx claude-flow-novice sparc batch architect,coder "Implement Jakarta EE with microprofile"
```

## Core Jakarta EE Components

### 1. CDI (Contexts and Dependency Injection)

```java
// Bean definition
@ApplicationScoped
public class UserService {

    @Inject
    private UserRepository userRepository;

    @Inject
    private EntityManager entityManager;

    @Inject
    private Event<UserCreatedEvent> userCreatedEvent;

    @Transactional
    public User createUser(CreateUserRequest request) {
        User user = new User();
        user.setEmail(request.getEmail());
        user.setFirstName(request.getFirstName());
        user.setLastName(request.getLastName());

        User savedUser = userRepository.save(user);
        userCreatedEvent.fire(new UserCreatedEvent(savedUser.getId()));

        return savedUser;
    }
}

// Custom qualifier
@Qualifier
@Retention(RetentionPolicy.RUNTIME)
@Target({ElementType.FIELD, ElementType.METHOD, ElementType.PARAMETER, ElementType.TYPE})
public @interface Database {
    DatabaseType value();
}

public enum DatabaseType {
    PRIMARY, SECONDARY
}

// Producer method
@ApplicationScoped
public class DatabaseProducer {

    @Produces
    @Database(DatabaseType.PRIMARY)
    @PersistenceContext(unitName = "primary")
    private EntityManager primaryEntityManager;

    @Produces
    @Database(DatabaseType.SECONDARY)
    @PersistenceContext(unitName = "secondary")
    private EntityManager secondaryEntityManager;
}

// Event handling
@ApplicationScoped
public class UserEventHandler {

    @Observes
    public void handleUserCreated(@Observes UserCreatedEvent event) {
        // Handle user creation event
        System.out.println("User created: " + event.getUserId());
    }

    @Observes
    @TransactionPhase(TransactionPhase.AFTER_SUCCESS)
    public void handleUserCreatedAfterTransaction(@Observes UserCreatedEvent event) {
        // Handle after transaction success
    }
}
```

### 2. JAX-RS REST Services

```java
@Path("/api/users")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
@RequestScoped
public class UserResource {

    @Inject
    private UserService userService;

    @Context
    private UriInfo uriInfo;

    @Context
    private SecurityContext securityContext;

    @GET
    @RolesAllowed({"USER", "ADMIN"})
    public Response getUsers(
            @QueryParam("page") @DefaultValue("0") int page,
            @QueryParam("size") @DefaultValue("20") int size,
            @QueryParam("sort") String sort) {

        Page<User> users = userService.findAll(page, size, sort);

        GenericEntity<List<User>> entity = new GenericEntity<List<User>>(users.getContent()) {};

        return Response.ok(entity)
                .header("X-Total-Count", users.getTotalElements())
                .header("X-Page-Number", users.getNumber())
                .header("X-Page-Size", users.getSize())
                .build();
    }

    @GET
    @Path("/{id}")
    @RolesAllowed({"USER", "ADMIN"})
    public Response getUser(@PathParam("id") Long id) {
        return userService.findById(id)
                .map(user -> Response.ok(user).build())
                .orElse(Response.status(Response.Status.NOT_FOUND).build());
    }

    @POST
    @RolesAllowed({"ADMIN"})
    @Valid
    public Response createUser(@Valid CreateUserRequest request) {
        User created = userService.createUser(request);

        URI location = uriInfo.getAbsolutePathBuilder()
                .path(created.getId().toString())
                .build();

        return Response.created(location).entity(created).build();
    }

    @PUT
    @Path("/{id}")
    @RolesAllowed({"ADMIN"})
    public Response updateUser(@PathParam("id") Long id, @Valid UpdateUserRequest request) {
        return userService.updateUser(id, request)
                .map(user -> Response.ok(user).build())
                .orElse(Response.status(Response.Status.NOT_FOUND).build());
    }

    @DELETE
    @Path("/{id}")
    @RolesAllowed({"ADMIN"})
    public Response deleteUser(@PathParam("id") Long id) {
        userService.deleteUser(id);
        return Response.noContent().build();
    }
}

// Exception handling
@Provider
public class ValidationExceptionMapper implements ExceptionMapper<ConstraintViolationException> {

    @Override
    public Response toResponse(ConstraintViolationException exception) {
        Set<ConstraintViolation<?>> violations = exception.getConstraintViolations();

        List<ValidationError> errors = violations.stream()
                .map(violation -> new ValidationError(
                    violation.getPropertyPath().toString(),
                    violation.getMessage()
                ))
                .collect(Collectors.toList());

        ErrorResponse errorResponse = new ErrorResponse("Validation failed", errors);

        return Response.status(Response.Status.BAD_REQUEST)
                .entity(errorResponse)
                .build();
    }
}
```

### 3. JPA (Java Persistence API)

```java
@Entity
@Table(name = "users")
@NamedQueries({
    @NamedQuery(
        name = "User.findByEmail",
        query = "SELECT u FROM User u WHERE u.email = :email"
    ),
    @NamedQuery(
        name = "User.findActiveUsers",
        query = "SELECT u FROM User u WHERE u.active = true ORDER BY u.createdAt DESC"
    )
})
@NamedEntityGraph(
    name = "User.withDepartment",
    attributeNodes = @NamedAttributeNode("department")
)
public class User {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, length = 255)
    @Email
    private String email;

    @Column(nullable = false, length = 100)
    @NotBlank
    private String firstName;

    @Column(nullable = false, length = 100)
    @NotBlank
    private String lastName;

    @Column(nullable = false)
    private Boolean active = true;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "department_id")
    private Department department;

    @OneToMany(mappedBy = "user", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<UserRole> roles = new ArrayList<>();

    @CreationTimestamp
    @Column(nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(nullable = false)
    private LocalDateTime updatedAt;

    @Version
    private Long version;

    // Constructors, getters, setters, equals, hashCode
}

@ApplicationScoped
public class UserRepository {

    @PersistenceContext
    private EntityManager entityManager;

    public Optional<User> findById(Long id) {
        User user = entityManager.find(User.class, id);
        return Optional.ofNullable(user);
    }

    public Optional<User> findByEmail(String email) {
        try {
            User user = entityManager.createNamedQuery("User.findByEmail", User.class)
                    .setParameter("email", email)
                    .getSingleResult();
            return Optional.of(user);
        } catch (NoResultException e) {
            return Optional.empty();
        }
    }

    public Page<User> findAll(int page, int size, String sort) {
        CriteriaBuilder cb = entityManager.getCriteriaBuilder();
        CriteriaQuery<User> query = cb.createQuery(User.class);
        Root<User> root = query.from(User.class);

        // Add sorting
        if (sort != null && !sort.isEmpty()) {
            Order order = sort.startsWith("-") ?
                cb.desc(root.get(sort.substring(1))) :
                cb.asc(root.get(sort));
            query.orderBy(order);
        }

        TypedQuery<User> typedQuery = entityManager.createQuery(query);
        typedQuery.setFirstResult(page * size);
        typedQuery.setMaxResults(size);

        List<User> users = typedQuery.getResultList();

        // Count query for total elements
        CriteriaQuery<Long> countQuery = cb.createQuery(Long.class);
        countQuery.select(cb.count(countQuery.from(User.class)));
        Long total = entityManager.createQuery(countQuery).getSingleResult();

        return new Page<>(users, page, size, total);
    }

    @Transactional
    public User save(User user) {
        if (user.getId() == null) {
            entityManager.persist(user);
            return user;
        } else {
            return entityManager.merge(user);
        }
    }

    @Transactional
    public void delete(User user) {
        if (entityManager.contains(user)) {
            entityManager.remove(user);
        } else {
            entityManager.remove(entityManager.merge(user));
        }
    }
}
```

### 4. JMS (Java Message Service)

```java
@MessageDriven(
    activationConfig = {
        @ActivationConfigProperty(propertyName = "destination", propertyValue = "java:/jms/queue/UserQueue"),
        @ActivationConfigProperty(propertyName = "destinationType", propertyValue = "javax.jms.Queue"),
        @ActivationConfigProperty(propertyName = "acknowledgeMode", propertyValue = "Auto-acknowledge")
    }
)
public class UserMessageListener implements MessageListener {

    @Inject
    private UserService userService;

    @Override
    public void onMessage(Message message) {
        try {
            if (message instanceof TextMessage) {
                TextMessage textMessage = (TextMessage) message;
                String messageBody = textMessage.getText();

                // Process the message
                ObjectMapper mapper = new ObjectMapper();
                UserMessage userMessage = mapper.readValue(messageBody, UserMessage.class);

                switch (userMessage.getType()) {
                    case "USER_CREATED":
                        handleUserCreated(userMessage);
                        break;
                    case "USER_UPDATED":
                        handleUserUpdated(userMessage);
                        break;
                    default:
                        System.out.println("Unknown message type: " + userMessage.getType());
                }
            }
        } catch (Exception e) {
            throw new RuntimeException("Error processing message", e);
        }
    }

    private void handleUserCreated(UserMessage message) {
        // Handle user created event
        System.out.println("Processing user created: " + message.getUserId());
    }

    private void handleUserUpdated(UserMessage message) {
        // Handle user updated event
        System.out.println("Processing user updated: " + message.getUserId());
    }
}

@ApplicationScoped
public class MessageProducer {

    @Resource(lookup = "java:/jms/queue/UserQueue")
    private Queue userQueue;

    @Inject
    private JMSContext jmsContext;

    public void sendUserMessage(UserMessage message) {
        try {
            ObjectMapper mapper = new ObjectMapper();
            String messageBody = mapper.writeValueAsString(message);

            jmsContext.createProducer()
                    .setProperty("messageType", message.getType())
                    .send(userQueue, messageBody);

        } catch (Exception e) {
            throw new RuntimeException("Error sending message", e);
        }
    }
}
```

### 5. EJB (Enterprise JavaBeans)

```java
@Stateless
@LocalBean
public class UserEJB {

    @PersistenceContext
    private EntityManager entityManager;

    @Resource
    private SessionContext sessionContext;

    @RolesAllowed({"ADMIN", "USER"})
    public List<User> findAllUsers() {
        return entityManager.createQuery("SELECT u FROM User u", User.class)
                .getResultList();
    }

    @RolesAllowed({"ADMIN"})
    @TransactionAttribute(TransactionAttributeType.REQUIRED)
    public User createUser(CreateUserRequest request) {
        User user = new User();
        user.setEmail(request.getEmail());
        user.setFirstName(request.getFirstName());
        user.setLastName(request.getLastName());

        entityManager.persist(user);
        return user;
    }

    @RolesAllowed({"ADMIN"})
    @TransactionAttribute(TransactionAttributeType.REQUIRED)
    public void deleteUser(Long userId) {
        User user = entityManager.find(User.class, userId);
        if (user != null) {
            entityManager.remove(user);
        } else {
            throw new EntityNotFoundException("User not found: " + userId);
        }
    }

    @PermitAll
    @Schedule(hour = "2", minute = "0", persistent = false)
    public void cleanupInactiveUsers() {
        LocalDateTime cutoffDate = LocalDateTime.now().minusDays(90);

        int deletedCount = entityManager.createQuery(
                "DELETE FROM User u WHERE u.active = false AND u.lastLoginAt < :cutoffDate")
                .setParameter("cutoffDate", cutoffDate)
                .executeUpdate();

        System.out.println("Cleaned up " + deletedCount + " inactive users");
    }
}

@Singleton
@Startup
@ConcurrencyManagement(ConcurrencyManagementType.CONTAINER)
@Lock(LockType.READ)
public class CacheManagerEJB {

    private final Map<String, Object> cache = new ConcurrentHashMap<>();

    @PostConstruct
    public void initialize() {
        System.out.println("Cache manager initialized");
    }

    @Lock(LockType.WRITE)
    public void put(String key, Object value) {
        cache.put(key, value);
    }

    public Object get(String key) {
        return cache.get(key);
    }

    @Lock(LockType.WRITE)
    public void clear() {
        cache.clear();
    }

    @Schedule(hour = "*", minute = "*/30", persistent = false)
    @Lock(LockType.WRITE)
    public void cleanupExpiredEntries() {
        // Cleanup logic
    }
}
```

## MicroProfile Integration

### Configuration

```java
@ApplicationScoped
public class DatabaseConfig {

    @Inject
    @ConfigProperty(name = "database.url")
    private String databaseUrl;

    @Inject
    @ConfigProperty(name = "database.username")
    private String username;

    @Inject
    @ConfigProperty(name = "database.password")
    private String password;

    @Inject
    @ConfigProperty(name = "database.pool.max-size", defaultValue = "20")
    private Integer maxPoolSize;

    @Inject
    @ConfigProperty(name = "feature.user.registration.enabled", defaultValue = "true")
    private Boolean userRegistrationEnabled;

    // Getters
}

// Configuration source
@ApplicationScoped
public class DatabaseConfigSource implements ConfigSource {

    private final Map<String, String> properties = new HashMap<>();

    public DatabaseConfigSource() {
        // Load from database or external source
        properties.put("database.pool.max-size", "25");
    }

    @Override
    public Map<String, String> getProperties() {
        return properties;
    }

    @Override
    public String getValue(String propertyName) {
        return properties.get(propertyName);
    }

    @Override
    public String getName() {
        return "DatabaseConfigSource";
    }

    @Override
    public int getOrdinal() {
        return 200;
    }
}
```

### Health Checks

```java
@Health
@ApplicationScoped
public class DatabaseHealthCheck implements HealthCheck {

    @PersistenceContext
    private EntityManager entityManager;

    @Override
    public HealthCheckResponse call() {
        try {
            entityManager.createNativeQuery("SELECT 1").getSingleResult();
            return HealthCheckResponse.up("Database");
        } catch (Exception e) {
            return HealthCheckResponse.down("Database")
                    .withData("error", e.getMessage());
        }
    }
}

@Liveness
@ApplicationScoped
public class LivenessHealthCheck implements HealthCheck {

    @Override
    public HealthCheckResponse call() {
        // Check if application is running
        return HealthCheckResponse.up("Application");
    }
}

@Readiness
@ApplicationScoped
public class ReadinessHealthCheck implements HealthCheck {

    @Inject
    private UserService userService;

    @Override
    public HealthCheckResponse call() {
        try {
            // Check if application is ready to serve requests
            userService.healthCheck();
            return HealthCheckResponse.up("Application ready");
        } catch (Exception e) {
            return HealthCheckResponse.down("Application not ready")
                    .withData("error", e.getMessage());
        }
    }
}
```

### Metrics

```java
@ApplicationScoped
public class UserMetrics {

    @Metric(name = "users_created_total", description = "Total number of users created")
    private Counter usersCreated;

    @Metric(name = "user_creation_duration", description = "User creation duration")
    private Timer userCreationTimer;

    @Gauge(name = "active_users_total", description = "Total number of active users")
    public long getActiveUsersCount() {
        // Return count of active users
        return userService.countActiveUsers();
    }

    public void recordUserCreated() {
        usersCreated.inc();
    }

    public Timer.Context startUserCreationTimer() {
        return userCreationTimer.time();
    }
}
```

### OpenAPI Documentation

```java
@OpenAPIDefinition(
    info = @Info(
        title = "User Management API",
        version = "1.0.0",
        description = "Enterprise user management service",
        contact = @Contact(
            name = "Development Team",
            email = "dev@example.com"
        ),
        license = @License(
            name = "Apache 2.0",
            url = "https://www.apache.org/licenses/LICENSE-2.0.html"
        )
    ),
    security = @SecurityRequirement(name = "jwt"),
    servers = {
        @Server(url = "http://localhost:8080", description = "Development server"),
        @Server(url = "https://api.example.com", description = "Production server")
    }
)
@SecurityScheme(
    securitySchemeName = "jwt",
    type = SecuritySchemeType.HTTP,
    scheme = "bearer",
    bearerFormat = "JWT"
)
@ApplicationPath("/api")
public class RestApplication extends Application {
}

@Path("/users")
@Tag(name = "Users", description = "User management operations")
public class UserResource {

    @GET
    @Operation(
        summary = "Get all users",
        description = "Retrieve a paginated list of all users"
    )
    @APIResponses({
        @APIResponse(
            responseCode = "200",
            description = "Users retrieved successfully",
            content = @Content(
                mediaType = MediaType.APPLICATION_JSON,
                schema = @Schema(implementation = User.class)
            )
        ),
        @APIResponse(
            responseCode = "403",
            description = "Access denied"
        )
    })
    @SecurityRequirement(name = "jwt")
    public Response getUsers(
            @Parameter(description = "Page number", example = "0")
            @QueryParam("page") @DefaultValue("0") int page,

            @Parameter(description = "Page size", example = "20")
            @QueryParam("size") @DefaultValue("20") int size) {
        // Implementation
    }
}
```

## Security

### JWT Authentication

```java
@ApplicationScoped
public class JWTAuthenticationMechanism implements HttpAuthenticationMechanism {

    @Inject
    private JWTTokenProvider tokenProvider;

    @Override
    public AuthenticationStatus validateRequest(
            HttpServletRequest request,
            HttpServletResponse response,
            HttpMessageContext httpMessageContext) {

        String authHeader = request.getHeader("Authorization");

        if (authHeader != null && authHeader.startsWith("Bearer ")) {
            String token = authHeader.substring(7);

            if (tokenProvider.validateToken(token)) {
                String username = tokenProvider.getUsernameFromToken(token);
                Set<String> roles = tokenProvider.getRolesFromToken(token);

                return httpMessageContext.notifyContainerAboutLogin(
                    new UserPrincipal(username),
                    new HashSet<>(roles)
                );
            }
        }

        return httpMessageContext.responseUnauthorized();
    }
}

@ApplicationScoped
public class UserIdentityStore implements IdentityStore {

    @Inject
    private UserService userService;

    @Override
    public CredentialValidationResult validate(UsernamePasswordCredential credential) {
        String username = credential.getCaller();
        String password = credential.getPasswordAsString();

        Optional<User> user = userService.authenticate(username, password);

        if (user.isPresent()) {
            Set<String> roles = userService.getUserRoles(user.get().getId());
            return new CredentialValidationResult(username, roles);
        }

        return CredentialValidationResult.INVALID_RESULT;
    }
}
```

### Role-Based Security

```java
@DeclareRoles({"ADMIN", "USER", "MANAGER"})
@ApplicationScoped
public class SecurityConfig {

    @Produces
    @RequestScoped
    public Principal getCurrentPrincipal(@Context SecurityContext securityContext) {
        return securityContext.getUserPrincipal();
    }
}

@Interceptor
@Secured
@Priority(Interceptor.Priority.APPLICATION)
public class SecurityInterceptor {

    @Context
    private SecurityContext securityContext;

    @AroundInvoke
    public Object checkSecurity(InvocationContext context) throws Exception {
        Secured secured = context.getMethod().getAnnotation(Secured.class);

        if (secured != null) {
            String[] requiredRoles = secured.value();

            for (String role : requiredRoles) {
                if (securityContext.isUserInRole(role)) {
                    return context.proceed();
                }
            }

            throw new SecurityException("Access denied");
        }

        return context.proceed();
    }
}

@Qualifier
@Retention(RetentionPolicy.RUNTIME)
@InterceptorBinding
public @interface Secured {
    String[] value() default {};
}
```

## Testing

### Arquillian Integration Tests

```java
@RunWith(Arquillian.class)
public class UserServiceIT {

    @Deployment
    public static WebArchive createDeployment() {
        return ShrinkWrap.create(WebArchive.class, "test.war")
                .addClasses(User.class, UserService.class, UserRepository.class)
                .addAsResource("META-INF/persistence.xml")
                .addAsWebInfResource(EmptyAsset.INSTANCE, "beans.xml");
    }

    @Inject
    private UserService userService;

    @PersistenceContext
    private EntityManager entityManager;

    @Test
    @Transactional
    public void shouldCreateUser() {
        // Given
        CreateUserRequest request = new CreateUserRequest("test@example.com", "John", "Doe");

        // When
        User created = userService.createUser(request);

        // Then
        assertThat(created).isNotNull();
        assertThat(created.getId()).isNotNull();
        assertThat(created.getEmail()).isEqualTo("test@example.com");

        // Verify in database
        User found = entityManager.find(User.class, created.getId());
        assertThat(found).isNotNull();
        assertThat(found.getEmail()).isEqualTo("test@example.com");
    }
}
```

### REST Endpoint Tests

```java
@RunWith(Arquillian.class)
public class UserResourceIT {

    @Deployment(testable = false)
    public static WebArchive createDeployment() {
        return ShrinkWrap.create(WebArchive.class, "test.war")
                .addPackages(true, "com.example")
                .addAsResource("META-INF/persistence.xml")
                .addAsWebInfResource(EmptyAsset.INSTANCE, "beans.xml");
    }

    @ArquillianResource
    private URL baseURL;

    private Client client;

    @Before
    public void setUp() {
        client = ClientBuilder.newClient();
    }

    @After
    public void tearDown() {
        client.close();
    }

    @Test
    public void shouldCreateUser() {
        // Given
        CreateUserRequest request = new CreateUserRequest("test@example.com", "John", "Doe");

        // When
        Response response = client.target(baseURL.toString())
                .path("api/users")
                .request(MediaType.APPLICATION_JSON)
                .post(Entity.entity(request, MediaType.APPLICATION_JSON));

        // Then
        assertThat(response.getStatus()).isEqualTo(Response.Status.CREATED.getStatusCode());

        User created = response.readEntity(User.class);
        assertThat(created.getEmail()).isEqualTo("test@example.com");
    }
}
```

## Cloud Deployment

### Docker Configuration

```dockerfile
# Multi-stage build for Jakarta EE application
FROM maven:3.8.6-openjdk-17 AS builder

WORKDIR /app
COPY pom.xml .
COPY src src

RUN mvn clean package -DskipTests

FROM payara/server-full:5.2022.5-jdk17

# Copy application
COPY --from=builder /app/target/*.war $DEPLOY_DIR

# Copy configuration
COPY src/main/resources/payara-resources.xml $PAYARA_DIR/domains/domain1/config/

# Set environment variables
ENV JDBC_URL="jdbc:postgresql://db:5432/userdb"
ENV JDBC_USERNAME="user"
ENV JDBC_PASSWORD=$DB_PASSWORD

EXPOSE 8080 4848

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD curl -f http://localhost:8080/health || exit 1
```

### Kubernetes Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: user-service
  labels:
    app: user-service
spec:
  replicas: 3
  selector:
    matchLabels:
      app: user-service
  template:
    metadata:
      labels:
        app: user-service
    spec:
      containers:
      - name: user-service
        image: user-service:latest
        ports:
        - containerPort: 8080
        env:
        - name: JDBC_URL
          valueFrom:
            secretKeyRef:
              name: database-secret
              key: url
        - name: JDBC_USERNAME
          valueFrom:
            secretKeyRef:
              name: database-secret
              key: username
        - name: JDBC_PASSWORD
          valueFrom:
            secretKeyRef:
              name: database-secret
              key: password
        resources:
          requests:
            memory: "512Mi"
            cpu: "250m"
          limits:
            memory: "1Gi"
            cpu: "500m"
        livenessProbe:
          httpGet:
            path: /health/live
            port: 8080
          initialDelaySeconds: 60
          periodSeconds: 30
        readinessProbe:
          httpGet:
            path: /health/ready
            port: 8080
          initialDelaySeconds: 30
          periodSeconds: 10

---
apiVersion: v1
kind: Service
metadata:
  name: user-service
spec:
  selector:
    app: user-service
  ports:
  - port: 80
    targetPort: 8080
  type: ClusterIP
```

## Claude Flow Integration

### Enterprise Development Workflow

```bash
# Initialize enterprise project with agents
npx claude-flow-novice sparc run architect "Design Jakarta EE enterprise architecture"

# Generate enterprise components
npx claude-flow-novice sparc batch coder,tester "Create Jakarta EE components with EJB and JPA"

# Setup security
npx claude-flow-novice sparc run coder "Implement JWT security with Jakarta Security"

# Create comprehensive tests
npx claude-flow-novice sparc run tester "Generate Arquillian integration tests"

# Setup cloud deployment
npx claude-flow-novice sparc batch architect,coder "Create Kubernetes deployment manifests"
```

### MCP Integration for Enterprise Java

```bash
# Initialize enterprise development swarm
npx claude-flow-novice mcp swarm_init --topology hierarchical --max-agents 10

# Spawn enterprise specialists
npx claude-flow-novice mcp agent_spawn --type architect --capabilities "jakarta-ee,microprofile,enterprise-patterns"
npx claude-flow-novice mcp agent_spawn --type coder --capabilities "ejb,jpa,jax-rs,cdi"
npx claude-flow-novice mcp agent_spawn --type tester --capabilities "arquillian,junit,integration-tests"
npx claude-flow-novice mcp agent_spawn --type reviewer --capabilities "security,performance,enterprise-standards"

# Orchestrate enterprise development
npx claude-flow-novice mcp task_orchestrate --task "Build enterprise Jakarta EE application" --strategy hierarchical
```

## Performance Optimization

### JPA Optimization

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
        name = "User.full",
        attributeNodes = {
            @NamedAttributeNode("department"),
            @NamedAttributeNode("roles")
        }
    )
})
public class User {
    // Entity definition
}

@ApplicationScoped
public class OptimizedUserRepository {

    @PersistenceContext
    private EntityManager entityManager;

    public List<User> findUsersWithDepartment() {
        return entityManager.createQuery(
                "SELECT u FROM User u JOIN FETCH u.department", User.class)
                .setHint("javax.persistence.fetchgraph",
                        entityManager.getEntityGraph("User.summary"))
                .getResultList();
    }

    public Page<User> findUsersWithPagination(int page, int size) {
        // Use cursor-based pagination for better performance
        String lastId = getLastIdFromPreviousPage(page);

        TypedQuery<User> query = entityManager.createQuery(
                "SELECT u FROM User u WHERE u.id > :lastId ORDER BY u.id", User.class)
                .setParameter("lastId", lastId != null ? Long.parseLong(lastId) : 0L)
                .setMaxResults(size);

        return new Page<>(query.getResultList(), page, size);
    }
}
```

### Connection Pool Tuning

```xml
<!-- payara-resources.xml -->
<resources>
    <jdbc-connection-pool
        name="UserPool"
        datasource-classname="org.postgresql.ds.PGConnectionPoolDataSource"
        initial-pool-size="5"
        max-pool-size="50"
        pool-resize-quantity="2"
        idle-timeout-in-seconds="300"
        max-wait-time-in-millis="60000"
        connection-validation-method="auto-commit"
        is-connection-validation-required="true"
        connection-leak-timeout-in-seconds="0"
        connection-leak-reclaim="false"
        statement-leak-timeout-in-seconds="0"
        statement-leak-reclaim="false">

        <property name="serverName" value="localhost"/>
        <property name="portNumber" value="5432"/>
        <property name="databaseName" value="userdb"/>
        <property name="user" value="user"/>
        <property name="password" value="${DB_PASSWORD}"/>
        <property name="preparedStatementCacheSize" value="250"/>
        <property name="preparedStatementCacheQueries" value="true"/>
    </jdbc-connection-pool>

    <jdbc-resource
        pool-name="UserPool"
        jndi-name="java:app/jdbc/UserDataSource"/>
</resources>
```

## Monitoring and Observability

### Custom Metrics

```java
@ApplicationScoped
public class EnterpriseMetrics {

    @Inject
    @Metric(name = "database_connections_active")
    private Gauge<Integer> activeConnections;

    @Inject
    @Metric(name = "ejb_method_invocations_total")
    private Counter ejbInvocations;

    @Inject
    @Metric(name = "jms_message_processing_duration")
    private Timer messageProcessingTime;

    public void recordEJBInvocation() {
        ejbInvocations.inc();
    }

    public Timer.Context startMessageProcessingTimer() {
        return messageProcessingTime.time();
    }
}
```

## Best Practices

### 1. Transaction Management

```java
@TransactionAttribute(TransactionAttributeType.REQUIRED)
public class UserService {

    @TransactionAttribute(TransactionAttributeType.REQUIRES_NEW)
    public void auditUserAction(Long userId, String action) {
        // Always execute in new transaction
    }

    @TransactionAttribute(TransactionAttributeType.NOT_SUPPORTED)
    public UserStatistics calculateStatistics() {
        // Execute without transaction for read-only operations
        return statisticsCalculator.calculate();
    }
}
```

### 2. Resource Management

```java
@Resource(lookup = "java:global/MyDataSource")
private DataSource dataSource;

@PreDestroy
public void cleanup() {
    // Cleanup resources
}
```

### 3. Error Handling

```java
@ApplicationException(rollback = true)
public class BusinessException extends Exception {
    public BusinessException(String message) {
        super(message);
    }
}

@Provider
public class BusinessExceptionMapper implements ExceptionMapper<BusinessException> {
    @Override
    public Response toResponse(BusinessException exception) {
        return Response.status(Response.Status.BAD_REQUEST)
                .entity(new ErrorResponse(exception.getMessage()))
                .build();
    }
}
```

## Next Steps

- [Testing Strategies](testing.md)
- [Performance Optimization](performance.md)
- [Microservices Development](microservices.md)
- [Claude Flow Agent Coordination](claude-flow-integration.md)
- [Spring Boot Development](spring-boot.md)