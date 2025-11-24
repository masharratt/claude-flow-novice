#!/usr/bin/env node
/**
 * Hello World in JavaScript
 *
 * A simple program that prints "Hello, World!" to the console.
 */

function main() {
    console.log("Hello, World!");
}

// Run the main function if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    main();
}