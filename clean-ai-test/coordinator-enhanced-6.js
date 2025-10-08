#!/usr/bin/env node

/**
 * AI Coordinator 1 - Enhanced with Communication Logging
 * Launch via: node clean-ai-test/coordinator-enhanced-1.js
 */

import fs from 'fs/promises';
import path from 'path';

const coordinatorId = 'coordinator-6';
const outputDir = '.';
const commLogFile = path.join(outputDir, `${coordinatorId}-communications.log`);

const programmingLanguages = ['Python', 'JavaScript', 'Rust', 'Go', 'Java', 'C++', 'TypeScript'];
const verbalLanguages = ['Spanish', 'French', 'German', 'Italian', 'Portuguese', 'Japanese', 'Russian', 'Chinese', 'Arabic', 'Hindi'];

// Enhanced communication logging
async function logCommunication(type, message, details = {}) {
  const logEntry = {
    timestamp: Date.now(),
    coordinatorId: coordinatorId,
    type: type,
    message: message,
    details: details,
    globalTimestamp: Date.now()
  };

  // Log to console (for real-time visibility)
  console.log(`[${coordinatorId}] ${type}: ${message}`);

  // Log to file (for permanent record)
  await fs.appendFile(commLogFile, JSON.stringify(logEntry) + '\n');

  // Also log to global communication log
  const globalCommLog = path.join(outputDir, 'global-coordination-log.jsonl');
  await fs.appendFile(globalCommLog, JSON.stringify(logEntry) + '\n');
}

// Initialize logging
await logCommunication('STARTUP', `AI Coordinator 1 starting...`, {
  availableLanguages: programmingLanguages,
  totalCoordinators: 7,
  coordinatorId: coordinatorId
});

await logCommunication('AVAILABILITY_CHECK', `Available programming languages: ${programmingLanguages.join(', ')}`);

async function coordinate() {
  let chosenLanguage = null;
  let attempts = 0;
  const maxAttempts = 10;

  while (attempts < maxAttempts && !chosenLanguage) {
    attempts++;

    await logCommunication('COORDINATION_ATTEMPT', `Starting coordination attempt ${attempts}`, {
      attempt: attempts,
      maxAttempts: maxAttempts
    });

    // Check other coordinators' choices
    const otherChoices = await checkOtherCoordinators();

    await logCommunication('OTHER_CHOICES_CHECK', `Other coordinators' choices: ${otherChoices.length > 0 ? otherChoices.join(', ') : 'None yet'}`, {
      detectedChoices: otherChoices,
      count: otherChoices.length
    });

    // Choose available language
    const availableLanguages = programmingLanguages.filter(lang =>
      !otherChoices.includes(lang)
    );

    await logCommunication('LANGUAGE_SELECTION', `Available languages: ${availableLanguages.join(', ')}`, {
      availableLanguages: availableLanguages,
      totalAvailable: availableLanguages.length
    });

    if (availableLanguages.length > 0) {
      chosenLanguage = availableLanguages[Math.floor(Math.random() * availableLanguages.length)];

      // Announce choice
      await announceChoice(chosenLanguage);

      await logCommunication('CHOICE_ANNOUNCED', `Chosen language: ${chosenLanguage} (attempt ${attempts})`, {
        chosenLanguage: chosenLanguage,
        attempt: attempts,
        reasoning: 'Random selection from available languages'
      });

      // Wait for potential conflicts
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Verify no conflicts
      const finalCheck = await checkOtherCoordinators();

      await logCommunication('CONFLICT_VERIFICATION', `Checking for conflicts...`, {
        otherChoices: finalCheck,
        myChoice: chosenLanguage,
        conflictExists: finalCheck.includes(chosenLanguage)
      });

      if (finalCheck.includes(chosenLanguage)) {
        await logCommunication('CONFLICT_DETECTED', `Conflict detected! Another coordinator also chose ${chosenLanguage}. Retrying...`, {
          conflictingLanguage: chosenLanguage,
          conflictDetected: true,
          conflictingCoordinators: finalCheck.filter(lang => lang === chosenLanguage)
        });

        chosenLanguage = null;
        await retractChoice();
      } else {
        await logCommunication('CHOICE_CONFIRMED', `Language choice confirmed: ${chosenLanguage}`, {
          finalChoice: chosenLanguage,
          conflictFree: true
        });
        break;
      }
    } else {
      await logCommunication('NO_LANGUAGES_AVAILABLE', `No available languages, retrying...`, {
        allLanguagesTaken: true,
        currentlyTaken: otherChoices
      });
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }

  if (chosenLanguage) {
    await logCommunication('FILE_CREATION_START', `Creating Hello World files in ${chosenLanguage}...`, {
      programmingLanguage: chosenLanguage,
      targetFiles: verbalLanguages.length
    });

    await createHelloWorldFiles(chosenLanguage, verbalLanguages);

    await logCommunication('TASK_COMPLETION', `Completed 10 Hello World files in ${chosenLanguage}`, {
      finalLanguage: chosenLanguage,
      totalAttempts: attempts,
      success: true
    });
  } else {
    await logCommunication('TASK_FAILURE', `Failed to choose language after ${attempts} attempts`, {
      totalAttempts: attempts,
      maxAttempts: maxAttempts,
      success: false
    });
  }
}

async function checkOtherCoordinators() {
  const choices = [];
  const detectedCoordinators = [];

  for (let i = 1; i <= 7; i++) {
    try {
      const statusFile = path.join(outputDir, `coordinator-${i}-status.txt`);
      const content = await fs.readFile(statusFile, 'utf8');
      const match = content.match(/CHOSEN_LANGUAGE:\s*(\w+)/);
      if (match) {
        choices.push(match[1]);
        detectedCoordinators.push(`coordinator-${i}: ${match[1]}`);

        await logCommunication('COORDINATOR_DETECTED', `Detected coordinator-${i} chose: ${match[1]}`, {
          detectedCoordinator: `coordinator-${i}`,
          detectedLanguage: match[1],
          timestamp: Date.now()
        });
      }
    } catch (error) {
      await logCommunication('COORDINATOR_NOT_FOUND', `coordinator-${i} status file not found yet`, {
        missingCoordinator: `coordinator-${i}`,
        reason: 'File does not exist yet'
      });
    }
  }

  await logCommunication('COODINATION_SCAN_COMPLETE', `Completed scan of other coordinators`, {
    totalDetected: detectedCoordinators.length,
    detectedCoordinators: detectedCoordinators,
    languagesTaken: choices
  });

  return choices;
}

async function announceChoice(language) {
  const statusFile = path.join(outputDir, `${coordinatorId}-status.txt`);
  const status = `COORDINATOR: ${coordinatorId}\nCHOSEN_LANGUAGE: ${language}\nTIMESTAMP: ${Date.now()}\nSTATUS: CHOSEN\n`;
  await fs.writeFile(statusFile, status);

  await logCommunication('CHOICE_BROADCAST', `Announced choice: ${language}`, {
    choice: language,
    statusFile: `${coordinatorId}-status.txt`,
    broadcastMethod: 'file-based'
  });
}

async function retractChoice() {
  const statusFile = path.join(outputDir, `${coordinatorId}-status.txt`);
  try {
    await fs.unlink(statusFile);

    await logCommunication('CHOICE_RETRACTION', `Retracted choice`, {
      statusFileRemoved: `${coordinatorId}-status.txt`,
      reason: 'Conflict detected'
    });
  } catch (error) {
    await logCommunication('RETRACTION_ERROR', `Failed to retract choice`, {
      error: error.message,
      statusFile: `${coordinatorId}-status.txt`
    });
  }
}

async function createHelloWorldFiles(programmingLang, verbalLangs) {
  const extensions = {
    'Python': 'py',
    'JavaScript': 'js',
    'Rust': 'rs',
    'Go': 'go',
    'Java': 'java',
    'C++': 'cpp',
    'TypeScript': 'ts'
  };

  const greetings = {
    'Spanish': '¡Hola Mundo!',
    'French': 'Bonjour le Monde!',
    'German': 'Hallo Welt!',
    'Italian': 'Ciao Mondo!',
    'Portuguese': 'Olá Mundo!',
    'Japanese': 'こんにちは世界！',
    'Russian': 'Привет мир!',
    'Chinese': '你好，世界！',
    'Arabic': 'مرحبا بالعالم!',
    'Hindi': 'नमस्ते दुनिया!'
  };

  const ext = extensions[programmingLang];
  const createdFiles = [];

  for (const verbalLang of verbalLangs) {
    const greeting = greetings[verbalLang];
    const filename = `hello_world_${verbalLang.toLowerCase()}_${programmingLang.toLowerCase()}.${ext}`;
    const filepath = path.join(outputDir, filename);

    let code = '';

    switch (programmingLang) {
      case 'Python':
        code = `# ${greeting} - ${verbalLang} greeting in ${programmingLang}\nprint("${greeting}")\n`;
        break;
      case 'JavaScript':
        code = `// ${greeting} - ${verbalLang} greeting in ${programmingLang}\nconsole.log("${greeting}");\n`;
        break;
      case 'Rust':
        code = `// ${greeting} - ${verbalLang} greeting in ${programmingLang}\nfn main() {\n    println!("${greeting}");\n}\n`;
        break;
      case 'Go':
        code = `// ${greeting} - ${verbalLang} greeting in ${programmingLang}\npackage main\nimport "fmt"\nfunc main() {\n    fmt.Println("${greeting}")\n}\n`;
        break;
      case 'Java':
        code = `// ${greeting} - ${verbalLang} greeting in ${programmingLang}\npublic class HelloWorld {\n    public static void main(String[] args) {\n        System.out.println("${greeting}");\n    }\n}\n`;
        break;
      case 'C++':
        code = `// ${greeting} - ${verbalLang} greeting in ${programmingLang}\n#include <iostream>\nint main() {\n    std::cout << "${greeting}" << std::endl;\n    return 0;\n}\n`;
        break;
      case 'TypeScript':
        code = `// ${greeting} - ${verbalLang} greeting in ${programmingLang}\nconsole.log("${greeting}");\n`;
        break;
    }

    await fs.writeFile(filepath, code);
    createdFiles.push(filename);

    await logCommunication('FILE_CREATED', `Created: ${filename}`, {
      filename: filename,
      verbalLanguage: verbalLang,
      programmingLanguage: programmingLang,
      greeting: greeting,
      fileSize: code.length
    });
  }

  await logCommunication('FILE_CREATION_COMPLETE', `All Hello World files created successfully`, {
    programmingLanguage: programmingLang,
    totalFiles: createdFiles.length,
    createdFiles: createdFiles
  });
}

// Final completion log
process.on('exit', async (code) => {
  await logCommunication('PROCESS_EXIT', `Coordinator process completed with code: ${code}`, {
    exitCode: code,
    processId: process.pid,
    finalStatus: code === 0 ? 'SUCCESS' : 'FAILED'
  });
});

// Start coordination
coordinate().catch(async (error) => {
  await logCommunication('COORDINATION_ERROR', `Error during coordination: ${error.message}`, {
    error: error.message,
    stack: error.stack,
    coordinatorId: coordinatorId
  });
  process.exit(1);
});