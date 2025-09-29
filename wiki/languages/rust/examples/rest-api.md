# Complete REST API Example with Claude-Flow

This comprehensive example demonstrates building a production-ready REST API using Rust, Axum, and claude-flow-novice orchestration, showcasing real toolchain integration and agent coordination.

## 🎯 Project Overview

We'll build a **Task Management API** with the following features:
- User authentication and authorization
- CRUD operations for tasks and projects
- Real-time notifications via WebSockets
- Rate limiting and caching
- Comprehensive testing and monitoring
- Production deployment configuration

## 🚀 Project Initialization

### 1. Create Project with Claude-Flow

```bash
# Initialize the project with multiple specialized agents
npx claude-flow-novice sparc run architect "Create a production-ready REST API for task management with user auth, real-time updates, and PostgreSQL"

# This spawns coordinated agents:
Task("API Architect", "Design RESTful API architecture with proper resource modeling", "api-architect")
Task("Database Engineer", "Design PostgreSQL schema with proper relationships and indexing", "database-engineer")
Task("Auth Specialist", "Implement JWT authentication with role-based access control", "auth-engineer")
Task("Performance Engineer", "Add caching, rate limiting, and performance optimization", "performance-optimizer")
Task("Testing Engineer", "Create comprehensive test suite with integration tests", "test-engineer")
Task("DevOps Engineer", "Set up Docker, CI/CD, and monitoring", "devops-engineer")
```

### 2. Generated Project Structure

```
task-management-api/
├── Cargo.toml
├── Cargo.lock
├── src/
│   ├── main.rs
│   ├── lib.rs
│   ├── config/
│   │   ├── mod.rs
│   │   ├── database.rs
│   │   ├── cache.rs
│   │   └── settings.rs
│   ├── handlers/
│   │   ├── mod.rs
│   │   ├── auth.rs
│   │   ├── users.rs
│   │   ├── projects.rs
│   │   ├── tasks.rs
│   │   └── websocket.rs
│   ├── models/
│   │   ├── mod.rs
│   │   ├── user.rs
│   │   ├── project.rs
│   │   ├── task.rs
│   │   └── auth.rs
│   ├── services/
│   │   ├── mod.rs
│   │   ├── auth_service.rs
│   │   ├── user_service.rs
│   │   ├── project_service.rs
│   │   ├── task_service.rs
│   │   └── notification_service.rs
│   ├── middleware/
│   │   ├── mod.rs
│   │   ├── auth.rs
│   │   ├── rate_limit.rs
│   │   ├── cors.rs
│   │   └── logging.rs
│   ├── utils/
│   │   ├── mod.rs
│   │   ├── cache.rs
│   │   ├── validation.rs
│   │   └── pagination.rs
│   └── error.rs
├── migrations/
│   ├── 001_initial_schema.sql
│   ├── 002_add_projects.sql
│   ├── 003_add_tasks.sql
│   └── 004_add_notifications.sql
├── tests/
│   ├── integration/
│   │   ├── auth_tests.rs
│   │   ├── project_tests.rs
│   │   ├── task_tests.rs
│   │   └── websocket_tests.rs
│   └── common/
│       └── mod.rs
├── benches/
│   └── api_benchmarks.rs
├── docs/
│   ├── api-spec.yml
│   └── README.md
├── docker/
│   ├── Dockerfile
│   ├── docker-compose.yml
│   └── nginx.conf
├── .github/
│   └── workflows/
│       ├── ci.yml
│       └── deploy.yml
└── scripts/
    ├── setup-dev.sh
    ├── run-tests.sh
    └── deploy.sh
```

## 📦 Dependencies Configuration

### Generated Cargo.toml

```toml
[package]
name = "task-management-api"
version = "0.1.0"
edition = "2021"
rust-version = "1.70"
authors = ["Development Team <team@example.com>"]
description = "Production-ready task management REST API built with Rust and Axum"
license = "MIT"
repository = "https://github.com/company/task-management-api"

[dependencies]
# Web framework
axum = { version = "0.7", features = ["macros", "multipart", "ws"] }
tokio = { version = "1.0", features = ["full"] }
tower = { version = "0.4", features = ["util", "timeout", "load-shed", "limit"] }
tower-http = { version = "0.5", features = ["fs", "trace", "cors", "compression-gzip", "request-id"] }

# Database
sqlx = { version = "0.7", features = ["runtime-tokio-rustls", "postgres", "chrono", "uuid", "migrate", "json"] }

# Serialization
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"

# Authentication & Security
jsonwebtoken = "9.0"
argon2 = "0.5"
uuid = { version = "1.0", features = ["v4", "serde"] }

# Caching
redis = { version = "0.24", features = ["tokio-comp", "connection-manager"] }

# Rate limiting
governor = "0.6"

# Configuration
config = "0.14"
dotenvy = "0.15"

# Logging & Monitoring
tracing = "0.1"
tracing-subscriber = { version = "0.3", features = ["env-filter", "json"] }
metrics = "0.22"
metrics-exporter-prometheus = "0.13"

# Error handling
anyhow = "1.0"
thiserror = "1.0"

# Validation
validator = { version = "0.18", features = ["derive"] }

# Time handling
chrono = { version = "0.4", features = ["serde"] }

# HTTP client for external services
reqwest = { version = "0.11", features = ["json", "rustls-tls"] }

# Utilities
futures = "0.3"
async-trait = "0.1"

[dev-dependencies]
axum-test = "14.0"
tokio-test = "0.4"
wiremock = "0.5"
tempfile = "3.0"
criterion = { version = "0.5", features = ["html_reports"] }

[[bench]]
name = "api_benchmarks"
harness = false

[profile.release]
opt-level = 3
lto = "thin"
codegen-units = 1
panic = "abort"
strip = true

[profile.dev]
opt-level = 0
debug = true

[profile.test]
opt-level = 1
debug = true
```

## 🗄️ Database Schema Design

### Generated Migration Files

**migrations/001_initial_schema.sql:**
```sql
-- Initial database schema for task management API
-- Generated by Database Engineer agent

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    username VARCHAR(100) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    avatar_url TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    email_verified BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- User sessions for JWT token management
CREATE TABLE user_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    user_agent TEXT,
    ip_address INET
);

-- Roles and permissions
CREATE TABLE roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(50) UNIQUE NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE TABLE permissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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

-- Projects table
CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(50) NOT NULL DEFAULT 'active',
    priority VARCHAR(20) NOT NULL DEFAULT 'medium',
    start_date DATE,
    due_date DATE,
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Project members
CREATE TABLE project_members (
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(50) NOT NULL DEFAULT 'member',
    joined_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    PRIMARY KEY (project_id, user_id)
);

-- Tasks table
CREATE TABLE tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    assignee_id UUID REFERENCES users(id) ON DELETE SET NULL,
    created_by UUID NOT NULL REFERENCES users(id),
    status VARCHAR(50) NOT NULL DEFAULT 'todo',
    priority VARCHAR(20) NOT NULL DEFAULT 'medium',
    due_date TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    estimated_hours INTEGER,
    actual_hours INTEGER,
    tags TEXT[],
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Task comments
CREATE TABLE task_comments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Task attachments
CREATE TABLE task_attachments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    filename VARCHAR(255) NOT NULL,
    file_path TEXT NOT NULL,
    file_size BIGINT NOT NULL,
    mime_type VARCHAR(100),
    uploaded_by UUID NOT NULL REFERENCES users(id),
    uploaded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Notifications
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    type VARCHAR(50) NOT NULL,
    entity_type VARCHAR(50),
    entity_id UUID,
    is_read BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Activity log
CREATE TABLE activity_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id UUID NOT NULL,
    details JSONB,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_created_at ON users(created_at);

CREATE INDEX idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX idx_user_sessions_expires_at ON user_sessions(expires_at);
CREATE INDEX idx_user_sessions_token_hash ON user_sessions(token_hash);

CREATE INDEX idx_projects_owner_id ON projects(owner_id);
CREATE INDEX idx_projects_status ON projects(status);
CREATE INDEX idx_projects_created_at ON projects(created_at);

CREATE INDEX idx_project_members_user_id ON project_members(user_id);

CREATE INDEX idx_tasks_project_id ON tasks(project_id);
CREATE INDEX idx_tasks_assignee_id ON tasks(assignee_id);
CREATE INDEX idx_tasks_created_by ON tasks(created_by);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_due_date ON tasks(due_date);
CREATE INDEX idx_tasks_created_at ON tasks(created_at);

CREATE INDEX idx_task_comments_task_id ON task_comments(task_id);
CREATE INDEX idx_task_comments_user_id ON task_comments(user_id);

CREATE INDEX idx_task_attachments_task_id ON task_attachments(task_id);

CREATE INDEX idx_notifications_user_id ON notifications(user_id);
CREATE INDEX idx_notifications_is_read ON notifications(is_read);
CREATE INDEX idx_notifications_created_at ON notifications(created_at);

CREATE INDEX idx_activity_log_user_id ON activity_log(user_id);
CREATE INDEX idx_activity_log_entity ON activity_log(entity_type, entity_id);
CREATE INDEX idx_activity_log_created_at ON activity_log(created_at);

-- Insert default roles
INSERT INTO roles (name, description) VALUES
    ('admin', 'System administrator with full access'),
    ('manager', 'Project manager with enhanced permissions'),
    ('developer', 'Developer with standard permissions'),
    ('viewer', 'Read-only access to assigned projects');

-- Insert basic permissions
INSERT INTO permissions (name, description, resource, action) VALUES
    ('users.read', 'Read user information', 'users', 'read'),
    ('users.write', 'Create and update users', 'users', 'write'),
    ('users.delete', 'Delete users', 'users', 'delete'),
    ('projects.read', 'Read project information', 'projects', 'read'),
    ('projects.write', 'Create and update projects', 'projects', 'write'),
    ('projects.delete', 'Delete projects', 'projects', 'delete'),
    ('tasks.read', 'Read task information', 'tasks', 'read'),
    ('tasks.write', 'Create and update tasks', 'tasks', 'write'),
    ('tasks.delete', 'Delete tasks', 'tasks', 'delete'),
    ('admin.access', 'Access admin features', 'admin', 'access');

-- Grant permissions to roles
-- Admin gets all permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p WHERE r.name = 'admin';

-- Manager gets project and task permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'manager' AND p.resource IN ('projects', 'tasks');

-- Developer gets read/write for tasks, read for projects
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'developer' AND (
    (p.resource = 'tasks' AND p.action IN ('read', 'write')) OR
    (p.resource = 'projects' AND p.action = 'read')
);

-- Viewer gets read-only access
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'viewer' AND p.action = 'read';
```

## 🏗️ Core Application Architecture

### 1. Main Application Setup

```rust
// src/main.rs - Generated by API Architect agent
use axum::{
    extract::State,
    http::{HeaderMap, StatusCode},
    middleware,
    response::Json,
    routing::{get, post},
    Router,
};
use sqlx::PgPool;
use std::sync::Arc;
use task_management_api::{
    config::AppConfig,
    handlers,
    middleware::{auth_middleware, cors_middleware, logging_middleware, rate_limit_middleware},
    services::NotificationService,
    utils::cache::CacheManager,
};
use tower::ServiceBuilder;
use tower_http::{
    compression::CompressionLayer,
    request_id::{MakeRequestId, RequestId},
    timeout::TimeoutLayer,
    trace::TraceLayer,
};
use tracing::{info, warn};
use uuid::Uuid;

// Application state
#[derive(Clone)]
pub struct AppState {
    pub db: PgPool,
    pub cache: Arc<CacheManager>,
    pub config: Arc<AppConfig>,
    pub notification_service: Arc<NotificationService>,
}

// Request ID generation
#[derive(Clone)]
struct MakeRequestUuid;

impl MakeRequestId for MakeRequestUuid {
    type RequestId = String;

    fn make_request_id<B>(&mut self, _: &axum::http::Request<B>) -> Self::RequestId {
        Uuid::new_v4().to_string()
    }
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Initialize tracing
    tracing_subscriber::registry()
        .with(tracing_subscriber::EnvFilter::new(
            std::env::var("RUST_LOG").unwrap_or_else(|_| {
                "task_management_api=debug,axum=debug,tower_http=debug,sqlx=info".into()
            })
        ))
        .with(tracing_subscriber::fmt::layer().json())
        .init();

    // Load configuration
    let config = AppConfig::from_env()?;
    info!("Configuration loaded successfully");

    // Connect to database
    let db = PgPool::connect(&config.database_url).await?;
    info!("Connected to database");

    // Run migrations
    sqlx::migrate!("./migrations").run(&db).await?;
    info!("Database migrations completed");

    // Initialize cache
    let cache = Arc::new(CacheManager::new(&config.redis_url).await?);
    info!("Cache initialized");

    // Initialize notification service
    let notification_service = Arc::new(NotificationService::new(
        db.clone(),
        cache.clone(),
    ));

    // Create application state
    let state = AppState {
        db: db.clone(),
        cache,
        config: Arc::new(config.clone()),
        notification_service,
    };

    // Create the application
    let app = create_app(state);

    // Create server
    let listener = tokio::net::TcpListener::bind(
        format!("{}:{}", config.server.host, config.server.port)
    ).await?;

    info!(
        "Server starting on http://{}:{}",
        config.server.host, config.server.port
    );

    // Start metrics server in background
    tokio::spawn(start_metrics_server(config.metrics.port));

    // Run the server
    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await?;

    info!("Server shutdown completed");
    Ok(())
}

fn create_app(state: AppState) -> Router {
    Router::new()
        // API routes
        .nest("/api/v1", api_routes())
        // Health check
        .route("/health", get(health_check))
        // WebSocket endpoint
        .route("/ws", get(handlers::websocket::websocket_handler))
        // Static file serving (for uploads)
        .nest_service("/uploads", tower_http::services::ServeDir::new("uploads"))
        // Add application state
        .with_state(state.clone())
        // Add middleware stack
        .layer(
            ServiceBuilder::new()
                // Timeout for all requests
                .layer(TimeoutLayer::new(
                    std::time::Duration::from_secs(state.config.server.request_timeout)
                ))
                // Rate limiting
                .layer(middleware::from_fn_with_state(
                    state.clone(),
                    rate_limit_middleware
                ))
                // Compression
                .layer(CompressionLayer::new())
                // CORS
                .layer(cors_middleware(&state.config.server.cors_origins))
                // Request tracing
                .layer(TraceLayer::new_for_http())
                // Request ID
                .layer(middleware::from_fn(logging_middleware))
        )
}

fn api_routes() -> Router<AppState> {
    Router::new()
        // Public routes (no authentication required)
        .nest("/auth", handlers::auth::routes())
        .route("/health", get(health_check))

        // Protected routes (authentication required)
        .nest("/users", handlers::users::routes())
        .nest("/projects", handlers::projects::routes())
        .nest("/tasks", handlers::tasks::routes())
        .nest("/notifications", handlers::notifications::routes())

        // Admin routes (admin role required)
        .nest("/admin", admin_routes())

        // Apply authentication middleware to protected routes
        .layer(middleware::from_fn_with_state(AppState::clone, auth_middleware))
}

fn admin_routes() -> Router<AppState> {
    Router::new()
        .route("/users", get(handlers::admin::list_all_users))
        .route("/metrics", get(handlers::admin::system_metrics))
        .route("/logs", get(handlers::admin::recent_logs))
}

async fn health_check(State(state): State<AppState>) -> Result<Json<serde_json::Value>, StatusCode> {
    // Check database connection
    let db_status = match sqlx::query("SELECT 1").fetch_one(&state.db).await {
        Ok(_) => "healthy",
        Err(_) => "unhealthy",
    };

    // Check cache connection
    let cache_status = match state.cache.ping().await {
        Ok(_) => "healthy",
        Err(_) => "unhealthy",
    };

    let response = serde_json::json!({
        "status": if db_status == "healthy" && cache_status == "healthy" { "healthy" } else { "unhealthy" },
        "timestamp": chrono::Utc::now(),
        "version": env!("CARGO_PKG_VERSION"),
        "services": {
            "database": db_status,
            "cache": cache_status
        }
    });

    Ok(Json(response))
}

async fn start_metrics_server(port: u16) {
    let metrics_app = Router::new()
        .route("/metrics", get(|| async {
            metrics_exporter_prometheus::render()
        }));

    let listener = tokio::net::TcpListener::bind(format!("0.0.0.0:{}", port))
        .await
        .expect("Failed to bind metrics server");

    info!("Metrics server starting on port {}", port);

    axum::serve(listener, metrics_app)
        .await
        .expect("Metrics server failed");
}

async fn shutdown_signal() {
    let ctrl_c = async {
        tokio::signal::ctrl_c()
            .await
            .expect("failed to install Ctrl+C handler");
    };

    #[cfg(unix)]
    let terminate = async {
        tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
            .expect("failed to install signal handler")
            .recv()
            .await;
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => {},
        _ = terminate => {},
    }

    warn!("Shutdown signal received");
}
```

### 2. Task Management Handlers

```rust
// src/handlers/tasks.rs - Generated by API Architect agent
use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::Json,
    routing::{delete, get, post, put},
    Router,
};
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use validator::Validate;
use crate::{
    error::{AppError, AppResult},
    extractors::{AuthenticatedUser, ValidatedJson},
    models::task::{Task, TaskStatus, TaskPriority},
    services::TaskService,
    utils::pagination::{PaginationParams, PaginatedResponse},
    AppState,
};

// Route definitions
pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/", get(list_tasks).post(create_task))
        .route("/:id", get(get_task).put(update_task).delete(delete_task))
        .route("/:id/comments", get(list_task_comments).post(add_task_comment))
        .route("/:id/attachments", get(list_task_attachments).post(upload_attachment))
        .route("/:id/assign", put(assign_task))
        .route("/:id/status", put(update_task_status))
        .route("/search", get(search_tasks))
}

// Request/Response DTOs
#[derive(Debug, Deserialize, Validate)]
pub struct CreateTaskRequest {
    #[validate(length(min = 1, max = 255))]
    pub title: String,

    pub description: Option<String>,

    pub project_id: Uuid,

    pub assignee_id: Option<Uuid>,

    #[serde(default)]
    pub priority: TaskPriority,

    pub due_date: Option<chrono::DateTime<chrono::Utc>>,

    pub estimated_hours: Option<i32>,

    pub tags: Option<Vec<String>>,
}

#[derive(Debug, Deserialize, Validate)]
pub struct UpdateTaskRequest {
    #[validate(length(min = 1, max = 255))]
    pub title: Option<String>,

    pub description: Option<String>,

    pub assignee_id: Option<Uuid>,

    pub priority: Option<TaskPriority>,

    pub due_date: Option<chrono::DateTime<chrono::Utc>>,

    pub estimated_hours: Option<i32>,

    pub actual_hours: Option<i32>,

    pub tags: Option<Vec<String>>,
}

#[derive(Debug, Deserialize, Validate)]
pub struct UpdateTaskStatusRequest {
    pub status: TaskStatus,
}

#[derive(Debug, Deserialize, Validate)]
pub struct AssignTaskRequest {
    pub assignee_id: Option<Uuid>,
}

#[derive(Debug, Deserialize)]
pub struct TaskSearchParams {
    pub project_id: Option<Uuid>,
    pub assignee_id: Option<Uuid>,
    pub status: Option<TaskStatus>,
    pub priority: Option<TaskPriority>,
    pub tags: Option<Vec<String>>,
    pub due_date_from: Option<chrono::Date<chrono::Utc>>,
    pub due_date_to: Option<chrono::Date<chrono::Utc>>,
    pub search: Option<String>,
    #[serde(flatten)]
    pub pagination: PaginationParams,
}

#[derive(Debug, Serialize)]
pub struct TaskResponse {
    pub id: Uuid,
    pub title: String,
    pub description: Option<String>,
    pub project_id: Uuid,
    pub project_name: String,
    pub assignee_id: Option<Uuid>,
    pub assignee_name: Option<String>,
    pub created_by: Uuid,
    pub created_by_name: String,
    pub status: TaskStatus,
    pub priority: TaskPriority,
    pub due_date: Option<chrono::DateTime<chrono::Utc>>,
    pub completed_at: Option<chrono::DateTime<chrono::Utc>>,
    pub estimated_hours: Option<i32>,
    pub actual_hours: Option<i32>,
    pub tags: Vec<String>,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
}

// Handler implementations
pub async fn list_tasks(
    State(state): State<AppState>,
    Query(params): Query<TaskSearchParams>,
    user: AuthenticatedUser,
) -> AppResult<Json<PaginatedResponse<TaskResponse>>> {
    let task_service = TaskService::new(state.db.clone(), state.cache.clone());

    let tasks = task_service
        .list_tasks_for_user(user.user_id, &params)
        .await?;

    let total = task_service
        .count_tasks_for_user(user.user_id, &params)
        .await?;

    let task_responses: Vec<TaskResponse> = tasks
        .into_iter()
        .map(TaskResponse::from)
        .collect();

    let response = PaginatedResponse {
        data: task_responses,
        pagination: crate::utils::pagination::PaginationResponse {
            page: params.pagination.page.unwrap_or(1),
            limit: params.pagination.limit.unwrap_or(20),
            total,
            pages: (total as f64 / params.pagination.limit.unwrap_or(20) as f64).ceil() as u32,
        },
    };

    Ok(Json(response))
}

pub async fn get_task(
    State(state): State<AppState>,
    Path(task_id): Path<Uuid>,
    user: AuthenticatedUser,
) -> AppResult<Json<TaskResponse>> {
    let task_service = TaskService::new(state.db.clone(), state.cache.clone());

    let task = task_service
        .get_task_by_id(task_id, user.user_id)
        .await?
        .ok_or(AppError::NotFound)?;

    Ok(Json(TaskResponse::from(task)))
}

pub async fn create_task(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    ValidatedJson(request): ValidatedJson<CreateTaskRequest>,
) -> AppResult<Json<TaskResponse>> {
    let task_service = TaskService::new(state.db.clone(), state.cache.clone());

    // Check if user has access to the project
    if !task_service.user_has_project_access(user.user_id, request.project_id).await? {
        return Err(AppError::Forbidden);
    }

    let task = task_service
        .create_task(request, user.user_id)
        .await?;

    // Send notification to assignee if assigned
    if let Some(assignee_id) = task.assignee_id {
        let notification_service = state.notification_service.clone();
        tokio::spawn(async move {
            let _ = notification_service.send_task_assigned_notification(
                assignee_id,
                task.id,
                &task.title,
            ).await;
        });
    }

    // Log activity
    task_service.log_task_activity(
        task.id,
        user.user_id,
        "task_created",
        serde_json::json!({
            "task_title": task.title,
            "project_id": task.project_id
        })
    ).await?;

    Ok(Json(TaskResponse::from(task)))
}

pub async fn update_task(
    State(state): State<AppState>,
    Path(task_id): Path<Uuid>,
    user: AuthenticatedUser,
    ValidatedJson(request): ValidatedJson<UpdateTaskRequest>,
) -> AppResult<Json<TaskResponse>> {
    let task_service = TaskService::new(state.db.clone(), state.cache.clone());

    // Check if user has access to the task
    let existing_task = task_service
        .get_task_by_id(task_id, user.user_id)
        .await?
        .ok_or(AppError::NotFound)?;

    let updated_task = task_service
        .update_task(task_id, request, user.user_id)
        .await?;

    // Send notifications for significant changes
    if let Some(new_assignee) = updated_task.assignee_id {
        if existing_task.assignee_id != Some(new_assignee) {
            let notification_service = state.notification_service.clone();
            let task_title = updated_task.title.clone();
            tokio::spawn(async move {
                let _ = notification_service.send_task_assigned_notification(
                    new_assignee,
                    task_id,
                    &task_title,
                ).await;
            });
        }
    }

    // Log activity
    task_service.log_task_activity(
        task_id,
        user.user_id,
        "task_updated",
        serde_json::json!({
            "changes": request
        })
    ).await?;

    Ok(Json(TaskResponse::from(updated_task)))
}

pub async fn delete_task(
    State(state): State<AppState>,
    Path(task_id): Path<Uuid>,
    user: AuthenticatedUser,
) -> AppResult<StatusCode> {
    let task_service = TaskService::new(state.db.clone(), state.cache.clone());

    // Check if user has access to delete the task
    let task = task_service
        .get_task_by_id(task_id, user.user_id)
        .await?
        .ok_or(AppError::NotFound)?;

    // Only task creator, project owner, or admin can delete
    if task.created_by != user.user_id && !user.roles.contains(&"admin".to_string()) {
        // Check if user is project owner
        if !task_service.is_project_owner(user.user_id, task.project_id).await? {
            return Err(AppError::Forbidden);
        }
    }

    task_service.delete_task(task_id).await?;

    // Log activity
    task_service.log_task_activity(
        task_id,
        user.user_id,
        "task_deleted",
        serde_json::json!({
            "task_title": task.title
        })
    ).await?;

    Ok(StatusCode::NO_CONTENT)
}

pub async fn assign_task(
    State(state): State<AppState>,
    Path(task_id): Path<Uuid>,
    user: AuthenticatedUser,
    ValidatedJson(request): ValidatedJson<AssignTaskRequest>,
) -> AppResult<Json<TaskResponse>> {
    let task_service = TaskService::new(state.db.clone(), state.cache.clone());

    let updated_task = task_service
        .assign_task(task_id, request.assignee_id, user.user_id)
        .await?;

    // Send notification
    if let Some(assignee_id) = request.assignee_id {
        let notification_service = state.notification_service.clone();
        let task_title = updated_task.title.clone();
        tokio::spawn(async move {
            let _ = notification_service.send_task_assigned_notification(
                assignee_id,
                task_id,
                &task_title,
            ).await;
        });
    }

    Ok(Json(TaskResponse::from(updated_task)))
}

pub async fn update_task_status(
    State(state): State<AppState>,
    Path(task_id): Path<Uuid>,
    user: AuthenticatedUser,
    ValidatedJson(request): ValidatedJson<UpdateTaskStatusRequest>,
) -> AppResult<Json<TaskResponse>> {
    let task_service = TaskService::new(state.db.clone(), state.cache.clone());

    let updated_task = task_service
        .update_task_status(task_id, request.status, user.user_id)
        .await?;

    // Send completion notification if task is completed
    if request.status == TaskStatus::Done {
        if let Some(assignee_id) = updated_task.assignee_id {
            let notification_service = state.notification_service.clone();
            let task_title = updated_task.title.clone();
            tokio::spawn(async move {
                let _ = notification_service.send_task_completed_notification(
                    assignee_id,
                    task_id,
                    &task_title,
                ).await;
            });
        }
    }

    Ok(Json(TaskResponse::from(updated_task)))
}

impl From<Task> for TaskResponse {
    fn from(task: Task) -> Self {
        Self {
            id: task.id,
            title: task.title,
            description: task.description,
            project_id: task.project_id,
            project_name: task.project_name.unwrap_or_default(),
            assignee_id: task.assignee_id,
            assignee_name: task.assignee_name,
            created_by: task.created_by,
            created_by_name: task.created_by_name.unwrap_or_default(),
            status: task.status,
            priority: task.priority,
            due_date: task.due_date,
            completed_at: task.completed_at,
            estimated_hours: task.estimated_hours,
            actual_hours: task.actual_hours,
            tags: task.tags.unwrap_or_default(),
            created_at: task.created_at,
            updated_at: task.updated_at,
        }
    }
}
```

## 🧪 Comprehensive Testing

### 1. Integration Tests

```rust
// tests/integration/task_tests.rs - Generated by Testing Engineer agent
use axum_test::TestServer;
use serde_json::json;
use sqlx::PgPool;
use task_management_api::models::task::TaskStatus;
use uuid::Uuid;

mod common;
use common::*;

#[tokio::test]
async fn test_task_crud_operations() {
    let (server, _db) = setup_test_server().await;
    let (user_token, user) = create_test_user_and_login(&server).await;
    let project = create_test_project(&server, &user_token, user.id).await;

    // Test create task
    let create_response = server
        .post("/api/v1/tasks")
        .add_header("authorization", format!("Bearer {}", user_token))
        .json(&json!({
            "title": "Test Task",
            "description": "This is a test task",
            "project_id": project.id,
            "priority": "high",
            "estimated_hours": 8,
            "tags": ["urgent", "feature"]
        }))
        .await;

    create_response.assert_status_ok();
    let created_task: TaskResponse = create_response.json();
    assert_eq!(created_task.title, "Test Task");
    assert_eq!(created_task.project_id, project.id);
    assert_eq!(created_task.priority.to_string(), "high");

    // Test get task
    let get_response = server
        .get(&format!("/api/v1/tasks/{}", created_task.id))
        .add_header("authorization", format!("Bearer {}", user_token))
        .await;

    get_response.assert_status_ok();
    let retrieved_task: TaskResponse = get_response.json();
    assert_eq!(retrieved_task.id, created_task.id);
    assert_eq!(retrieved_task.title, "Test Task");

    // Test update task
    let update_response = server
        .put(&format!("/api/v1/tasks/{}", created_task.id))
        .add_header("authorization", format!("Bearer {}", user_token))
        .json(&json!({
            "title": "Updated Test Task",
            "actual_hours": 6
        }))
        .await;

    update_response.assert_status_ok();
    let updated_task: TaskResponse = update_response.json();
    assert_eq!(updated_task.title, "Updated Test Task");
    assert_eq!(updated_task.actual_hours, Some(6));

    // Test update task status
    let status_response = server
        .put(&format!("/api/v1/tasks/{}/status", created_task.id))
        .add_header("authorization", format!("Bearer {}", user_token))
        .json(&json!({
            "status": "done"
        }))
        .await;

    status_response.assert_status_ok();
    let completed_task: TaskResponse = status_response.json();
    assert_eq!(completed_task.status.to_string(), "done");
    assert!(completed_task.completed_at.is_some());

    // Test delete task
    let delete_response = server
        .delete(&format!("/api/v1/tasks/{}", created_task.id))
        .add_header("authorization", format!("Bearer {}", user_token))
        .await;

    delete_response.assert_status(axum::http::StatusCode::NO_CONTENT);

    // Verify task is deleted
    let get_deleted_response = server
        .get(&format!("/api/v1/tasks/{}", created_task.id))
        .add_header("authorization", format!("Bearer {}", user_token))
        .await;

    get_deleted_response.assert_status_not_found();
}

#[tokio::test]
async fn test_task_assignment_and_notifications() {
    let (server, _db) = setup_test_server().await;
    let (user1_token, user1) = create_test_user_and_login(&server).await;
    let (user2_token, user2) = create_test_user_with_email(&server, "user2@example.com").await;
    let project = create_test_project(&server, &user1_token, user1.id).await;

    // Add user2 to project
    add_user_to_project(&server, &user1_token, project.id, user2.id).await;

    // Create task
    let create_response = server
        .post("/api/v1/tasks")
        .add_header("authorization", format!("Bearer {}", user1_token))
        .json(&json!({
            "title": "Assignable Task",
            "project_id": project.id
        }))
        .await;

    let created_task: TaskResponse = create_response.json();

    // Assign task to user2
    let assign_response = server
        .put(&format!("/api/v1/tasks/{}/assign", created_task.id))
        .add_header("authorization", format!("Bearer {}", user1_token))
        .json(&json!({
            "assignee_id": user2.id
        }))
        .await;

    assign_response.assert_status_ok();
    let assigned_task: TaskResponse = assign_response.json();
    assert_eq!(assigned_task.assignee_id, Some(user2.id));

    // Check notifications for user2
    let notifications_response = server
        .get("/api/v1/notifications")
        .add_header("authorization", format!("Bearer {}", user2_token))
        .await;

    notifications_response.assert_status_ok();
    let notifications: PaginatedResponse<NotificationResponse> = notifications_response.json();

    assert!(!notifications.data.is_empty());
    let notification = &notifications.data[0];
    assert!(notification.title.contains("assigned"));
}

#[tokio::test]
async fn test_task_search_and_filtering() {
    let (server, _db) = setup_test_server().await;
    let (user_token, user) = create_test_user_and_login(&server).await;
    let project = create_test_project(&server, &user_token, user.id).await;

    // Create multiple tasks with different properties
    let tasks = vec![
        json!({
            "title": "High Priority Bug Fix",
            "project_id": project.id,
            "priority": "high",
            "tags": ["bug", "urgent"]
        }),
        json!({
            "title": "Feature Development",
            "project_id": project.id,
            "priority": "medium",
            "tags": ["feature", "enhancement"]
        }),
        json!({
            "title": "Low Priority Cleanup",
            "project_id": project.id,
            "priority": "low",
            "tags": ["cleanup", "technical-debt"]
        }),
    ];

    let mut created_task_ids = Vec::new();
    for task_data in tasks {
        let response = server
            .post("/api/v1/tasks")
            .add_header("authorization", format!("Bearer {}", user_token))
            .json(&task_data)
            .await;

        let task: TaskResponse = response.json();
        created_task_ids.push(task.id);
    }

    // Test search by priority
    let high_priority_response = server
        .get("/api/v1/tasks")
        .add_header("authorization", format!("Bearer {}", user_token))
        .add_query_param("priority", "high")
        .await;

    high_priority_response.assert_status_ok();
    let high_priority_tasks: PaginatedResponse<TaskResponse> = high_priority_response.json();
    assert_eq!(high_priority_tasks.data.len(), 1);
    assert_eq!(high_priority_tasks.data[0].title, "High Priority Bug Fix");

    // Test search by tags
    let bug_tasks_response = server
        .get("/api/v1/tasks")
        .add_header("authorization", format!("Bearer {}", user_token))
        .add_query_param("tags", "bug")
        .await;

    bug_tasks_response.assert_status_ok();
    let bug_tasks: PaginatedResponse<TaskResponse> = bug_tasks_response.json();
    assert_eq!(bug_tasks.data.len(), 1);
    assert!(bug_tasks.data[0].tags.contains(&"bug".to_string()));

    // Test text search
    let search_response = server
        .get("/api/v1/tasks")
        .add_header("authorization", format!("Bearer {}", user_token))
        .add_query_param("search", "Feature")
        .await;

    search_response.assert_status_ok();
    let search_results: PaginatedResponse<TaskResponse> = search_response.json();
    assert_eq!(search_results.data.len(), 1);
    assert!(search_results.data[0].title.contains("Feature"));
}

#[tokio::test]
async fn test_task_permissions() {
    let (server, _db) = setup_test_server().await;
    let (user1_token, user1) = create_test_user_and_login(&server).await;
    let (user2_token, user2) = create_test_user_with_email(&server, "user2@example.com").await;

    let project = create_test_project(&server, &user1_token, user1.id).await;

    // Create task as user1
    let create_response = server
        .post("/api/v1/tasks")
        .add_header("authorization", format!("Bearer {}", user1_token))
        .json(&json!({
            "title": "Private Task",
            "project_id": project.id
        }))
        .await;

    let created_task: TaskResponse = create_response.json();

    // user2 should not be able to access the task (not a project member)
    let unauthorized_response = server
        .get(&format!("/api/v1/tasks/{}", created_task.id))
        .add_header("authorization", format!("Bearer {}", user2_token))
        .await;

    unauthorized_response.assert_status_forbidden();

    // Add user2 to project
    add_user_to_project(&server, &user1_token, project.id, user2.id).await;

    // Now user2 should be able to access the task
    let authorized_response = server
        .get(&format!("/api/v1/tasks/{}", created_task.id))
        .add_header("authorization", format!("Bearer {}", user2_token))
        .await;

    authorized_response.assert_status_ok();

    // But user2 should not be able to delete the task (not the creator)
    let delete_response = server
        .delete(&format!("/api/v1/tasks/{}", created_task.id))
        .add_header("authorization", format!("Bearer {}", user2_token))
        .await;

    delete_response.assert_status_forbidden();
}
```

### 2. Load Testing and Benchmarks

```rust
// benches/api_benchmarks.rs - Generated by Performance Engineer agent
use criterion::{black_box, criterion_group, criterion_main, Criterion, BenchmarkId};
use reqwest::Client;
use serde_json::json;
use std::time::Duration;
use tokio::runtime::Runtime;

struct ApiTestSetup {
    client: Client,
    base_url: String,
    auth_token: String,
}

impl ApiTestSetup {
    async fn new() -> Self {
        let client = Client::new();
        let base_url = "http://localhost:8080".to_string();

        // Login and get auth token
        let login_response = client
            .post(&format!("{}/api/v1/auth/login", base_url))
            .json(&json!({
                "email": "bench@example.com",
                "password": "benchmarkpassword"
            }))
            .send()
            .await
            .unwrap();

        let auth_data: serde_json::Value = login_response.json().await.unwrap();
        let auth_token = auth_data["access_token"].as_str().unwrap().to_string();

        Self {
            client,
            base_url,
            auth_token,
        }
    }
}

fn bench_task_creation(c: &mut Criterion) {
    let rt = Runtime::new().unwrap();
    let setup = rt.block_on(ApiTestSetup::new());

    let mut group = c.benchmark_group("task_creation");

    for concurrent_requests in [1, 5, 10, 20, 50].iter() {
        group.bench_with_input(
            BenchmarkId::from_parameter(concurrent_requests),
            concurrent_requests,
            |b, &concurrent_requests| {
                b.to_async(&rt).iter(|| async {
                    let futures: Vec<_> = (0..concurrent_requests)
                        .map(|i| {
                            let client = &setup.client;
                            let url = format!("{}/api/v1/tasks", setup.base_url);
                            let token = &setup.auth_token;

                            async move {
                                client
                                    .post(&url)
                                    .header("authorization", format!("Bearer {}", token))
                                    .json(&json!({
                                        "title": format!("Benchmark Task {}", i),
                                        "project_id": "123e4567-e89b-12d3-a456-426614174000",
                                        "priority": "medium"
                                    }))
                                    .send()
                                    .await
                                    .unwrap()
                            }
                        })
                        .collect();

                    let responses = futures::future::join_all(futures).await;
                    black_box(responses)
                });
            },
        );
    }
    group.finish();
}

fn bench_task_listing(c: &mut Criterion) {
    let rt = Runtime::new().unwrap();
    let setup = rt.block_on(ApiTestSetup::new());

    let mut group = c.benchmark_group("task_listing");

    // Test different page sizes
    for page_size in [10, 20, 50, 100].iter() {
        group.bench_with_input(
            BenchmarkId::from_parameter(page_size),
            page_size,
            |b, &page_size| {
                b.to_async(&rt).iter(|| async {
                    let response = setup.client
                        .get(&format!("{}/api/v1/tasks", setup.base_url))
                        .header("authorization", format!("Bearer {}", setup.auth_token))
                        .query(&[("limit", page_size), ("page", 1)])
                        .send()
                        .await
                        .unwrap();

                    black_box(response.text().await.unwrap())
                });
            },
        );
    }
    group.finish();
}

fn bench_task_search(c: &mut Criterion) {
    let rt = Runtime::new().unwrap();
    let setup = rt.block_on(ApiTestSetup::new());

    c.bench_function("task_search", |b| {
        b.to_async(&rt).iter(|| async {
            let response = setup.client
                .get(&format!("{}/api/v1/tasks", setup.base_url))
                .header("authorization", format!("Bearer {}", setup.auth_token))
                .query(&[
                    ("search", "important"),
                    ("status", "todo"),
                    ("priority", "high")
                ])
                .send()
                .await
                .unwrap();

            black_box(response.text().await.unwrap())
        });
    });
}

fn bench_concurrent_users(c: &mut Criterion) {
    let rt = Runtime::new().unwrap();

    let mut group = c.benchmark_group("concurrent_users");
    group.measurement_time(Duration::from_secs(30));

    for user_count in [10, 25, 50, 100].iter() {
        group.bench_with_input(
            BenchmarkId::from_parameter(user_count),
            user_count,
            |b, &user_count| {
                b.to_async(&rt).iter(|| async {
                    // Simulate multiple users performing various operations
                    let futures: Vec<_> = (0..user_count)
                        .map(|i| {
                            async move {
                                let client = Client::new();
                                let base_url = "http://localhost:8080";

                                // Login
                                let login_response = client
                                    .post(&format!("{}/api/v1/auth/login", base_url))
                                    .json(&json!({
                                        "email": format!("user{}@example.com", i),
                                        "password": "password123"
                                    }))
                                    .send()
                                    .await?;

                                if login_response.status().is_success() {
                                    let auth_data: serde_json::Value = login_response.json().await?;
                                    let token = auth_data["access_token"].as_str().unwrap();

                                    // Perform typical user operations
                                    let _tasks = client
                                        .get(&format!("{}/api/v1/tasks", base_url))
                                        .header("authorization", format!("Bearer {}", token))
                                        .send()
                                        .await?;

                                    let _projects = client
                                        .get(&format!("{}/api/v1/projects", base_url))
                                        .header("authorization", format!("Bearer {}", token))
                                        .send()
                                        .await?;
                                }

                                Ok::<(), Box<dyn std::error::Error + Send + Sync>>(())
                            }
                        })
                        .collect();

                    let results = futures::future::join_all(futures).await;
                    black_box(results)
                });
            },
        );
    }
    group.finish();
}

criterion_group!(
    benches,
    bench_task_creation,
    bench_task_listing,
    bench_task_search,
    bench_concurrent_users
);
criterion_main!(benches);
```

## 🚀 Production Deployment

### 1. Docker Configuration

```dockerfile
# docker/Dockerfile - Generated by DevOps Engineer agent
# Multi-stage build for optimal image size
FROM rust:1.70-slim as builder

WORKDIR /app

# Install build dependencies
RUN apt-get update && apt-get install -y \
    pkg-config \
    libssl-dev \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy dependency files
COPY Cargo.toml Cargo.lock ./

# Build dependencies (cached layer)
RUN mkdir src && \
    echo "fn main() {}" > src/main.rs && \
    cargo build --release && \
    rm -rf src

# Copy source code
COPY src ./src
COPY migrations ./migrations

# Build application
RUN touch src/main.rs && \
    cargo build --release

# Runtime stage
FROM debian:bookworm-slim

# Install runtime dependencies
RUN apt-get update && apt-get install -y \
    ca-certificates \
    libssl3 \
    libpq5 \
    && rm -rf /var/lib/apt/lists/*

# Create app user
RUN useradd -m -u 1001 app

WORKDIR /app

# Copy binary and migrations
COPY --from=builder /app/target/release/task-management-api .
COPY --from=builder /app/migrations ./migrations

# Create uploads directory
RUN mkdir -p uploads && chown app:app uploads

# Switch to app user
USER app

# Expose port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8080/health || exit 1

# Run the application
CMD ["./task-management-api"]
```

**docker/docker-compose.yml:**
```yaml
# Production-ready Docker Compose setup
version: '3.8'

services:
  api:
    build:
      context: ..
      dockerfile: docker/Dockerfile
    environment:
      APP_DATABASE_URL: postgres://taskmanager:${DB_PASSWORD}@db:5432/taskmanagement
      APP_REDIS_URL: redis://redis:6379
      APP_JWT_SECRET: ${JWT_SECRET}
      APP_SERVER_HOST: 0.0.0.0
      APP_SERVER_PORT: 8080
      RUST_LOG: info
    ports:
      - "8080:8080"
      - "9090:9090"  # Metrics port
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_healthy
    restart: unless-stopped
    volumes:
      - uploads:/app/uploads
    networks:
      - app-network

  db:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: taskmanagement
      POSTGRES_USER: taskmanager
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./init.sql:/docker-entrypoint-initdb.d/init.sql
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U taskmanager -d taskmanagement"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: unless-stopped
    networks:
      - app-network

  redis:
    image: redis:7-alpine
    command: redis-server --appendonly yes
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 3s
      retries: 5
    restart: unless-stopped
    networks:
      - app-network

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - ./ssl:/etc/nginx/ssl:ro
      - uploads:/app/uploads:ro
    depends_on:
      - api
    restart: unless-stopped
    networks:
      - app-network

  prometheus:
    image: prom/prometheus:latest
    ports:
      - "9091:9090"
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml:ro
      - prometheus_data:/prometheus
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.path=/prometheus'
      - '--web.console.libraries=/etc/prometheus/console_libraries'
      - '--web.console.templates=/etc/prometheus/consoles'
    restart: unless-stopped
    networks:
      - app-network

  grafana:
    image: grafana/grafana:latest
    ports:
      - "3000:3000"
    environment:
      GF_SECURITY_ADMIN_PASSWORD: ${GRAFANA_PASSWORD}
    volumes:
      - grafana_data:/var/lib/grafana
      - ./grafana/dashboards:/etc/grafana/provisioning/dashboards:ro
      - ./grafana/datasources:/etc/grafana/provisioning/datasources:ro
    depends_on:
      - prometheus
    restart: unless-stopped
    networks:
      - app-network

volumes:
  postgres_data:
  redis_data:
  uploads:
  prometheus_data:
  grafana_data:

networks:
  app-network:
    driver: bridge
```

### 2. CI/CD Pipeline

```yaml
# .github/workflows/ci.yml - Generated by DevOps Engineer agent
name: CI/CD Pipeline

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main ]

env:
  CARGO_TERM_COLOR: always
  RUST_BACKTRACE: 1

jobs:
  test:
    name: Test Suite
    runs-on: ubuntu-latest

    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: taskmanagement_test
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

      redis:
        image: redis:7
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
    - uses: actions/checkout@v4

    - name: Install Rust
      uses: dtolnay/rust-toolchain@stable
      with:
        components: rustfmt, clippy

    - name: Cache cargo registry
      uses: actions/cache@v3
      with:
        path: ~/.cargo/registry
        key: ${{ runner.os }}-cargo-registry-${{ hashFiles('**/Cargo.lock') }}

    - name: Install dependencies
      run: |
        sudo apt-get update
        sudo apt-get install -y libpq-dev

    - name: Run claude-flow-novice quality validation
      run: |
        npm install -g claude-flow@alpha
        npx claude-flow-novice validate rust . --comprehensive

    - name: Run tests
      env:
        TEST_DATABASE_URL: postgres://postgres:postgres@localhost/taskmanagement_test
        TEST_REDIS_URL: redis://localhost:6379
      run: cargo test --all-features --verbose

    - name: Run integration tests
      env:
        TEST_DATABASE_URL: postgres://postgres:postgres@localhost/taskmanagement_test
        TEST_REDIS_URL: redis://localhost:6379
      run: cargo test --test integration --all-features

    - name: Generate coverage report
      run: |
        cargo install cargo-tarpaulin
        cargo tarpaulin --verbose --all-features --workspace --timeout 120 --out Xml

    - name: Upload coverage to Codecov
      uses: codecov/codecov-action@v3

  security:
    name: Security Audit
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v4
    - uses: dtolnay/rust-toolchain@stable
    - name: Security audit
      run: |
        cargo install cargo-audit
        cargo audit

  benchmark:
    name: Performance Benchmarks
    runs-on: ubuntu-latest
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'

    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: taskmanagement_bench
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
    - uses: actions/checkout@v4
    - uses: dtolnay/rust-toolchain@stable
    - name: Run benchmarks
      env:
        DATABASE_URL: postgres://postgres:postgres@localhost/taskmanagement_bench
      run: |
        cargo bench --all-features

    - name: Store benchmark results
      uses: benchmark-action/github-action-benchmark@v1
      with:
        tool: 'cargo'
        output-file-path: target/criterion/report/benchmark.json

  build-and-deploy:
    name: Build and Deploy
    runs-on: ubuntu-latest
    needs: [test, security]
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'

    steps:
    - uses: actions/checkout@v4

    - name: Set up Docker Buildx
      uses: docker/setup-buildx-action@v3

    - name: Login to Container Registry
      uses: docker/login-action@v3
      with:
        registry: ghcr.io
        username: ${{ github.actor }}
        password: ${{ secrets.GITHUB_TOKEN }}

    - name: Build and push Docker image
      uses: docker/build-push-action@v5
      with:
        context: .
        file: docker/Dockerfile
        push: true
        tags: |
          ghcr.io/${{ github.repository }}:latest
          ghcr.io/${{ github.repository }}:${{ github.sha }}
        cache-from: type=gha
        cache-to: type=gha,mode=max

    - name: Deploy to staging
      run: |
        # Deploy to staging environment
        echo "Deploying to staging..."
        # Add deployment scripts here

    - name: Run smoke tests
      run: |
        # Run smoke tests against staging
        npm install -g @apidevtools/swagger-parser
        npx swagger-parser validate docs/api-spec.yml
```

This comprehensive REST API example demonstrates how claude-flow-novice orchestrates multiple specialized agents to create a production-ready Rust application with real toolchain integration, comprehensive testing, and deployment automation.

## 🔗 Related Resources

- [Axum Framework Guide](../web-development/axum.md) - Detailed Axum development
- [Quality Validation](../testing/quality-validation.md) - Code quality assurance
- [Systems Programming](../workflows/systems-programming.md) - Advanced Rust patterns
- [Performance Testing](../testing/performance.md) - Benchmarking and optimization