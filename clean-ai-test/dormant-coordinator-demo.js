#!/usr/bin/env node

/**
 * Dormant Coordinator Demo
 * Shows how coordinators that are "offline" or "dormant" handle messages
 */

import Redis from 'redis';
import readline from 'readline';

class DormantCoordinatorDemo {
  constructor() {
    this.redisClient = null;
    this.coordinators = new Map();
    this.messages = [];
  }

  async initialize() {
    this.redisClient = Redis.createClient({
      url: 'redis://localhost:6379'
    });

    this.redisClient.on('error', (err) => {
      console.error('Redis Client Error:', err);
    });

    await this.redisClient.connect();
    console.log('🔗 Connected to Redis for dormant coordinator demo\n');
  }

  async simulateOfflineCoordinator() {
    console.log('📱 Scenario 1: Coordinator goes offline after announcing\n');

    // Coordinator 1 announces choice and goes "offline"
    await this.redisClient.setEx('coordinator:sleeping:choice', 300, 'Python');
    await this.redisClient.setEx('coordinator:sleeping:status', 300, 'offline');
    await this.redisClient.setEx('coordinator:sleeping:last_seen', 300, Date.now());

    console.log('💤 coordinator-sleeping announced: Python and went offline');
    console.log('📝 Message stored in Redis with 5-minute expiration\n');

    // Show what Redis stored
    const choice = await this.redisClient.get('coordinator:sleeping:choice');
    const status = await this.redisClient.get('coordinator:sleeping:status');
    const lastSeen = await this.redisClient.get('coordinator:sleeping:last_seen');

    console.log('📊 Redis state for sleeping coordinator:');
    console.log(`   Choice: ${choice}`);
    console.log(`   Status: ${status}`);
    console.log(`   Last Seen: ${new Date(parseInt(lastSeen)).toLocaleString()}\n`);
  }

  async simulateActiveCoordinatorChecking() {
    console.log('📱 Scenario 2: Active coordinator checks for sleeping coordinator\n');

    // Active coordinator (coordinator-2) comes online and checks
    const sleepingChoice = await this.redisClient.get('coordinator:sleeping:choice');
    const sleepingStatus = await this.redisClient.get('coordinator:sleeping:status');
    const lastSeen = await this.redisClient.get('coordinator:sleeping:last_seen');

    console.log('🔍 Active coordinator checking Redis...');
    console.log(`   Found sleeping coordinator's choice: ${sleepingChoice}`);
    console.log(`   Status: ${sleepingStatus}`);
    console.log(`   Last seen: ${new Date(parseInt(lastSeen)).toLocaleString()}`);

    // Active coordinator makes decision based on sleeping coordinator's state
    const availableLanguages = ['Java', 'JavaScript', 'Rust', 'Go', 'C++', 'TypeScript'];
    const filteredLanguages = availableLanguages.filter(lang => lang !== sleepingChoice);
    const chosenLanguage = filteredLanguages[Math.floor(Math.random() * filteredLanguages.length)];

    console.log(`✅ Active coordinator chooses: ${chosenLanguage} (avoiding ${sleepingChoice})\n`);

    // Store active coordinator's choice
    await this.redisClient.setEx('coordinator:active:choice', 300, chosenLanguage);
    await this.redisClient.setEx('coordinator:active:status', 300, 'online');
  }

  async simulateCoordinatorWakingUp() {
    console.log('📱 Scenario 3: Sleeping coordinator wakes up and checks messages\n');

    // Simulate time passing
    const currentTime = Date.now();
    const lastSeen = await this.redisClient.get('coordinator:sleeping:last_seen');
    const timeSinceLastSeen = currentTime - parseInt(lastSeen);

    console.log('😴 coordinator-sleeping waking up...');
    console.log(`⏰ Time asleep: ${(timeSinceLastSeen / 1000).toFixed(1)} seconds`);

    // Check if any messages were left while sleeping
    const messagesWhileAsleep = await this.redisClient.lRange('messages:sleeping', 0, -1);

    if (messagesWhileAsleep.length > 0) {
      console.log('📨 Messages received while sleeping:');
      messagesWhileAsleep.forEach((msg, index) => {
        const message = JSON.parse(msg);
        console.log(`   ${index + 1}. From: ${message.from}, Content: ${message.content}, Time: ${new Date(message.timestamp).toLocaleString()}`);
      });
    } else {
      console.log('📨 No direct messages while sleeping');
    }

    // Check what other coordinators are doing
    const activeCoordinators = await this.redisClient.keys('coordinator:*:choice');
    console.log('🤖 Current coordinator states:');

    for (const key of activeCoordinators) {
      const coordinatorId = key.split(':')[1];
      const choice = await this.redisClient.get(key);
      const status = await this.redisClient.get(`coordinator:${coordinatorId}:status`);
      console.log(`   ${coordinatorId}: ${choice} (${status})`);
    }

    console.log('✅ Sleeping coordinator is now aware of all current states\n');
  }

  async simulateMessageQueuing() {
    console.log('📱 Scenario 4: Message queuing for offline coordinators\n');

    // Simulate multiple coordinators trying to contact sleeping coordinator
    const messages = [
      { from: 'coordinator-alpha', content: 'Need Python resource, are you done?', timestamp: Date.now() },
      { from: 'coordinator-beta', content: 'Python resource requested by engineering team', timestamp: Date.now() + 1000 },
      { from: 'coordinator-gamma', content: 'Urgent: Python cluster maintenance in 5 mins', timestamp: Date.now() + 2000 }
    ];

    console.log('📨 Other coordinators leaving messages for sleeping coordinator:');

    for (const message of messages) {
      // Store message in Redis list for sleeping coordinator
      await this.redisClient.lPush('messages:sleeping', JSON.stringify(message));
      console.log(`   📝 ${message.from}: "${message.content}"`);
    }

    // Also set up pub/sub subscription for when coordinator wakes up
    await this.redisClient.publish('coordinator:announcements', JSON.stringify({
      type: 'message_queued',
      target: 'coordinator-sleeping',
      message_count: messages.length,
      timestamp: Date.now()
    }));

    console.log(`📡 Broadcast announcement: ${messages.length} messages queued for sleeping coordinator\n`);
  }

  async demonstratePersistentState() {
    console.log('📱 Scenario 5: Redis maintains state even if coordinators restart\n');

    // Show that Redis maintains coordinator state
    const allCoordinatorData = await this.redisClient.keys('coordinator:*');
    console.log('💾 Redis persistent storage contains:');

    for (const key of allCoordinatorData.sort()) {
      const value = await this.redisClient.get(key);
      const keyParts = key.split(':');

      if (keyParts.length === 3) {
        const [prefix, coordinatorId, dataType] = keyParts;
        let displayValue = value;

        if (dataType === 'last_seen') {
          displayValue = new Date(parseInt(value)).toLocaleString();
        }

        console.log(`   ${coordinatorId} ${dataType}: ${displayValue}`);
      }
    }

    console.log('\n✨ Key insight: Even if all coordinators restart, Redis remembers everything!');
    console.log('   - Language choices are preserved');
    console.log('   - Coordinator status is maintained');
    console.log('   - Messages are queued and waiting');
    console.log('   - Timestamps show when things happened\n');
  }

  async run() {
    await this.initialize();

    console.log('🎭 DORMANT COORDINATOR DEMONSTRATION\n');
    console.log('This demo shows how Redis handles coordinators that go offline or are dormant\n');
    console.log('=' .repeat(70) + '\n');

    await this.simulateOfflineCoordinator();
    await this.simulateActiveCoordinatorChecking();
    await this.simulateMessageQueuing();
    await this.simulateCoordinatorWakingUp();
    await this.demonstratePersistentState();

    console.log('🎯 SUMMARY: How Redis Handles Dormant Coordinators');
    console.log('=' .repeat(50));
    console.log('1. 📱 **Persistent State**: Redis stores coordinator choices and status');
    console.log('2. 📨 **Message Queuing**: Messages are stored in Redis lists for offline coordinators');
    console.log('3. 📡 **Pub/Sub Announcements**: Important events are broadcast to all coordinators');
    console.log('4. 🔍 **State Discovery**: Coordinators can check Redis for current system state');
    console.log('5. ⏰ **Timestamps**: Redis tracks when coordinators were last active');
    console.log('6. 🔄 **Automatic Cleanup**: Redis keys can have expiration times');
    console.log('\n💡 **The Magic**: Redis acts as a shared brain that remembers everything,');
    console.log('   even when individual coordinators are offline or restart!\n');

    await this.redisClient.quit();
  }
}

// Run the demo
const demo = new DormantCoordinatorDemo();
demo.run().catch(console.error);