# Axum Web Framework with Claude-Flow

This guide demonstrates how to build high-performance web applications using Axum, Rust's modern async web framework, with claude-flow orchestration and real toolchain integration.

## 🚀 Axum Overview

Axum is a modern, ergonomic web framework built on top of Tokio and Tower, designed for high-performance async web applications with excellent type safety and developer experience.

### Key Features
- **Async-first**: Built on tokio for excellent async performance
- **Type-safe**: Compile-time request/response validation
- **Modular**: Composable middleware and extractors
- **High-performance**: Zero-cost abstractions and minimal overhead
- **Integration**: Seamless integration with the Tower ecosystem

## 🎯 Quick Start: Axum Projects

### 1. REST API with Database

```bash
# Initialize Axum REST API project
npx claude-flow sparc run architect "Create REST API with Axum, PostgreSQL, JWT auth, and OpenAPI docs"

# This spawns specialized agents:
Task("Web Architect", "Design Axum API architecture with layered services", "web-architect")
Task("Database Engineer", "Implement SQLx integration with migrations", "database-engineer")
Task("Auth Specialist", "Add JWT authentication and authorization", "auth-engineer")
Task("API Designer", "Create OpenAPI documentation and validation", "api-docs")
Task("Performance Engineer", "Optimize async request handling", "performance-optimizer")
```

**Generated Project Structure:**
```
axum-api/
├── Cargo.toml
├── src/
│   ├── main.rs
│   ├── lib.rs
│   ├── config/
│   │   ├── mod.rs
│   │   └── settings.rs
│   ├── handlers/
│   │   ├── mod.rs
│   │   ├── auth.rs
│   │   ├── users.rs
│   │   └── health.rs
│   ├── models/
│   │   ├── mod.rs
│   │   ├── user.rs
│   │   └── auth.rs
│   ├── services/
│   │   ├── mod.rs
│   │   ├── user_service.rs
│   │   └── auth_service.rs
│   ├── middleware/
│   │   ├── mod.rs
│   │   ├── auth.rs
│   │   ├── cors.rs
│   │   └── logging.rs
│   ├── extractors/
│   │   ├── mod.rs
│   │   └── auth.rs
│   └── error.rs
├── migrations/
├── tests/
│   ├── integration/
│   └── common/
├── docs/
└── docker/
```

### 2. GraphQL API Server

```bash
# Create GraphQL server with Axum
npx claude-flow sparc run architect "Build GraphQL API server with Axum, async-graphql, and real-time subscriptions"

Task("GraphQL Architect", "Design schema and resolvers with async-graphql", "graphql-engineer")
Task("Subscription Engineer", "Implement WebSocket subscriptions", "websocket-engineer")
Task("Performance Engineer", "Optimize GraphQL query execution", "performance-optimizer")
```

## 🏗️ Core Axum Application Architecture

### 1. Application Setup and Configuration

```rust
// Generated main.rs by claude-flow agents
use axum::{
    extract::{Path, Query, State},
    http::{StatusCode, HeaderMap},
    middleware::{self, Next},
    response::{IntoResponse, Json},
    routing::{get, post, put, delete},
    Router,
};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use std::sync::Arc;
use tower::{ServiceBuilder, limit::ConcurrencyLimitLayer, timeout::TimeoutLayer};
use tower_http::{
    cors::CorsLayer,
    trace::TraceLayer,
    compression::CompressionLayer,
    request_id::{MakeRequestId, RequestId},
};
use tracing::{info, warn, error};
use uuid::Uuid;

// Application state
#[derive(Clone)]
pub struct AppState {
    pub db: PgPool,
    pub config: Arc<Config>,
    pub jwt_secret: String,
}

// Configuration management
#[derive(Debug, Clone)]
pub struct Config {
    pub database_url: String,
    pub jwt_secret: String,
    pub server_host: String,
    pub server_port: u16,
    pub cors_origins: Vec<String>,
    pub request_timeout: u64,
    pub max_connections: u32,
}

impl Config {
    pub fn from_env() -> Result<Self, config::ConfigError> {
        let settings = config::Config::builder()
            .add_source(config::Environment::with_prefix("APP"))
            .build()?;

        Ok(Self {
            database_url: settings.get_string("database_url")?,
            jwt_secret: settings.get_string("jwt_secret")?,
            server_host: settings.get_string("server_host").unwrap_or_else(|_| "0.0.0.0".to_string()),
            server_port: settings.get_int("server_port").unwrap_or(8080) as u16,
            cors_origins: settings.get_array("cors_origins")
                .unwrap_or_default()
                .into_iter()
                .map(|v| v.into_string().unwrap())
                .collect(),
            request_timeout: settings.get_int("request_timeout").unwrap_or(30) as u64,
            max_connections: settings.get_int("max_connections").unwrap_or(100) as u32,
        })
    }
}

// Request ID generation for tracing
#[derive(Clone)]
struct MakeRequestUuid;

impl MakeRequestId for MakeRequestUuid {
    type RequestId = String;

    fn make_request_id<B>(&mut self, _: &axum::http::Request<B>) -> Self::RequestId {
        Uuid::new_v4().to_string()
    }
}

// Main application factory
pub fn create_app(state: AppState) -> Router {
    Router::new()
        // API routes
        .nest("/api/v1", api_routes())
        // Health check
        .route("/health", get(health_check))
        // Metrics endpoint
        .route("/metrics", get(metrics_handler))
        // Add application state
        .with_state(state.clone())
        // Add middleware stack
        .layer(
            ServiceBuilder::new()
                // Timeout for all requests
                .layer(TimeoutLayer::new(
                    std::time::Duration::from_secs(state.config.request_timeout)
                ))
                // Limit concurrent requests
                .layer(ConcurrencyLimitLayer::new(state.config.max_connections as usize))
                // Compression
                .layer(CompressionLayer::new())
                // CORS
                .layer(create_cors_layer(&state.config.cors_origins))
                // Request tracing
                .layer(TraceLayer::new_for_http())
                // Request ID
                .layer(middleware::from_fn(request_id_middleware))
                // Custom logging
                .layer(middleware::from_fn(logging_middleware))
        )
}

// API routes organization
fn api_routes() -> Router<AppState> {
    Router::new()
        // Authentication routes
        .nest("/auth", auth_routes())
        // User management routes
        .nest("/users", user_routes())
        // Protected routes with auth middleware
        .nest("/protected", protected_routes())
}

fn auth_routes() -> Router<AppState> {
    Router::new()
        .route("/login", post(login_handler))
        .route("/register", post(register_handler))
        .route("/refresh", post(refresh_token_handler))
        .route("/logout", post(logout_handler))
}

fn user_routes() -> Router<AppState> {
    Router::new()
        .route("/", get(list_users).post(create_user))
        .route("/:id", get(get_user).put(update_user).delete(delete_user))
        .route("/:id/profile", get(get_user_profile).put(update_user_profile))
        .layer(middleware::from_fn_with_state(AppState::clone, auth_middleware))
}

fn protected_routes() -> Router<AppState> {
    Router::new()
        .route("/dashboard", get(dashboard_handler))
        .route("/admin", get(admin_handler))
        .layer(middleware::from_fn_with_state(AppState::clone, auth_middleware))
        .layer(middleware::from_fn_with_state(AppState::clone, role_middleware))
}

// CORS configuration
fn create_cors_layer(origins: &[String]) -> CorsLayer {
    let mut cors = CorsLayer::new()
        .allow_methods([
            axum::http::Method::GET,
            axum::http::Method::POST,
            axum::http::Method::PUT,
            axum::http::Method::DELETE,
            axum::http::Method::PATCH,
        ])
        .allow_headers([
            axum::http::header::AUTHORIZATION,
            axum::http::header::CONTENT_TYPE,
            axum::http::header::ACCEPT,
        ]);

    if origins.is_empty() || origins.contains(&"*".to_string()) {
        cors = cors.allow_origin(tower_http::cors::Any);
    } else {
        for origin in origins {
            cors = cors.allow_origin(origin.parse().unwrap());
        }
    }

    cors
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Initialize tracing
    tracing_subscriber::registry()
        .with(tracing_subscriber::EnvFilter::new(
            std::env::var("RUST_LOG").unwrap_or_else(|_| "axum_api=debug,tower_http=debug".into())
        ))
        .with(tracing_subscriber::fmt::layer())
        .init();

    // Load configuration
    let config = Config::from_env()?;

    // Connect to database
    let db = PgPool::connect(&config.database_url).await?;

    // Run migrations
    sqlx::migrate!("./migrations").run(&db).await?;

    // Create application state
    let state = AppState {
        db: db.clone(),
        config: Arc::new(config.clone()),
        jwt_secret: config.jwt_secret.clone(),
    };

    // Create the application
    let app = create_app(state);

    // Create server
    let listener = tokio::net::TcpListener::bind(
        format!("{}:{}", config.server_host, config.server_port)
    ).await?;

    info!("Server starting on http://{}:{}", config.server_host, config.server_port);

    // Run the server
    axum::serve(listener, app).await?;

    Ok(())
}
```

### 2. Advanced Request Handling and Extractors

```rust
// Custom extractors for type-safe request handling
use axum::{
    async_trait,
    extract::{FromRequest, FromRequestParts},
    http::{request::Parts, StatusCode},
    response::{IntoResponse, Response},
    Json, RequestPartsExt,
};
use serde::de::DeserializeOwned;
use validator::Validate;

// Validated JSON extractor
pub struct ValidatedJson<T>(pub T);

#[async_trait]
impl<T, S> FromRequest<S> for ValidatedJson<T>
where
    T: DeserializeOwned + Validate + Send,
    S: Send + Sync,
{
    type Rejection = Response;

    async fn from_request(req: axum::http::Request<axum::body::Body>, state: &S) -> Result<Self, Self::Rejection> {
        let Json(value) = Json::<T>::from_request(req, state)
            .await
            .map_err(|err| {
                (StatusCode::BAD_REQUEST, format!("Invalid JSON: {}", err)).into_response()
            })?;

        value.validate().map_err(|err| {
            (StatusCode::UNPROCESSABLE_ENTITY, format!("Validation error: {}", err)).into_response()
        })?;

        Ok(ValidatedJson(value))
    }
}

// Authenticated user extractor
pub struct AuthenticatedUser {
    pub user_id: Uuid,
    pub email: String,
    pub roles: Vec<String>,
}

#[async_trait]
impl<S> FromRequestParts<S> for AuthenticatedUser
where
    S: Send + Sync,
    AppState: FromRef<S>,
{
    type Rejection = AuthError;

    async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self, Self::Rejection> {
        let state = AppState::from_ref(state);

        let auth_header = parts
            .headers
            .get(axum::http::header::AUTHORIZATION)
            .and_then(|header| header.to_str().ok())
            .ok_or(AuthError::MissingToken)?;

        let token = auth_header
            .strip_prefix("Bearer ")
            .ok_or(AuthError::InvalidToken)?;

        let claims = verify_jwt(token, &state.jwt_secret)
            .map_err(|_| AuthError::InvalidToken)?;

        Ok(AuthenticatedUser {
            user_id: claims.user_id,
            email: claims.email,
            roles: claims.roles,
        })
    }
}

// Pagination extractor
#[derive(Debug, Deserialize)]
pub struct PaginationParams {
    pub page: Option<u32>,
    pub limit: Option<u32>,
}

impl Default for PaginationParams {
    fn default() -> Self {
        Self {
            page: Some(1),
            limit: Some(20),
        }
    }
}

impl PaginationParams {
    pub fn offset(&self) -> u32 {
        (self.page.unwrap_or(1).saturating_sub(1)) * self.limit.unwrap_or(20)
    }

    pub fn limit(&self) -> u32 {
        std::cmp::min(self.limit.unwrap_or(20), 100) // Max 100 items per page
    }
}

// Search parameters extractor
#[derive(Debug, Deserialize)]
pub struct SearchParams {
    pub q: Option<String>,
    pub sort: Option<String>,
    pub order: Option<SortOrder>,
    #[serde(flatten)]
    pub pagination: PaginationParams,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SortOrder {
    Asc,
    Desc,
}

impl Default for SortOrder {
    fn default() -> Self {
        Self::Asc
    }
}
```

### 3. Middleware Implementation

```rust
// Authentication middleware
pub async fn auth_middleware(
    State(state): State<AppState>,
    mut req: axum::http::Request<axum::body::Body>,
    next: Next,
) -> Result<Response, AuthError> {
    let auth_header = req
        .headers()
        .get(axum::http::header::AUTHORIZATION)
        .and_then(|header| header.to_str().ok())
        .ok_or(AuthError::MissingToken)?;

    let token = auth_header
        .strip_prefix("Bearer ")
        .ok_or(AuthError::InvalidToken)?;

    let claims = verify_jwt(token, &state.jwt_secret)
        .map_err(|_| AuthError::InvalidToken)?;

    // Add user info to request extensions for handlers to use
    req.extensions_mut().insert(claims);

    Ok(next.run(req).await)
}

// Role-based authorization middleware
pub async fn role_middleware(
    State(_state): State<AppState>,
    req: axum::http::Request<axum::body::Body>,
    next: Next,
) -> Result<Response, AuthError> {
    let claims = req
        .extensions()
        .get::<JwtClaims>()
        .ok_or(AuthError::Unauthorized)?;

    // Check if user has required role
    if !claims.roles.contains(&"admin".to_string()) {
        return Err(AuthError::Forbidden);
    }

    Ok(next.run(req).await)
}

// Request ID middleware
pub async fn request_id_middleware(
    req: axum::http::Request<axum::body::Body>,
    next: Next,
) -> Response {
    let request_id = Uuid::new_v4().to_string();

    // Add request ID to tracing span
    let span = tracing::info_span!("request", request_id = %request_id);

    async move {
        let mut response = next.run(req).await;

        // Add request ID to response headers
        response.headers_mut().insert(
            "x-request-id",
            request_id.parse().unwrap(),
        );

        response
    }
    .instrument(span)
    .await
}

// Logging middleware
pub async fn logging_middleware(
    req: axum::http::Request<axum::body::Body>,
    next: Next,
) -> Response {
    let start = std::time::Instant::now();
    let method = req.method().clone();
    let uri = req.uri().clone();

    let response = next.run(req).await;

    let latency = start.elapsed();
    let status = response.status();

    tracing::info!(
        method = %method,
        uri = %uri,
        status = %status,
        latency = ?latency,
        "Request completed"
    );

    response
}

// Rate limiting middleware
use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant};

pub struct RateLimiter {
    requests: Mutex<HashMap<String, Vec<Instant>>>,
    max_requests: usize,
    window: Duration,
}

impl RateLimiter {
    pub fn new(max_requests: usize, window: Duration) -> Self {
        Self {
            requests: Mutex::new(HashMap::new()),
            max_requests,
            window,
        }
    }

    pub fn check_rate_limit(&self, key: &str) -> bool {
        let now = Instant::now();
        let mut requests = self.requests.lock().unwrap();

        let user_requests = requests.entry(key.to_string()).or_insert_with(Vec::new);

        // Remove old requests outside the window
        user_requests.retain(|&time| now.duration_since(time) < self.window);

        if user_requests.len() >= self.max_requests {
            false
        } else {
            user_requests.push(now);
            true
        }
    }
}

pub async fn rate_limit_middleware(
    State(rate_limiter): State<Arc<RateLimiter>>,
    req: axum::http::Request<axum::body::Body>,
    next: Next,
) -> Result<Response, StatusCode> {
    // Extract client IP or user ID for rate limiting
    let client_id = req
        .headers()
        .get("x-forwarded-for")
        .and_then(|header| header.to_str().ok())
        .unwrap_or("unknown");

    if !rate_limiter.check_rate_limit(client_id) {
        return Err(StatusCode::TOO_MANY_REQUESTS);
    }

    Ok(next.run(req).await)
}
```

## 📦 Database Integration with SQLx

### 1. Database Models and Queries

```rust
// User model with SQLx integration
use sqlx::{FromRow, PgPool, query, query_as};
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use chrono::{DateTime, Utc};

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct User {
    pub id: Uuid,
    pub email: String,
    pub username: String,
    pub password_hash: String,
    pub is_active: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize, Validate)]
pub struct CreateUserRequest {
    #[validate(email)]
    pub email: String,

    #[validate(length(min = 3, max = 50))]
    pub username: String,

    #[validate(length(min = 8))]
    pub password: String,
}

#[derive(Debug, Deserialize, Validate)]
pub struct UpdateUserRequest {
    #[validate(email)]
    pub email: Option<String>,

    #[validate(length(min = 3, max = 50))]
    pub username: Option<String>,
}

// User service implementation
pub struct UserService {
    db: PgPool,
}

impl UserService {
    pub fn new(db: PgPool) -> Self {
        Self { db }
    }

    pub async fn create_user(&self, request: CreateUserRequest) -> Result<User, DatabaseError> {
        let password_hash = hash_password(&request.password)?;
        let user_id = Uuid::new_v4();

        let user = query_as!(
            User,
            r#"
            INSERT INTO users (id, email, username, password_hash, is_active, created_at, updated_at)
            VALUES ($1, $2, $3, $4, true, NOW(), NOW())
            RETURNING id, email, username, password_hash, is_active, created_at, updated_at
            "#,
            user_id,
            request.email,
            request.username,
            password_hash
        )
        .fetch_one(&self.db)
        .await?;

        Ok(user)
    }

    pub async fn get_user_by_id(&self, user_id: Uuid) -> Result<Option<User>, DatabaseError> {
        let user = query_as!(
            User,
            "SELECT id, email, username, password_hash, is_active, created_at, updated_at FROM users WHERE id = $1",
            user_id
        )
        .fetch_optional(&self.db)
        .await?;

        Ok(user)
    }

    pub async fn get_user_by_email(&self, email: &str) -> Result<Option<User>, DatabaseError> {
        let user = query_as!(
            User,
            "SELECT id, email, username, password_hash, is_active, created_at, updated_at FROM users WHERE email = $1",
            email
        )
        .fetch_optional(&self.db)
        .await?;

        Ok(user)
    }

    pub async fn list_users(&self, pagination: &PaginationParams, search: &SearchParams) -> Result<Vec<User>, DatabaseError> {
        let mut query_builder = sqlx::QueryBuilder::new(
            "SELECT id, email, username, password_hash, is_active, created_at, updated_at FROM users WHERE 1=1"
        );

        // Add search filter
        if let Some(search_query) = &search.q {
            query_builder.push(" AND (username ILIKE ");
            query_builder.push_bind(format!("%{}%", search_query));
            query_builder.push(" OR email ILIKE ");
            query_builder.push_bind(format!("%{}%", search_query));
            query_builder.push(")");
        }

        // Add sorting
        let sort_column = search.sort.as_deref().unwrap_or("created_at");
        let sort_order = match search.order.as_ref().unwrap_or(&SortOrder::Desc) {
            SortOrder::Asc => "ASC",
            SortOrder::Desc => "DESC",
        };

        query_builder.push(format!(" ORDER BY {} {}", sort_column, sort_order));

        // Add pagination
        query_builder.push(" LIMIT ");
        query_builder.push_bind(pagination.limit() as i64);
        query_builder.push(" OFFSET ");
        query_builder.push_bind(pagination.offset() as i64);

        let users = query_builder
            .build_query_as::<User>()
            .fetch_all(&self.db)
            .await?;

        Ok(users)
    }

    pub async fn update_user(&self, user_id: Uuid, request: UpdateUserRequest) -> Result<Option<User>, DatabaseError> {
        let mut query_builder = sqlx::QueryBuilder::new("UPDATE users SET updated_at = NOW()");
        let mut has_updates = false;

        if let Some(email) = &request.email {
            query_builder.push(", email = ");
            query_builder.push_bind(email);
            has_updates = true;
        }

        if let Some(username) = &request.username {
            query_builder.push(", username = ");
            query_builder.push_bind(username);
            has_updates = true;
        }

        if !has_updates {
            return self.get_user_by_id(user_id).await;
        }

        query_builder.push(" WHERE id = ");
        query_builder.push_bind(user_id);
        query_builder.push(" RETURNING id, email, username, password_hash, is_active, created_at, updated_at");

        let user = query_builder
            .build_query_as::<User>()
            .fetch_optional(&self.db)
            .await?;

        Ok(user)
    }

    pub async fn delete_user(&self, user_id: Uuid) -> Result<bool, DatabaseError> {
        let result = query!("DELETE FROM users WHERE id = $1", user_id)
            .execute(&self.db)
            .await?;

        Ok(result.rows_affected() > 0)
    }

    pub async fn count_users(&self, search: &SearchParams) -> Result<i64, DatabaseError> {
        let mut query_builder = sqlx::QueryBuilder::new("SELECT COUNT(*) as count FROM users WHERE 1=1");

        if let Some(search_query) = &search.q {
            query_builder.push(" AND (username ILIKE ");
            query_builder.push_bind(format!("%{}%", search_query));
            query_builder.push(" OR email ILIKE ");
            query_builder.push_bind(format!("%{}%", search_query));
            query_builder.push(")");
        }

        let count = query_builder
            .build_query_scalar::<i64>()
            .fetch_one(&self.db)
            .await?;

        Ok(count)
    }
}
```

### 2. Database Migrations

```sql
-- Generated migration by claude-flow agents
-- migrations/001_initial_schema.sql

-- Users table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    username VARCHAR(100) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_created_at ON users(created_at);

-- User sessions table for JWT token management
CREATE TABLE user_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    UNIQUE(token_hash)
);

CREATE INDEX idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX idx_user_sessions_expires_at ON user_sessions(expires_at);

-- User profiles table
CREATE TABLE user_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    bio TEXT,
    avatar_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    UNIQUE(user_id)
);

-- Roles and permissions
CREATE TABLE roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(50) UNIQUE NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE TABLE permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    resource VARCHAR(100) NOT NULL,
    action VARCHAR(50) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE TABLE role_permissions (
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE user_roles (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    granted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    granted_by UUID REFERENCES users(id),
    PRIMARY KEY (user_id, role_id)
);

-- Insert default roles
INSERT INTO roles (name, description) VALUES
    ('admin', 'Administrator with full access'),
    ('user', 'Regular user with basic permissions'),
    ('moderator', 'Moderator with enhanced permissions');

-- Insert basic permissions
INSERT INTO permissions (name, description, resource, action) VALUES
    ('users.read', 'Read user information', 'users', 'read'),
    ('users.write', 'Create and update users', 'users', 'write'),
    ('users.delete', 'Delete users', 'users', 'delete'),
    ('admin.access', 'Access admin panel', 'admin', 'access');

-- Grant permissions to roles
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'admin'; -- Admin gets all permissions

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'user' AND p.name = 'users.read';
```

## 🔐 Authentication and Authorization

### 1. JWT Authentication Implementation

```rust
// JWT authentication service
use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};
use chrono::{Duration, Utc};

#[derive(Debug, Serialize, Deserialize)]
pub struct JwtClaims {
    pub sub: String,     // subject (user id)
    pub email: String,
    pub roles: Vec<String>,
    pub exp: i64,        // expiration time
    pub iat: i64,        // issued at
    pub jti: String,     // JWT ID for revocation
}

pub struct AuthService {
    encoding_key: EncodingKey,
    decoding_key: DecodingKey,
    db: PgPool,
}

impl AuthService {
    pub fn new(secret: &str, db: PgPool) -> Self {
        Self {
            encoding_key: EncodingKey::from_secret(secret.as_bytes()),
            decoding_key: DecodingKey::from_secret(secret.as_bytes()),
            db,
        }
    }

    pub async fn authenticate(&self, email: &str, password: &str) -> Result<AuthResponse, AuthError> {
        // Get user from database
        let user = query_as!(
            User,
            "SELECT id, email, username, password_hash, is_active, created_at, updated_at FROM users WHERE email = $1 AND is_active = true",
            email
        )
        .fetch_optional(&self.db)
        .await?
        .ok_or(AuthError::InvalidCredentials)?;

        // Verify password
        if !verify_password(password, &user.password_hash)? {
            return Err(AuthError::InvalidCredentials);
        }

        // Get user roles
        let roles = query_scalar!(
            "SELECT r.name FROM roles r
             JOIN user_roles ur ON r.id = ur.role_id
             WHERE ur.user_id = $1",
            user.id
        )
        .fetch_all(&self.db)
        .await?;

        // Generate JWT token
        let token_id = Uuid::new_v4().to_string();
        let expiry = Utc::now() + Duration::hours(24);

        let claims = JwtClaims {
            sub: user.id.to_string(),
            email: user.email.clone(),
            roles,
            exp: expiry.timestamp(),
            iat: Utc::now().timestamp(),
            jti: token_id.clone(),
        };

        let token = encode(&Header::default(), &claims, &self.encoding_key)?;

        // Store session in database
        let token_hash = hash_token(&token)?;
        query!(
            "INSERT INTO user_sessions (user_id, token_hash, expires_at) VALUES ($1, $2, $3)",
            user.id,
            token_hash,
            expiry
        )
        .execute(&self.db)
        .await?;

        Ok(AuthResponse {
            access_token: token,
            token_type: "Bearer".to_string(),
            expires_in: 86400, // 24 hours
            user: UserResponse::from(user),
        })
    }

    pub async fn verify_token(&self, token: &str) -> Result<JwtClaims, AuthError> {
        // Decode and validate JWT
        let token_data = decode::<JwtClaims>(
            token,
            &self.decoding_key,
            &Validation::default(),
        )?;

        // Check if session exists and is not expired
        let token_hash = hash_token(token)?;
        let session_exists = query_scalar!(
            "SELECT EXISTS(SELECT 1 FROM user_sessions WHERE token_hash = $1 AND expires_at > NOW())",
            token_hash
        )
        .fetch_one(&self.db)
        .await?
        .unwrap_or(false);

        if !session_exists {
            return Err(AuthError::InvalidToken);
        }

        Ok(token_data.claims)
    }

    pub async fn logout(&self, token: &str) -> Result<(), AuthError> {
        let token_hash = hash_token(token)?;

        query!(
            "DELETE FROM user_sessions WHERE token_hash = $1",
            token_hash
        )
        .execute(&self.db)
        .await?;

        Ok(())
    }

    pub async fn refresh_token(&self, refresh_token: &str) -> Result<AuthResponse, AuthError> {
        // Verify the refresh token
        let claims = self.verify_token(refresh_token).await?;

        // Generate new access token
        let new_token_id = Uuid::new_v4().to_string();
        let expiry = Utc::now() + Duration::hours(24);

        let new_claims = JwtClaims {
            sub: claims.sub,
            email: claims.email,
            roles: claims.roles,
            exp: expiry.timestamp(),
            iat: Utc::now().timestamp(),
            jti: new_token_id,
        };

        let new_token = encode(&Header::default(), &new_claims, &self.encoding_key)?;

        // Remove old session and create new one
        let old_token_hash = hash_token(refresh_token)?;
        let new_token_hash = hash_token(&new_token)?;

        let user_id: Uuid = claims.sub.parse()?;

        sqlx::query!(
            "UPDATE user_sessions SET token_hash = $1, expires_at = $2 WHERE token_hash = $3",
            new_token_hash,
            expiry,
            old_token_hash
        )
        .execute(&self.db)
        .await?;

        // Get user info
        let user = query_as!(
            User,
            "SELECT id, email, username, password_hash, is_active, created_at, updated_at FROM users WHERE id = $1",
            user_id
        )
        .fetch_one(&self.db)
        .await?;

        Ok(AuthResponse {
            access_token: new_token,
            token_type: "Bearer".to_string(),
            expires_in: 86400,
            user: UserResponse::from(user),
        })
    }
}

// Password hashing utilities
use argon2::{Argon2, PasswordHash, PasswordHasher, PasswordVerifier};
use argon2::password_hash::{rand_core::OsRng, SaltString};

pub fn hash_password(password: &str) -> Result<String, AuthError> {
    let salt = SaltString::generate(&mut OsRng);
    let argon2 = Argon2::default();

    let password_hash = argon2
        .hash_password(password.as_bytes(), &salt)?
        .to_string();

    Ok(password_hash)
}

pub fn verify_password(password: &str, hash: &str) -> Result<bool, AuthError> {
    let parsed_hash = PasswordHash::new(hash)?;
    let argon2 = Argon2::default();

    Ok(argon2.verify_password(password.as_bytes(), &parsed_hash).is_ok())
}

fn hash_token(token: &str) -> Result<String, AuthError> {
    use sha2::{Sha256, Digest};

    let mut hasher = Sha256::new();
    hasher.update(token.as_bytes());
    let result = hasher.finalize();

    Ok(format!("{:x}", result))
}
```

### 2. Request Handlers Implementation

```rust
// Authentication handlers
pub async fn login_handler(
    State(state): State<AppState>,
    ValidatedJson(request): ValidatedJson<LoginRequest>,
) -> Result<Json<AuthResponse>, AuthError> {
    let auth_service = AuthService::new(&state.jwt_secret, state.db.clone());

    let response = auth_service
        .authenticate(&request.email, &request.password)
        .await?;

    Ok(Json(response))
}

pub async fn register_handler(
    State(state): State<AppState>,
    ValidatedJson(request): ValidatedJson<CreateUserRequest>,
) -> Result<Json<AuthResponse>, AuthError> {
    let user_service = UserService::new(state.db.clone());
    let auth_service = AuthService::new(&state.jwt_secret, state.db.clone());

    // Check if user already exists
    if user_service.get_user_by_email(&request.email).await?.is_some() {
        return Err(AuthError::UserAlreadyExists);
    }

    // Create user
    let user = user_service.create_user(request).await?;

    // Assign default role
    query!(
        "INSERT INTO user_roles (user_id, role_id)
         SELECT $1, id FROM roles WHERE name = 'user'",
        user.id
    )
    .execute(&state.db)
    .await?;

    // Authenticate the new user
    let response = auth_service
        .authenticate(&user.email, &request.password)
        .await?;

    Ok(Json(response))
}

pub async fn refresh_token_handler(
    State(state): State<AppState>,
    Json(request): Json<RefreshTokenRequest>,
) -> Result<Json<AuthResponse>, AuthError> {
    let auth_service = AuthService::new(&state.jwt_secret, state.db.clone());

    let response = auth_service
        .refresh_token(&request.refresh_token)
        .await?;

    Ok(Json(response))
}

pub async fn logout_handler(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<StatusCode, AuthError> {
    let auth_header = headers
        .get(axum::http::header::AUTHORIZATION)
        .and_then(|header| header.to_str().ok())
        .ok_or(AuthError::MissingToken)?;

    let token = auth_header
        .strip_prefix("Bearer ")
        .ok_or(AuthError::InvalidToken)?;

    let auth_service = AuthService::new(&state.jwt_secret, state.db.clone());
    auth_service.logout(token).await?;

    Ok(StatusCode::NO_CONTENT)
}

// User management handlers
pub async fn list_users(
    State(state): State<AppState>,
    Query(search): Query<SearchParams>,
    user: AuthenticatedUser,
) -> Result<Json<PaginatedResponse<UserResponse>>, AppError> {
    // Check permissions
    if !user.roles.contains(&"admin".to_string()) {
        return Err(AppError::Forbidden);
    }

    let user_service = UserService::new(state.db.clone());

    let users = user_service.list_users(&search.pagination, &search).await?;
    let total = user_service.count_users(&search).await?;

    let user_responses: Vec<UserResponse> = users.into_iter().map(UserResponse::from).collect();

    let response = PaginatedResponse {
        data: user_responses,
        pagination: PaginationResponse {
            page: search.pagination.page.unwrap_or(1),
            limit: search.pagination.limit.unwrap_or(20),
            total,
            pages: (total as f64 / search.pagination.limit.unwrap_or(20) as f64).ceil() as u32,
        },
    };

    Ok(Json(response))
}

pub async fn get_user(
    State(state): State<AppState>,
    Path(user_id): Path<Uuid>,
    current_user: AuthenticatedUser,
) -> Result<Json<UserResponse>, AppError> {
    // Users can view their own profile or admins can view any profile
    if current_user.user_id != user_id && !current_user.roles.contains(&"admin".to_string()) {
        return Err(AppError::Forbidden);
    }

    let user_service = UserService::new(state.db);

    let user = user_service
        .get_user_by_id(user_id)
        .await?
        .ok_or(AppError::NotFound)?;

    Ok(Json(UserResponse::from(user)))
}

pub async fn update_user(
    State(state): State<AppState>,
    Path(user_id): Path<Uuid>,
    current_user: AuthenticatedUser,
    ValidatedJson(request): ValidatedJson<UpdateUserRequest>,
) -> Result<Json<UserResponse>, AppError> {
    // Users can update their own profile or admins can update any profile
    if current_user.user_id != user_id && !current_user.roles.contains(&"admin".to_string()) {
        return Err(AppError::Forbidden);
    }

    let user_service = UserService::new(state.db);

    let user = user_service
        .update_user(user_id, request)
        .await?
        .ok_or(AppError::NotFound)?;

    Ok(Json(UserResponse::from(user)))
}

// Health check and metrics handlers
pub async fn health_check() -> Json<HealthResponse> {
    Json(HealthResponse {
        status: "healthy".to_string(),
        timestamp: Utc::now(),
        version: env!("CARGO_PKG_VERSION").to_string(),
    })
}

pub async fn metrics_handler(State(state): State<AppState>) -> Result<String, AppError> {
    // Implement Prometheus metrics collection
    let metrics = collect_metrics(&state.db).await?;
    Ok(format_prometheus_metrics(metrics))
}

async fn collect_metrics(db: &PgPool) -> Result<AppMetrics, sqlx::Error> {
    let user_count = query_scalar!("SELECT COUNT(*) FROM users")
        .fetch_one(db)
        .await?
        .unwrap_or(0);

    let active_sessions = query_scalar!(
        "SELECT COUNT(*) FROM user_sessions WHERE expires_at > NOW()"
    )
    .fetch_one(db)
    .await?
    .unwrap_or(0);

    Ok(AppMetrics {
        user_count,
        active_sessions,
        timestamp: Utc::now(),
    })
}
```

## 🧪 Testing Axum Applications

### 1. Integration Testing

```rust
// Integration tests for Axum API
use axum_test::TestServer;
use serde_json::json;
use sqlx::PgPool;

#[tokio::test]
async fn test_user_registration_and_login() {
    let db = setup_test_db().await;
    let app = create_test_app(db.clone()).await;
    let server = TestServer::new(app).unwrap();

    // Test user registration
    let registration_response = server
        .post("/api/v1/auth/register")
        .json(&json!({
            "email": "test@example.com",
            "username": "testuser",
            "password": "password123"
        }))
        .await;

    registration_response.assert_status_ok();
    let auth_response: AuthResponse = registration_response.json();
    assert!(!auth_response.access_token.is_empty());

    // Test login with created user
    let login_response = server
        .post("/api/v1/auth/login")
        .json(&json!({
            "email": "test@example.com",
            "password": "password123"
        }))
        .await;

    login_response.assert_status_ok();
    let login_auth: AuthResponse = login_response.json();
    assert!(!login_auth.access_token.is_empty());

    cleanup_test_db(db).await;
}

#[tokio::test]
async fn test_protected_route_authentication() {
    let db = setup_test_db().await;
    let app = create_test_app(db.clone()).await;
    let server = TestServer::new(app).unwrap();

    // Try to access protected route without token
    let response = server.get("/api/v1/users").await;
    response.assert_status_unauthorized();

    // Create user and get token
    let (token, _) = create_test_user_and_login(&server).await;

    // Access protected route with valid token
    let response = server
        .get("/api/v1/users")
        .add_header("authorization", format!("Bearer {}", token))
        .await;

    response.assert_status_ok();

    cleanup_test_db(db).await;
}

#[tokio::test]
async fn test_user_crud_operations() {
    let db = setup_test_db().await;
    let app = create_test_app(db.clone()).await;
    let server = TestServer::new(app).unwrap();

    let (token, user) = create_test_user_and_login(&server).await;

    // Test get user
    let response = server
        .get(&format!("/api/v1/users/{}", user.id))
        .add_header("authorization", format!("Bearer {}", token))
        .await;

    response.assert_status_ok();
    let retrieved_user: UserResponse = response.json();
    assert_eq!(retrieved_user.email, user.email);

    // Test update user
    let update_response = server
        .put(&format!("/api/v1/users/{}", user.id))
        .add_header("authorization", format!("Bearer {}", token))
        .json(&json!({
            "username": "updated_username"
        }))
        .await;

    update_response.assert_status_ok();
    let updated_user: UserResponse = update_response.json();
    assert_eq!(updated_user.username, "updated_username");

    cleanup_test_db(db).await;
}

// Test utilities
async fn setup_test_db() -> PgPool {
    let database_url = std::env::var("TEST_DATABASE_URL")
        .expect("TEST_DATABASE_URL must be set for integration tests");

    let db = PgPool::connect(&database_url).await.unwrap();

    // Run migrations
    sqlx::migrate!("./migrations").run(&db).await.unwrap();

    db
}

async fn create_test_app(db: PgPool) -> Router {
    let config = Config {
        database_url: "".to_string(), // Not used in tests
        jwt_secret: "test_secret_key_for_testing_only".to_string(),
        server_host: "localhost".to_string(),
        server_port: 0,
        cors_origins: vec!["*".to_string()],
        request_timeout: 30,
        max_connections: 10,
    };

    let state = AppState {
        db,
        config: Arc::new(config),
        jwt_secret: "test_secret_key_for_testing_only".to_string(),
    };

    create_app(state)
}

async fn create_test_user_and_login(server: &TestServer) -> (String, UserResponse) {
    let registration_response = server
        .post("/api/v1/auth/register")
        .json(&json!({
            "email": "testuser@example.com",
            "username": "testuser",
            "password": "testpassword123"
        }))
        .await;

    registration_response.assert_status_ok();
    let auth_response: AuthResponse = registration_response.json();

    (auth_response.access_token, auth_response.user)
}

async fn cleanup_test_db(db: PgPool) {
    // Clean up test data
    sqlx::query("TRUNCATE TABLE user_sessions CASCADE")
        .execute(&db)
        .await
        .unwrap();

    sqlx::query("TRUNCATE TABLE users CASCADE")
        .execute(&db)
        .await
        .unwrap();

    db.close().await;
}
```

### 2. Load Testing with Real Metrics

```bash
# Load testing script generated by claude-flow agents
#!/bin/bash

echo "🔥 Starting Axum API load testing..."

# Start the server in background
cargo run --release &
SERVER_PID=$!

# Wait for server to start
sleep 5

# Run wrk load test
echo "📊 Running load test with wrk..."
wrk -t12 -c400 -d30s --script=load_test.lua http://localhost:8080/api/v1/health

# Run Artillery.io for complex scenarios
echo "🎯 Running scenario-based testing with Artillery..."
artillery run load-test-config.yml

# Cleanup
kill $SERVER_PID

echo "✅ Load testing complete!"
```

This comprehensive Axum guide demonstrates real Rust web development with claude-flow, showcasing production-ready patterns, authentication, database integration, and testing strategies.

## 🔗 Next Steps

- [Database Integration Guide](./database.md) - Advanced SQLx patterns
- [Performance Testing](../testing/performance.md) - Benchmarking Axum applications
- [Deployment Guide](../examples/microservice.md) - Production deployment patterns
- [WebSocket Integration](./websockets.md) - Real-time features with Axum