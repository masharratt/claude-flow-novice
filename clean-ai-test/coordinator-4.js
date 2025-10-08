#!/usr/bin/env node

/**
 * AI Coordinator 2 - Clean Test Version
 * Launch via: node clean-ai-test/coordinator-4.js
 */

import fs from 'fs/promises';
import path from 'path';

const coordinatorId = 'coordinator-4';
const outputDir = '.';

const programmingLanguages = ['Python', 'JavaScript', 'Rust', 'Go', 'Java', 'C++', 'TypeScript'];
const verbalLanguages = ['Spanish', 'French', 'German', 'Italian', 'Portuguese', 'Japanese', 'Russian', 'Chinese', 'Arabic', 'Hindi'];

console.log(`[${coordinatorId}] 🚀 AI Coordinator 2 starting...`);
console.log(`[${coordinatorId}] 📋 Available programming languages: ${programmingLanguages.join(', ')}`);

async function coordinate() {
  let chosenLanguage = null;
  let attempts = 0;
  const maxAttempts = 10;

  while (attempts < maxAttempts && !chosenLanguage) {
    attempts++;

    // Check other coordinators' choices
    const otherChoices = await checkOtherCoordinators();
    console.log(`[${coordinatorId}] 🔍 Other coordinators' choices: ${otherChoices.length > 0 ? otherChoices.join(', ') : 'None yet'}`);

    // Choose available language
    const availableLanguages = programmingLanguages.filter(lang =>
      !otherChoices.includes(lang)
    );

    if (availableLanguages.length > 0) {
      chosenLanguage = availableLanguages[Math.floor(Math.random() * availableLanguages.length)];

      // Announce choice
      await announceChoice(chosenLanguage);
      console.log(`[${coordinatorId}] 🎯 Chosen language: ${chosenLanguage} (attempt ${attempts})`);

      // Wait for potential conflicts
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Verify no conflicts
      const finalCheck = await checkOtherCoordinators();

      if (finalCheck.includes(chosenLanguage)) {
        console.log(`[${coordinatorId}] ⚠️  Conflict detected! Another coordinator also chose ${chosenLanguage}. Retrying...`);
        chosenLanguage = null;
        await retractChoice();
      } else {
        console.log(`[${coordinatorId}] ✅ Language choice confirmed: ${chosenLanguage}`);
        break;
      }
    } else {
      console.log(`[${coordinatorId}] ⚠️  No available languages, retrying...`);
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }

  if (chosenLanguage) {
    console.log(`[${coordinatorId}] 🏗️  Creating Hello World files in ${chosenLanguage}...`);
    await createHelloWorldFiles(chosenLanguage, verbalLanguages);
    console.log(`[${coordinatorId}] ✅ Completed 10 Hello World files in ${chosenLanguage}`);
  } else {
    console.log(`[${coordinatorId}] ❌ Failed to choose language after ${attempts} attempts`);
  }
}

async function checkOtherCoordinators() {
  const choices = [];

  for (let i = 1; i <= 7; i++) {
    if (i !== 4) {
      try {
        const statusFile = path.join(outputDir, `coordinator-${i}-status.txt`);
        const content = await fs.readFile(statusFile, 'utf8');
        const match = content.match(/CHOSEN_LANGUAGE:\s*(\w+)/);
        if (match) {
          choices.push(match[1]);
          console.log(`[${coordinatorId}] 📨 Detected coordinator-${i} chose: ${match[1]}`);
        }
      } catch (error) {
        // File doesn't exist yet
      }
    }
  }

  return choices;
}

async function announceChoice(language) {
  const statusFile = path.join(outputDir, `${coordinatorId}-status.txt`);
  const status = `COORDINATOR: ${coordinatorId}\nCHOSEN_LANGUAGE: ${language}\nTIMESTAMP: ${Date.now()}\nSTATUS: CHOSEN\n`;
  await fs.writeFile(statusFile, status);
  console.log(`[${coordinatorId}] 📢 Announced choice: ${language}`);
}

async function retractChoice() {
  const statusFile = path.join(outputDir, `${coordinatorId}-status.txt`);
  try {
    await fs.unlink(statusFile);
    console.log(`[${coordinatorId}] 🔄 Retracted choice`);
  } catch (error) {
    // File doesn't exist
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
    console.log(`[${coordinatorId}] 📄 Created: ${filename}`);
  }
}

// Start coordination
coordinate().catch(console.error);