const io = require('socket.io-client');

describe('WebSocket Events', () => {
  let socket;
  const socketUrl = 'http://localhost:3456';

  beforeEach((done) => {
    socket = io(socketUrl);
    socket.on('connect', () => {
      done();
    });
  });

  afterEach((done) => {
    if (socket.connected) {
      socket.disconnect();
    }
    done();
  });

  it('should connect successfully', (done) => {
    expect(socket.connected).toBe(true);
    done();
  });

  it('should receive agent status update', (done) => {
    socket.on('agent-status', (data) => {
      expect(data).toHaveProperty('agentId');
      expect(data).toHaveProperty('status');
      done();
    });

    // Trigger agent status event
    socket.emit('request-agent-status');
  });

  it('should receive decision event', (done) => {
    socket.on('decision', (data) => {
      expect(data).toHaveProperty('id');
      expect(data).toHaveProperty('type');
      expect(data).toHaveProperty('details');
      done();
    });

    // Trigger decision event
    socket.emit('request-decision');
  });

  it('should handle error event', (done) => {
    socket.on('error', (err) => {
      expect(err).toBeDefined();
      done();
    });

    // Trigger error event (e.g., unauthorized access)
    socket.emit('unauthorized-action');
  });

  it('should support room-based events', (done) => {
    const roomName = 'test-room';

    socket.emit('join-room', roomName);

    socket.on('room-message', (message) => {
      expect(message).toHaveProperty('roomId', roomName);
      expect(message).toHaveProperty('content');
      done();
    });

    // Trigger room message
    socket.emit('send-room-message', { roomId: roomName, content: 'Test message' });
  });
});