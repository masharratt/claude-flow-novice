/**
 * Enhanced Hello World function with customizable greeting
 * @param {string} name - Optional name to greet
 * @returns {string} The greeting message
 */
export function hello(name = 'World') {
  return `Hello ${name}!`;
}

/**
 * Health check function
 * @returns {Object} Health status with timestamp
 */
export function healthCheck() {
  return {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  };
}

/**
 * API response wrapper
 * @param {any} data - Response data
 * @param {string} message - Response message
 * @returns {Object} Formatted API response
 */
export function createApiResponse(data, message = 'Success') {
  return {
    success: true,
    message,
    data,
    timestamp: new Date().toISOString()
  };
}