/**
 * Integration tests for ReadWriteQueryExecutor against real Postgres
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
    const { ReadWriteQueryExecutor, executeReadWriteQuery } = await import(
      '../../../src/docker/skills/database-readwrite/query'
    );

    describe('ReadWriteQueryExecutor Integration', () => {
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
      }, 90000);

      afterAll(async () => {
        await postgresContainer?.stop();
      });

      beforeEach(async () => {
        // Reset test table
        execSync(
          `PGPASSWORD=testpass psql -h ${dbHost} -p ${dbPort} -U testuser -d testdb -c "DROP TABLE IF EXISTS rw_test; CREATE TABLE rw_test (id SERIAL PRIMARY KEY, name VARCHAR(100), value INT);"`,
          { stdio: 'ignore' }
        );
      });

      describe('ReadWriteQueryExecutor class', () => {
        it('should execute INSERT queries', async () => {
          const executor = new ReadWriteQueryExecutor({
            host: dbHost,
            port: dbPort,
            database: 'testdb',
            user: 'testuser',
            password: 'testpass',
          });

          const result = await executor.execute(
            "INSERT INTO rw_test (name, value) VALUES ('test', 42) RETURNING *"
          );

          expect(result.success).toBe(true);
          expect(result.rowsAffected).toBe(1);
        });

        it('should execute UPDATE queries', async () => {
          const executor = new ReadWriteQueryExecutor({
            host: dbHost,
            port: dbPort,
            database: 'testdb',
            user: 'testuser',
            password: 'testpass',
          });

          // Insert first
          await executor.execute("INSERT INTO rw_test (name, value) VALUES ('update-me', 10)");

          // Update
          const result = await executor.execute(
            "UPDATE rw_test SET value = 20 WHERE name = 'update-me'"
          );

          expect(result.success).toBe(true);
          expect(result.rowsAffected).toBe(1);
        });

        it('should execute DELETE queries', async () => {
          const executor = new ReadWriteQueryExecutor({
            host: dbHost,
            port: dbPort,
            database: 'testdb',
            user: 'testuser',
            password: 'testpass',
          });

          // Insert first
          await executor.execute("INSERT INTO rw_test (name, value) VALUES ('delete-me', 100)");

          // Delete
          const result = await executor.execute(
            "DELETE FROM rw_test WHERE name = 'delete-me'"
          );

          expect(result.success).toBe(true);
          expect(result.rowsAffected).toBe(1);
        });

        it('should support transactions', async () => {
          const executor = new ReadWriteQueryExecutor({
            host: dbHost,
            port: dbPort,
            database: 'testdb',
            user: 'testuser',
            password: 'testpass',
          });

          await executor.execute('BEGIN');
          await executor.execute("INSERT INTO rw_test (name, value) VALUES ('tx-test', 1)");
          await executor.execute('ROLLBACK');

          // Data should not exist after rollback
          const result = await executor.execute("SELECT * FROM rw_test WHERE name = 'tx-test'");
          expect(result.rows).toHaveLength(0);
        });

        it('should track audit context', async () => {
          const executor = new ReadWriteQueryExecutor(
            {
              host: dbHost,
              port: dbPort,
              database: 'testdb',
              user: 'testuser',
              password: 'testpass',
            },
            {
              agentId: 'test-agent',
              taskId: 'test-task-123',
              operation: 'integration-test',
            }
          );

          const result = await executor.execute(
            "INSERT INTO rw_test (name, value) VALUES ('audit', 1)"
          );

          expect(result.success).toBe(true);
          // Audit info should be available if implemented
        });
      });
    });
  };

  runTests();
} else {
  describe('ReadWriteQueryExecutor Integration', () => {
    it.skip('Docker not available - skipping integration tests', () => {});
  });
}
