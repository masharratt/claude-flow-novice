#!/usr/bin/env node

/**
 * Simple Dormant Coordinator Demo
 * Shows how coordinators handle messages when they're offline
 */

import Redis from 'redis';

class SimpleDormantDemo {
  constructor() {
    this.redisClient = null;
  }

  async initialize() {
    this.redisClient = Redis.createClient({
      url: 'redis://localhost:6379'
    });

    this.redisClient.on('error', (err) => {
      console.error('Redis Client Error:', err);
    });

    await this.redisClient.connect();
    console.log('🔗 Connected to Redis\n');
  }

  async demonstrateDormantCoordinator() {
    console.log('🎭 DORMANT COORDINATOR DEMONSTRATION\n');
    console.log('Showing how Redis handles coordinators that go offline...\n');

    // Scenario 1: Coordinator announces choice and goes "offline"
    console.log('📱 Scenario 1: Coordinator announces choice and goes offline');
    console.log('-' .repeat(50));

    await this.redisClient.setEx('coordinator:offline:choice', 300, 'Python');
    await this.redisClient.setEx('coordinator:offline:status', 300, 'offline');
    await this.redisClient.setEx('coordinator:offline:last_seen', 300, Date.now().toString());

    console.log('✅ coordinator-offline announced: Python and went offline');
    console.log('💾 Redis stores this information with 5-minute expiration\n');

    // Show what Redis stored
    const choice = await this.redisClient.get('coordinator:offline:choice');
    const status = await this.redisClient.get('coordinator:offline:status');
    const lastSeen = await this.redisClient.get('coordinator:offline:last_seen');

    console.log('📊 Current Redis state:');
    console.log(`   Choice: ${choice}`);
    console.log(`   Status: ${status}`);
    console.log(`   Last Seen: ${new Date(parseInt(lastSeen)).toLocaleString()}\n`);

    // Scenario 2: Other coordinators can still see the dormant coordinator's state
    console.log('📱 Scenario 2: Active coordinators check dormant coordinator');
    console.log('-' .repeat(50));

    console.log('🔍 Active coordinator checking Redis for other coordinators...');
    const offlineChoice = await this.redisClient.get('coordinator:offline:choice');
    console.log(`   Found offline coordinator's choice: ${offlineChoice}`);

    // Active coordinator makes decision based on dormant coordinator's state
    const availableLanguages = ['Java', 'JavaScript', 'Rust', 'Go', 'C++', 'TypeScript'];
    const filteredLanguages = availableLanguages.filter(lang => lang !== offlineChoice);
    const chosenLanguage = filteredLanguages[Math.floor(Math.random() * filteredLanguages.length)];

    console.log(`✅ Active coordinator chooses: ${chosenLanguage} (avoiding ${offlineChoice})`);

    // Store active coordinator's choice
    await this.redisClient.setEx('coordinator:active:choice', 300, chosenLanguage);
    console.log('💾 Active coordinator choice also stored in Redis\n');

    // Scenario 3: Messages are queued for dormant coordinator
    console.log('📱 Scenario 3: Messages queued for dormant coordinator');
    console.log('-' .repeat(50));

    const messages = [
      { from: 'coordinator-alpha', message: 'Need Python resource, are you done?', time: new Date().toLocaleString() },
      { from: 'coordinator-beta', message: 'Python requested by engineering team', time: new Date().toLocaleString() },
      { from: 'coordinator-gamma', message: 'Python maintenance in 5 mins', time: new Date().toLocaleString() }
    ];

    console.log('📨 Other coordinators leaving messages for dormant coordinator:');
    for (const msg of messages) {
      await this.redisClient.lPush('messages:coordinator:offline', JSON.stringify(msg));
      console.log(`   📝 ${msg.from}: "${msg.message}"`);
    }
    console.log('💾 Messages stored in Redis list, waiting for dormant coordinator\n');

    // Scenario 4: Dormant coordinator wakes up and checks messages
    console.log('📱 Scenario 4: Dormant coordinator wakes up');
    console.log('-' .repeat(50));

    console.log('😴 coordinator-offline waking up and checking Redis...');

    // Check for messages
    const queuedMessages = await this.redisClient.lRange('messages:coordinator:offline', 0, -1);
    if (queuedMessages.length > 0) {
      console.log('📨 Found messages while offline:');
      queuedMessages.forEach((msg, index) => {
        const parsed = JSON.parse(msg);
        console.log(`   ${index + 1}. ${parsed.from}: "${parsed.message}" (${parsed.time})`);
      });
    }

    // Check current system state
    console.log('\n🤖 Current coordinator states in Redis:');
    const allCoordinatorKeys = await this.redisClient.keys('coordinator:*:choice');
    for (const key of allCoordinatorKeys) {
      const coordinatorId = key.split(':')[1];
      const choice = await this.redisClient.get(key);
      const status = await this.redisClient.get(`coordinator:${coordinatorId}:status`);
      console.log(`   ${coordinatorId}: ${choice} (${status})`);
    }

    console.log('\n✅ Dormant coordinator is now fully aware of system state!');

    // Scenario 5: Coordinator responds to messages
    console.log('\n📱 Scenario 5: Dormant coordinator responds to messages');
    console.log('-' .repeat(50));

    // Clear messages after reading them
    await this.redisClient.del('messages:coordinator:offline');
    console.log('🗑️  Cleared processed messages');

    // Update status
    await this.redisClient.setEx('coordinator:offline:status', 300, 'active');
    console.log('✅ Updated status to: active');

    // Publish announcement
    await this.redisClient.publish('coordinator:announcements', JSON.stringify({
      coordinator: 'coordinator-offline',
      action: 'woke_up',
      choice: 'Python',
      timestamp: new Date().toISOString()
    }));
    console.log('📡 Published wake-up announcement to all coordinators\n');

    // Show the magic
    console.log('🎯 THE MAGIC OF REDIS FOR DORMANT COORDINATORS');
    console.log('=' .repeat(60));
    console.log('1. 💾 **Persistent State**: Redis remembers everything even when coordinators are offline');
    console.log('2. 📨 **Message Queuing**: Messages wait in Redis lists for dormant coordinators');
    console.log('3. 🔍 **State Discovery**: Anyone can check Redis for current system state');
    console.log('4. 📡 **Pub/Sub**: Important events are broadcast to all coordinators');
    console.log('5. ⏰ **Timestamps**: Track when coordinators were last active');
    console.log('6. 🔄 **Automatic Cleanup**: Keys expire to prevent stale data\n');

    console.log('💡 **Bottom Line**: Redis acts as a shared memory that never forgets!');
    console.log('   Coordinators can come and go, but Redis always remembers the system state.\n');
  }

  async run() {
    await this.initialize();
    await this.demonstrateDormantCoordinator();
    await this.redisClient.quit();
  }
}

// Run the demo
const demo = new SimpleDormantDemo();
demo.run().catch(console.error);