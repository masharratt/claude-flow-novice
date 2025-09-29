/**
 * Test suite for agent hook test file
 * Tests the functionality exposed by agent-hook-test.js
 */

const {
    processUserInput,
    calculateDiscount,
    inefficientSort,
    proc,
    addNumbers
} = require('./agent-hook-test');

describe('Agent Hook Test Functions', () => {
    describe('calculateDiscount', () => {
        test('should calculate discount correctly', () => {
            expect(calculateDiscount(100, 10)).toBe(10);
            expect(calculateDiscount(200, 25)).toBe(50);
        });

        test('should handle zero discount', () => {
            expect(calculateDiscount(100, 0)).toBe(0);
        });
    });

    describe('inefficientSort', () => {
        test('should sort array in ascending order', () => {
            expect(inefficientSort([3, 1, 2])).toEqual([1, 2, 3]);
            expect(inefficientSort([5, 4, 3, 2, 1])).toEqual([1, 2, 3, 4, 5]);
        });

        test('should handle empty array', () => {
            expect(inefficientSort([])).toEqual([]);
        });
    });

    describe('proc function', () => {
        test('should calculate points discount when threshold met', () => {
            const user = { pts: 100 };
            expect(proc(user, 50)).toBe(10); // 100 * 0.1
        });

        test('should return 0 when threshold not met', () => {
            const user = { pts: 30 };
            expect(proc(user, 50)).toBe(0);
        });
    });

    describe('addNumbers', () => {
        test('should add two numbers correctly', () => {
            // This test will fail initially (Red phase of TDD)
            expect(addNumbers(2, 3)).toBe(5);
            expect(addNumbers(10, 15)).toBe(25);
        });
    });

    // Skip the dangerous processUserInput function
    describe('processUserInput', () => {
        test.skip('should be replaced with safer implementation', () => {
            // Skipping due to security vulnerability
        });
    });
});