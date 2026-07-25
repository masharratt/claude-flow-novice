// Jest test suite for hello-world.txt progressive improvements
// This test validates the progressive iteration requirements

const fs = require('fs');
const path = require('path');

describe('Hello World Progressive Development', () => {
  const filePath = path.join(__dirname, 'hello-world.txt');

  test('File exists', () => {
    expect(fs.existsSync(filePath)).toBe(true);
  });

  test('File has content', () => {
    const content = fs.readFileSync(filePath, 'utf8');
    expect(content.trim()).not.toBe('');
  });

  // Iteration-specific tests
  test('Iteration 1: Basic file (should fail - missing greeting)', () => {
    const content = fs.readFileSync(filePath, 'utf8').trim();
    
    // For iteration 1, this should FAIL because the file lacks proper greeting
    expect(content).toMatch(/hello/i);
  });

  test('Iteration 2: Should include Hello (pass gate but need fixes)', () => {
    const content = fs.readFileSync(filePath, 'utf8').trim();
    
    // This should pass in iteration 2
    expect(content).toMatch(/hello/i);
  });

  test('Iteration 3: Should include World (pass all but PO wants refinement)', () => {
    const content = fs.readFileSync(filePath, 'utf8').trim();
    
    // This should pass in iteration 3
    expect(content).toMatch(/hello\s+world/i);
  });

  test('Iteration 4: Should include punctuation (pass all but PO wants polish)', () => {
    const content = fs.readFileSync(filePath, 'utf8').trim();
    
    // This should pass in iteration 4
    expect(content).toMatch(/hello\s+world[!.,?]/i);
  });

  test('Iteration 5: Perfect output: Hello, World!', () => {
    const content = fs.readFileSync(filePath, 'utf8').trim();
    
    // Final perfect output should match exactly
    expect(content).toBe('Hello, World!');
  });
});