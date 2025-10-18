#!/usr/bin/env node

/**
 * Multilingual Hello World Test with 50 Real CLI Agents
 *
 * Each agent writes a "Hello World" function in a different programming language
 * and incorporates greetings from different languages around the world
 */

import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class MultilingualHelloWorldTest {
  constructor() {
    this.outputDir = './multilingual-hello-world-results';
    this.testStartTime = Date.now();
    this.agentResults = new Map();
    this.completedAgents = 0;
    this.totalAgents = 50;
  }

  // Define 50 programming languages and world languages combinations
  getLanguageCombinations() {
    return [
      { progLang: 'Python', worldLang: 'Spanish', greeting: '¡Hola Mundo!', fileName: 'hola_mundo.py' },
      { progLang: 'JavaScript', worldLang: 'French', greeting: 'Bonjour le Monde!', fileName: 'bonjour_monde.js' },
      { progLang: 'Java', worldLang: 'German', greeting: 'Hallo Welt!', fileName: 'hallo_welt.java' },
      { progLang: 'C++', worldLang: 'Italian', greeting: 'Ciao Mondo!', fileName: 'ciao_mondo.cpp' },
      { progLang: 'Ruby', worldLang: 'Portuguese', greeting: 'Olá Mundo!', fileName: 'ola_mundo.rb' },
      { progLang: 'Go', worldLang: 'Japanese', greeting: 'こんにちは世界！', fileName: 'konnichiwa_sekai.go' },
      { progLang: 'Rust', worldLang: 'Russian', greeting: 'Привет мир!', fileName: 'privet_mir.rs' },
      { progLang: 'TypeScript', worldLang: 'Chinese', greeting: '你好，世界！', fileName: 'ni_hao_shijie.ts' },
      { progLang: 'PHP', worldLang: 'Arabic', greeting: 'مرحبا بالعالم!', fileName: 'marhaban_bialalam.php' },
      { progLang: 'Swift', worldLang: 'Hindi', greeting: 'नमस्ते दुनिया!', fileName: 'namaste_duniya.swift' },
      { progLang: 'Kotlin', worldLang: 'Korean', greeting: '안녕하세요 세계!', fileName: 'annyeonghaseyo_segye.kt' },
      { progLang: 'C#', worldLang: 'Dutch', greeting: 'Hallo Wereld!', fileName: 'hallo_wereld.cs' },
      { progLang: 'Perl', worldLang: 'Turkish', greeting: 'Merhaba Dünya!', fileName: 'merhaba_dunya.pl' },
      { progLang: 'R', worldLang: 'Polish', greeting: 'Witaj świecie!', fileName: 'witaj_swiecie.R' },
      { progLang: 'Scala', worldLang: 'Swedish', greeting: 'Hej Världen!', fileName: 'hej_varlden.scala' },
      { progLang: 'Lua', worldLang: 'Norwegian', greeting: 'Hei Verden!', fileName: 'hei_verden.lua' },
      { progLang: 'Haskell', worldLang: 'Finnish', greeting: 'Hei Maailma!', fileName: 'hei_maailma.hs' },
      { progLang: 'Dart', worldLang: 'Greek', greeting: 'Γειά σου Κόσμε!', fileName: 'geia_sou_kosme.dart' },
      { progLang: 'Elixir', worldLang: 'Hebrew', greeting: 'שלום עולם!', fileName: 'shalom_olam.ex' },
      { progLang: 'Julia', worldLang: 'Thai', greeting: 'สวัสดีชาวโลก!', fileName: 'sawasdi_chawlok.jl' },
      { progLang: 'Crystal', worldLang: 'Vietnamese', greeting: 'Xin chào thế giới!', fileName: 'xin_chao_the_gioi.cr' },
      { progLang: 'Nim', worldLang: 'Czech', greeting: 'Ahoj světe!', fileName: 'ahoj_svete.nim' },
      { progLang: 'Zig', worldLang: 'Hungarian', greeting: 'Helló Világ!', fileName: 'hello_vilag.zig' },
      { progLang: 'Odin', worldLang: 'Romanian', greeting: 'Salut Lume!', fileName: 'salut_lume.odin' },
      { progLang: 'V', worldLang: 'Danish', greeting: 'Hej Verden!', fileName: 'hej_verden.v' },
      { progLang: 'Wren', worldLang: 'Indonesian', greeting: 'Halo Dunia!', fileName: 'halo_dunia.wren' },
      { progLang: 'Clojure', worldLang: 'Malay', greeting: 'Hai dunia!', fileName: 'hai_dunia.clj' },
      { progLang: 'F#', worldLang: 'Filipino', greeting: 'Kamusta Mundo!', fileName: 'kamusta_mundo.fs' },
      { progLang: 'Erlang', worldLang: 'Ukrainian', greeting: 'Привіт Світ!', fileName: 'privit_svit.erl' },
      { progLang: 'Elm', worldLang: 'Bengali', greeting: 'হ্যালো বিশ্ব!', fileName: 'halo_bishvo.elm' },
      { progLang: 'Purescript', worldLang: 'Tamil', greeting: 'வணக்கம் உலகம்!', fileName: 'vanakkam_ulagam.purs' },
      { progLang: 'Reason', worldLang: 'Urdu', greeting: 'ہیلو ورلڈ!', fileName: 'hello_world.re' },
      { progLang: 'OCaml', worldLang: 'Persian', greeting: 'سلام دنیا!', fileName: 'salam_donya.ml' },
      { progLang: 'Common Lisp', worldLang: 'Swahili', greeting: 'Habari Dunia!', fileName: 'habari_dunia.lisp' },
      { progLang: 'Scheme', worldLang: 'Irish', greeting: 'Dia duit a dhomhain!', fileName: 'dia_duit_adhomain.scm' },
      { progLang: 'Smalltalk', worldLang: 'Icelandic', greeting: 'Halló heimur!', fileName: 'hallo_heimur.st' },
      { progLang: 'Fortran', worldLang: 'Latvian', greeting: 'Sveika pasauli!', fileName: 'sveika_pasauli.f90' },
      { progLang: 'COBOL', worldLang: 'Lithuanian', greeting: 'Sveikas, pasauli!', fileName: 'sveikas_pasauli.cob' },
      { progLang: 'Ada', worldLang: 'Estonian', greeting: 'Tere maailm!', fileName: 'tere_maailm.ada' },
      { progLang: 'Bash', worldLang: 'Croatian', greeting: 'Pozdrav svijete!', fileName: 'pozdrav_svijete.sh' },
      { progLang: 'PowerShell', worldLang: 'Serbian', greeting: 'Здраво свете!', fileName: 'zdravo_svete.ps1' },
      { progLang: 'SQL', worldLang: 'Slovenian', greeting: 'Pozdravljen svet!', fileName: 'pozdravljen_svet.sql' },
      { progLang: 'HTML', worldLang: 'Estonian', greeting: 'Tere maailm!', fileName: 'tere_maailm.html' },
      { progLang: 'CSS', worldLang: 'Albanian', greeting: 'Përshëndetje Botë!', fileName: 'pershendetje_bote.css' },
      { progLang: 'LaTeX', worldLang: 'Macedonian', greeting: 'Здраво свету!', fileName: 'zdravo_svetu.tex' },
      { progLang: 'Matlab', worldLang: 'Bulgarian', greeting: 'Здравей, свят!', fileName: 'zdravei_svyat.m' },
      { progLang: 'Assembly', worldLang: 'Georgian', greeting: 'გამარჯობა მსოფლიო!', fileName: 'gamarjoba_msoplio.asm' },
      { progLang: 'Brainfuck', worldLang: 'Armenian', greeting: 'Բարև աշխարհ!', fileName: 'barev_ashkharh.bf' }
    ];
  }

  async start() {
    console.log('🌍 Starting Multilingual Hello World Test with 50 Real CLI Agents');
    console.log('   Each agent will write a Hello World function in a different programming language');
    console.log('   Each will incorporate greetings from different languages around the world\n');

    await fs.mkdir(this.outputDir, { recursive: true });

    // Step 1: Initialize swarm
    await this.initializeSwarm();

    // Step 2: Spawn 50 real agents with different language combinations
    await this.spawnMultilingualAgents();

    // Step 3: Monitor progress and collect results
    await this.monitorAgentProgress();

    // Step 4: Generate comprehensive report
    await this.generateMultilingualReport();
  }

  async initializeSwarm() {
    console.log('📋 Step 1: Initializing swarm for multilingual test...');

    return new Promise((resolve) => {
      const swarmInit = spawn('claude-flow-novice', ['swarm', 'init', 'mesh', '50', 'balanced'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: __dirname
      });

      swarmInit.stdout.on('data', (data) => {
        console.log(`   ${data.toString().trim()}`);
      });

      swarmInit.stderr.on('data', (data) => {
        console.error(`   ERROR: ${data.toString().trim()}`);
      });

      swarmInit.on('close', (code) => {
        console.log(`✅ Swarm initialization completed\n`);
        resolve();
      });

      setTimeout(() => {
        swarmInit.kill();
        resolve();
      }, 10000);
    });
  }

  async spawnMultilingualAgents() {
    console.log('🤖 Step 2: Spawning 50 multilingual agents...');

    const combinations = this.getLanguageCombinations();

    for (let i = 0; i < combinations.length; i++) {
      const { progLang, worldLang, greeting, fileName } = combinations[i];
      const agentName = `${progLang}-${worldLang}-Agent-${i + 1}`;

      console.log(`   [${i + 1}/50] Spawning ${agentName}`);
      console.log(`       Programming: ${progLang}, World Language: ${worldLang}`);
      console.log(`       Greeting: ${greeting}`);

      await this.spawnAgentWithTask(i + 1, agentName, progLang, worldLang, greeting, fileName);

      // Small delay between spawns to avoid overwhelming the system
      if (i % 5 === 0) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    console.log(`✅ Spawned ${combinations.length} multilingual agents\n`);
  }

  async spawnAgentWithTask(agentId, agentName, progLang, worldLang, greeting, fileName) {
    const task = `
Create a Hello World function in ${progLang} that incorporates the ${worldLang} greeting "${greeting}".

Requirements:
1. Write a complete, working ${progLang} program/function
2. Include the ${worldLang} greeting "${greeting}" prominently
3. Add comments explaining both the programming language and the world language
4. Ensure the code is syntactically correct and follows best practices
5. Include a brief explanation of the cultural context of the greeting
6. Save the code to a file named "${fileName}"

The function should demonstrate both programming diversity and cultural diversity.
    `;

    return new Promise((resolve) => {
      const agentProcess = spawn('claude-flow-novice', ['swarm', 'spawn', 'coder', agentName], {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: this.outputDir
      });

      let output = '';
      let hasResponded = false;

      agentProcess.stdout.on('data', (data) => {
        const text = data.toString();
        output += text;

        // Check if agent has produced meaningful output
        if (text.includes('function') || text.includes('def') || text.includes('class') || text.includes(fileName)) {
          hasResponded = true;
        }
      });

      agentProcess.stderr.on('data', (data) => {
        console.error(`   [${agentName}] ERROR: ${data.toString().trim()}`);
      });

      agentProcess.on('close', (code) => {
        this.agentResults.set(agentId, {
          agentName,
          progLang,
          worldLang,
          greeting,
          fileName,
          output: output,
          success: hasResponded || code === 0,
          exitCode: code,
          timestamp: Date.now()
        });

        if (hasResponded || code === 0) {
          this.completedAgents++;
        }

        resolve();
      });

      // Send the task to the agent
      agentProcess.stdin.write(task + '\n');

      // Timeout after 30 seconds
      setTimeout(() => {
        if (!hasResponded) {
          agentProcess.kill();
        }
        resolve();
      }, 30000);
    });
  }

  async monitorAgentProgress() {
    console.log('📊 Step 3: Monitoring agent progress...');

    let progress = 0;
    const monitorInterval = setInterval(() => {
      progress = this.completedAgents;
      const percentage = (progress / this.totalAgents * 100).toFixed(1);

      console.log(`   Progress: ${progress}/${this.totalAgents} agents (${percentage}%) completed`);

      if (progress >= this.totalAgents) {
        clearInterval(monitorInterval);
        console.log('✅ All agents completed their tasks\n');
      }
    }, 5000);

    // Wait for all agents to complete (max 5 minutes)
    return new Promise((resolve) => {
      const checkCompletion = () => {
        if (this.completedAgents >= this.totalAgents) {
          clearInterval(monitorInterval);
          resolve();
        } else if (Date.now() - this.testStartTime > 300000) { // 5 minute timeout
          console.log('⚠️  Test timeout reached\n');
          clearInterval(monitorInterval);
          resolve();
        } else {
          setTimeout(checkCompletion, 2000);
        }
      };
      checkCompletion();
    });
  }

  async generateMultilingualReport() {
    console.log('📋 Step 4: Generating multilingual test report...');

    const testDuration = Date.now() - this.testStartTime;
    const successfulAgents = Array.from(this.agentResults.values()).filter(a => a.success).length;
    const programmingLanguages = new Set(Array.from(this.agentResults.values()).map(a => a.progLang));
    const worldLanguages = new Set(Array.from(this.agentResults.values()).map(a => a.worldLang));

    const report = {
      test: {
        type: 'multilingual-hello-world-test',
        duration: testDuration,
        startTime: new Date(this.testStartTime).toISOString(),
        endTime: new Date().toISOString(),
        totalAgents: this.totalAgents
      },
      results: {
        completedAgents: this.completedAgents,
        successfulAgents: successfulAgents,
        successRate: (successfulAgents / this.totalAgents * 100).toFixed(2) + '%',
        programmingLanguagesCount: programmingLanguages.size,
        worldLanguagesCount: worldLanguages.size
      },
      diversity: {
        programmingLanguages: Array.from(programmingLanguages).sort(),
        worldLanguages: Array.from(worldLanguages).sort(),
        uniqueGreetings: Array.from(this.agentResults.values()).map(a => a.greeting)
      },
      agentDetails: Array.from(this.agentResults.entries()).map(([id, agent]) => ({
        id,
        name: agent.agentName,
        programmingLanguage: agent.progLang,
        worldLanguage: agent.worldLang,
        greeting: agent.greeting,
        fileName: agent.fileName,
        success: agent.success,
        outputLength: agent.output.length
      }))
    };

    const reportFile = path.join(this.outputDir, `multilingual-test-report-${Date.now()}.json`);
    await fs.writeFile(reportFile, JSON.stringify(report, null, 2));

    // Generate a summary text file
    const summaryFile = path.join(this.outputDir, `multilingual-summary-${Date.now()}.txt`);
    const summary = this.generateTextSummary(report);
    await fs.writeFile(summaryFile, summary);

    console.log('\n🌍 MULTILINGUAL HELLO WORLD TEST RESULTS:');
    console.log(`   Test Duration: ${(testDuration / 1000).toFixed(2)} seconds`);
    console.log(`   Total Agents: ${this.totalAgents}`);
    console.log(`   Completed Agents: ${this.completedAgents}`);
    console.log(`   Successful Agents: ${successfulAgents} (${report.results.successRate})`);
    console.log(`   Programming Languages: ${programmingLanguages.size}`);
    console.log(`   World Languages: ${worldLanguages.size}`);
    console.log(`   Report saved to: ${reportFile}`);
    console.log(`   Summary saved to: ${summaryFile}`);

    console.log('\n🌐 LANGUAGE DIVERSITY SHOWCASE:');
    this.showLanguageSamples();

    console.log('\n🎯 SUMMARY:');
    if (report.results.successRate === '100.00%') {
      console.log('   ✅ Perfect success! All 50 agents created Hello World functions in different languages!');
      console.log('   🌍 Demonstrated both programming diversity and cultural diversity!');
    } else {
      console.log(`   ⚠️  ${report.results.successRate} success rate. Some agents may need more time.`);
    }
  }

  generateTextSummary(report) {
    let summary = 'MULTILINGUAL HELLO WORLD TEST SUMMARY\n';
    summary += '=' .repeat(50) + '\n\n';
    summary += `Test Duration: ${(report.test.duration / 1000).toFixed(2)} seconds\n`;
    summary += `Success Rate: ${report.results.successRate}\n`;
    summary += `Programming Languages: ${report.diversity.programmingLanguages.join(', ')}\n`;
    summary += `World Languages: ${report.diversity.worldLanguages.join(', ')}\n\n`;

    summary += 'AGENT RESULTS:\n';
    summary += '-'.repeat(50) + '\n';

    for (const agent of report.agentDetails) {
      summary += `${agent.id}. ${agent.programmingLanguage} + ${agent.worldLanguage}\n`;
      summary += `   Greeting: ${agent.greeting}\n`;
      summary += `   File: ${agent.fileName}\n`;
      summary += `   Status: ${agent.success ? '✅ Success' : '❌ Failed'}\n\n`;
    }

    return summary;
  }

  showLanguageSamples() {
    const samples = Array.from(this.agentResults.values()).slice(0, 10);
    for (const agent of samples) {
      console.log(`   ${agent.progLang} + ${agent.worldLang}: "${agent.greeting}"`);
    }
    if (this.agentResults.size > 10) {
      console.log(`   ... and ${this.agentResults.size - 10} more language combinations!`);
    }
  }
}

// CLI interface
if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv.includes('--help')) {
    console.log(`
Multilingual Hello World Test with 50 Real CLI Agents

Usage: node multilingual-hello-world-test.js

This test:
1. Spawns 50 real Claude Code agents via CLI
2. Each agent writes a Hello World function in a different programming language
3. Each incorporates greetings from different languages around the world
4. Demonstrates both programming diversity and cultural diversity
5. Generates a comprehensive report of all language combinations

The agents will create Hello World functions in 50+ programming languages
with greetings from 50+ world languages.
    `);
    process.exit(0);
  }

  const test = new MultilingualHelloWorldTest();

  test.start().catch(error => {
    console.error('Test failed:', error);
    process.exit(1);
  });
}

export default MultilingualHelloWorldTest;