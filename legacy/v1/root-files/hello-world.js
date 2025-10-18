/**
 * A simple hello world function that returns a greeting message
 * @param {string} name - The name to greet (optional, defaults to "World")
 * @returns {string} A greeting message
 */
function helloWorld(name = "World") {
  return `Hello, ${name}!`;
}

// Export the function for use in other modules
module.exports = helloWorld;

// Example usage:
// console.log(helloWorld()); // "Hello, World!"
// console.log(helloWorld("Alice")); // "Hello, Alice!"