import Redis from 'ioredis';
import { v4 as uuidv4 } from 'uuid';

export class TestRedisClient {
  private client: Redis;
  private channelPrefix: string;

  constructor(config?: Redis.RedisOptions) {
    this.client = new Redis(config);
    this.channelPrefix = `test-${uuidv4()}:`;
  }

  async publishMessage(channel: string, message: any): Promise<void> {
    await this.client.publish(`${this.channelPrefix}${channel}`, JSON.stringify(message));
  }

  async subscribeToChannel(channel: string, callback: (message: string) => void): Promise<void> {
    const fullChannel = `${this.channelPrefix}${channel}`;
    await this.client.subscribe(fullChannel);
    this.client.on('message', (receivedChannel, message) => {
      if (receivedChannel === fullChannel) {
        callback(JSON.parse(message));
      }
    });
  }

  async cleanup(): Promise<void> {
    await this.client.unsubscribe();
    await this.client.quit();
  }
}

export function generateUniqueId(): string {
  return uuidv4();
}

export function createMockAgent(overrides = {}) {
  return {
    id: generateUniqueId(),
    type: 'mock-agent',
    skills: [],
    state: 'idle',
    ...overrides
  };
}

export async function waitForCondition(
  condition: () => Promise<boolean> | boolean,
  timeout = 5000,
  interval = 100
): Promise<void> {
  const startTime = Date.now();
  while (!(await condition())) {
    if (Date.now() - startTime > timeout) {
      throw new Error('Condition not met within timeout');
    }
    await new Promise(resolve => setTimeout(resolve, interval));
  }
}