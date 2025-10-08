#!/usr/bin/env node

/**
 * AI Coordinator with Redis Coordination - Coordinator 1
 * Real-time coordination using Redis instead of files
 */

import Redis from 'redis';
import fs from 'fs/promises';
import path from 'path';

const coordinatorId = 'coordinator-5';
const outputDir = '.';
const commLogFile = path.join(outputDir, `${coordinatorId}-redis-communications.log`);

const programmingLanguages = ['Python', 'JavaScript', 'Rust', 'Go', 'Java', 'C++', 'TypeScript'];
const verbalLanguages = ['Spanish', 'French', 'German', 'Italian', 'Portuguese', 'Japanese', 'Russian', 'Chinese', 'Arabic', 'Hindi'];

// Redis client for coordination
let redisClient = null;

// Enhanced communication logging
async function logCommunication(type, message, details = {}) {
  const logEntry = {
    timestamp: Date.now(),
    coordinatorId: coordinatorId,
    type: type,
    message: message,
    details: details,
    coordinationMode: 'redis',
    globalTimestamp: Date.now()
  };

  // Log to console (for real-time visibility)
  console.log(`[${coordinatorId}] ${type}: ${message}`);

  // Log to file (for permanent record)
  await fs.appendFile(commLogFile, JSON.stringify(logEntry) + '\n');

  // Also log to Redis for real-time monitoring
  if (redisClient) {
    try {
      await redisClient.lPush('global-coordination-log', JSON.stringify(logEntry));
      await redisClient.lTrim('global-coordination-log', 0, 9999); // Keep last 10k entries
    } catch (error) {
      console.error('Redis logging error:', error.message);
    }
  }
}

// Initialize Redis connection
async function initializeRedis() {
  try {
    redisClient = Redis.createClient({
      url: 'redis://localhost:6379'
    });

    redisClient.on('error', (err) => {
      console.error('Redis Client Error:', err);
    });

    await redisClient.connect();
    await logCommunication('REDIS_CONNECTION', 'Connected to Redis coordination bus');
    return true;
  } catch (error) {
    await logCommunication('REDIS_ERROR', `Failed to connect to Redis: ${error.message}`);
    return false;
  }
}

// Initialize logging
await logCommunication('STARTUP', `AI Coordinator ${coordinatorId} starting with Redis coordination...`, {
  availableLanguages: programmingLanguages,
  totalCoordinators: 7,
  coordinatorId: coordinatorId,
  coordinationMode: 'redis'
});

await logCommunication('AVAILABILITY_CHECK', `Available programming languages: ${programmingLanguages.join(', ')}`);

async function coordinate() {
  let chosenLanguage = null;
  let attempts = 0;
  const maxAttempts = 10;

  while (attempts < maxAttempts && !chosenLanguage) {
    attempts++;

    await logCommunication('COORDINATION_ATTEMPT', `Starting Redis coordination attempt ${attempts}`, {
      attempt: attempts,
      maxAttempts: maxAttempts
    });

    // Check other coordinators' choices via Redis
    const otherChoices = await checkOtherCoordinatorsRedis();

    await logCommunication('OTHER_CHOICES_CHECK', `Other coordinators' choices: ${otherChoices.length > 0 ? otherChoices.join(', ') : 'None yet'}`, {
      detectedChoices: otherChoices,
      count: otherChoices.length,
      coordinationMethod: 'redis'
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

      // Announce choice via Redis
      await announceChoiceRedis(chosenLanguage);

      await logCommunication('CHOICE_ANNOUNCED', `Chosen language: ${chosenLanguage} (attempt ${attempts})`, {
        chosenLanguage: chosenLanguage,
        attempt: attempts,
        reasoning: 'Random selection from available languages',
        announcementMethod: 'redis'
      });

      // Wait for potential conflicts (much shorter with Redis)
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Verify no conflicts via Redis
      const finalCheck = await checkOtherCoordinatorsRedis();

      await logCommunication('CONFLICT_VERIFICATION', `Checking for conflicts...`, {
        otherChoices: finalCheck,
        myChoice: chosenLanguage,
        conflictExists: finalCheck.includes(chosenLanguage),
        verificationMethod: 'redis'
      });

      if (finalCheck.includes(chosenLanguage)) {
        await logCommunication('CONFLICT_DETECTED', `Conflict detected! Another coordinator also chose ${chosenLanguage}. Retrying...`, {
          conflictingLanguage: chosenLanguage,
          conflictDetected: true,
          conflictingCoordinators: finalCheck.filter(lang => lang === chosenLanguage)
        });

        chosenLanguage = null;
        await retractChoiceRedis();
      } else {
        await logCommunication('CHOICE_CONFIRMED', `Language choice confirmed: ${chosenLanguage}`, {
          finalChoice: chosenLanguage,
          conflictFree: true,
          confirmationMethod: 'redis'
        });
        break;
      }
    } else {
      await logCommunication('NO_LANGUAGES_AVAILABLE', `No available languages, retrying...`, {
        allLanguagesTaken: true,
        currentlyTaken: otherChoices
      });
      await new Promise(resolve => setTimeout(resolve, 2000));
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

async function checkOtherCoordinatorsRedis() {
  const choices = [];
  const detectedCoordinators = [];

  try {
    // Get all coordinator choices from Redis
    const coordinatorKeys = await redisClient.keys('coordinator:*:choice');

    for (const key of coordinatorKeys) {
      if (!key.includes(coordinatorId)) {
        const choice = await redisClient.get(key);
        if (choice) {
          choices.push(choice);
          const otherCoordinatorId = key.split(':')[1];
          detectedCoordinators.push(`${otherCoordinatorId}: ${choice}`);

          await logCommunication('COORDINATOR_DETECTED', `Detected ${otherCoordinatorId} chose: ${choice}`, {
            detectedCoordinator: otherCoordinatorId,
            detectedLanguage: choice,
            timestamp: Date.now(),
            detectionMethod: 'redis'
          });
        }
      }
    }

    await logCommunication('COODINATION_SCAN_COMPLETE', `Completed Redis scan of other coordinators`, {
      totalDetected: detectedCoordinators.length,
      detectedCoordinators: detectedCoordinators,
      languagesTaken: choices,
      scanMethod: 'redis'
    });

  } catch (error) {
    await logCommunication('REDIS_SCAN_ERROR', `Error scanning Redis for coordinators: ${error.message}`, {
      error: error.message
    });
  }

  return choices;
}

async function announceChoiceRedis(language) {
  try {
    // Set choice in Redis with expiration
    const key = `coordinator:${coordinatorId}:choice`;
    await redisClient.setEx(key, 300, language); // 5 minutes expiration

    // Also announce to a pub/sub channel for real-time notifications
    await redisClient.publish('coordinator-announcements', JSON.stringify({
      coordinatorId: coordinatorId,
      choice: language,
      timestamp: Date.now(),
      action: 'CHOICE_ANNOUNCED'
    }));

    await logCommunication('CHOICE_BROADCAST', `Announced choice via Redis: ${language}`, {
      choice: language,
      redisKey: key,
      expiration: 300,
      broadcastMethod: 'redis'
    });
  } catch (error) {
    await logCommunication('REDIS_ANNOUNCE_ERROR', `Failed to announce choice via Redis: ${error.message}`, {
      error: error.message,
      choice: language
    });
  }
}

async function retractChoiceRedis() {
  try {
    const key = `coordinator:${coordinatorId}:choice`;
    await redisClient.del(key);

    // Announce retraction
    await redisClient.publish('coordinator-announcements', JSON.stringify({
      coordinatorId: coordinatorId,
      timestamp: Date.now(),
      action: 'CHOICE_RETRACTED'
    }));

    await logCommunication('CHOICE_RETRACTION', `Retracted choice via Redis`, {
      redisKeyRemoved: key,
      reason: 'Conflict detected',
      retractionMethod: 'redis'
    });
  } catch (error) {
    await logCommunication('REDIS_RETRACTION_ERROR', `Failed to retract choice via Redis: ${error.message}`, {
      error: error.message,
      coordinatorId: coordinatorId
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
        code = `# ${greeting} - ${verbalLang} greeting in ${programmingLang} (Redis-coordinated)\nprint("${greeting}")\n`;
        break;
      case 'JavaScript':
        code = `// ${greeting} - ${verbalLang} greeting in ${programmingLang} (Redis-coordinated)\nconsole.log("${greeting}");\n`;
        break;
      case 'Rust':
        code = `// ${greeting} - ${verbalLang} greeting in ${programmingLang} (Redis-coordinated)\nfn main() {\n    println!("${greeting}");\n}\n`;
        break;
      case 'Go':
        code = `// ${greeting} - ${verbalLang} greeting in ${programmingLang} (Redis-coordinated)\npackage main\nimport "fmt"\nfunc main() {\n    fmt.Println("${greeting}")\n}\n`;
        break;
      case 'Java':
        code = `// ${greeting} - ${verbalLang} greeting in ${programmingLang} (Redis-coordinated)\npublic class HelloWorld {\n    public static void main(String[] args) {\n        System.out.println("${greeting}");\n    }\n}\n`;
        break;
      case 'C++':
        code = `// ${greeting} - ${verbalLang} greeting in ${programmingLang} (Redis-coordinated)\n#include <iostream>\nint main() {\n    std::cout << "${greeting}" << std::endl;\n    return 0;\n}\n`;
        break;
      case 'TypeScript':
        code = `// ${greeting} - ${verbalLang} greeting in ${programmingLang} (Redis-coordinated)\nconsole.log("${greeting}");\n`;
        break;
    }

    await fs.writeFile(filepath, code);
    createdFiles.push(filename);

    await logCommunication('FILE_CREATED', `Created: ${filename}`, {
      filename: filename,
      verbalLanguage: verbalLang,
      programmingLanguage: programmingLang,
      greeting: greeting,
      fileSize: code.length,
      coordinationMode: 'redis'
    });
  }

  await logCommunication('FILE_CREATION_COMPLETE', `All Hello World files created successfully`, {
    programmingLanguage: programmingLang,
    totalFiles: createdFiles.length,
    createdFiles: createdFiles,
    coordinationMode: 'redis'
  });
}

// Final completion log
process.on('exit', async (code) => {
  await logCommunication('PROCESS_EXIT', `Coordinator process completed with code: ${code}`, {
    exitCode: code,
    processId: process.pid,
    finalStatus: code === 0 ? 'SUCCESS' : 'FAILED',
    coordinationMode: 'redis'
  });

  // Cleanup Redis
  if (redisClient) {
    try {
      await redisClient.quit();
    } catch (error) {
      console.error('Redis cleanup error:', error.message);
    }
  }
});

// Initialize Redis and start coordination
if (await initializeRedis()) {
  coordinate().catch(async (error) => {
    await logCommunication('COORDINATION_ERROR', `Error during coordination: ${error.message}`, {
      error: error.message,
      stack: error.stack,
      coordinatorId: coordinatorId
    });

    if (redisClient) {
      await redisClient.quit();
    }
    process.exit(1);
  });
} else {
  process.exit(1);
}