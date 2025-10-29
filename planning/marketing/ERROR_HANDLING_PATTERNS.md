# API Error Handling Patterns

## Overview
This document provides comprehensive error handling strategies for marketing platform APIs, focusing on resilience, retry mechanisms, and graceful error recovery.

## Common HTTP Status Codes

### Authentication Errors
- **401 (Unauthorized)**
  - Token expired or invalid
  - Requires token refresh or re-authentication
- **403 (Forbidden)**
  - Insufficient permissions
  - Check OAuth scopes and access rights

### Rate Limiting Errors
- **429 (Too Many Requests)**
  - API rate limit exceeded
  - Implement exponential backoff strategy
- **Specific Platform Rate Limit Headers**
  - `X-RateLimit-Remaining`
  - `X-RateLimit-Reset`
  - Monitor and adjust request frequency

### Server Errors
- **500 (Internal Server Error)**
  - Platform-side issue
  - Retry with exponential backoff
- **502 (Bad Gateway)**
  - Temporary service interruption
  - Implement retry mechanism
- **503 (Service Unavailable)**
  - Temporary overload or maintenance
  - Use circuit breaker pattern

## Retry Strategy Implementation

### Exponential Backoff Algorithm
```bash
#!/bin/bash
# Exponential Backoff Retry Function

max_retries=5
base_delay=1  # Initial delay in seconds

api_request() {
    local url="$1"
    local retry_count=0
    local success=false

    while [ $retry_count -lt $max_retries ] && [ "$success" = false ]; do
        response=$(curl -s -w "%{http_code}" "$url")
        http_code=$(echo "$response" | tail -c 4)

        case $http_code in
            200)
                success=true
                echo "Request successful"
                break
                ;;
            429|500|502|503)
                # Exponential backoff
                delay=$((base_delay * (2 ** retry_count)))
                jitter=$((RANDOM % delay))
                sleep_time=$((delay + jitter))

                echo "Rate limit/server error. Retrying in $sleep_time seconds..."
                sleep $sleep_time
                ((retry_count++))
                ;;
            401|403)
                echo "Authentication error. Refresh tokens or check permissions."
                break
                ;;
            *)
                echo "Unhandled HTTP status: $http_code"
                break
                ;;
        esac
    done

    if [ "$success" = false ]; then
        echo "Max retries reached. Request failed."
        return 1
    fi
}
```

### Circuit Breaker Pattern
```bash
#!/bin/bash
# Circuit Breaker Implementation

failure_threshold=3
reset_timeout=60  # Seconds to reset circuit

circuit_breaker() {
    local url="$1"
    local failure_count=0
    local circuit_state="closed"

    while true; do
        if [ "$circuit_state" = "open" ]; then
            sleep $reset_timeout
            circuit_state="half-open"
        fi

        response=$(curl -s -w "%{http_code}" "$url")
        http_code=$(echo "$response" | tail -c 4)

        case $http_code in
            200)
                # Successful request
                failure_count=0
                circuit_state="closed"
                ;;
            429|500|502|503)
                ((failure_count++))
                
                if [ $failure_count -ge $failure_threshold ]; then
                    circuit_state="open"
                    echo "Circuit opened. Blocking requests for $reset_timeout seconds."
                fi
                ;;
            *)
                echo "Unhandled status: $http_code"
                ;;
        esac
    done
}
```

## Platform-Specific Error Handling

### 1. Mailchimp
- **Error Response Structure:**
  ```json
  {
    "type": "http://developer.mailchimp.com/documentation/apidocs/oas/v3.0.0#/",
    "title": "Resource Not Found",
    "status": 404,
    "detail": "The requested resource could not be found."
  }
  ```
- **Handling Strategy:**
  - Log detailed error message
  - Check resource existence before request
  - Implement specific error mapping

### 2. SendGrid
- **Error Codes:**
  - `400`: Bad Request
  - `401`: Unauthorized
  - `403`: Forbidden
  - `404`: Resource Not Found
- **Handling:**
  - Validate request payload
  - Check API key permissions
  - Handle resource-specific errors

### 3. HubSpot
- **Error Response:**
  ```json
  {
    "status": "error",
    "message": "Validation Failed",
    "correlationId": "abc123",
    "category": "VALIDATION_ERROR"
  }
  ```
- **Strategies:**
  - Use `correlationId` for support
  - Validate input before sending
  - Handle validation category errors

### 4. Meta Graph API
- **Error Response:**
  ```json
  {
    "error": {
      "message": "API call limit reached",
      "type": "OAuthException",
      "code": 4,
      "fbtrace_id": "ABC123XYZ"
    }
  }
  ```
- **Handling:**
  - Track `fbtrace_id` for support
  - Implement strict rate limiting
  - Use app-level permissions

## Best Practices

### 1. Logging
- Log all API errors with:
  - Timestamp
  - HTTP status code
  - Error message
  - Request details
  - Correlation/trace IDs

### 2. Alerting
- Set up notifications for:
  - Repeated authentication failures
  - Consistent rate limit hits
  - High error rate from specific endpoints

### 3. Monitoring
- Track metrics:
  - API response times
  - Error rates
  - Retry success percentages

## Security Considerations
- Never expose raw error messages to end-users
- Sanitize and generalize error responses
- Use centralized error handling
- Implement request validation before API calls

## Recommended Error Handling Flow
1. Validate request locally
2. Send API request
3. Check HTTP status code
4. Handle specific error types
5. Implement retry/circuit breaker
6. Log and alert on persistent failures

## Tools & Libraries
- `jq` for JSON parsing
- `curl` with advanced error handling
- Custom bash retry libraries
- Language-specific HTTP client libraries

## Conclusion
Robust error handling requires:
- Comprehensive retry strategies
- Detailed logging
- Circuit breaker mechanisms
- Graceful degradation
- Minimal user-facing disruption
