const { startServer, stopServer } = require('./scripts/simple-portal-server.cjs');

beforeAll(async () => {
  // Ensure server is running before tests
  await startServer();
});

afterAll(async () => {
  // Stop server after tests complete
  await stopServer();
});