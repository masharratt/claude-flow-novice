/**
 * Mock Redis Client for Integration Tests
 *
 * Provides in-memory Redis mock without requiring actual Redis connection.
 */

export interface IMockRedisClient {
  get: jest.Mock;
  set: jest.Mock;
  del: jest.Mock;
  exists: jest.Mock;
  expire: jest.Mock;
  ttl: jest.Mock;
  keys: jest.Mock;
  incr: jest.Mock;
  decr: jest.Mock;
  lpush: jest.Mock;
  rpush: jest.Mock;
  lpop: jest.Mock;
  rpop: jest.Mock;
  lrange: jest.Mock;
  llen: jest.Mock;
  sadd: jest.Mock;
  smembers: jest.Mock;
  sismember: jest.Mock;
  hset: jest.Mock;
  hget: jest.Mock;
  hgetall: jest.Mock;
  hdel: jest.Mock;
  publish: jest.Mock;
  subscribe: jest.Mock;
  unsubscribe: jest.Mock;
  quit: jest.Mock;
  disconnect: jest.Mock;
  ping: jest.Mock;
}

class MockRedisClient implements IMockRedisClient {
  private store: Map<string, any> = new Map();
  private lists: Map<string, any[]> = new Map();
  private sets: Map<string, Set<any>> = new Map();
  private hashes: Map<string, Map<string, any>> = new Map();
  private subscribers: Map<string, Set<Function>> = new Map();

  get = jest.fn((key: string) => {
    return Promise.resolve(this.store.get(key) || null);
  });

  set = jest.fn((key: string, value: any, ...args: any[]) => {
    this.store.set(key, value);
    return Promise.resolve('OK');
  });

  del = jest.fn((...keys: string[]) => {
    let deleted = 0;
    keys.forEach(key => {
      if (this.store.delete(key)) deleted++;
    });
    return Promise.resolve(deleted);
  });

  exists = jest.fn((...keys: string[]) => {
    return Promise.resolve(keys.filter(k => this.store.has(k)).length);
  });

  expire = jest.fn((key: string, seconds: number) => {
    return Promise.resolve(this.store.has(key) ? 1 : 0);
  });

  ttl = jest.fn((key: string) => {
    return Promise.resolve(this.store.has(key) ? -1 : -2);
  });

  keys = jest.fn((pattern: string) => {
    const regex = new RegExp(pattern.replace('*', '.*'));
    return Promise.resolve(
      Array.from(this.store.keys()).filter(k => regex.test(k))
    );
  });

  incr = jest.fn((key: string) => {
    const current = parseInt(this.store.get(key) || '0', 10);
    const newValue = current + 1;
    this.store.set(key, newValue.toString());
    return Promise.resolve(newValue);
  });

  decr = jest.fn((key: string) => {
    const current = parseInt(this.store.get(key) || '0', 10);
    const newValue = current - 1;
    this.store.set(key, newValue.toString());
    return Promise.resolve(newValue);
  });

  lpush = jest.fn((key: string, ...values: any[]) => {
    if (!this.lists.has(key)) this.lists.set(key, []);
    const list = this.lists.get(key)!;
    list.unshift(...values);
    return Promise.resolve(list.length);
  });

  rpush = jest.fn((key: string, ...values: any[]) => {
    if (!this.lists.has(key)) this.lists.set(key, []);
    const list = this.lists.get(key)!;
    list.push(...values);
    return Promise.resolve(list.length);
  });

  lpop = jest.fn((key: string) => {
    const list = this.lists.get(key);
    return Promise.resolve(list ? list.shift() : null);
  });

  rpop = jest.fn((key: string) => {
    const list = this.lists.get(key);
    return Promise.resolve(list ? list.pop() : null);
  });

  lrange = jest.fn((key: string, start: number, stop: number) => {
    const list = this.lists.get(key) || [];
    return Promise.resolve(list.slice(start, stop + 1));
  });

  llen = jest.fn((key: string) => {
    const list = this.lists.get(key) || [];
    return Promise.resolve(list.length);
  });

  sadd = jest.fn((key: string, ...members: any[]) => {
    if (!this.sets.has(key)) this.sets.set(key, new Set());
    const set = this.sets.get(key)!;
    let added = 0;
    members.forEach(m => {
      if (!set.has(m)) {
        set.add(m);
        added++;
      }
    });
    return Promise.resolve(added);
  });

  smembers = jest.fn((key: string) => {
    const set = this.sets.get(key);
    return Promise.resolve(set ? Array.from(set) : []);
  });

  sismember = jest.fn((key: string, member: any) => {
    const set = this.sets.get(key);
    return Promise.resolve(set ? (set.has(member) ? 1 : 0) : 0);
  });

  hset = jest.fn((key: string, field: string, value: any) => {
    if (!this.hashes.has(key)) this.hashes.set(key, new Map());
    const hash = this.hashes.get(key)!;
    const isNew = !hash.has(field);
    hash.set(field, value);
    return Promise.resolve(isNew ? 1 : 0);
  });

  hget = jest.fn((key: string, field: string) => {
    const hash = this.hashes.get(key);
    return Promise.resolve(hash ? hash.get(field) : null);
  });

  hgetall = jest.fn((key: string) => {
    const hash = this.hashes.get(key);
    if (!hash) return Promise.resolve({});
    const obj: Record<string, any> = {};
    hash.forEach((value, key) => {
      obj[key] = value;
    });
    return Promise.resolve(obj);
  });

  hdel = jest.fn((key: string, ...fields: string[]) => {
    const hash = this.hashes.get(key);
    if (!hash) return Promise.resolve(0);
    let deleted = 0;
    fields.forEach(f => {
      if (hash.delete(f)) deleted++;
    });
    return Promise.resolve(deleted);
  });

  publish = jest.fn((channel: string, message: string) => {
    const subs = this.subscribers.get(channel);
    if (subs) {
      subs.forEach(callback => callback(channel, message));
    }
    return Promise.resolve(subs ? subs.size : 0);
  });

  subscribe = jest.fn((channel: string, callback?: Function) => {
    if (!this.subscribers.has(channel)) {
      this.subscribers.set(channel, new Set());
    }
    if (callback) {
      this.subscribers.get(channel)!.add(callback);
    }
    return Promise.resolve('OK');
  });

  unsubscribe = jest.fn((channel: string) => {
    this.subscribers.delete(channel);
    return Promise.resolve('OK');
  });

  quit = jest.fn(() => {
    this.store.clear();
    this.lists.clear();
    this.sets.clear();
    this.hashes.clear();
    this.subscribers.clear();
    return Promise.resolve('OK');
  });

  disconnect = jest.fn(() => {
    return this.quit();
  });

  ping = jest.fn(() => {
    return Promise.resolve('PONG');
  });

  // Helper for tests to access internal state
  _getStore() {
    return this.store;
  }

  _clear() {
    this.store.clear();
    this.lists.clear();
    this.sets.clear();
    this.hashes.clear();
    this.subscribers.clear();
  }
}

export const createMockRedisClient = (): IMockRedisClient => {
  return new MockRedisClient();
};

export const mockRedisClient = new MockRedisClient();
