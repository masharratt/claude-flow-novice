/**
 * Simple hello-world function
 * @param {string} name - The name to greet
 * @returns {string} Greeting message
 */
function hello(name = 'World') {
  if (typeof name !== 'string') {
    throw new TypeError('Name must be a string');
  }
  return `Hello, ${name}!`;
}

module.exports = { hello };