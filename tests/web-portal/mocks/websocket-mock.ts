/**
 * @file WebSocket Mock Implementation
 * @description Mock WebSocket and WebSocket Server for testing
 */

import { EventEmitter } from 'events';

export interface MockWebSocket extends EventEmitter {
  id: string;
  readyState: number;
  send: jest.Mock;
  close: jest.Mock;
  ping: jest.Mock;
  pong: jest.Mock;
  terminate: jest.Mock;
}

export interface MockWebSocketServer extends EventEmitter {
  clients: Set<MockWebSocket>;
  close: jest.Mock;
  handleUpgrade: jest.Mock;
}

// WebSocket readyState constants
const CONNECTING = 0;
const OPEN = 1;
const CLOSING = 2;
const CLOSED = 3;

/**
 * Creates a mock WebSocket client for testing
 */
export function createMockWebSocket(id?: string): MockWebSocket {
  const mockWs = new EventEmitter() as MockWebSocket;

  mockWs.id = id || `ws-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  mockWs.readyState = OPEN;

  // Mock WebSocket methods
  mockWs.send = jest.fn().mockImplementation((data: string | Buffer) => {
    // Simulate successful send
    return undefined;
  });

  mockWs.close = jest.fn().mockImplementation((code?: number, reason?: string) => {
    mockWs.readyState = CLOSING;
    setTimeout(() => {
      mockWs.readyState = CLOSED;
      mockWs.emit('close', code || 1000, reason || 'Normal closure');
    }, 10);
  });

  mockWs.ping = jest.fn().mockImplementation((data?: Buffer) => {
    // Simulate ping
    setTimeout(() => {
      mockWs.emit('pong', data);
    }, 5);
  });

  mockWs.pong = jest.fn().mockImplementation((data?: Buffer) => {
    // Simulate pong response
    return undefined;
  });

  mockWs.terminate = jest.fn().mockImplementation(() => {
    mockWs.readyState = CLOSED;
    mockWs.emit('close', 1006, 'Terminated');
  });

  return mockWs;
}

/**
 * Creates a mock WebSocket server for testing
 */
export function createMockWebSocketServer(): MockWebSocketServer {
  const mockServer = new EventEmitter() as MockWebSocketServer;

  mockServer.clients = new Set<MockWebSocket>();

  mockServer.close = jest.fn().mockImplementation((callback?: () => void) => {
    // Close all client connections
    mockServer.clients.forEach(client => {
      client.close(1001, 'Server shutdown');
    });
    mockServer.clients.clear();

    // Simulate server close
    setTimeout(() => {
      mockServer.emit('close');
      if (callback) callback();
    }, 10);
  });

  mockServer.handleUpgrade = jest.fn().mockImplementation(
    (request: any, socket: any, head: Buffer, callback: (ws: MockWebSocket) => void) => {
      const client = createMockWebSocket();
      mockServer.clients.add(client);

      // Set up client event handlers
      client.on('close', () => {
        mockServer.clients.delete(client);
      });

      setTimeout(() => {
        callback(client);
        mockServer.emit('connection', client, request);
      }, 5);
    }
  );

  return mockServer;
}

/**
 * Mock WebSocket client that can simulate various scenarios
 */
export class MockWebSocketClient extends EventEmitter implements MockWebSocket {
  public id: string;
  public readyState: number;
  public send: jest.Mock;
  public close: jest.Mock;
  public ping: jest.Mock;
  public pong: jest.Mock;
  public terminate: jest.Mock;

  private messageQueue: string[] = [];
  private latency: number = 0;

  constructor(id?: string, options: { latency?: number } = {}) {
    super();

    this.id = id || `mock-ws-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.readyState = OPEN;
    this.latency = options.latency || 0;

    this.send = jest.fn().mockImplementation((data: string | Buffer) => {
      return this.simulateSend(data);
    });

    this.close = jest.fn().mockImplementation((code?: number, reason?: string) => {
      return this.simulateClose(code, reason);
    });

    this.ping = jest.fn().mockImplementation((data?: Buffer) => {
      return this.simulatePing(data);
    });

    this.pong = jest.fn().mockImplementation((data?: Buffer) => {
      return this.simulatePong(data);
    });

    this.terminate = jest.fn().mockImplementation(() => {
      return this.simulateTerminate();
    });
  }

  /**
   * Simulate sending a message with optional latency
   */
  private simulateSend(data: string | Buffer): void {
    if (this.readyState !== OPEN) {
      throw new Error('WebSocket is not open');
    }

    const message = typeof data === 'string' ? data : data.toString();

    if (this.latency > 0) {
      setTimeout(() => {
        this.messageQueue.push(message);
        this.emit('message_sent', message);
      }, this.latency);
    } else {
      this.messageQueue.push(message);
      this.emit('message_sent', message);
    }
  }

  /**
   * Simulate receiving a message (for testing incoming messages)
   */
  public simulateReceive(data: string | Buffer): void {
    if (this.readyState !== OPEN) {
      return;
    }

    const message = typeof data === 'string' ? data : data.toString();

    if (this.latency > 0) {
      setTimeout(() => {
        this.emit('message', message);
      }, this.latency);
    } else {
      this.emit('message', message);
    }
  }

  /**
   * Simulate WebSocket close
   */
  private simulateClose(code?: number, reason?: string): void {
    if (this.readyState === CLOSED) {
      return;
    }

    this.readyState = CLOSING;

    setTimeout(() => {
      this.readyState = CLOSED;
      this.emit('close', code || 1000, reason || 'Normal closure');
    }, 10);
  }

  /**
   * Simulate WebSocket ping
   */
  private simulatePing(data?: Buffer): void {
    if (this.readyState !== OPEN) {
      return;
    }

    setTimeout(() => {
      this.emit('ping', data);
      // Auto-respond with pong
      this.emit('pong', data);
    }, this.latency || 5);
  }

  /**
   * Simulate WebSocket pong
   */
  private simulatePong(data?: Buffer): void {
    if (this.readyState !== OPEN) {
      return;
    }

    setTimeout(() => {
      this.emit('pong', data);
    }, this.latency || 5);
  }

  /**
   * Simulate WebSocket termination
   */
  private simulateTerminate(): void {
    this.readyState = CLOSED;
    this.emit('close', 1006, 'Connection terminated');
  }

  /**
   * Simulate connection error
   */
  public simulateError(error: Error): void {
    this.emit('error', error);
    this.simulateClose(1006, 'Connection error');
  }

  /**
   * Get all messages sent by this client
   */
  public getSentMessages(): string[] {
    return [...this.messageQueue];
  }

  /**
   * Clear sent message history
   */
  public clearSentMessages(): void {
    this.messageQueue = [];
  }

  /**
   * Simulate network issues
   */
  public simulateNetworkIssue(type: 'timeout' | 'disconnect' | 'slow'): void {
    switch (type) {
      case 'timeout':
        this.simulateError(new Error('Connection timeout'));
        break;
      case 'disconnect':
        this.simulateClose(1006, 'Network disconnect');
        break;
      case 'slow':
        this.latency = 5000; // 5 second latency
        break;
    }
  }
}

/**
 * Mock WebSocket server that can simulate various server scenarios
 */
export class MockWebSocketServer extends EventEmitter {
  public clients: Set<MockWebSocketClient>;
  public close: jest.Mock;
  public handleUpgrade: jest.Mock;

  private port?: number;
  private isListening: boolean = false;

  constructor(options: { port?: number } = {}) {
    super();

    this.clients = new Set<MockWebSocketClient>();
    this.port = options.port;

    this.close = jest.fn().mockImplementation((callback?: () => void) => {
      return this.simulateClose(callback);
    });

    this.handleUpgrade = jest.fn().mockImplementation(
      (request: any, socket: any, head: Buffer, callback: (ws: MockWebSocketClient) => void) => {
        return this.simulateUpgrade(request, socket, head, callback);
      }
    );
  }

  /**
   * Simulate client connection
   */
  public simulateConnection(clientId?: string): MockWebSocketClient {
    const client = new MockWebSocketClient(clientId);

    this.clients.add(client);

    client.on('close', () => {
      this.clients.delete(client);
    });

    // Emit connection event
    setTimeout(() => {
      this.emit('connection', client);
    }, 5);

    return client;
  }

  /**
   * Simulate server upgrade (WebSocket handshake)
   */
  private simulateUpgrade(
    request: any,
    socket: any,
    head: Buffer,
    callback: (ws: MockWebSocketClient) => void
  ): void {
    const client = this.simulateConnection();

    setTimeout(() => {
      callback(client);
    }, 10);
  }

  /**
   * Simulate server close
   */
  private simulateClose(callback?: () => void): void {
    // Close all client connections
    this.clients.forEach(client => {
      client.close(1001, 'Server shutdown');
    });

    this.clients.clear();
    this.isListening = false;

    setTimeout(() => {
      this.emit('close');
      if (callback) callback();
    }, 10);
  }

  /**
   * Broadcast message to all connected clients
   */
  public broadcast(data: string | Buffer): void {
    const message = typeof data === 'string' ? data : data.toString();

    this.clients.forEach(client => {
      if (client.readyState === OPEN) {
        client.simulateReceive(message);
      }
    });
  }

  /**
   * Simulate server error
   */
  public simulateServerError(error: Error): void {
    this.emit('error', error);
  }

  /**
   * Get all connected clients
   */
  public getConnectedClients(): MockWebSocketClient[] {
    return Array.from(this.clients).filter(client => client.readyState === OPEN);
  }

  /**
   * Simulate server resource exhaustion
   */
  public simulateResourceExhaustion(): void {
    // Refuse new connections
    this.handleUpgrade = jest.fn().mockImplementation((request, socket, head, callback) => {
      const error = new Error('Server resource exhaustion');
      setTimeout(() => socket.emit('error', error), 5);
    });

    this.emit('error', new Error('Server overloaded'));
  }
}

// Export constants for testing
export const WebSocketReadyState = {
  CONNECTING,
  OPEN,
  CLOSING,
  CLOSED
};