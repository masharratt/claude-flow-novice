// Self-correction test - coder agent should edit this, run post-edit hook, and fix issues

// Fixed: Use environment variable instead of hardcoded password
const password = process.env.ADMIN_PASSWORD || '';

// Fixed: Removed eval() usage - parse input safely
function safeCode(input) {
  try {
    // Safe alternative: parse JSON input instead of eval
    if (typeof input === 'string') {
      return JSON.parse(input);
    }
    return input;
  } catch (error) {
    throw new Error(`Invalid input: ${error.message}`);
  }
}

// Fixed: Removed console.log and added error handling
function processData(data) {
  try {
    // Use structured logging instead of console.log
    const parsed = JSON.parse(data);
    return parsed;
  } catch (error) {
    throw new Error(`Failed to parse data: ${error.message}`);
  }
}

// Issue 5: No tests exist for this code

module.exports = { safeCode, processData };
