#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const REDIS_PASSWORD = "Hbzbkuv1VdlWq4KTbzDZ2wL+o1xWVGvjDgzWKMkVtcyfoXmzpW9P43UZ6CgGlxjb";
const claims = require('./coordinator-b-claims.json');

// Error injection configuration
const ERROR_RATE = 0.5; // 50% error injection rate
const ERROR_TYPES = ['syntax', 'logic', 'translation', 'mixed'];

// File extensions mapping
const fileExtensions = {
  'Python': 'py',
  'JavaScript': 'js',
  'TypeScript': 'ts',
  'Ruby': 'rb',
  'Go': 'go',
  'Rust': 'rs',
  'Java': 'java',
  'C++': 'cpp',
  'C#': 'cs',
  'PHP': 'php',
  'Swift': 'swift',
  'Kotlin': 'kt',
  'Scala': 'scala',
  'Haskell': 'hs'
};

// Syntax error templates by language
const syntaxErrors = {
  'Python': (msg) => `print("${msg}"`,  // Missing closing parenthesis
  'JavaScript': (msg) => `console.log("${msg}"`,  // Missing closing parenthesis
  'Ruby': (msg) => `puts "${msg}"`,  // Missing closing quote
  'Go': (msg) => `fmt.Println("${msg}"`,  // Missing closing parenthesis
  'Rust': (msg) => `println!("${msg}"`,  // Missing closing parenthesis
  'Java': (msg) => `System.out.println("${msg}"`,  // Missing closing parenthesis
  'C++': (msg) => `std::cout << "${msg}`,  // Missing closing quote
  'default': (msg) => `print("${msg}"`  // Missing closing parenthesis
};

// Logic error templates (wrong function calls)
const logicErrors = {
  'Python': (msg) => `console.log("${msg}")`,  // JavaScript function in Python
  'JavaScript': (msg) => `puts("${msg}");`,  // Ruby function in JavaScript
  'Ruby': (msg) => `print("${msg}")`,  // Python function in Ruby
  'Go': (msg) => `println!("${msg}")`,  // Rust macro in Go
  'Rust': (msg) => `fmt.Println("${msg}")`,  // Go function in Rust
  'Java': (msg) => `cout << "${msg}";`,  // C++ in Java
  'default': (msg) => `puts("${msg}")`  // Wrong function
};

// Translation error (use English instead of target language)
const translationError = () => "Hello World";

// Mixed errors (combine multiple issues)
const mixedErrors = {
  'Python': (msg) => `console.log("Hello World"`,  // Wrong function + wrong translation + syntax
  'JavaScript': (msg) => `puts("Hello World"`,  // Wrong function + wrong translation + syntax
  'default': (msg) => `print("Hello World"`  // Wrong translation + syntax
};

function redisCmd(cmd) {
  try {
    return execSync(`redis-cli --pass "${REDIS_PASSWORD}" --no-auth-warning ${cmd}`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe']
    }).trim();
  } catch (error) {
    console.error(`Redis error: ${error.message}`);
    return '';
  }
}

// Generate error injection decisions for all agents
const errorInjections = claims.map((claim, index) => {
  const hasError = Math.random() < ERROR_RATE;
  const errorType = hasError ? ERROR_TYPES[Math.floor(Math.random() * ERROR_TYPES.length)] : null;

  let errorDetails = null;
  if (hasError) {
    const lang = claim.prog;
    const msg = claim.translation;

    switch(errorType) {
      case 'syntax':
        const syntaxTemplate = syntaxErrors[lang] || syntaxErrors['default'];
        errorDetails = {
          type: 'syntax',
          description: 'Missing closing parenthesis or bracket',
          code: syntaxTemplate(msg)
        };
        break;
      case 'logic':
        const logicTemplate = logicErrors[lang] || logicErrors['default'];
        errorDetails = {
          type: 'logic',
          description: `Wrong function call for ${lang}`,
          code: logicTemplate(msg)
        };
        break;
      case 'translation':
        errorDetails = {
          type: 'translation',
          description: 'Using English instead of target language',
          incorrectMessage: translationError()
        };
        break;
      case 'mixed':
        const mixedTemplate = mixedErrors[lang] || mixedErrors['default'];
        errorDetails = {
          type: 'mixed',
          description: 'Multiple issues: wrong function + wrong translation + syntax error',
          code: mixedTemplate(msg)
        };
        break;
    }
  }

  return {
    ...claim,
    hasError,
    errorType,
    errorDetails
  };
});

// Save error injection plan
fs.writeFileSync(
  '/mnt/c/Users/masha/Documents/claude-flow-novice/coordinator-b-error-plan.json',
  JSON.stringify(errorInjections, null, 2)
);

console.log(`Error injection plan created:`);
console.log(`Total agents: ${errorInjections.length}`);
console.log(`With errors: ${errorInjections.filter(e => e.hasError).length}`);
console.log(`Without errors: ${errorInjections.filter(e => !e.hasError).length}`);

// Create output directory
const outputDir = '/mnt/c/Users/masha/Documents/claude-flow-novice/test-results/hello-world/output/hello-world';
execSync(`mkdir -p "${outputDir}"`, { stdio: 'inherit' });

// Generate agent implementation scripts
errorInjections.forEach((injection) => {
  const { agentId, prog, written, translation, hasError, errorType, errorDetails } = injection;
  const ext = fileExtensions[prog] || 'txt';
  const outputFile = `${outputDir}/${agentId}-${prog.toLowerCase()}-${written.toLowerCase()}.${ext}`;

  // Store error metadata in Redis
  if (hasError) {
    const errorMeta = JSON.stringify({
      hasError: true,
      errorType,
      expectedMessage: translation,
      actualIssue: errorDetails.description,
      agentId,
      language: prog,
      writtenLanguage: written
    });
    redisCmd(`SETEX "coordination:error:${agentId}" 3600 '${errorMeta.replace(/'/g, "\\'")}'`);
  } else {
    const errorMeta = JSON.stringify({
      hasError: false,
      agentId,
      language: prog,
      writtenLanguage: written,
      expectedMessage: translation
    });
    redisCmd(`SETEX "coordination:error:${agentId}" 3600 '${errorMeta.replace(/'/g, "\\'")}'`);
  }

  // Create implementation based on error injection
  let implementation;

  if (hasError) {
    // Use error code from errorDetails
    if (errorDetails.code) {
      implementation = errorDetails.code;
    } else if (errorType === 'translation') {
      // Translation error: correct syntax but wrong message
      switch(prog) {
        case 'Python':
          implementation = `print("${errorDetails.incorrectMessage}")`;
          break;
        case 'JavaScript':
          implementation = `console.log("${errorDetails.incorrectMessage}");`;
          break;
        case 'Ruby':
          implementation = `puts "${errorDetails.incorrectMessage}"`;
          break;
        case 'Go':
          implementation = `package main\nimport "fmt"\nfunc main() {\n  fmt.Println("${errorDetails.incorrectMessage}")\n}`;
          break;
        case 'Rust':
          implementation = `fn main() {\n  println!("${errorDetails.incorrectMessage}");\n}`;
          break;
        default:
          implementation = `print("${errorDetails.incorrectMessage}")`;
      }
    }
  } else {
    // Correct implementation
    switch(prog) {
      case 'Python':
        implementation = `print("${translation}")`;
        break;
      case 'JavaScript':
        implementation = `console.log("${translation}");`;
        break;
      case 'Ruby':
        implementation = `puts "${translation}"`;
        break;
      case 'Go':
        implementation = `package main\nimport "fmt"\nfunc main() {\n  fmt.Println("${translation}")\n}`;
        break;
      case 'Rust':
        implementation = `fn main() {\n  println!("${translation}");\n}`;
        break;
      case 'Java':
        implementation = `public class HelloWorld {\n  public static void main(String[] args) {\n    System.out.println("${translation}");\n  }\n}`;
        break;
      case 'C++':
        implementation = `#include <iostream>\nint main() {\n  std::cout << "${translation}" << std::endl;\n  return 0;\n}`;
        break;
      default:
        implementation = `print("${translation}")`;
    }
  }

  // Write implementation file
  fs.writeFileSync(outputFile, implementation);

  // Add to review queue
  const reviewEntry = JSON.stringify({
    file: outputFile,
    agent: agentId,
    language: prog,
    written: written,
    coordinator: 'Coordinator-B',
    hasInjectedError: hasError,
    errorType: errorType || 'none',
    timestamp: Date.now()
  });

  redisCmd(`LPUSH coordination:review:queue '${reviewEntry.replace(/'/g, "\\'")}'`);
});

console.log(`\nAll ${errorInjections.length} implementations created and added to review queue`);
console.log(`Output directory: ${outputDir}`);

// Publish completion message
const completionMsg = JSON.stringify({
  coordinator: 'Coordinator-B',
  action: 'completed',
  totalAgents: errorInjections.length,
  withErrors: errorInjections.filter(e => e.hasError).length,
  withoutErrors: errorInjections.filter(e => !e.hasError).length,
  timestamp: Date.now()
});
redisCmd(`PUBLISH coordination:claims:channel '${completionMsg}'`);

console.log('\nCoordinator-B Layer 3 execution complete with error injection');
