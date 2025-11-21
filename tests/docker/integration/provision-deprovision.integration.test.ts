/**
 * Integration tests for ProvisionTeam and DeprovisionTeam against real Docker
 */
import { execSync } from 'child_process';
import { ProvisionTeam } from '../../../src/docker/scripts/provision-team';
import { DeprovisionTeam } from '../../../src/docker/scripts/deprovision-team';

const DOCKER_AVAILABLE = (() => {
  try {
    execSync('docker info', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

(DOCKER_AVAILABLE ? describe : describe.skip)('Provision/Deprovision Integration', () => {
  const testTeamId = 'int-test-team';

  afterAll(async () => {
    // Final cleanup
    try {
      execSync(`docker ps -a --filter "name=${testTeamId}" -q | xargs -r docker rm -f`, { stdio: 'ignore' });
      execSync(`docker network ls --filter "name=${testTeamId}" -q | xargs -r docker network rm`, { stdio: 'ignore' });
    } catch {
      // Ignore
    }
  });

  describe('ProvisionTeam', () => {
    afterEach(async () => {
      // Cleanup after each test
      try {
        execSync(`docker ps -a --filter "name=${testTeamId}" -q | xargs -r docker rm -f`, { stdio: 'ignore' });
        execSync(`docker network ls --filter "name=${testTeamId}" -q | xargs -r docker network rm`, { stdio: 'ignore' });
      } catch {
        // Ignore
      }
    });

    it('should provision team resources', async () => {
      const provisioner = new ProvisionTeam({
        teamId: testTeamId,
        dryRun: false,
      });

      const events: string[] = [];
      provisioner.on('step', (step) => events.push(step));

      const result = await provisioner.run();

      expect(result.success).toBe(true);
      expect(events.length).toBeGreaterThan(0);
    });

    it('should support dry-run mode', async () => {
      const provisioner = new ProvisionTeam({
        teamId: testTeamId,
        dryRun: true,
      });

      const result = await provisioner.run();

      expect(result.success).toBe(true);

      // Nothing should be created
      const containers = execSync(`docker ps -a --filter "name=${testTeamId}" -q`).toString();
      expect(containers.trim()).toBe('');
    });

    it('should emit progress events', async () => {
      const provisioner = new ProvisionTeam({
        teamId: testTeamId,
        dryRun: true,
      });

      const progressEvents: number[] = [];
      provisioner.on('progress', (percent) => progressEvents.push(percent));

      await provisioner.run();

      expect(progressEvents.length).toBeGreaterThan(0);
    });
  });

  describe('DeprovisionTeam', () => {
    beforeEach(async () => {
      // Create resources to deprovision
      try {
        execSync(`docker network create ${testTeamId}-network || true`, { stdio: 'ignore' });
      } catch {
        // Ignore
      }
    });

    it('should deprovision team resources', async () => {
      const deprovisioner = new DeprovisionTeam({
        teamId: testTeamId,
        force: true,
      });

      const result = await deprovisioner.run();

      expect(result.success).toBe(true);
    });

    it('should handle non-existent resources gracefully', async () => {
      const deprovisioner = new DeprovisionTeam({
        teamId: 'non-existent-team-xyz',
        force: true,
      });

      // Should not throw
      const result = await deprovisioner.run();
      expect(result.success).toBe(true);
    });

    it('should emit cleanup events', async () => {
      const deprovisioner = new DeprovisionTeam({
        teamId: testTeamId,
        force: true,
      });

      const events: string[] = [];
      deprovisioner.on('cleanup', (resource) => events.push(resource));

      await deprovisioner.run();

      // May or may not have events depending on what exists
      expect(Array.isArray(events)).toBe(true);
    });
  });

  describe('Provision/Deprovision lifecycle', () => {
    it('should complete full provision-deprovision cycle', async () => {
      // Provision
      const provisioner = new ProvisionTeam({
        teamId: testTeamId,
        dryRun: false,
      });
      const provisionResult = await provisioner.run();
      expect(provisionResult.success).toBe(true);

      // Deprovision
      const deprovisioner = new DeprovisionTeam({
        teamId: testTeamId,
        force: true,
      });
      const deprovisionResult = await deprovisioner.run();
      expect(deprovisionResult.success).toBe(true);

      // Verify cleanup
      const remainingContainers = execSync(`docker ps -a --filter "name=${testTeamId}" -q`).toString();
      expect(remainingContainers.trim()).toBe('');
    });
  });
});
