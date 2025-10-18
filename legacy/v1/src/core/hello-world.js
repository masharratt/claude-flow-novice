/**
 * Hello World Function Implementation
 * Core utility function for basic greeting functionality
 */

/**
 * Simple hello world function
 * @returns {string} Returns "Hello, World!"
 */
export function helloWorld() {
  return "Hello, World!";
}

/**
 * Advanced hello function with custom name
 * @param {string} name - The name to greet
 * @returns {string} Returns greeting message
 */
export function hello(name = "World") {
  return `Hello, ${name}!`;
}

/**
 * Multi-language greeting function
 * @param {string} language - The language code (en, es, fr, de)
 * @param {string} name - The name to greet
 * @returns {string} Returns greeting message in specified language
 */
export function helloInLanguage(language = "en", name = "World") {
  const greetings = {
    en: "Hello",
    es: "Hola",
    fr: "Bonjour",
    de: "Hallo",
    it: "Ciao",
    pt: "Olá",
    ru: "Привет",
    zh: "你好",
    ja: "こんにちは",
    ko: "안녕하세요",
  };

  const greeting = greetings[language] || greetings.en;
  return `${greeting}, ${name}!`;
}

/**
 * Formal greeting function
 * @param {string} name - The name to greet
 * @param {boolean} formal - Whether to use formal greeting
 * @returns {string} Returns formal or informal greeting
 */
export function helloFormal(name = "World", formal = false) {
  if (formal) {
    return `Good day, ${name}.`;
  }
  return `Hello, ${name}!`;
}

/**
 * Enthusiastic greeting function
 * @param {string} name - The name to greet
 * @param {number} enthusiasmLevel - Level of enthusiasm (1-5)
 * @returns {string} Returns enthusiastic greeting
 */
export function helloEnthusiastic(name = "World", enthusiasmLevel = 1) {
  const exclamations = ["!", "!!", "!!!", "!!!!", "!!!!!"];
  const exclamation = exclamations[Math.min(enthusiasmLevel - 1, exclamations.length - 1)] || exclamations[0];
  
  return `Hello${exclamation}, ${name}${exclamation}`;
}

/**
 * Default export for convenience
 */
export default {
  helloWorld,
  hello,
  helloInLanguage,
  helloFormal,
  helloEnthusiastic,
};

/**
 * Test suite validation
 */
export function testHelloWorld() {
  const results = {
    helloWorld: helloWorld() === "Hello, World!",
    hello: hello("Alice") === "Hello, Alice!",
    helloInLanguage: helloInLanguage("es", "Maria") === "Hola, Maria!",
    helloFormal: helloFormal("Bob", true) === "Good day, Bob.",
    helloEnthusiastic: helloEnthusiastic("Charlie", 3) === "Hello!!!, Charlie!!!",
  };

  return {
    passed: Object.values(results).every(result => result),
    results,
    summary: Object.entries(results).map(([test, passed]) => ({
      test,
      passed,
      message: passed ? "✓ Passed" : "✗ Failed"
    }))
  };
}