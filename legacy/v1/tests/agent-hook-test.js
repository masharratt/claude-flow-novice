/**
 * Test file for agent hook verification
 * This file contains various code patterns to test the enhanced post-edit hook system
 */

// Import statements to test dependency analysis
const fs = require('fs');
const path = require('path');

// Function with potential security issues
function processUserInput(input) {
    // Security issue: eval usage
    return eval(input);
}

// Function with hardcoded credentials (security issue - intentional for testing)
const API_KEY = process.env.TEST_API_KEY || "test-key-placeholder";
const DATABASE_URL = process.env.TEST_DB_URL || "mongodb://localhost:27017/testdb";

// Function that needs better error handling
function calculateDiscount(price, discountPercent) {
    // Missing input validation
    return price * (discountPercent / 100);
}

// Function with performance issues
function inefficientSort(array) {
    // Bubble sort - inefficient algorithm
    for (let i = 0; i < array.length; i++) {
        for (let j = 0; j < array.length - i - 1; j++) {
            if (array[j] > array[j + 1]) {
                let temp = array[j];
                array[j] = array[j + 1];
                array[j + 1] = temp;
            }
        }
    }
    return array;
}

// Function that could benefit from better naming
function proc(u, p) {
    return u.pts > p ? u.pts * 0.1 : 0;
}

// Test for TDD patterns - Red phase (failing test scenario)
function addNumbers(a, b) {
    // Intentionally incomplete implementation for TDD testing
    return a; // Missing addition of b
}

// Export for testing
module.exports = {
    processUserInput,
    calculateDiscount,
    inefficientSort,
    proc,
    addNumbers
};