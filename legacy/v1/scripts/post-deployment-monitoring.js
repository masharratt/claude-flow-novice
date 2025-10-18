#!/usr/bin/env node

/**
 * Post-Deployment Monitoring Script
 *
 * Tracks NPM downloads, installation success rate, and deployment health
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

console.log('📊 Post-Deployment Monitoring\n');

const packageJson = JSON.parse(
  fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8')
);

const packageName = packageJson.name;
const packageVersion = packageJson.version;

console.log(`Package: ${packageName}@${packageVersion}`);
console.log('═'.repeat(60));

// Monitoring checks
const checks = {
  npmAvailability: async () => {
    console.log('\n🔍 NPM Package Availability');
    console.log('-'.repeat(60));

    try {
      const result = execSync(`npm view ${packageName}@${packageVersion} --json`, {
        encoding: 'utf8',
        stdio: 'pipe'
      });

      const npmInfo = JSON.parse(result);

      console.log('✅ Package is available on NPM');
      console.log(`   Name: ${npmInfo.name}`);
      console.log(`   Version: ${npmInfo.version}`);
      console.log(`   Published: ${new Date(npmInfo.time[npmInfo.version]).toISOString()}`);

      if (npmInfo.dist) {
        console.log(`   Tarball Size: ${(npmInfo.dist.unpackedSize / 1024 / 1024).toFixed(2)}MB`);
      }

      return {
        status: 'success',
        available: true,
        publishedAt: npmInfo.time[npmInfo.version],
        size: npmInfo.dist ? npmInfo.dist.unpackedSize : null
      };
    } catch (error) {
      console.log('❌ Package not yet available on NPM');
      console.log(`   Error: ${error.message}`);

      return {
        status: 'error',
        available: false,
        error: error.message
      };
    }
  },

  downloadStats: async () => {
    console.log('\n📈 Download Statistics');
    console.log('-'.repeat(60));

    try {
      // Get download stats from npm
      const result = execSync(`npm view ${packageName} --json`, {
        encoding: 'utf8',
        stdio: 'pipe'
      });

      const npmInfo = JSON.parse(result);

      // Try to fetch download stats (requires external API)
      try {
        const lastWeekResult = execSync(
          `curl -s https://api.npmjs.org/downloads/point/last-week/${packageName}`,
          { encoding: 'utf8', stdio: 'pipe' }
        );

        const downloadStats = JSON.parse(lastWeekResult);

        console.log('✅ Download statistics retrieved');
        console.log(`   Last Week Downloads: ${downloadStats.downloads || 'N/A'}`);

        return {
          status: 'success',
          lastWeekDownloads: downloadStats.downloads || 0
        };
      } catch (statsError) {
        console.log('⚠️ Download stats not yet available (package may be newly published)');
        return {
          status: 'pending',
          lastWeekDownloads: 0
        };
      }
    } catch (error) {
      console.log('❌ Unable to retrieve download statistics');
      console.log(`   Error: ${error.message}`);

      return {
        status: 'error',
        error: error.message
      };
    }
  },

  installationTest: async () => {
    console.log('\n🧪 Installation Test');
    console.log('-'.repeat(60));

    const testDir = path.join(projectRoot, '.test-install');

    try {
      // Clean up previous test
      if (fs.existsSync(testDir)) {
        fs.rmSync(testDir, { recursive: true, force: true });
      }

      // Create test directory
      fs.mkdirSync(testDir, { recursive: true });

      // Initialize package.json
      execSync('npm init -y', { cwd: testDir, stdio: 'pipe' });

      console.log('Installing package from NPM...');

      // Try to install from NPM
      const installStart = Date.now();
      execSync(`npm install ${packageName}@${packageVersion}`, {
        cwd: testDir,
        stdio: 'pipe',
        timeout: 60000
      });
      const installTime = Date.now() - installStart;

      console.log(`✅ Installation successful (${(installTime / 1000).toFixed(2)}s)`);

      // Verify CLI commands
      try {
        execSync(`npx ${packageName} --help`, {
          cwd: testDir,
          stdio: 'pipe',
          timeout: 10000
        });

        console.log('✅ CLI commands working');

        // Verify package import
        const testScript = `
          const pkg = require('${packageName}');
          console.log('Package loaded successfully');
        `;

        fs.writeFileSync(path.join(testDir, 'test.js'), testScript);
        execSync('node test.js', { cwd: testDir, stdio: 'pipe' });

        console.log('✅ Package import working');

        // Cleanup
        fs.rmSync(testDir, { recursive: true, force: true });

        return {
          status: 'success',
          installTime,
          cliWorking: true,
          importWorking: true
        };
      } catch (verifyError) {
        console.log('⚠️ Package installed but verification failed');
        console.log(`   Error: ${verifyError.message}`);

        return {
          status: 'partial',
          installTime,
          cliWorking: false,
          error: verifyError.message
        };
      }
    } catch (error) {
      console.log('❌ Installation test failed');
      console.log(`   Error: ${error.message}`);

      // Cleanup
      if (fs.existsSync(testDir)) {
        fs.rmSync(testDir, { recursive: true, force: true });
      }

      return {
        status: 'error',
        error: error.message
      };
    }
  },

  healthCheck: async () => {
    console.log('\n🏥 Health Check');
    console.log('-'.repeat(60));

    const healthMetrics = {
      npmRegistry: false,
      githubRelease: false,
      documentationAccessible: false
    };

    // Check NPM registry
    try {
      execSync(`npm view ${packageName}@${packageVersion}`, {
        stdio: 'pipe',
        timeout: 10000
      });
      healthMetrics.npmRegistry = true;
      console.log('✅ NPM Registry: Accessible');
    } catch (error) {
      console.log('❌ NPM Registry: Not accessible');
    }

    // Check GitHub release (if applicable)
    try {
      const repoUrl = packageJson.repository?.url;
      if (repoUrl) {
        const match = repoUrl.match(/github\.com[:/](.+?)(?:\.git)?$/);
        if (match) {
          const repo = match[1];
          const tagName = `v${packageVersion}`;

          // Try to check if release exists
          try {
            execSync(`gh release view ${tagName} -R ${repo}`, {
              stdio: 'pipe',
              timeout: 10000
            });
            healthMetrics.githubRelease = true;
            console.log('✅ GitHub Release: Published');
          } catch (ghError) {
            console.log('⚠️ GitHub Release: Not yet available');
          }
        }
      } else {
        console.log('⚠️ GitHub Release: Repository URL not configured');
      }
    } catch (error) {
      console.log('⚠️ GitHub Release: Unable to verify');
    }

    // Check documentation accessibility
    try {
      const readmePath = path.join(projectRoot, 'README.md');
      if (fs.existsSync(readmePath)) {
        healthMetrics.documentationAccessible = true;
        console.log('✅ Documentation: Accessible');
      } else {
        console.log('⚠️ Documentation: README.md not found');
      }
    } catch (error) {
      console.log('❌ Documentation: Unable to verify');
    }

    const healthScore =
      (healthMetrics.npmRegistry ? 40 : 0) +
      (healthMetrics.githubRelease ? 30 : 0) +
      (healthMetrics.documentationAccessible ? 30 : 0);

    console.log(`\nOverall Health Score: ${healthScore}/100`);

    return {
      status: healthScore >= 70 ? 'healthy' : healthScore >= 40 ? 'degraded' : 'unhealthy',
      score: healthScore,
      metrics: healthMetrics
    };
  }
};

// Execute all monitoring checks
const runMonitoring = async () => {
  const results = {
    timestamp: new Date().toISOString(),
    package: {
      name: packageName,
      version: packageVersion
    },
    checks: {}
  };

  try {
    results.checks.npmAvailability = await checks.npmAvailability();
    results.checks.downloadStats = await checks.downloadStats();
    results.checks.installationTest = await checks.installationTest();
    results.checks.healthCheck = await checks.healthCheck();

    // Calculate overall status
    const criticalChecks = ['npmAvailability', 'installationTest'];
    const criticalPassed = criticalChecks.every(
      check => results.checks[check].status === 'success'
    );

    results.overallStatus = criticalPassed ? 'healthy' : 'degraded';

    // Save report
    const reportDir = path.join(projectRoot, '.claude-flow-novice/monitoring');
    fs.mkdirSync(reportDir, { recursive: true });

    const reportPath = path.join(reportDir, `deployment-${packageVersion}-${Date.now()}.json`);
    fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));

    console.log('\n' + '═'.repeat(60));
    console.log('Monitoring Summary');
    console.log('═'.repeat(60));
    console.log(`Overall Status: ${results.overallStatus.toUpperCase()}`);
    console.log(`Report saved: ${reportPath}`);

    // Exit code based on health
    if (results.overallStatus === 'healthy') {
      console.log('\n✅ Deployment monitoring: All systems healthy\n');
      process.exit(0);
    } else {
      console.log('\n⚠️ Deployment monitoring: Some checks failed\n');
      process.exit(0); // Don't fail the workflow
    }
  } catch (error) {
    console.error('\n❌ Monitoring failed:', error.message);
    results.error = error.message;

    // Save error report
    const reportDir = path.join(projectRoot, '.claude-flow-novice/monitoring');
    fs.mkdirSync(reportDir, { recursive: true });

    const reportPath = path.join(reportDir, `deployment-error-${Date.now()}.json`);
    fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));

    console.log(`Error report saved: ${reportPath}\n`);
    process.exit(0); // Don't fail the workflow
  }
};

// Run monitoring
runMonitoring().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
