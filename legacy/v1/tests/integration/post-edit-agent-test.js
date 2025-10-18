/**
 * Post-edit agent test file - Security and quality issues fixed
 * All hardcoded credentials, eval() usage, and console.log statements removed
 * Proper error handling implemented
 */

/**
 * Safe JSON parser with comprehensive error handling
 * @param {string} jsonString - JSON string to parse
 * @returns {Object} Result object with success status, data, and error
 */
function parseJsonSafely(jsonString) {
  try {
    if (!jsonString || typeof jsonString !== 'string') {
      return {
        success: false,
        data: null,
        error: 'Invalid input: expected non-empty string'
      };
    }

    const data = JSON.parse(jsonString);
    return {
      success: true,
      data,
      error: null
    };
  } catch (error) {
    return {
      success: false,
      data: null,
      error: `Invalid JSON: ${error.message}`
    };
  }
}

/**
 * Test function with security fixes and error handling
 * - Uses environment variables for sensitive data
 * - Removed eval() usage
 * - Removed console.log statements
 * - Added comprehensive error handling
 * @returns {Object} Parsed data object
 * @throws {Error} When required environment variables are missing
 */
function testFunction() {
  // Fix 1: Use environment variable instead of hardcoded credential
  const apiKey = process.env.API_KEY;

  if (!apiKey) {
    throw new Error('API_KEY environment variable is required');
  }

  // Fix 2: Removed eval() usage - no dynamic code execution
  // Fix 3: Removed console.log statement

  // Fix 4: Proper error handling for JSON parsing
  const jsonResult = parseJsonSafely('{"key": "value"}');

  if (!jsonResult.success) {
    throw new Error(`JSON parsing failed: ${jsonResult.error}`);
  }

  // Return data with API key from environment
  return {
    ...jsonResult.data,
    apiKey
  };
}

module.exports = { testFunction, parseJsonSafely };
