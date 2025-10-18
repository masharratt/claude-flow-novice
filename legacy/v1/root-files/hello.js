/**
 * Simple hello function that returns a greeting
 * @param {string} name - The name to greet
 * @returns {string} A greeting message
 */
function hello(name = 'World') {
  return `Hello, ${name}!`;
}

module.exports = { hello };