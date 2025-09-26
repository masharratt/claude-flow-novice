# Java Testing Strategies with JUnit, TestNG, and Spring Test

This comprehensive guide covers modern Java testing strategies, including unit testing, integration testing, test automation, and Claude Flow integration for robust test-driven development.

## Quick Start

### Basic JUnit 5 Test

```java
@DisplayName("User Service Tests")
class UserServiceTest {

    @Test
    @DisplayName("Should create user with valid data")
    void shouldCreateUserWithValidData() {
        // Given, When, Then
    }
}
```

### With Claude Flow Integration

```bash
# Generate comprehensive test suite with agents
npx claude-flow sparc run tester "Create comprehensive Java test suite with JUnit 5"

# Setup test automation
npx claude-flow sparc batch tester,coder "Implement test automation with TestNG and Spring Test"
```

## JUnit 5 Testing

### 1. Basic Test Structure

```java
@ExtendWith(MockitoExtension.class)
@DisplayName("User Service Unit Tests")
class UserServiceTest {

    @Mock
    private UserRepository userRepository;

    @Mock
    private UserMapper userMapper;

    @Mock
    private ApplicationEventPublisher eventPublisher;

    @InjectMocks
    private UserService userService;

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

            when(userMapper.toEntity(request)).thenReturn(user);
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

            when(userRepository.existsByEmail("existing@example.com")).thenReturn(true);

            // When & Then
            assertThatThrownBy(() -> userService.createUser(request))
                    .isInstanceOf(EmailAlreadyExistsException.class)
                    .hasMessage("Email already exists: existing@example.com");

            verify(userRepository, never()).save(any(User.class));
            verify(eventPublisher, never()).publishEvent(any());
        }

        @ParameterizedTest
        @DisplayName("Should validate email format")
        @ValueSource(strings = {"invalid-email", "@example.com", "test@", "test..test@example.com"})
        void shouldValidateEmailFormat(String invalidEmail) {
            // Given
            CreateUserRequest request = CreateUserRequest.builder()
                    .email(invalidEmail)
                    .firstName("John")
                    .lastName("Doe")
                    .build();

            // When & Then
            assertThatThrownBy(() -> userService.createUser(request))
                    .isInstanceOf(InvalidEmailException.class);
        }

        @ParameterizedTest
        @DisplayName("Should handle various valid email formats")
        @CsvSource({
            "test@example.com, John, Doe",
            "user.name@domain.co.uk, Jane, Smith",
            "user+tag@example.org, Bob, Johnson"
        })
        void shouldHandleValidEmailFormats(String email, String firstName, String lastName) {
            // Given
            CreateUserRequest request = CreateUserRequest.builder()
                    .email(email)
                    .firstName(firstName)
                    .lastName(lastName)
                    .build();

            User user = new User();
            User savedUser = new User();
            savedUser.setId(1L);

            when(userMapper.toEntity(request)).thenReturn(user);
            when(userRepository.save(user)).thenReturn(savedUser);
            when(userMapper.toDto(savedUser)).thenReturn(new UserDto());

            // When & Then
            assertThatCode(() -> userService.createUser(request))
                    .doesNotThrowAnyException();
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

        @Test
        @DisplayName("Should find users with pagination")
        void shouldFindUsersWithPagination() {
            // Given
            Pageable pageable = PageRequest.of(0, 10);
            List<User> users = Arrays.asList(
                createTestUser(1L, "user1@example.com"),
                createTestUser(2L, "user2@example.com")
            );
            Page<User> userPage = new PageImpl<>(users, pageable, 2);

            when(userRepository.findAll(pageable)).thenReturn(userPage);
            when(userMapper.toDto(any(User.class))).thenAnswer(invocation -> {
                User user = invocation.getArgument(0);
                return createTestUserDto(user.getId(), user.getEmail());
            });

            // When
            Page<UserDto> result = userService.findAll(pageable);

            // Then
            assertThat(result.getContent()).hasSize(2);
            assertThat(result.getTotalElements()).isEqualTo(2);
            assertThat(result.getNumber()).isEqualTo(0);
            assertThat(result.getSize()).isEqualTo(10);
        }
    }

    @Test
    @DisplayName("Should handle concurrent user creation")
    @Timeout(value = 5, unit = TimeUnit.SECONDS)
    void shouldHandleConcurrentUserCreation() throws InterruptedException {
        // Given
        int numberOfThreads = 10;
        ExecutorService executor = Executors.newFixedThreadPool(numberOfThreads);
        CountDownLatch latch = new CountDownLatch(numberOfThreads);
        AtomicInteger successCount = new AtomicInteger(0);

        // When
        for (int i = 0; i < numberOfThreads; i++) {
            final int index = i;
            executor.submit(() -> {
                try {
                    CreateUserRequest request = CreateUserRequest.builder()
                            .email("user" + index + "@example.com")
                            .firstName("User")
                            .lastName("" + index)
                            .build();

                    // Setup mocks for each thread
                    setupMocksForUser(request, (long) index);

                    userService.createUser(request);
                    successCount.incrementAndGet();
                } catch (Exception e) {
                    // Expected in some cases due to concurrency
                } finally {
                    latch.countDown();
                }
            });
        }

        // Then
        latch.await();
        executor.shutdown();

        assertThat(successCount.get()).isGreaterThan(0);
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
```

### 2. Advanced JUnit 5 Features

```java
@ExtendWith({MockitoExtension.class, TestInstanceExtension.class})
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class AdvancedUserServiceTest {

    @TempDir
    Path tempDir;

    @RegisterExtension
    static WireMockExtension wireMock = WireMockExtension.newInstance()
            .options(wireMockConfig().port(8089))
            .build();

    @BeforeAll
    void setUpAll() {
        // Setup shared resources
    }

    @AfterAll
    void tearDownAll() {
        // Cleanup shared resources
    }

    @RepeatedTest(value = 5, name = "Attempt {currentRepetition} of {totalRepetitions}")
    @DisplayName("Should handle repeated operations")
    void shouldHandleRepeatedOperations(RepetitionInfo repetitionInfo) {
        // Test logic that needs to be repeated
        int currentRepetition = repetitionInfo.getCurrentRepetition();
        assertThat(currentRepetition).isBetween(1, 5);
    }

    @Test
    @EnabledOnOs(OS.LINUX)
    @EnabledIfEnvironmentVariable(named = "ENV", matches = "test")
    void shouldRunOnLinuxInTestEnvironment() {
        // Test that only runs on Linux in test environment
    }

    @Test
    @DisabledIfSystemProperty(named = "java.version", matches = "11.*")
    void shouldSkipOnJava11() {
        // Test that skips on Java 11
    }

    @ParameterizedTest
    @MethodSource("userCreationData")
    @DisplayName("Should create users with various data combinations")
    void shouldCreateUsersWithVariousData(String email, String firstName, String lastName, boolean shouldSucceed) {
        // Given
        CreateUserRequest request = CreateUserRequest.builder()
                .email(email)
                .firstName(firstName)
                .lastName(lastName)
                .build();

        // When & Then
        if (shouldSucceed) {
            assertThatCode(() -> userService.createUser(request))
                    .doesNotThrowAnyException();
        } else {
            assertThatThrownBy(() -> userService.createUser(request))
                    .isInstanceOf(ValidationException.class);
        }
    }

    static Stream<Arguments> userCreationData() {
        return Stream.of(
            Arguments.of("valid@example.com", "John", "Doe", true),
            Arguments.of("invalid-email", "John", "Doe", false),
            Arguments.of("valid@example.com", "", "Doe", false),
            Arguments.of("valid@example.com", "John", "", false),
            Arguments.of("another@example.com", "Jane", "Smith", true)
        );
    }

    @Test
    @DisplayName("Should create temporary file for user data export")
    void shouldCreateTemporaryFileForExport() throws IOException {
        // Given
        Path exportFile = tempDir.resolve("users-export.csv");

        // When
        userService.exportUsersToFile(exportFile);

        // Then
        assertThat(Files.exists(exportFile)).isTrue();
        assertThat(Files.size(exportFile)).isGreaterThan(0);
    }
}
```

## TestNG Testing

### 1. TestNG Test Classes

```java
@Test
public class UserServiceTestNG {

    private UserService userService;
    private UserRepository userRepository;

    @BeforeClass
    public void setUpClass() {
        // Class-level setup
        MockitoAnnotations.openMocks(this);
    }

    @BeforeMethod
    public void setUp() {
        userRepository = mock(UserRepository.class);
        userService = new UserService(userRepository);
    }

    @Test(description = "Should create user with valid data")
    public void shouldCreateUserWithValidData() {
        // Given
        CreateUserRequest request = new CreateUserRequest("test@example.com", "John", "Doe");
        User savedUser = new User();
        savedUser.setId(1L);

        when(userRepository.save(any(User.class))).thenReturn(savedUser);

        // When
        User result = userService.createUser(request);

        // Then
        Assert.assertNotNull(result);
        Assert.assertEquals(result.getId(), Long.valueOf(1));
    }

    @Test(dataProvider = "invalidEmails", expectedExceptions = InvalidEmailException.class)
    public void shouldThrowExceptionForInvalidEmails(String invalidEmail) {
        // Given
        CreateUserRequest request = new CreateUserRequest(invalidEmail, "John", "Doe");

        // When & Then
        userService.createUser(request);
    }

    @DataProvider(name = "invalidEmails")
    public Object[][] invalidEmailData() {
        return new Object[][] {
            {"invalid-email"},
            {"@example.com"},
            {"test@"},
            {""}
        };
    }

    @Test(dataProvider = "validUserData")
    public void shouldCreateUsersWithValidData(String email, String firstName, String lastName) {
        // Given
        CreateUserRequest request = new CreateUserRequest(email, firstName, lastName);
        User savedUser = new User();
        savedUser.setId(1L);

        when(userRepository.save(any(User.class))).thenReturn(savedUser);

        // When
        User result = userService.createUser(request);

        // Then
        Assert.assertNotNull(result);
        Assert.assertEquals(result.getEmail(), email);
    }

    @DataProvider(name = "validUserData")
    public Object[][] validUserData() {
        return new Object[][] {
            {"john@example.com", "John", "Doe"},
            {"jane@example.com", "Jane", "Smith"},
            {"bob@example.com", "Bob", "Johnson"}
        };
    }

    @Test(groups = {"integration"}, dependsOnMethods = {"shouldCreateUserWithValidData"})
    public void shouldFindCreatedUser() {
        // Integration test logic
    }

    @Test(groups = {"performance"}, threadPoolSize = 10, invocationCount = 100)
    public void shouldHandleConcurrentRequests() {
        // Performance test logic
    }

    @Test(timeOut = 5000)
    public void shouldCompleteWithinTimeout() {
        // Test that must complete within 5 seconds
    }

    @AfterMethod
    public void tearDown() {
        // Method-level cleanup
    }

    @AfterClass
    public void tearDownClass() {
        // Class-level cleanup
    }
}
```

### 2. TestNG Configuration

```xml
<!DOCTYPE suite SYSTEM "http://testng.org/testng-1.0.dtd">
<suite name="UserServiceTestSuite" parallel="methods" thread-count="5">
    <parameter name="environment" value="test"/>

    <test name="UnitTests">
        <groups>
            <run>
                <include name="unit"/>
            </run>
        </groups>
        <classes>
            <class name="com.example.service.UserServiceTestNG"/>
            <class name="com.example.repository.UserRepositoryTestNG"/>
        </classes>
    </test>

    <test name="IntegrationTests">
        <groups>
            <run>
                <include name="integration"/>
            </run>
        </groups>
        <classes>
            <class name="com.example.integration.UserIntegrationTestNG"/>
        </classes>
    </test>

    <test name="PerformanceTests">
        <groups>
            <run>
                <include name="performance"/>
            </run>
        </groups>
        <classes>
            <class name="com.example.performance.UserPerformanceTestNG"/>
        </classes>
    </test>
</suite>
```

## Spring Test Integration

### 1. Spring Boot Test Slices

```java
// Web Layer Testing
@WebMvcTest(UserController.class)
class UserControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private UserService userService;

    @Test
    @DisplayName("Should return user when found")
    void shouldReturnUserWhenFound() throws Exception {
        // Given
        Long userId = 1L;
        UserDto userDto = UserDto.builder()
                .id(userId)
                .email("test@example.com")
                .firstName("John")
                .lastName("Doe")
                .build();

        when(userService.findById(userId)).thenReturn(Optional.of(userDto));

        // When & Then
        mockMvc.perform(get("/api/users/{id}", userId)
                .contentType(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(userId))
                .andExpect(jsonPath("$.email").value("test@example.com"))
                .andExpect(jsonPath("$.firstName").value("John"))
                .andExpect(jsonPath("$.lastName").value("Doe"));

        verify(userService).findById(userId);
    }

    @Test
    @DisplayName("Should return 404 when user not found")
    void shouldReturn404WhenUserNotFound() throws Exception {
        // Given
        Long userId = 999L;
        when(userService.findById(userId)).thenReturn(Optional.empty());

        // When & Then
        mockMvc.perform(get("/api/users/{id}", userId)
                .contentType(MediaType.APPLICATION_JSON))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("Should create user with valid data")
    void shouldCreateUserWithValidData() throws Exception {
        // Given
        CreateUserRequest request = CreateUserRequest.builder()
                .email("new@example.com")
                .firstName("Jane")
                .lastName("Smith")
                .build();

        UserDto createdUser = UserDto.builder()
                .id(1L)
                .email("new@example.com")
                .firstName("Jane")
                .lastName("Smith")
                .build();

        when(userService.createUser(any(CreateUserRequest.class))).thenReturn(createdUser);

        // When & Then
        mockMvc.perform(post("/api/users")
                .contentType(MediaType.APPLICATION_JSON)
                .content(asJsonString(request)))
                .andExpect(status().isCreated())
                .andExpect(header().exists("Location"))
                .andExpected(jsonPath("$.id").value(1))
                .andExpected(jsonPath("$.email").value("new@example.com"));
    }

    @Test
    @DisplayName("Should return validation errors for invalid data")
    void shouldReturnValidationErrorsForInvalidData() throws Exception {
        // Given
        CreateUserRequest request = CreateUserRequest.builder()
                .email("invalid-email")
                .firstName("")
                .lastName("")
                .build();

        // When & Then
        mockMvc.perform(post("/api/users")
                .contentType(MediaType.APPLICATION_JSON)
                .content(asJsonString(request)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors").isArray())
                .andExpected(jsonPath("$.errors", hasSize(greaterThan(0))));
    }

    private String asJsonString(Object obj) throws JsonProcessingException {
        ObjectMapper mapper = new ObjectMapper();
        return mapper.writeValueAsString(obj);
    }
}

// Data Layer Testing
@DataJpaTest
class UserRepositoryTest {

    @Autowired
    private TestEntityManager entityManager;

    @Autowired
    private UserRepository userRepository;

    @Test
    @DisplayName("Should find user by email")
    void shouldFindUserByEmail() {
        // Given
        User user = new User();
        user.setEmail("test@example.com");
        user.setFirstName("John");
        user.setLastName("Doe");
        entityManager.persistAndFlush(user);

        // When
        Optional<User> found = userRepository.findByEmail("test@example.com");

        // Then
        assertThat(found).isPresent();
        assertThat(found.get().getEmail()).isEqualTo("test@example.com");
    }

    @Test
    @DisplayName("Should return empty when email not found")
    void shouldReturnEmptyWhenEmailNotFound() {
        // When
        Optional<User> found = userRepository.findByEmail("nonexistent@example.com");

        // Then
        assertThat(found).isEmpty();
    }

    @Test
    @DisplayName("Should find active users")
    void shouldFindActiveUsers() {
        // Given
        User activeUser = createUser("active@example.com", true);
        User inactiveUser = createUser("inactive@example.com", false);
        entityManager.persistAndFlush(activeUser);
        entityManager.persistAndFlush(inactiveUser);

        // When
        List<User> activeUsers = userRepository.findByActiveTrue();

        // Then
        assertThat(activeUsers).hasSize(1);
        assertThat(activeUsers.get(0).getEmail()).isEqualTo("active@example.com");
    }

    @Test
    @DisplayName("Should count users by status")
    void shouldCountUsersByStatus() {
        // Given
        entityManager.persistAndFlush(createUser("user1@example.com", true));
        entityManager.persistAndFlush(createUser("user2@example.com", true));
        entityManager.persistAndFlush(createUser("user3@example.com", false));

        // When
        long activeCount = userRepository.countByActiveTrue();
        long inactiveCount = userRepository.countByActiveFalse();

        // Then
        assertThat(activeCount).isEqualTo(2);
        assertThat(inactiveCount).isEqualTo(1);
    }

    private User createUser(String email, boolean active) {
        User user = new User();
        user.setEmail(email);
        user.setFirstName("Test");
        user.setLastName("User");
        user.setActive(active);
        return user;
    }
}

// Service Layer Testing
@SpringBootTest
@Transactional
class UserServiceIntegrationTest {

    @Autowired
    private UserService userService;

    @Autowired
    private UserRepository userRepository;

    @MockBean
    private ApplicationEventPublisher eventPublisher;

    @Test
    @DisplayName("Should create and persist user")
    void shouldCreateAndPersistUser() {
        // Given
        CreateUserRequest request = CreateUserRequest.builder()
                .email("integration@example.com")
                .firstName("Integration")
                .lastName("Test")
                .build();

        // When
        UserDto created = userService.createUser(request);

        // Then
        assertThat(created).isNotNull();
        assertThat(created.getId()).isNotNull();

        // Verify persistence
        Optional<User> persisted = userRepository.findById(created.getId());
        assertThat(persisted).isPresent();
        assertThat(persisted.get().getEmail()).isEqualTo("integration@example.com");

        // Verify event publication
        verify(eventPublisher).publishEvent(any(UserCreatedEvent.class));
    }

    @Test
    @DisplayName("Should rollback transaction on failure")
    @Rollback
    void shouldRollbackTransactionOnFailure() {
        // Given
        CreateUserRequest request = CreateUserRequest.builder()
                .email("rollback@example.com")
                .firstName("Rollback")
                .lastName("Test")
                .build();

        // Mock to throw exception after save
        doThrow(new RuntimeException("Simulated failure"))
                .when(eventPublisher).publishEvent(any());

        // When & Then
        assertThatThrownBy(() -> userService.createUser(request))
                .isInstanceOf(RuntimeException.class)
                .hasMessage("Simulated failure");

        // Verify rollback
        Optional<User> user = userRepository.findByEmail("rollback@example.com");
        assertThat(user).isEmpty();
    }
}
```

### 2. Test Containers Integration

```java
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Testcontainers
class UserControllerIntegrationTest {

    @Container
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:15")
            .withDatabaseName("testdb")
            .withUsername("test")
            .withPassword("test");

    @Container
    static GenericContainer<?> redis = new GenericContainer<>("redis:7-alpine")
            .withExposedPorts(6379);

    @Autowired
    private TestRestTemplate restTemplate;

    @Autowired
    private UserRepository userRepository;

    @DynamicPropertySource
    static void configureProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", postgres::getJdbcUrl);
        registry.add("spring.datasource.username", postgres::getUsername);
        registry.add("spring.datasource.password", postgres::getPassword);

        registry.add("spring.redis.host", redis::getHost);
        registry.add("spring.redis.port", redis::getFirstMappedPort);
    }

    @Test
    @DisplayName("Should create user end-to-end")
    void shouldCreateUserEndToEnd() {
        // Given
        CreateUserRequest request = CreateUserRequest.builder()
                .email("e2e@example.com")
                .firstName("End")
                .lastName("ToEnd")
                .build();

        // When
        ResponseEntity<UserDto> response = restTemplate.postForEntity(
                "/api/users", request, UserDto.class);

        // Then
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        assertThat(response.getBody()).isNotNull();
        assertThat(response.getBody().getEmail()).isEqualTo("e2e@example.com");

        // Verify in database
        Optional<User> user = userRepository.findByEmail("e2e@example.com");
        assertThat(user).isPresent();
    }

    @Test
    @DisplayName("Should handle database constraints")
    void shouldHandleDatabaseConstraints() {
        // Given - Create user first
        CreateUserRequest request = CreateUserRequest.builder()
                .email("duplicate@example.com")
                .firstName("First")
                .lastName("User")
                .build();

        restTemplate.postForEntity("/api/users", request, UserDto.class);

        // When - Try to create duplicate
        CreateUserRequest duplicateRequest = CreateUserRequest.builder()
                .email("duplicate@example.com")
                .firstName("Second")
                .lastName("User")
                .build();

        ResponseEntity<ErrorResponse> response = restTemplate.postForEntity(
                "/api/users", duplicateRequest, ErrorResponse.class);

        // Then
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
        assertThat(response.getBody().getMessage()).contains("Email already exists");
    }
}
```

## Performance Testing

### 1. JMH Benchmarks

```java
@BenchmarkMode(Mode.AverageTime)
@OutputTimeUnit(TimeUnit.MICROSECONDS)
@State(Scope.Benchmark)
@Fork(value = 2, jvmArgs = {"-Xms2G", "-Xmx2G"})
@Warmup(iterations = 3)
@Measurement(iterations = 5)
public class UserServiceBenchmark {

    private UserService userService;
    private CreateUserRequest request;

    @Setup
    public void setup() {
        UserRepository userRepository = mock(UserRepository.class);
        userService = new UserService(userRepository);

        request = CreateUserRequest.builder()
                .email("benchmark@example.com")
                .firstName("Benchmark")
                .lastName("Test")
                .build();

        when(userRepository.save(any(User.class))).thenAnswer(invocation -> {
            User user = invocation.getArgument(0);
            user.setId(1L);
            return user;
        });
    }

    @Benchmark
    public UserDto benchmarkUserCreation() {
        return userService.createUser(request);
    }

    @Benchmark
    @Group("concurrent")
    @GroupThreads(4)
    public UserDto benchmarkConcurrentUserCreation() {
        return userService.createUser(request);
    }

    public static void main(String[] args) throws RunnerException {
        Options opt = new OptionsBuilder()
                .include(UserServiceBenchmark.class.getSimpleName())
                .build();

        new Runner(opt).run();
    }
}
```

### 2. Load Testing with Gatling

```java
public class UserApiLoadTest extends Simulation {

    HttpProtocolBuilder httpProtocol = http
            .baseUrl("http://localhost:8080")
            .acceptHeader("application/json")
            .contentTypeHeader("application/json");

    ScenarioBuilder createUserScenario = scenario("Create User Load Test")
            .feed(csv("users.csv").random())
            .exec(http("Create User")
                    .post("/api/users")
                    .body(StringBody(session -> {
                        String email = session.getString("email");
                        String firstName = session.getString("firstName");
                        String lastName = session.getString("lastName");

                        return String.format(
                                "{\"email\":\"%s\",\"firstName\":\"%s\",\"lastName\":\"%s\"}",
                                email, firstName, lastName);
                    }))
                    .check(status().is(201))
                    .check(jsonPath("$.id").saveAs("userId")))
            .pause(1, 3);

    ScenarioBuilder getUserScenario = scenario("Get User Load Test")
            .exec(http("Get User")
                    .get("/api/users/${userId}")
                    .check(status().is(200)));

    {
        setUp(
                createUserScenario.inject(
                        rampUsersPerSec(1).to(10).during(Duration.ofMinutes(2)),
                        constantUsersPerSec(10).during(Duration.ofMinutes(5)),
                        rampUsersPerSec(10).to(1).during(Duration.ofMinutes(2))
                ),
                getUserScenario.inject(
                        constantUsersPerSec(20).during(Duration.ofMinutes(9))
                )
        ).protocols(httpProtocol)
         .assertions(
                 global().responseTime().max().lt(2000),
                 global().successfulRequests().percent().gt(95.0)
         );
    }
}
```

## Test Automation with Claude Flow

### 1. Automated Test Generation

```bash
# Generate comprehensive test suite
npx claude-flow sparc run tester "Generate JUnit 5 test suite for UserService with 90% coverage"

# Create integration tests
npx claude-flow sparc run tester "Create Spring Boot integration tests with TestContainers"

# Generate performance tests
npx claude-flow sparc run tester "Create JMH benchmarks and Gatling load tests"

# Setup test automation pipeline
npx claude-flow sparc batch tester,coder "Create automated test pipeline with Maven/Gradle"
```

### 2. MCP Integration for Test Coordination

```bash
# Initialize testing swarm
npx claude-flow mcp swarm_init --topology star --max-agents 5

# Spawn testing specialists
npx claude-flow mcp agent_spawn --type tester --capabilities "junit5,mockito,spring-test"
npx claude-flow mcp agent_spawn --type tester --capabilities "testng,integration-testing"
npx claude-flow mcp agent_spawn --type tester --capabilities "performance-testing,jmh,gatling"
npx claude-flow mcp agent_spawn --type reviewer --capabilities "test-quality,coverage-analysis"

# Orchestrate test development
npx claude-flow mcp task_orchestrate --task "Create comprehensive Java test suite" --strategy parallel
```

### 3. Test Configuration Management

```java
@TestConfiguration
public class TestConfig {

    @Bean
    @Primary
    public Clock testClock() {
        return Clock.fixed(Instant.parse("2023-12-01T10:00:00Z"), ZoneOffset.UTC);
    }

    @Bean
    @Primary
    public UserRepository mockUserRepository() {
        return Mockito.mock(UserRepository.class);
    }

    @TestComponent
    public static class TestDataBuilder {

        public User buildTestUser() {
            return User.builder()
                    .email("test@example.com")
                    .firstName("Test")
                    .lastName("User")
                    .active(true)
                    .createdAt(LocalDateTime.now())
                    .build();
        }

        public CreateUserRequest buildCreateUserRequest() {
            return CreateUserRequest.builder()
                    .email("new@example.com")
                    .firstName("New")
                    .lastName("User")
                    .build();
        }
    }
}
```

## Test Data Management

### 1. Test Data Builders

```java
public class UserTestDataBuilder {

    private String email = "test@example.com";
    private String firstName = "Test";
    private String lastName = "User";
    private boolean active = true;
    private LocalDateTime createdAt = LocalDateTime.now();

    public static UserTestDataBuilder aUser() {
        return new UserTestDataBuilder();
    }

    public UserTestDataBuilder withEmail(String email) {
        this.email = email;
        return this;
    }

    public UserTestDataBuilder withName(String firstName, String lastName) {
        this.firstName = firstName;
        this.lastName = lastName;
        return this;
    }

    public UserTestDataBuilder inactive() {
        this.active = false;
        return this;
    }

    public UserTestDataBuilder createdAt(LocalDateTime createdAt) {
        this.createdAt = createdAt;
        return this;
    }

    public User build() {
        User user = new User();
        user.setEmail(email);
        user.setFirstName(firstName);
        user.setLastName(lastName);
        user.setActive(active);
        user.setCreatedAt(createdAt);
        return user;
    }

    public CreateUserRequest buildRequest() {
        return CreateUserRequest.builder()
                .email(email)
                .firstName(firstName)
                .lastName(lastName)
                .build();
    }
}

// Usage in tests
@Test
void shouldCreateInactiveUser() {
    // Given
    User user = aUser()
            .withEmail("inactive@example.com")
            .withName("Inactive", "User")
            .inactive()
            .build();

    // Test logic
}
```

### 2. Test Fixtures

```java
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class UserServiceTestWithFixtures {

    @RegisterExtension
    static DatabaseExtension database = new DatabaseExtension();

    private TestFixtures fixtures;

    @BeforeAll
    void setupFixtures() {
        fixtures = TestFixtures.builder()
                .withUsers(10)
                .withDepartments(3)
                .withRoles(5)
                .build();

        fixtures.load(database.getDataSource());
    }

    @Test
    void shouldFindUsersFromFixtures() {
        // Test using pre-loaded fixture data
        List<User> users = userService.findAll();
        assertThat(users).hasSize(10);
    }

    @AfterAll
    void cleanupFixtures() {
        fixtures.cleanup();
    }
}
```

## Test Quality and Coverage

### 1. Coverage Configuration

```xml
<!-- Maven Surefire and JaCoCo configuration -->
<plugin>
    <groupId>org.jacoco</groupId>
    <artifactId>jacoco-maven-plugin</artifactId>
    <version>0.8.10</version>
    <executions>
        <execution>
            <goals>
                <goal>prepare-agent</goal>
            </goals>
        </execution>
        <execution>
            <id>report</id>
            <phase>test</phase>
            <goals>
                <goal>report</goal>
            </goals>
        </execution>
        <execution>
            <id>check</id>
            <goals>
                <goal>check</goal>
            </goals>
            <configuration>
                <rules>
                    <rule>
                        <element>CLASS</element>
                        <limits>
                            <limit>
                                <counter>LINE</counter>
                                <value>COVEREDRATIO</value>
                                <minimum>0.80</minimum>
                            </limit>
                            <limit>
                                <counter>BRANCH</counter>
                                <value>COVEREDRATIO</value>
                                <minimum>0.70</minimum>
                            </limit>
                        </limits>
                    </rule>
                </rules>
            </configuration>
        </execution>
    </executions>
</plugin>
```

### 2. Mutation Testing

```xml
<plugin>
    <groupId>org.pitest</groupId>
    <artifactId>pitest-maven</artifactId>
    <version>1.14.4</version>
    <configuration>
        <targetClasses>
            <param>com.example.service.*</param>
        </targetClasses>
        <targetTests>
            <param>com.example.service.*Test</param>
        </targetTests>
        <mutationThreshold>80</mutationThreshold>
        <coverageThreshold>90</coverageThreshold>
    </configuration>
</plugin>
```

## Best Practices

### 1. Test Organization

```java
// Use nested classes for logical grouping
@DisplayName("User Service Tests")
class UserServiceTest {

    @Nested
    @DisplayName("When creating users")
    class UserCreation {
        // Creation tests
    }

    @Nested
    @DisplayName("When finding users")
    class UserRetrieval {
        // Retrieval tests
    }

    @Nested
    @DisplayName("When updating users")
    class UserUpdate {
        // Update tests
    }
}
```

### 2. Test Naming Conventions

```java
// Use descriptive test names
@Test
@DisplayName("Should throw EmailAlreadyExistsException when creating user with existing email")
void shouldThrowEmailAlreadyExistsExceptionWhenCreatingUserWithExistingEmail() {
    // Test implementation
}

// Follow Given-When-Then structure
@Test
void shouldCalculateCorrectAge() {
    // Given
    LocalDate birthDate = LocalDate.of(1990, 1, 1);
    LocalDate currentDate = LocalDate.of(2023, 1, 1);

    // When
    int age = userService.calculateAge(birthDate, currentDate);

    // Then
    assertThat(age).isEqualTo(33);
}
```

### 3. Test Independence

```java
// Each test should be independent
@TestMethodOrder(OrderAnnotation.class)
class UserServiceOrderedTest {

    // Avoid test dependencies
    @Test
    @Order(1)
    void test1() {
        // Independent test
    }

    @Test
    @Order(2)
    void test2() {
        // Independent test (not depending on test1)
    }
}
```

## Next Steps

- [Performance Optimization](performance.md)
- [Microservices Development](microservices.md)
- [Claude Flow Agent Coordination](claude-flow-integration.md)
- [Spring Boot Development](spring-boot.md)
- [Enterprise Java Development](enterprise-java.md)