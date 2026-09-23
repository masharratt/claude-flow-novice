use anyhow::{Result, anyhow};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Represents an HTTP request
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Request {
    pub method: String,
    pub path: String,
    pub body: Option<String>,
    pub headers: HashMap<String, String>,
}

impl Request {
    pub fn new(method: &str, path: &str) -> Self {
        Self {
            method: method.to_string(),
            path: path.to_string(),
            body: None,
            headers: HashMap::new(),
        }
    }

    pub fn with_body(mut self, body: String) -> Self {
        self.body = Some(body);
        self
    }

    pub fn with_header(mut self, key: &str, value: &str) -> Self {
        self.headers.insert(key.to_string(), value.to_string());
        self
    }
}

/// Represents an HTTP response
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Response {
    pub status_code: u16,
    pub body: String,
    pub headers: HashMap<String, String>,
}

impl Response {
    pub fn new(status_code: u16) -> Self {
        Self {
            status_code,
            body: String::new(),
            headers: HashMap::new(),
        }
    }

    pub fn with_body(mut self, body: String) -> Self {
        self.body = body;
        self
    }

    pub fn with_header(mut self, key: &str, value: &str) -> Self {
        self.headers.insert(key.to_string(), value.to_string());
        self
    }

    pub fn ok(body: String) -> Self {
        Self::new(200)
            .with_body(body)
            .with_header("Content-Type", "application/json")
    }

    pub fn created(body: String) -> Self {
        Self::new(201)
            .with_body(body)
            .with_header("Content-Type", "application/json")
    }

    pub fn bad_request(body: String) -> Self {
        Self::new(400)
            .with_body(body)
            .with_header("Content-Type", "application/json")
    }

    pub fn not_found(body: String) -> Self {
        Self::new(404)
            .with_body(body)
            .with_header("Content-Type", "application/json")
    }

    pub fn internal_error(body: String) -> Self {
        Self::new(500)
            .with_body(body)
            .with_header("Content-Type", "application/json")
    }
}

/// API Response enum for handler returns
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ApiResponse {
    Success(Response),
    Error(String),
}

impl ApiResponse {
    pub fn into_response(self) -> Response {
        match self {
            ApiResponse::Success(response) => response,
            ApiResponse::Error(error) => Response::internal_error(
                format!(r#"{{"error": "{}"}}"#, error)
            ),
        }
    }
}

/// Type alias for request handlers
pub type RouteHandler = fn(Request) -> Result<Response>;

/// Main API Handler struct
pub struct ApiHandler {
    routes: HashMap<String, HashMap<String, RouteHandler>>,
}

impl ApiHandler {
    /// Creates a new ApiHandler instance
    pub fn new() -> Self {
        Self {
            routes: HashMap::new(),
        }
    }

    /// Handles an incoming request
    pub fn handle_request(&self, method: &str, path: &str, body: Option<&str>) -> Result<ApiResponse> {
        // Build request object
        let mut request = Request::new(method, path);
        if let Some(body_str) = body {
            request = request.with_body(body_str.to_string());
        }

        // Find matching route
        if let Some(method_routes) = self.routes.get(method) {
            // Exact path match
            if let Some(handler) = method_routes.get(path) {
                return match handler(request) {
                    Ok(response) => Ok(ApiResponse::Success(response)),
                    Err(e) => Ok(ApiResponse::Error(e.to_string())),
                };
            } else {
                // Try to match as a pattern (simple wildcard support)
                for (route_path, handler) in method_routes {
                    if self.path_matches(route_path, path) {
                        return match handler(request) {
                            Ok(response) => Ok(ApiResponse::Success(response)),
                            Err(e) => Ok(ApiResponse::Error(e.to_string())),
                        };
                    }
                }
            }
        }

        // If no route found
        Ok(ApiResponse::Error(
            format!("Route not found: {} {}", method, path)
        ))
    }

    /// Adds a route to the handler
    pub fn add_route(&mut self, method: &str, path: &str, handler: RouteHandler) -> Result<()> {
        let method = method.to_uppercase();
        let path = path.to_string();

        if !self.routes.contains_key(&method) {
            self.routes.insert(method.clone(), HashMap::new());
        }

        let method_routes = self.routes.get_mut(&method)
            .ok_or_else(|| anyhow!("Failed to get method routes"))?;

        method_routes.insert(path, handler);

        Ok(())
    }

    /// Gets all registered routes
    pub fn get_routes(&self) -> Vec<(String, String)> {
        let mut routes = Vec::new();

        for (method, method_routes) in &self.routes {
            for path in method_routes.keys() {
                routes.push((method.clone(), path.clone()));
            }
        }

        routes.sort();
        routes
    }

    /// Simple path matching with support for wildcards
    fn path_matches(&self, route: &str, path: &str) -> bool {
        // Support simple wildcard at the end
        if route.ends_with('*') {
            let base = &route[..route.len() - 1];
            path.starts_with(base)
        } else {
            route == path
        }
    }
}

impl Default for ApiHandler {
    fn default() -> Self {
        Self::new()
    }
}

// Unit tests
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_api_handler_creation() {
        let handler = ApiHandler::new();
        assert_eq!(handler.get_routes().len(), 0);
    }

    #[test]
    fn test_add_route() {
        let mut handler = ApiHandler::new();

        fn test_handler(_req: Request) -> Result<Response> {
            Ok(Response::ok("test".to_string()))
        }

        handler.add_route("GET", "/test", test_handler).unwrap();

        let routes = handler.get_routes();
        assert_eq!(routes.len(), 1);
        assert_eq!(routes[0], ("GET".to_string(), "/test".to_string()));
    }

    #[test]
    fn test_handle_request() {
        let mut handler = ApiHandler::new();

        fn test_handler(req: Request) -> Result<Response> {
            Ok(Response::ok(format!("Handled: {} {}", req.method, req.path)))
        }

        handler.add_route("GET", "/test", test_handler).unwrap();

        let response = handler.handle_request("GET", "/test", None).unwrap();

        match response {
            ApiResponse::Success(resp) => {
                assert_eq!(resp.status_code, 200);
                assert_eq!(resp.body, "Handled: GET /test");
            },
            ApiResponse::Error(_) => panic!("Expected success response"),
        }
    }

    #[test]
    fn test_handle_request_not_found() {
        let handler = ApiHandler::new();

        let response = handler.handle_request("GET", "/nonexistent", None).unwrap();

        match response {
            ApiResponse::Success(_) => panic!("Expected error response"),
            ApiResponse::Error(error) => {
                assert!(error.contains("Route not found"));
            },
        }
    }

    #[test]
    fn test_request_builder() {
        let request = Request::new("GET", "/test")
            .with_body("test body".to_string())
            .with_header("Content-Type", "application/json");

        assert_eq!(request.method, "GET");
        assert_eq!(request.path, "/test");
        assert_eq!(request.body, Some("test body".to_string()));
        assert_eq!(request.headers.get("Content-Type"), Some(&"application/json".to_string()));
    }

    #[test]
    fn test_response_builder() {
        let response = Response::ok("success".to_string())
            .with_header("X-Custom", "value");

        assert_eq!(response.status_code, 200);
        assert_eq!(response.body, "success");
        assert_eq!(response.headers.get("X-Custom"), Some(&"value".to_string()));
    }

    #[test]
    fn test_wildcard_routes() {
        let mut handler = ApiHandler::new();

        fn wildcard_handler(req: Request) -> Result<Response> {
            Ok(Response::ok(format!("Wildcard: {}", req.path)))
        }

        handler.add_route("GET", "/api/*", wildcard_handler).unwrap();

        let test_paths = vec!["/api/users", "/api/users/123", "/api/test"];

        for path in test_paths {
            let response = handler.handle_request("GET", path, None).unwrap();

            match response {
                ApiResponse::Success(resp) => {
                    assert_eq!(resp.status_code, 200);
                    assert!(resp.body.contains("Wildcard:"));
                },
                ApiResponse::Error(_) => panic!("Expected success for path: {}", path),
            }
        }
    }
}