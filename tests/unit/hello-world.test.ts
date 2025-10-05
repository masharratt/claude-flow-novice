import { describe, it, expect } from '@jest/globals';

/**
 * Simple Hello World function for testing
 */
function helloWorld(): string {
  return 'Hello World';
}

/**
 * Greet a specific person
 */
function greet(name: string): string {
  return `Hello ${name}`;
}

describe('Hello World', () => {
  it('should return "Hello World"', () => {
    const result = helloWorld();
    expect(result).toBe('Hello World');
  });

  it('should greet a person by name', () => {
    const result = greet('Claude');
    expect(result).toBe('Hello Claude');
  });

  it('should handle empty string', () => {
    const result = greet('');
    expect(result).toBe('Hello ');
  });

  it('should return correct type', () => {
    const result = helloWorld();
    expect(typeof result).toBe('string');
  });
});
