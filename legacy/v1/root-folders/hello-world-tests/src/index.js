/**
 * Simple hello-world function
 * @returns {string} Hello world message
 */
function helloWorld() {
  return 'Hello, World!';
}

/**
 * Enhanced hello function with customizable greeting
 * @param {string} name - The name to greet
 * @param {string} greeting - The greeting word (optional)
 * @returns {string} Custom greeting message
 */
function hello(name, greeting = 'Hello') {
  if (!name || typeof name !== 'string') {
    throw new Error('Name must be a non-empty string');
  }
  return `${greeting}, ${name}!`;
}

/**
 * Count function that returns the count of items
 * @param {Array} items - Array of items to count
 * @returns {number} Count of items
 */
function countItems(items) {
  if (!Array.isArray(items)) {
    throw new Error('Items must be an array');
  }
  return items.length;
}

/**
 * Function that processes a list of names and returns greetings
 * @param {Array<string>} names - Array of names
 * @param {string} greeting - Custom greeting word
 * @returns {Array<string>} Array of greeting messages
 */
function processNames(names, greeting = 'Hello') {
  if (!Array.isArray(names)) {
    throw new Error('Names must be an array');
  }
  
  return names.map(name => {
    if (!name || typeof name !== 'string') {
      throw new Error('Each name must be a non-empty string');
    }
    return `${greeting}, ${name}!`;
  });
}

module.exports = {
  helloWorld,
  hello,
  countItems,
  processNames
};