/**
 * Integration tests for ReadOnlyQueryExecutor against real Postgres
 */
import { execSync } from 'child_process';

// Check Docker availability synchronously before importing testcontainers
const isDockerAvailable = (): boolean => {
  try {
    execSync('docker info', { stdio: 'ignore', timeout: 5000 });
    return true;
  } catch {
    return false;
  }
};

const DOCKER_AVAILABLE = isDockerAvailable();

if (DOCKER_AVAILABLE) {
  // Dynamic import to avoid testcontainers initialization when Docker unavailable
  const runTests = async () => {
    const { GenericContainer, Wait } = await import('testcontainers');
    const { ReadOnlyQueryExecutor, executeReadOnlyQuery } = await import(
      '../../../src/docker/skills/database-readonly/query'
    );

    describe('ReadOnlyQueryExecutor Integration', () => {
      let postgresContainer: Awaited<ReturnType<typeof GenericContainer.prototype.start>>;
      let dbHost: string;
      let dbPort: number;

      beforeAll(async () => {
        postgresContainer = await new GenericContainer('postgres:15-alpine')
          .withEnvironment({
            POSTGRES_DB: 'testdb',
            POSTGRES_USER: 'testuser',
            POSTGRES_PASSWORD: 'testpass',
          })
          .withExposedPorts(5432)
          .withWaitStrategy(Wait.forLogMessage(/database system is ready to accept connections/))
          .start();

        dbHost = postgresContainer.getHost();
        dbPort = postgresContainer.getMappedPort(5432);

        // Create test table
        execSync(
          `PGPASSWORD=testpass psql -h ${dbHost} -p ${dbPort} -U testuser -d testdb -c "CREATE TABLE IF NOT EXISTS test_items (id SERIAL PRIMARY KEY, name VARCHAR(100), created_at TIMESTAMP DEFAULT NOW());"`,
          { stdio: 'ignore' }
        );
        execSync(
          `PGPASSWORD=testpass psql -h ${dbHost} -p ${dbPort} -U testuser -d testdb -c "INSERT INTO test_items (name) VALUES ('item1'), ('item2'), ('item3');"`,
          { stdio: 'ignore' }
        );
      }, 90000);

      afterAll(async () => {
        await postgresContainer?.stop();
      });

      describe('ReadOnlyQueryExecutor class', () => {
        it('should execute SELECT queries against real Postgres', async () => {
          const executor = new ReadOnlyQueryExecutor({
            host: dbHost,
            port: dbPort,
            database: 'testdb',
            user: 'testuser',
            password: 'testpass',
          });

          const result = await executor.execute('SELECT * FROM test_items');

          expect(result.success).toBe(true);
          expect(result.rows).toHaveLength(3);
          expect(result.rows[0]).toHaveProperty('name');
        });

        it('should reject write queries', async () => {
          const executor = new ReadOnlyQueryExecutor({
            host: dbHost,
            port: dbPort,
            database: 'testdb',
            user: 'testuser',
            password: 'testpass',
          });

          await expect(
            executor.execute('DELETE FROM test_items WHERE id = 1')
          ).rejects.toThrow();
        });

        it('should handle parameterized queries', async () => {
          const executor = new ReadOnlyQueryExecutor({
            host: dbHost,
            port: dbPort,
            database: 'testdb',
            user: 'testuser',
            password: 'testpass',
          });

          const result = await executor.execute('SELECT * FROM test_items WHERE name = $1', [
            'item1',
          ]);

          expect(result.success).toBe(true);
          expect(result.rows).toHaveLength(1);
          expect(result.rows[0].name).toBe('item1');
        });

        it('should report query execution time', async () => {
          const executor = new ReadOnlyQueryExecutor({
            host: dbHost,
            port: dbPort,
            database: 'testdb',
            user: 'testuser',
            password: 'testpass',
          });

          const result = await executor.execute('SELECT * FROM test_items');

          expect(result.executionTimeMs).toBeGreaterThan(0);
        });
      });

      describe('Service discovery pattern', () => {
        it('should accept postgres as service name', () => {
          const executor = new ReadOnlyQueryExecutor({
            host: 'postgres', // Service name for Docker network
            port: 5432,
            database: 'testdb',
            user: 'testuser',
            password: 'testpass',
          });

          expect(executor).toBeDefined();
        });
      });
    });
  };

  runTests();
} else {
  describe('ReadOnlyQueryExecutor Integration', () => {
    it.skip('Docker not available - skipping integration tests', () => {});
  });
}
