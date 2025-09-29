# Java Ecosystem Integration Examples

This comprehensive guide provides practical examples of integrating Java applications with various ecosystem tools, frameworks, and Claude Flow agents for real-world enterprise development scenarios.

## Quick Start

### Basic Integration Example

```java
@SpringBootApplication
@EnableJpaRepositories
@EnableEurekaClient
public class EcommerceApplication {
    public static void main(String[] args) {
        SpringApplication.run(EcommerceApplication.class, args);
    }
}
```

### With Claude Flow

```bash
# Generate complete e-commerce system
npx claude-flow-novice sparc batch architect,coder,tester "Build e-commerce platform with Spring Boot, React, and PostgreSQL"
```

## Enterprise E-Commerce Platform

### 1. Project Structure

```
ecommerce-platform/
├── user-service/
│   ├── src/main/java/
│   ├── src/test/java/
│   └── pom.xml
├── product-service/
│   ├── src/main/java/
│   ├── src/test/java/
│   └── pom.xml
├── order-service/
│   ├── src/main/java/
│   ├── src/test/java/
│   └── pom.xml
├── payment-service/
│   ├── src/main/java/
│   ├── src/test/java/
│   └── pom.xml
├── api-gateway/
│   ├── src/main/java/
│   └── pom.xml
├── config-server/
│   ├── src/main/java/
│   └── pom.xml
├── discovery-server/
│   ├── src/main/java/
│   └── pom.xml
├── docker-compose.yml
├── kubernetes/
└── README.md
```

### 2. User Service Implementation

```java
// User Entity
@Entity
@Table(name = "users", indexes = {
    @Index(name = "idx_user_email", columnList = "email"),
    @Index(name = "idx_user_status", columnList = "status, createdAt")
})
public class User {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true)
    @Email
    private String email;

    @Column(nullable = false)
    @Size(min = 2, max = 100)
    private String firstName;

    @Column(nullable = false)
    @Size(min = 2, max = 100)
    private String lastName;

    @Column(nullable = false)
    private String password;

    @Enumerated(EnumType.STRING)
    private UserStatus status = UserStatus.ACTIVE;

    @ElementCollection(fetch = FetchType.EAGER)
    @Enumerated(EnumType.STRING)
    private Set<Role> roles = new HashSet<>();

    @OneToMany(mappedBy = "user", cascade = CascadeType.ALL, fetch = FetchType.LAZY)
    private List<Address> addresses = new ArrayList<>();

    @CreatedDate
    private LocalDateTime createdAt;

    @LastModifiedDate
    private LocalDateTime updatedAt;

    // Constructors, getters, setters
}

// User Service with comprehensive features
@Service
@Transactional
@Validated
public class UserService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtTokenProvider tokenProvider;
    private final ApplicationEventPublisher eventPublisher;
    private final EmailService emailService;

    public UserService(UserRepository userRepository,
                      PasswordEncoder passwordEncoder,
                      JwtTokenProvider tokenProvider,
                      ApplicationEventPublisher eventPublisher,
                      EmailService emailService) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.tokenProvider = tokenProvider;
        this.eventPublisher = eventPublisher;
        this.emailService = emailService;
    }

    @Cacheable(value = "users", key = "#id")
    public Optional<UserDto> findById(Long id) {
        return userRepository.findById(id)
                .map(this::convertToDto);
    }

    public UserDto registerUser(RegisterUserRequest request) {
        validateUniqueEmail(request.getEmail());

        User user = User.builder()
                .email(request.getEmail())
                .firstName(request.getFirstName())
                .lastName(request.getLastName())
                .password(passwordEncoder.encode(request.getPassword()))
                .status(UserStatus.PENDING_VERIFICATION)
                .roles(Set.of(Role.CUSTOMER))
                .build();

        User savedUser = userRepository.save(user);

        // Send verification email
        String verificationToken = tokenProvider.generateVerificationToken(savedUser.getId());
        emailService.sendVerificationEmail(savedUser.getEmail(), verificationToken);

        // Publish event
        eventPublisher.publishEvent(new UserRegisteredEvent(savedUser.getId(), savedUser.getEmail()));

        return convertToDto(savedUser);
    }

    public AuthenticationResponse authenticateUser(LoginRequest request) {
        User user = userRepository.findByEmail(request.getEmail())
                .orElseThrow(() -> new BadCredentialsException("Invalid credentials"));

        if (!passwordEncoder.matches(request.getPassword(), user.getPassword())) {
            throw new BadCredentialsException("Invalid credentials");
        }

        if (user.getStatus() != UserStatus.ACTIVE) {
            throw new AccountNotActiveException("Account is not active");
        }

        String accessToken = tokenProvider.generateAccessToken(user);
        String refreshToken = tokenProvider.generateRefreshToken(user);

        // Update last login
        user.setLastLoginAt(LocalDateTime.now());
        userRepository.save(user);

        return AuthenticationResponse.builder()
                .accessToken(accessToken)
                .refreshToken(refreshToken)
                .tokenType("Bearer")
                .expiresIn(tokenProvider.getAccessTokenExpirationTime())
                .user(convertToDto(user))
                .build();
    }

    @CacheEvict(value = "users", key = "#userId")
    public UserDto updateProfile(Long userId, UpdateProfileRequest request) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new UserNotFoundException("User not found"));

        user.setFirstName(request.getFirstName());
        user.setLastName(request.getLastName());

        User updatedUser = userRepository.save(user);
        eventPublisher.publishEvent(new UserProfileUpdatedEvent(userId));

        return convertToDto(updatedUser);
    }

    private void validateUniqueEmail(String email) {
        if (userRepository.existsByEmail(email)) {
            throw new EmailAlreadyExistsException("Email already exists: " + email);
        }
    }

    private UserDto convertToDto(User user) {
        return UserDto.builder()
                .id(user.getId())
                .email(user.getEmail())
                .firstName(user.getFirstName())
                .lastName(user.getLastName())
                .status(user.getStatus())
                .roles(user.getRoles())
                .createdAt(user.getCreatedAt())
                .build();
    }
}

// User Controller with comprehensive API
@RestController
@RequestMapping("/api/users")
@Validated
@SecurityRequirement(name = "bearer-key")
public class UserController {

    private final UserService userService;

    public UserController(UserService userService) {
        this.userService = userService;
    }

    @PostMapping("/register")
    @Operation(summary = "Register new user", description = "Register a new user account")
    @ApiResponses({
        @ApiResponse(responseCode = "201", description = "User registered successfully"),
        @ApiResponse(responseCode = "400", description = "Invalid request data"),
        @ApiResponse(responseCode = "409", description = "Email already exists")
    })
    public ResponseEntity<UserDto> registerUser(@Valid @RequestBody RegisterUserRequest request) {
        UserDto user = userService.registerUser(request);
        return ResponseEntity.status(HttpStatus.CREATED).body(user);
    }

    @PostMapping("/login")
    @Operation(summary = "User login", description = "Authenticate user and return JWT tokens")
    public ResponseEntity<AuthenticationResponse> login(@Valid @RequestBody LoginRequest request) {
        AuthenticationResponse response = userService.authenticateUser(request);
        return ResponseEntity.ok(response);
    }

    @GetMapping("/profile")
    @PreAuthorize("hasRole('CUSTOMER') or hasRole('ADMIN')")
    @Operation(summary = "Get user profile", description = "Get current user's profile information")
    public ResponseEntity<UserDto> getProfile(Authentication authentication) {
        Long userId = extractUserIdFromAuthentication(authentication);
        return userService.findById(userId)
                .map(user -> ResponseEntity.ok(user))
                .orElse(ResponseEntity.notFound().build());
    }

    @PutMapping("/profile")
    @PreAuthorize("hasRole('CUSTOMER') or hasRole('ADMIN')")
    @Operation(summary = "Update user profile", description = "Update current user's profile information")
    public ResponseEntity<UserDto> updateProfile(
            Authentication authentication,
            @Valid @RequestBody UpdateProfileRequest request) {
        Long userId = extractUserIdFromAuthentication(authentication);
        UserDto updatedUser = userService.updateProfile(userId, request);
        return ResponseEntity.ok(updatedUser);
    }

    private Long extractUserIdFromAuthentication(Authentication authentication) {
        JwtAuthenticationToken jwtAuth = (JwtAuthenticationToken) authentication;
        return Long.valueOf(jwtAuth.getToken().getClaimAsString("user_id"));
    }
}

// Generated with:
// npx claude-flow-novice sparc run coder "Create comprehensive user service with authentication, authorization, and profile management"
```

### 3. Product Service with Search Integration

```java
// Product Entity with Elasticsearch integration
@Entity
@Table(name = "products")
@Document(indexName = "products")
public class Product {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @org.springframework.data.annotation.Id
    private Long id;

    @Column(nullable = false)
    @Field(type = FieldType.Text, analyzer = "standard")
    private String name;

    @Column(length = 2000)
    @Field(type = FieldType.Text, analyzer = "standard")
    private String description;

    @Column(nullable = false, precision = 10, scale = 2)
    @Field(type = FieldType.Double)
    private BigDecimal price;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "category_id")
    @Field(type = FieldType.Object)
    private Category category;

    @Column(nullable = false)
    @Field(type = FieldType.Integer)
    private Integer stockQuantity;

    @Enumerated(EnumType.STRING)
    @Field(type = FieldType.Keyword)
    private ProductStatus status;

    @ElementCollection
    @CollectionTable(name = "product_images")
    @Field(type = FieldType.Keyword)
    private List<String> imageUrls = new ArrayList<>();

    @ElementCollection
    @CollectionTable(name = "product_attributes")
    @MapKeyColumn(name = "attribute_name")
    @Column(name = "attribute_value")
    @Field(type = FieldType.Object)
    private Map<String, String> attributes = new HashMap<>();

    @Field(type = FieldType.Double)
    private Double rating;

    @Field(type = FieldType.Integer)
    private Integer reviewCount;

    // Constructors, getters, setters
}

// Product Service with search capabilities
@Service
@Transactional
public class ProductService {

    private final ProductRepository productRepository;
    private final ElasticsearchRepository elasticsearchRepository;
    private final CategoryService categoryService;
    private final RedisTemplate<String, Object> redisTemplate;

    public ProductService(ProductRepository productRepository,
                         ElasticsearchRepository elasticsearchRepository,
                         CategoryService categoryService,
                         RedisTemplate<String, Object> redisTemplate) {
        this.productRepository = productRepository;
        this.elasticsearchRepository = elasticsearchRepository;
        this.categoryService = categoryService;
        this.redisTemplate = redisTemplate;
    }

    public Page<ProductDto> searchProducts(ProductSearchCriteria criteria, Pageable pageable) {
        // Try cache first
        String cacheKey = generateCacheKey(criteria, pageable);
        Page<ProductDto> cachedResult = (Page<ProductDto>) redisTemplate.opsForValue().get(cacheKey);
        if (cachedResult != null) {
            return cachedResult;
        }

        // Build Elasticsearch query
        BoolQueryBuilder query = QueryBuilders.boolQuery();

        if (StringUtils.hasText(criteria.getKeyword())) {
            query.must(QueryBuilders.multiMatchQuery(criteria.getKeyword())
                    .field("name", 2.0f)  // Boost name matches
                    .field("description", 1.0f)
                    .type(MultiMatchQueryBuilder.Type.BEST_FIELDS));
        }

        if (criteria.getCategoryId() != null) {
            query.filter(QueryBuilders.termQuery("category.id", criteria.getCategoryId()));
        }

        if (criteria.getMinPrice() != null || criteria.getMaxPrice() != null) {
            RangeQueryBuilder priceRange = QueryBuilders.rangeQuery("price");
            if (criteria.getMinPrice() != null) {
                priceRange.gte(criteria.getMinPrice());
            }
            if (criteria.getMaxPrice() != null) {
                priceRange.lte(criteria.getMaxPrice());
            }
            query.filter(priceRange);
        }

        query.filter(QueryBuilders.termQuery("status", ProductStatus.ACTIVE.name()));

        // Execute search
        SearchSourceBuilder searchSourceBuilder = new SearchSourceBuilder()
                .query(query)
                .from((int) pageable.getOffset())
                .size(pageable.getPageSize());

        // Add sorting
        if (pageable.getSort().isSorted()) {
            pageable.getSort().forEach(order -> {
                SortBuilder<?> sortBuilder = SortBuilders.fieldSort(order.getProperty())
                        .order(order.getDirection() == Sort.Direction.ASC ?
                               SortOrder.ASC : SortOrder.DESC);
                searchSourceBuilder.sort(sortBuilder);
            });
        } else {
            // Default sort by relevance, then by rating
            searchSourceBuilder.sort(SortBuilders.scoreSort().order(SortOrder.DESC))
                             .sort(SortBuilders.fieldSort("rating").order(SortOrder.DESC));
        }

        SearchResponse response = elasticsearchRepository.search(searchSourceBuilder);

        List<ProductDto> products = Arrays.stream(response.getHits().getHits())
                .map(hit -> convertToDto(parseProduct(hit.getSourceAsString())))
                .collect(Collectors.toList());

        Page<ProductDto> result = new PageImpl<>(products, pageable, response.getHits().getTotalHits().value);

        // Cache result for 5 minutes
        redisTemplate.opsForValue().set(cacheKey, result, Duration.ofMinutes(5));

        return result;
    }

    public ProductDto getProductDetails(Long productId) {
        return productRepository.findById(productId)
                .map(this::convertToDto)
                .orElseThrow(() -> new ProductNotFoundException("Product not found: " + productId));
    }

    @Cacheable(value = "featured-products")
    public List<ProductDto> getFeaturedProducts(int limit) {
        List<Product> products = productRepository.findFeaturedProducts(PageRequest.of(0, limit));
        return products.stream()
                .map(this::convertToDto)
                .collect(Collectors.toList());
    }

    public List<ProductDto> getRecommendations(Long userId, int limit) {
        // Simple recommendation based on user's purchase history and popular products
        List<Product> recommendations = productRepository.findRecommendationsForUser(userId, limit);
        return recommendations.stream()
                .map(this::convertToDto)
                .collect(Collectors.toList());
    }

    @EventListener
    @Async
    public void handleProductUpdated(ProductUpdatedEvent event) {
        // Update Elasticsearch index
        Product product = productRepository.findById(event.getProductId())
                .orElse(null);
        if (product != null) {
            elasticsearchRepository.save(product);
        }

        // Invalidate related caches
        redisTemplate.delete("featured-products");
    }

    private ProductDto convertToDto(Product product) {
        return ProductDto.builder()
                .id(product.getId())
                .name(product.getName())
                .description(product.getDescription())
                .price(product.getPrice())
                .categoryName(product.getCategory().getName())
                .stockQuantity(product.getStockQuantity())
                .status(product.getStatus())
                .imageUrls(product.getImageUrls())
                .attributes(product.getAttributes())
                .rating(product.getRating())
                .reviewCount(product.getReviewCount())
                .build();
    }

    private String generateCacheKey(ProductSearchCriteria criteria, Pageable pageable) {
        return String.format("product-search:%s:%d:%d",
                criteria.hashCode(), pageable.getPageNumber(), pageable.getPageSize());
    }
}

// Generated with:
// npx claude-flow-novice sparc run coder "Create product service with Elasticsearch search, Redis caching, and recommendations"
```

### 4. Order Service with Saga Pattern

```java
// Order Entity with state management
@Entity
@Table(name = "orders")
public class Order {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true)
    private String orderNumber;

    @Column(nullable = false)
    private Long userId;

    @OneToMany(mappedBy = "order", cascade = CascadeType.ALL, fetch = FetchType.LAZY)
    private List<OrderItem> items = new ArrayList<>();

    @Enumerated(EnumType.STRING)
    private OrderStatus status;

    @Column(nullable = false, precision = 10, scale = 2)
    private BigDecimal totalAmount;

    @Embedded
    private Address shippingAddress;

    @Embedded
    @AttributeOverrides({
        @AttributeOverride(name = "street", column = @Column(name = "billing_street")),
        @AttributeOverride(name = "city", column = @Column(name = "billing_city")),
        @AttributeOverride(name = "state", column = @Column(name = "billing_state")),
        @AttributeOverride(name = "zipCode", column = @Column(name = "billing_zip_code")),
        @AttributeOverride(name = "country", column = @Column(name = "billing_country"))
    })
    private Address billingAddress;

    @Column
    private String paymentId;

    @CreatedDate
    private LocalDateTime createdAt;

    @LastModifiedDate
    private LocalDateTime updatedAt;

    // Constructors, getters, setters
}

// Order Service with distributed transaction management
@Service
@Transactional
public class OrderService {

    private final OrderRepository orderRepository;
    private final InventoryServiceClient inventoryServiceClient;
    private final PaymentServiceClient paymentServiceClient;
    private final OrderSagaOrchestrator sagaOrchestrator;
    private final ApplicationEventPublisher eventPublisher;

    public OrderService(OrderRepository orderRepository,
                       InventoryServiceClient inventoryServiceClient,
                       PaymentServiceClient paymentServiceClient,
                       OrderSagaOrchestrator sagaOrchestrator,
                       ApplicationEventPublisher eventPublisher) {
        this.orderRepository = orderRepository;
        this.inventoryServiceClient = inventoryServiceClient;
        this.paymentServiceClient = paymentServiceClient;
        this.sagaOrchestrator = sagaOrchestrator;
        this.eventPublisher = eventPublisher;
    }

    public OrderDto createOrder(Long userId, CreateOrderRequest request) {
        // Validate request
        validateOrderRequest(request);

        // Create order entity
        Order order = Order.builder()
                .orderNumber(generateOrderNumber())
                .userId(userId)
                .status(OrderStatus.PENDING)
                .shippingAddress(request.getShippingAddress())
                .billingAddress(request.getBillingAddress())
                .build();

        // Add order items
        List<OrderItem> items = request.getItems().stream()
                .map(itemRequest -> OrderItem.builder()
                        .order(order)
                        .productId(itemRequest.getProductId())
                        .quantity(itemRequest.getQuantity())
                        .unitPrice(itemRequest.getUnitPrice())
                        .build())
                .collect(Collectors.toList());

        order.setItems(items);
        order.setTotalAmount(calculateTotalAmount(items));

        // Save order
        Order savedOrder = orderRepository.save(order);

        // Start saga for distributed transaction
        sagaOrchestrator.startOrderProcessingSaga(savedOrder.getId());

        return convertToDto(savedOrder);
    }

    @EventListener
    @Async
    public void handleInventoryReserved(InventoryReservedEvent event) {
        Order order = orderRepository.findById(event.getOrderId())
                .orElseThrow(() -> new OrderNotFoundException("Order not found: " + event.getOrderId()));

        order.setStatus(OrderStatus.INVENTORY_RESERVED);
        orderRepository.save(order);

        // Continue saga - process payment
        sagaOrchestrator.processPayment(order.getId(), order.getTotalAmount());
    }

    @EventListener
    @Async
    public void handlePaymentProcessed(PaymentProcessedEvent event) {
        Order order = orderRepository.findById(event.getOrderId())
                .orElseThrow(() -> new OrderNotFoundException("Order not found: " + event.getOrderId()));

        order.setStatus(OrderStatus.PAID);
        order.setPaymentId(event.getPaymentId());
        orderRepository.save(order);

        // Complete saga - confirm order
        sagaOrchestrator.confirmOrder(order.getId());

        // Send confirmation email
        eventPublisher.publishEvent(new OrderConfirmedEvent(order.getId(), order.getUserId()));
    }

    @EventListener
    @Async
    public void handlePaymentFailed(PaymentFailedEvent event) {
        Order order = orderRepository.findById(event.getOrderId())
                .orElseThrow(() -> new OrderNotFoundException("Order not found: " + event.getOrderId()));

        order.setStatus(OrderStatus.PAYMENT_FAILED);
        orderRepository.save(order);

        // Compensate - release inventory
        sagaOrchestrator.releaseInventory(order.getId());
    }

    public Page<OrderDto> getUserOrders(Long userId, Pageable pageable) {
        Page<Order> orders = orderRepository.findByUserIdOrderByCreatedAtDesc(userId, pageable);
        return orders.map(this::convertToDto);
    }

    public OrderDto getOrderDetails(Long orderId, Long userId) {
        Order order = orderRepository.findByIdAndUserId(orderId, userId)
                .orElseThrow(() -> new OrderNotFoundException("Order not found: " + orderId));

        return convertToDto(order);
    }

    private void validateOrderRequest(CreateOrderRequest request) {
        if (request.getItems().isEmpty()) {
            throw new InvalidOrderException("Order must contain at least one item");
        }

        // Validate product availability
        for (CreateOrderItemRequest item : request.getItems()) {
            if (item.getQuantity() <= 0) {
                throw new InvalidOrderException("Item quantity must be positive");
            }
        }
    }

    private String generateOrderNumber() {
        return "ORD-" + System.currentTimeMillis() + "-" +
               ThreadLocalRandom.current().nextInt(1000, 9999);
    }

    private BigDecimal calculateTotalAmount(List<OrderItem> items) {
        return items.stream()
                .map(item -> item.getUnitPrice().multiply(BigDecimal.valueOf(item.getQuantity())))
                .reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    private OrderDto convertToDto(Order order) {
        return OrderDto.builder()
                .id(order.getId())
                .orderNumber(order.getOrderNumber())
                .status(order.getStatus())
                .totalAmount(order.getTotalAmount())
                .items(order.getItems().stream()
                        .map(this::convertItemToDto)
                        .collect(Collectors.toList()))
                .shippingAddress(order.getShippingAddress())
                .createdAt(order.getCreatedAt())
                .build();
    }

    private OrderItemDto convertItemToDto(OrderItem item) {
        return OrderItemDto.builder()
                .productId(item.getProductId())
                .quantity(item.getQuantity())
                .unitPrice(item.getUnitPrice())
                .build();
    }
}

// Saga Orchestrator for distributed transactions
@Component
public class OrderSagaOrchestrator {

    private final InventoryServiceClient inventoryServiceClient;
    private final PaymentServiceClient paymentServiceClient;
    private final ApplicationEventPublisher eventPublisher;

    public OrderSagaOrchestrator(InventoryServiceClient inventoryServiceClient,
                                PaymentServiceClient paymentServiceClient,
                                ApplicationEventPublisher eventPublisher) {
        this.inventoryServiceClient = inventoryServiceClient;
        this.paymentServiceClient = paymentServiceClient;
        this.eventPublisher = eventPublisher;
    }

    @Async
    public void startOrderProcessingSaga(Long orderId) {
        try {
            // Step 1: Reserve inventory
            inventoryServiceClient.reserveInventory(orderId);
        } catch (Exception e) {
            eventPublisher.publishEvent(new OrderProcessingFailedEvent(orderId, "Inventory reservation failed"));
        }
    }

    @Async
    public void processPayment(Long orderId, BigDecimal amount) {
        try {
            // Step 2: Process payment
            paymentServiceClient.processPayment(orderId, amount);
        } catch (Exception e) {
            // Compensate - release inventory
            inventoryServiceClient.releaseInventory(orderId);
            eventPublisher.publishEvent(new OrderProcessingFailedEvent(orderId, "Payment processing failed"));
        }
    }

    @Async
    public void confirmOrder(Long orderId) {
        try {
            // Step 3: Confirm order (no external service call needed)
            eventPublisher.publishEvent(new OrderConfirmedEvent(orderId));
        } catch (Exception e) {
            eventPublisher.publishEvent(new OrderProcessingFailedEvent(orderId, "Order confirmation failed"));
        }
    }

    @Async
    public void releaseInventory(Long orderId) {
        try {
            inventoryServiceClient.releaseInventory(orderId);
        } catch (Exception e) {
            log.error("Failed to release inventory for order: {}", orderId, e);
        }
    }
}

// Generated with:
// npx claude-flow-novice sparc run coder "Create order service with saga pattern for distributed transactions"
```

## Integration with External Systems

### 1. Payment Service Integration

```java
// Payment Service with multiple providers
@Service
public class PaymentService {

    private final Map<PaymentProvider, PaymentProcessor> processors;
    private final PaymentRepository paymentRepository;
    private final EncryptionService encryptionService;

    public PaymentService(List<PaymentProcessor> processorList,
                         PaymentRepository paymentRepository,
                         EncryptionService encryptionService) {
        this.processors = processorList.stream()
                .collect(Collectors.toMap(
                    PaymentProcessor::getProvider,
                    processor -> processor
                ));
        this.paymentRepository = paymentRepository;
        this.encryptionService = encryptionService;
    }

    @Transactional
    public PaymentResult processPayment(PaymentRequest request) {
        // Validate payment request
        validatePaymentRequest(request);

        // Create payment record
        Payment payment = Payment.builder()
                .orderId(request.getOrderId())
                .amount(request.getAmount())
                .currency(request.getCurrency())
                .provider(request.getProvider())
                .status(PaymentStatus.PENDING)
                .build();

        Payment savedPayment = paymentRepository.save(payment);

        try {
            // Get appropriate processor
            PaymentProcessor processor = processors.get(request.getProvider());
            if (processor == null) {
                throw new UnsupportedPaymentProviderException("Unsupported provider: " + request.getProvider());
            }

            // Process payment with external provider
            ExternalPaymentResponse response = processor.processPayment(request);

            // Update payment record
            savedPayment.setExternalTransactionId(response.getTransactionId());
            savedPayment.setStatus(response.isSuccess() ? PaymentStatus.COMPLETED : PaymentStatus.FAILED);
            savedPayment.setProviderResponse(encryptionService.encrypt(response.getRawResponse()));

            paymentRepository.save(savedPayment);

            return PaymentResult.builder()
                    .paymentId(savedPayment.getId())
                    .status(savedPayment.getStatus())
                    .transactionId(response.getTransactionId())
                    .success(response.isSuccess())
                    .build();

        } catch (Exception e) {
            savedPayment.setStatus(PaymentStatus.FAILED);
            savedPayment.setErrorMessage(e.getMessage());
            paymentRepository.save(savedPayment);

            throw new PaymentProcessingException("Payment processing failed", e);
        }
    }

    // Stripe payment processor
    @Component
    public static class StripePaymentProcessor implements PaymentProcessor {

        private final StripeClient stripeClient;

        public StripePaymentProcessor(StripeClient stripeClient) {
            this.stripeClient = stripeClient;
        }

        @Override
        public PaymentProvider getProvider() {
            return PaymentProvider.STRIPE;
        }

        @Override
        public ExternalPaymentResponse processPayment(PaymentRequest request) {
            try {
                PaymentIntent intent = PaymentIntent.create(
                    PaymentIntentCreateParams.builder()
                            .setAmount(request.getAmount().multiply(BigDecimal.valueOf(100)).longValue()) // Convert to cents
                            .setCurrency(request.getCurrency().toLowerCase())
                            .setPaymentMethod(request.getPaymentMethodToken())
                            .setConfirm(true)
                            .build()
                );

                return ExternalPaymentResponse.builder()
                        .success("succeeded".equals(intent.getStatus()))
                        .transactionId(intent.getId())
                        .rawResponse(intent.toJson())
                        .build();

            } catch (StripeException e) {
                throw new PaymentProcessingException("Stripe payment failed", e);
            }
        }
    }

    // PayPal payment processor
    @Component
    public static class PayPalPaymentProcessor implements PaymentProcessor {

        private final PayPalClient payPalClient;

        public PayPalPaymentProcessor(PayPalClient payPalClient) {
            this.payPalClient = payPalClient;
        }

        @Override
        public PaymentProvider getProvider() {
            return PaymentProvider.PAYPAL;
        }

        @Override
        public ExternalPaymentResponse processPayment(PaymentRequest request) {
            // PayPal integration implementation
            // Similar to Stripe but using PayPal SDK
            return ExternalPaymentResponse.builder()
                    .success(true)
                    .transactionId("paypal-transaction-id")
                    .rawResponse("{}")
                    .build();
        }
    }

    private void validatePaymentRequest(PaymentRequest request) {
        if (request.getAmount().compareTo(BigDecimal.ZERO) <= 0) {
            throw new InvalidPaymentException("Payment amount must be positive");
        }

        if (request.getOrderId() == null) {
            throw new InvalidPaymentException("Order ID is required");
        }
    }
}

// Generated with:
// npx claude-flow-novice sparc run coder "Create payment service with multiple providers and secure processing"
```

### 2. Email Service Integration

```java
// Email Service with template support
@Service
public class EmailService {

    private final JavaMailSender mailSender;
    private final TemplateEngine templateEngine;
    private final EmailConfigurationProperties emailConfig;

    public EmailService(JavaMailSender mailSender,
                       TemplateEngine templateEngine,
                       EmailConfigurationProperties emailConfig) {
        this.mailSender = mailSender;
        this.templateEngine = templateEngine;
        this.emailConfig = emailConfig;
    }

    @Async
    public void sendWelcomeEmail(String toEmail, String firstName) {
        Context context = new Context();
        context.setVariable("firstName", firstName);
        context.setVariable("companyName", emailConfig.getCompanyName());
        context.setVariable("websiteUrl", emailConfig.getWebsiteUrl());

        String htmlContent = templateEngine.process("welcome-email", context);

        MimeMessage message = mailSender.createMimeMessage();
        try {
            MimeMessageHelper helper = new MimeMessageHelper(message, true, "UTF-8");
            helper.setFrom(emailConfig.getFromEmail(), emailConfig.getFromName());
            helper.setTo(toEmail);
            helper.setSubject("Welcome to " + emailConfig.getCompanyName());
            helper.setText(htmlContent, true);

            mailSender.send(message);

        } catch (MessagingException | UnsupportedEncodingException e) {
            log.error("Failed to send welcome email to: {}", toEmail, e);
            throw new EmailSendingException("Failed to send welcome email", e);
        }
    }

    @Async
    public void sendOrderConfirmationEmail(String toEmail, OrderDto order) {
        Context context = new Context();
        context.setVariable("order", order);
        context.setVariable("companyName", emailConfig.getCompanyName());

        String htmlContent = templateEngine.process("order-confirmation", context);

        sendEmail(toEmail, "Order Confirmation - " + order.getOrderNumber(), htmlContent);
    }

    @Async
    public void sendPasswordResetEmail(String toEmail, String resetToken) {
        Context context = new Context();
        context.setVariable("resetToken", resetToken);
        context.setVariable("resetUrl", emailConfig.getWebsiteUrl() + "/reset-password?token=" + resetToken);
        context.setVariable("companyName", emailConfig.getCompanyName());

        String htmlContent = templateEngine.process("password-reset", context);

        sendEmail(toEmail, "Password Reset Request", htmlContent);
    }

    private void sendEmail(String toEmail, String subject, String htmlContent) {
        MimeMessage message = mailSender.createMimeMessage();
        try {
            MimeMessageHelper helper = new MimeMessageHelper(message, true, "UTF-8");
            helper.setFrom(emailConfig.getFromEmail(), emailConfig.getFromName());
            helper.setTo(toEmail);
            helper.setSubject(subject);
            helper.setText(htmlContent, true);

            mailSender.send(message);

        } catch (MessagingException | UnsupportedEncodingException e) {
            log.error("Failed to send email to: {} with subject: {}", toEmail, subject, e);
            throw new EmailSendingException("Failed to send email", e);
        }
    }
}

// Email configuration
@ConfigurationProperties(prefix = "app.email")
@Data
public class EmailConfigurationProperties {
    private String fromEmail;
    private String fromName;
    private String companyName;
    private String websiteUrl;
}

// Generated with:
// npx claude-flow-novice sparc run coder "Create email service with template support and async processing"
```

### 3. File Storage Integration

```java
// File Storage Service with multiple providers
@Service
public class FileStorageService {

    private final Map<StorageProvider, StorageAdapter> adapters;
    private final FileStorageProperties storageProperties;

    public FileStorageService(List<StorageAdapter> adapterList,
                             FileStorageProperties storageProperties) {
        this.adapters = adapterList.stream()
                .collect(Collectors.toMap(
                    StorageAdapter::getProvider,
                    adapter -> adapter
                ));
        this.storageProperties = storageProperties;
    }

    public FileUploadResult uploadFile(MultipartFile file, String directory) {
        validateFile(file);

        String fileName = generateFileName(file.getOriginalFilename());
        String fullPath = directory + "/" + fileName;

        StorageAdapter adapter = adapters.get(storageProperties.getDefaultProvider());

        try {
            String fileUrl = adapter.uploadFile(file.getInputStream(), fullPath, file.getContentType());

            return FileUploadResult.builder()
                    .fileName(fileName)
                    .originalFileName(file.getOriginalFilename())
                    .contentType(file.getContentType())
                    .size(file.getSize())
                    .url(fileUrl)
                    .provider(storageProperties.getDefaultProvider())
                    .build();

        } catch (IOException e) {
            throw new FileStorageException("Failed to upload file", e);
        }
    }

    // AWS S3 Storage Adapter
    @Component
    public static class S3StorageAdapter implements StorageAdapter {

        private final AmazonS3 s3Client;
        private final S3Properties s3Properties;

        public S3StorageAdapter(AmazonS3 s3Client, S3Properties s3Properties) {
            this.s3Client = s3Client;
            this.s3Properties = s3Properties;
        }

        @Override
        public StorageProvider getProvider() {
            return StorageProvider.AWS_S3;
        }

        @Override
        public String uploadFile(InputStream inputStream, String path, String contentType) {
            ObjectMetadata metadata = new ObjectMetadata();
            metadata.setContentType(contentType);

            try {
                PutObjectRequest request = new PutObjectRequest(
                    s3Properties.getBucketName(),
                    path,
                    inputStream,
                    metadata
                );

                s3Client.putObject(request);

                return String.format("https://%s.s3.%s.amazonaws.com/%s",
                    s3Properties.getBucketName(),
                    s3Properties.getRegion(),
                    path);

            } catch (AmazonS3Exception e) {
                throw new FileStorageException("Failed to upload to S3", e);
            }
        }

        @Override
        public void deleteFile(String path) {
            try {
                s3Client.deleteObject(s3Properties.getBucketName(), path);
            } catch (AmazonS3Exception e) {
                throw new FileStorageException("Failed to delete from S3", e);
            }
        }
    }

    // Local File System Storage Adapter
    @Component
    public static class LocalStorageAdapter implements StorageAdapter {

        private final LocalStorageProperties localProperties;

        public LocalStorageAdapter(LocalStorageProperties localProperties) {
            this.localProperties = localProperties;
        }

        @Override
        public StorageProvider getProvider() {
            return StorageProvider.LOCAL;
        }

        @Override
        public String uploadFile(InputStream inputStream, String path, String contentType) {
            Path fullPath = Paths.get(localProperties.getUploadDir(), path);

            try {
                Files.createDirectories(fullPath.getParent());
                Files.copy(inputStream, fullPath, StandardCopyOption.REPLACE_EXISTING);

                return localProperties.getBaseUrl() + "/" + path;

            } catch (IOException e) {
                throw new FileStorageException("Failed to save file locally", e);
            }
        }

        @Override
        public void deleteFile(String path) {
            Path fullPath = Paths.get(localProperties.getUploadDir(), path);

            try {
                Files.deleteIfExists(fullPath);
            } catch (IOException e) {
                throw new FileStorageException("Failed to delete local file", e);
            }
        }
    }

    private void validateFile(MultipartFile file) {
        if (file.isEmpty()) {
            throw new InvalidFileException("File is empty");
        }

        if (file.getSize() > storageProperties.getMaxFileSize()) {
            throw new InvalidFileException("File size exceeds limit");
        }

        String contentType = file.getContentType();
        if (!storageProperties.getAllowedContentTypes().contains(contentType)) {
            throw new InvalidFileException("File type not allowed: " + contentType);
        }
    }

    private String generateFileName(String originalFileName) {
        String extension = StringUtils.getFilenameExtension(originalFileName);
        return UUID.randomUUID().toString() + (extension != null ? "." + extension : "");
    }
}

// Generated with:
// npx claude-flow-novice sparc run coder "Create file storage service with AWS S3 and local storage support"
```

## Monitoring and Observability Integration

### 1. Comprehensive Metrics

```java
// Custom metrics for business operations
@Component
public class EcommerceMetrics {

    private final Counter userRegistrationCounter;
    private final Counter orderCreationCounter;
    private final Timer orderProcessingTimer;
    private final Gauge activeUsersGauge;
    private final DistributionSummary orderValueSummary;

    public EcommerceMetrics(MeterRegistry meterRegistry, UserRepository userRepository) {
        this.userRegistrationCounter = Counter.builder("ecommerce.users.registrations.total")
                .description("Total user registrations")
                .register(meterRegistry);

        this.orderCreationCounter = Counter.builder("ecommerce.orders.created.total")
                .description("Total orders created")
                .register(meterRegistry);

        this.orderProcessingTimer = Timer.builder("ecommerce.order.processing.duration")
                .description("Order processing duration")
                .register(meterRegistry);

        this.activeUsersGauge = Gauge.builder("ecommerce.users.active.total")
                .description("Total active users")
                .register(meterRegistry, userRepository, repo -> repo.countByStatusAndActiveTrue(UserStatus.ACTIVE));

        this.orderValueSummary = DistributionSummary.builder("ecommerce.order.value")
                .description("Order value distribution")
                .baseUnit("USD")
                .register(meterRegistry);
    }

    @EventListener
    public void handleUserRegistered(UserRegisteredEvent event) {
        userRegistrationCounter.increment();
    }

    @EventListener
    public void handleOrderCreated(OrderCreatedEvent event) {
        orderCreationCounter.increment(
            Tags.of(
                Tag.of("payment_method", event.getPaymentMethod()),
                Tag.of("order_source", event.getSource())
            )
        );

        orderValueSummary.record(event.getOrderValue().doubleValue());
    }

    public Timer.Sample startOrderProcessingTimer() {
        return Timer.start();
    }

    public void recordOrderProcessingTime(Timer.Sample sample, String status) {
        sample.stop(orderProcessingTimer.tag("status", status));
    }
}

// Health checks for external dependencies
@Component
public class EcommerceHealthIndicator implements HealthIndicator {

    private final DataSource dataSource;
    private final RedisTemplate<String, Object> redisTemplate;
    private final PaymentServiceClient paymentServiceClient;

    public EcommerceHealthIndicator(DataSource dataSource,
                                   RedisTemplate<String, Object> redisTemplate,
                                   PaymentServiceClient paymentServiceClient) {
        this.dataSource = dataSource;
        this.redisTemplate = redisTemplate;
        this.paymentServiceClient = paymentServiceClient;
    }

    @Override
    public Health health() {
        Health.Builder builder = Health.up();

        // Check database
        try (Connection connection = dataSource.getConnection()) {
            if (connection.isValid(5)) {
                builder.withDetail("database", "Available");
            } else {
                builder.down().withDetail("database", "Connection invalid");
            }
        } catch (SQLException e) {
            builder.down().withDetail("database", "Connection failed: " + e.getMessage());
        }

        // Check Redis
        try {
            redisTemplate.opsForValue().get("health-check");
            builder.withDetail("redis", "Available");
        } catch (Exception e) {
            builder.down().withDetail("redis", "Connection failed: " + e.getMessage());
        }

        // Check payment service
        try {
            if (paymentServiceClient.healthCheck()) {
                builder.withDetail("payment-service", "Available");
            } else {
                builder.down().withDetail("payment-service", "Service unhealthy");
            }
        } catch (Exception e) {
            builder.down().withDetail("payment-service", "Connection failed: " + e.getMessage());
        }

        return builder.build();
    }
}

// Generated with:
// npx claude-flow-novice sparc run monitor "Create comprehensive metrics and health checks for e-commerce platform"
```

## Docker and Kubernetes Integration

### 1. Docker Compose for Development

```yaml
# docker-compose.yml - Complete development environment
version: '3.8'

services:
  # Databases
  postgres:
    image: postgres:15
    environment:
      POSTGRES_DB: ecommerce
      POSTGRES_USER: ecommerce
      POSTGRES_PASSWORD: password
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./docker/postgres/init.sql:/docker-entrypoint-initdb.d/init.sql

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    command: redis-server --appendonly yes
    volumes:
      - redis_data:/data

  # Search and Analytics
  elasticsearch:
    image: docker.elastic.co/elasticsearch/elasticsearch:8.8.0
    environment:
      - discovery.type=single-node
      - xpack.security.enabled=false
    ports:
      - "9200:9200"
    volumes:
      - elasticsearch_data:/usr/share/elasticsearch/data

  # Message Queue
  kafka:
    image: confluentinc/cp-kafka:latest
    environment:
      KAFKA_ZOOKEEPER_CONNECT: zookeeper:2181
      KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://localhost:9092
      KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: 1
    ports:
      - "9092:9092"
    depends_on:
      - zookeeper

  zookeeper:
    image: confluentinc/cp-zookeeper:latest
    environment:
      ZOOKEEPER_CLIENT_PORT: 2181

  # Service Discovery
  eureka-server:
    build: ./eureka-server
    ports:
      - "8761:8761"
    environment:
      - SPRING_PROFILES_ACTIVE=docker

  # Configuration Server
  config-server:
    build: ./config-server
    ports:
      - "8888:8888"
    environment:
      - SPRING_PROFILES_ACTIVE=docker
      - EUREKA_CLIENT_SERVICE_URL_DEFAULTZONE=http://eureka-server:8761/eureka
    depends_on:
      - eureka-server

  # API Gateway
  api-gateway:
    build: ./api-gateway
    ports:
      - "8080:8080"
    environment:
      - SPRING_PROFILES_ACTIVE=docker
      - EUREKA_CLIENT_SERVICE_URL_DEFAULTZONE=http://eureka-server:8761/eureka
    depends_on:
      - eureka-server
      - config-server

  # Microservices
  user-service:
    build: ./user-service
    environment:
      - SPRING_PROFILES_ACTIVE=docker
      - DATABASE_URL=jdbc:postgresql://postgres:5432/ecommerce
      - REDIS_HOST=redis
      - EUREKA_CLIENT_SERVICE_URL_DEFAULTZONE=http://eureka-server:8761/eureka
    depends_on:
      - postgres
      - redis
      - eureka-server
      - config-server

  product-service:
    build: ./product-service
    environment:
      - SPRING_PROFILES_ACTIVE=docker
      - DATABASE_URL=jdbc:postgresql://postgres:5432/ecommerce
      - REDIS_HOST=redis
      - ELASTICSEARCH_HOST=elasticsearch
      - EUREKA_CLIENT_SERVICE_URL_DEFAULTZONE=http://eureka-server:8761/eureka
    depends_on:
      - postgres
      - redis
      - elasticsearch
      - eureka-server
      - config-server

  order-service:
    build: ./order-service
    environment:
      - SPRING_PROFILES_ACTIVE=docker
      - DATABASE_URL=jdbc:postgresql://postgres:5432/ecommerce
      - KAFKA_BROKERS=kafka:9092
      - EUREKA_CLIENT_SERVICE_URL_DEFAULTZONE=http://eureka-server:8761/eureka
    depends_on:
      - postgres
      - kafka
      - eureka-server
      - config-server

  # Monitoring
  prometheus:
    image: prom/prometheus:latest
    ports:
      - "9090:9090"
    volumes:
      - ./docker/prometheus/prometheus.yml:/etc/prometheus/prometheus.yml
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.path=/prometheus'

  grafana:
    image: grafana/grafana:latest
    ports:
      - "3000:3000"
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin
    volumes:
      - grafana_data:/var/lib/grafana
      - ./docker/grafana/provisioning:/etc/grafana/provisioning

volumes:
  postgres_data:
  redis_data:
  elasticsearch_data:
  grafana_data:

# Generated with:
# npx claude-flow-novice sparc run architect "Create comprehensive Docker Compose setup for e-commerce development"
```

### 2. Kubernetes Production Deployment

```yaml
# kubernetes/namespace.yaml
apiVersion: v1
kind: Namespace
metadata:
  name: ecommerce

---
# kubernetes/configmap.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: ecommerce-config
  namespace: ecommerce
data:
  application.yml: |
    spring:
      profiles:
        active: kubernetes
    management:
      endpoints:
        web:
          exposure:
            include: health,info,metrics,prometheus
      endpoint:
        health:
          show-details: when-authorized

---
# kubernetes/user-service.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: user-service
  namespace: ecommerce
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
        image: ecommerce/user-service:latest
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
        - name: REDIS_HOST
          value: "redis-service"
        - name: JAVA_OPTS
          value: "-Xms512m -Xmx1g -XX:+UseG1GC"
        resources:
          requests:
            memory: "512Mi"
            cpu: "250m"
          limits:
            memory: "1Gi"
            cpu: "500m"
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
        - name: config-volume
          mountPath: /app/config
      volumes:
      - name: config-volume
        configMap:
          name: ecommerce-config

---
apiVersion: v1
kind: Service
metadata:
  name: user-service
  namespace: ecommerce
  labels:
    app: user-service
spec:
  selector:
    app: user-service
  ports:
  - port: 80
    targetPort: 8080
  type: ClusterIP

---
# kubernetes/hpa.yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: user-service-hpa
  namespace: ecommerce
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: user-service
  minReplicas: 3
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80

# Generated with:
# npx claude-flow-novice sparc run architect "Create production Kubernetes manifests with auto-scaling"
```

## Claude Flow Integration Examples

### 1. Complete Development Workflow

```bash
#!/bin/bash
# complete-ecommerce-development.sh
# Auto-generated development workflow by Claude Flow

echo "Starting e-commerce platform development with Claude Flow..."

# Initialize project structure
npx claude-flow-novice sparc run architect "Design complete e-commerce microservices architecture"

# Generate core services in parallel
npx claude-flow-novice sparc batch coder,tester "Create user service with authentication and profile management" &
npx claude-flow-novice sparc batch coder,tester "Create product service with search and inventory management" &
npx claude-flow-novice sparc batch coder,tester "Create order service with payment processing and fulfillment" &
npx claude-flow-novice sparc batch coder,tester "Create notification service with email and SMS capabilities" &

# Wait for core services
wait

# Generate infrastructure components
npx claude-flow-novice sparc run coder "Create API Gateway with rate limiting and authentication"
npx claude-flow-novice sparc run coder "Setup service discovery with Eureka"
npx claude-flow-novice sparc run coder "Configure centralized logging with ELK stack"

# Generate deployment configurations
npx claude-flow-novice sparc run architect "Create Docker Compose for development environment"
npx claude-flow-novice sparc run architect "Create Kubernetes manifests for production deployment"

# Generate monitoring and observability
npx claude-flow-novice sparc run monitor "Setup comprehensive monitoring with Prometheus and Grafana"
npx claude-flow-novice sparc run monitor "Configure distributed tracing with Jaeger"

# Generate CI/CD pipeline
npx claude-flow-novice sparc run cicd-engineer "Create GitHub Actions workflow for automated testing and deployment"

echo "E-commerce platform development completed!"

# Generated with:
# npx claude-flow-novice sparc run architect "Create complete development workflow script for e-commerce platform"
```

### 2. Performance Optimization Workflow

```bash
#!/bin/bash
# performance-optimization.sh

echo "Starting performance optimization workflow..."

# Analyze current performance
npx claude-flow-novice sparc run perf-analyzer "Analyze application performance bottlenecks and generate optimization plan"

# Database optimization
npx claude-flow-novice sparc run perf-analyzer "Optimize database queries and connection pool settings"

# JVM tuning
npx claude-flow-novice sparc run perf-analyzer "Generate optimized JVM settings for production workload"

# Caching optimization
npx claude-flow-novice sparc run coder "Implement Redis caching strategy for frequently accessed data"

# Load testing
npx claude-flow-novice sparc run tester "Create comprehensive load tests with Gatling"

# Performance monitoring
npx claude-flow-novice sparc run monitor "Setup performance monitoring dashboards and alerts"

echo "Performance optimization completed!"
```

## Next Steps

- [Project Setup](project-setup.md)
- [Spring Boot Development](spring-boot.md)
- [Enterprise Java Development](enterprise-java.md)
- [Testing Strategies](testing.md)
- [Performance Optimization](performance.md)
- [Microservices Development](microservices.md)
- [Claude Flow Integration](claude-flow-integration.md)