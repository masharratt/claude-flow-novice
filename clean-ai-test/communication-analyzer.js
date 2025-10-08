#!/usr/bin/env node

/**
 * Communication Analyzer for AI Coordinators
 * Analyzes all communication logs and provides insights
 */

import fs from 'fs/promises';
import path from 'path';

const outputDir = '.';

async function analyzeCommunications() {
  console.log('🔍 Analyzing AI Coordinator Communications...\n');

  // Check for global coordination log
  const globalLogFile = path.join(outputDir, 'global-coordination-log.jsonl');
  let globalLogExists = false;

  try {
    await fs.access(globalLogFile);
    globalLogExists = true;
  } catch (error) {
    console.log('⚠️  Global coordination log not found');
  }

  // Analyze individual coordinator logs
  const coordinatorFiles = [];
  for (let i = 1; i <= 7; i++) {
    const logFile = path.join(outputDir, `coordinator-${i}-communications.log`);
    try {
      await fs.access(logFile);
      coordinatorFiles.push(logFile);
    } catch (error) {
      console.log(`⚠️  coordinator-${i} communication log not found`);
    }
  }

  if (coordinatorFiles.length === 0 && !globalLogExists) {
    console.log('❌ No communication logs found. Run the enhanced coordinators first.');
    return;
  }

  console.log(`📁 Found ${coordinatorFiles.length} individual logs + ${globalLogExists ? '1 global log' : '0 global logs'}\n`);

  // Analyze individual logs
  const coordinatorStats = new Map();
  let totalMessages = 0;

  for (const logFile of coordinatorFiles) {
    const content = await fs.readFile(logFile, 'utf8');
    const lines = content.trim().split('\n').filter(line => line.trim());
    const coordinatorId = path.basename(logFile).replace('-communications.log', '');

    const stats = {
      totalMessages: lines.length,
      messageTypes: {},
      events: [],
      firstMessage: null,
      lastMessage: null
    };

    lines.forEach(line => {
      try {
        const logEntry = JSON.parse(line);
        stats.events.push(logEntry);
        stats.messageTypes[logEntry.type] = (stats.messageTypes[logEntry.type] || 0) + 1;

        if (!stats.firstMessage) {
          stats.firstMessage = logEntry.timestamp;
        }
        stats.lastMessage = logEntry.timestamp;
      } catch (error) {
        console.log(`⚠️  Could not parse line in ${logFile}: ${line.substring(0, 50)}...`);
      }
    });

    coordinatorStats.set(coordinatorId, stats);
    totalMessages += lines.length;
  }

  // Display statistics
  console.log('📊 Communication Statistics:');
  console.log('================================');
  console.log(`Total Messages: ${totalMessages}`);
  console.log(`Active Coordinators: ${coordinatorStats.size}/7\n`);

  // Per-coordinator breakdown
  console.log('📈 Per-Coordinator Breakdown:');
  console.log('---------------------------------');

  for (const [coordinatorId, stats] of coordinatorStats) {
    const duration = stats.lastMessage - stats.firstMessage;
    console.log(`\n${coordinatorId}:`);
    console.log(`  Messages: ${stats.totalMessages}`);
    console.log(`  Duration: ${(duration / 1000).toFixed(2)}s`);
    console.log(`  Message Types:`, Object.entries(stats.messageTypes).map(([type, count]) => `${type}(${count})`).join(', '));
  }

  // Analyze coordination timeline
  console.log('\n🕐 Coordination Timeline Analysis:');
  console.log('------------------------------------');

  // Extract key events
  const allEvents = [];
  for (const [coordinatorId, stats] of coordinatorStats) {
    stats.events.forEach(event => {
      allEvents.push({ ...event, coordinatorId });
    });
  }

  // Sort by timestamp
  allEvents.sort((a, b) => a.timestamp - b.timestamp);

  // Show key events
  const keyEvents = allEvents.filter(event =>
    ['STARTUP', 'CHOICE_ANNOUNCED', 'CONFLICT_DETECTED', 'CHOICE_CONFIRMED', 'TASK_COMPLETION', 'TASK_FAILURE'].includes(event.type)
  );

  console.log(`\nKey Events (${keyEvents.length}):`);
  keyEvents.forEach((event, index) => {
    const time = new Date(event.timestamp).toLocaleTimeString();
    console.log(`  ${index + 1}. [${time}] ${event.coordinatorId}: ${event.type}`);
    if (event.message) {
      console.log(`     ${event.message}`);
    }
  });

  // Conflict analysis
  const conflicts = allEvents.filter(event => event.type === 'CONFLICT_DETECTED');
  if (conflicts.length > 0) {
    console.log('\n⚠️  Conflicts Detected:');
    console.log('----------------------');
    conflicts.forEach((conflict, index) => {
      console.log(`  ${index + 1}. ${conflict.coordinatorId}: ${conflict.message}`);
      if (conflict.details && conflict.details.conflictingLanguage) {
        console.log(`     Conflicting language: ${conflict.details.conflictingLanguage}`);
      }
    });
  } else {
    console.log('\n✅ No conflicts detected');
  }

  // Success analysis
  const completions = allEvents.filter(event => event.type === 'TASK_COMPLETION');
  const failures = allEvents.filter(event => event.type === 'TASK_FAILURE');

  console.log('\n🎯 Task Completion Summary:');
  console.log('---------------------------');
  console.log(`Successful: ${completions.length}`);
  console.log(`Failed: ${failures.length}`);
  console.log(`Success Rate: ${((completions.length / Math.max(completions.length + failures.length, 1)) * 100).toFixed(1)}%`);

  // Check for generated files
  try {
    const files = await fs.readdir(outputDir);
    const helloFiles = files.filter(f => f.startsWith('hello_world_'));
    const statusFiles = files.filter(f => f.includes('-status.txt'));

    console.log('\n📁 Generated Files:');
    console.log('-------------------');
    console.log(`Hello World files: ${helloFiles.length}/70`);
    console.log(`Status files: ${statusFiles.length}/7`);

    if (helloFiles.length === 70) {
      console.log('✅ Perfect! All 70 language combinations created!');
    } else {
      console.log(`⚠️  Missing ${70 - helloFiles.length} files`);
    }

  } catch (error) {
    console.log('⚠️  Could not analyze generated files');
  }

  console.log('\n📝 Log Locations:');
  console.log('----------------');
  console.log('Global coordination log: global-coordination-log.jsonl');
  console.log('Individual coordinator logs: coordinator-*-communications.log');
}

// Run analysis
analyzeCommunications().catch(console.error);