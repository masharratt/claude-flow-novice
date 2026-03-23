//! Example demonstrating the API Handler functionality

use anyhow::Result;
use transparency_middleware::{ApiHandler, Request, Response, ApiResponse};

fn main() -> Result<()> {
    // Initialize the API handler
    let mut api = ApiHandler::new();

    // Define some handlers
    let get_users_handler = |_req: Request| -> Result<Response> {
        let users = r#"[
            {"id": 1, "name": "Alice", "email": "alice@example.com"},
            {"id": 2, "name": "Bob", "email": "bob@example.com"}
        ]"#;
        Ok(Response::ok(users.to_string()))
    };

    let create_user_handler = |req: Request| -> Result<Response> {
        // In a real implementation, you'd parse the body and create a user
        match req.body {
            Some(body) => {
                Ok(Response::created(format!(r#"{{"message": "User created", "data": {}}}"#, body)))
            }
            None => Ok(Response::bad_request("Missing request body".to_string())),
        }
    };

    let health_check_handler = |_req: Request| -> Result<Response> {
        Ok(Response::ok(r#"{"status": "healthy", "version": "0.1.0"}"#.to_string()))
    };

    // Register routes
    api.add_route("GET", "/api/users", get_users_handler)?;
    api.add_route("POST", "/api/users", create_user_handler)?;
    api.add_route("GET", "/health", health_check_handler)?;

    // Add a wildcard route for API versioning
    let api_v1_handler = |_req: Request| -> Result<Response> {
        Ok(Response::ok(r#"{"message": "API v1 endpoint"}"#.to_string()))
    };
    api.add_route("GET", "/api/v1/*", api_v1_handler)?;

    // List all registered routes
    println!("Registered routes:");
    for (method, path) in api.get_routes() {
        println!("  {} {}", method, path);
    }
    println!();

    // Test some requests
    println!("Testing requests:\n");

    // Test GET /api/users
    println!("GET /api/users:");
    match api.handle_request("GET", "/api/users", None)? {
        ApiResponse::Success(resp) => {
            println!("  Status: {}", resp.status_code);
            println!("  Body: {}", resp.body);
        }
        ApiResponse::Error(err) => {
            println!("  Error: {}", err);
        }
    }
    println!();

    // Test POST /api/users
    let user_data = r#"{"name": "Charlie", "email": "charlie@example.com"}"#;
    println!("POST /api/users:");
    match api.handle_request("POST", "/api/users", Some(user_data))? {
        ApiResponse::Success(resp) => {
            println!("  Status: {}", resp.status_code);
            println!("  Body: {}", resp.body);
        }
        ApiResponse::Error(err) => {
            println!("  Error: {}", err);
        }
    }
    println!();

    // Test wildcard route
    println!("GET /api/v1/test:");
    match api.handle_request("GET", "/api/v1/test", None)? {
        ApiResponse::Success(resp) => {
            println!("  Status: {}", resp.status_code);
            println!("  Body: {}", resp.body);
        }
        ApiResponse::Error(err) => {
            println!("  Error: {}", err);
        }
    }
    println!();

    // Test non-existent route
    println!("GET /api/nonexistent:");
    match api.handle_request("GET", "/api/nonexistent", None)? {
        ApiResponse::Success(resp) => {
            println!("  Status: {}", resp.status_code);
            println!("  Body: {}", resp.body);
        }
        ApiResponse::Error(err) => {
            println!("  Error: {}", err);
        }
    }

    Ok(())
}