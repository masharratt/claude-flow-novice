/**
 * /dependency-recommendations slash command
 * Analyzes dependencies and provides update recommendations with explanations
 * Integrates with security scanning and performance optimization
 */

const fs = require('fs').promises;
const path = require('path');
const { execSync } = require('child_process');

class DependencyRecommendationEngine {
  constructor() {
    this.packageJson = null;
    this.outdatedPackages = new Map();
    this.securityIssues = [];
    this.performanceRecommendations = [];
  }

  async analyzeProject(projectPath = process.cwd()) {
    try {
      // Load package.json
      this.packageJson = await this.loadPackageJson(projectPath);
      if (!this.packageJson) {
        throw new Error('No package.json found in current directory');
      }

      // Analyze different aspects
      const analysis = {
        outdated: await this.checkOutdatedPackages(projectPath),
        security: await this.checkSecurityIssues(projectPath),
        performance: await this.analyzePerformanceImpact(),
        alternatives: await this.suggestAlternatives(),
        bundleSize: await this.analyzeBundleSize(),
        duplicates: await this.findDuplicateDependencies()
      };

      return analysis;
    } catch (error) {
      throw new Error(`Failed to analyze project: ${error.message}`);
    }
  }

  async loadPackageJson(projectPath) {
    try {
      const content = await fs.readFile(path.join(projectPath, 'package.json'), 'utf8');
      return JSON.parse(content);
    } catch (error) {
      return null;
    }
  }

  async checkOutdatedPackages(projectPath) {
    try {
      // Use npm outdated to check for updates
      const output = execSync('npm outdated --json', {
        cwd: projectPath,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'ignore'] // Suppress stderr
      });

      const outdated = JSON.parse(output || '{}');
      const recommendations = [];

      Object.entries(outdated).forEach(([packageName, info]) => {
        const recommendation = this.createUpdateRecommendation(packageName, info);
        recommendations.push(recommendation);
      });

      return recommendations;
    } catch (error) {
      // npm outdated exits with code 1 when packages are outdated
      // Try to parse the output anyway
      try {
        const output = execSync('npm outdated --json', {
          cwd: projectPath,
          encoding: 'utf8',
          stdio: ['pipe', 'pipe', 'ignore']
        });
        return JSON.parse(output || '[]');
      } catch (e) {
        return []; // No outdated packages or npm not available
      }
    }
  }

  createUpdateRecommendation(packageName, info) {
    const currentVersion = info.current;
    const wantedVersion = info.wanted;
    const latestVersion = info.latest;

    // Determine update type
    const updateType = this.getUpdateType(currentVersion, wantedVersion, latestVersion);
    const risk = this.assessUpdateRisk(packageName, updateType, currentVersion, latestVersion);

    return {
      package: packageName,
      current: currentVersion,
      wanted: wantedVersion,
      latest: latestVersion,
      updateType,
      risk,
      recommendation: this.getUpdateRecommendation(updateType, risk),
      changes: this.getVersionChanges(packageName, currentVersion, latestVersion),
      command: this.getUpdateCommand(packageName, updateType, risk)
    };
  }

  getUpdateType(current, wanted, latest) {
    if (current === latest) return 'none';
    if (current === wanted) return 'major';

    const currentParts = current.split('.').map(Number);
    const wantedParts = wanted.split('.').map(Number);
    const latestParts = latest.split('.').map(Number);

    if (currentParts[0] !== latestParts[0]) return 'major';
    if (currentParts[1] !== latestParts[1]) return 'minor';
    return 'patch';
  }

  assessUpdateRisk(packageName, updateType, current, latest) {
    // High-risk packages that often have breaking changes
    const highRiskPackages = [
      'react', 'vue', 'angular', 'webpack', 'babel', 'typescript',
      'eslint', 'jest', 'next', 'nuxt', 'express'
    ];

    if (updateType === 'major') {
      return highRiskPackages.includes(packageName) ? 'high' : 'medium';
    }
    if (updateType === 'minor') {
      return highRiskPackages.includes(packageName) ? 'medium' : 'low';
    }
    return 'low';
  }

  getUpdateRecommendation(updateType, risk) {
    if (updateType === 'patch') return 'recommended';
    if (updateType === 'minor' && risk === 'low') return 'recommended';
    if (updateType === 'minor' && risk === 'medium') return 'review';
    if (updateType === 'major') return 'careful-review';
    return 'optional';
  }

  getVersionChanges(packageName, current, latest) {
    // This would ideally fetch changelog data from npm or GitHub
    // For now, provide general guidance based on package type
    const packageTypes = {
      react: 'UI framework - check for component API changes',
      express: 'Web framework - review middleware and routing changes',
      webpack: 'Bundler - configuration format may have changed',
      typescript: 'Language - new syntax features and stricter checking',
      eslint: 'Linter - new rules may require code updates',
      jest: 'Testing - matcher APIs and configuration changes'
    };

    return packageTypes[packageName] || 'Review changelog for breaking changes';
  }

  getUpdateCommand(packageName, updateType, risk) {
    if (updateType === 'patch' || (updateType === 'minor' && risk === 'low')) {
      return `npm update ${packageName}`;
    }
    return `npm install ${packageName}@latest`;
  }

  async checkSecurityIssues(projectPath) {
    try {
      const output = execSync('npm audit --json', {
        cwd: projectPath,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'ignore']
      });

      const auditResult = JSON.parse(output);
      const vulnerabilities = [];

      if (auditResult.vulnerabilities) {
        Object.entries(auditResult.vulnerabilities).forEach(([packageName, vuln]) => {
          vulnerabilities.push({
            package: packageName,
            severity: vuln.severity,
            title: vuln.title,
            overview: vuln.overview,
            recommendation: vuln.recommendation,
            url: vuln.url,
            fixAvailable: vuln.fixAvailable
          });
        });
      }

      return vulnerabilities;
    } catch (error) {
      return []; // No security issues or npm audit not available
    }
  }

  async analyzePerformanceImpact() {
    if (!this.packageJson) return [];

    const recommendations = [];
    const dependencies = {
      ...this.packageJson.dependencies,
      ...this.packageJson.devDependencies
    };

    // Check for heavy packages with lighter alternatives
    const heavyPackages = {
      lodash: {
        alternative: 'lodash-es (tree-shakable) or native ES6 methods',
        reason: 'Reduce bundle size by 50-70%',
        impact: 'high'
      },
      moment: {
        alternative: 'date-fns or dayjs',
        reason: 'Significantly smaller bundle size',
        impact: 'high'
      },
      jquery: {
        alternative: 'Native DOM APIs or framework-specific solutions',
        reason: 'Remove unnecessary dependency',
        impact: 'medium'
      },
      'core-js': {
        alternative: 'Targeted polyfills or modern browsers only',
        reason: 'Reduce polyfill overhead',
        impact: 'medium'
      }
    };

    Object.keys(dependencies).forEach(dep => {
      if (heavyPackages[dep]) {
        recommendations.push({
          package: dep,
          type: 'alternative',
          ...heavyPackages[dep]
        });
      }
    });

    // Check for duplicate functionality
    const duplicateChecks = [
      {
        packages: ['axios', 'fetch', 'node-fetch'],
        recommendation: 'Consider using only one HTTP client library'
      },
      {
        packages: ['lodash', 'underscore', 'ramda'],
        recommendation: 'Multiple utility libraries detected - consider consolidating'
      },
      {
        packages: ['jest', 'mocha', 'jasmine'],
        recommendation: 'Multiple testing frameworks detected'
      }
    ];

    duplicateChecks.forEach(check => {
      const found = check.packages.filter(pkg => dependencies[pkg]);
      if (found.length > 1) {
        recommendations.push({
          type: 'duplicate',
          packages: found,
          recommendation: check.recommendation,
          impact: 'medium'
        });
      }
    });

    return recommendations;
  }

  async suggestAlternatives() {
    if (!this.packageJson) return [];

    const alternatives = [];
    const dependencies = {
      ...this.packageJson.dependencies,
      ...this.packageJson.devDependencies
    };

    // Modern alternatives for older packages
    const modernAlternatives = {
      'node-sass': {
        alternative: 'sass (Dart Sass)',
        reason: 'Better performance and active development',
        migration: 'npm uninstall node-sass && npm install sass'
      },
      'babel-preset-env': {
        alternative: '@babel/preset-env',
        reason: 'Modern Babel preset with better browser targeting',
        migration: 'Update .babelrc to use @babel/preset-env'
      },
      'request': {
        alternative: 'axios or native fetch',
        reason: 'Request is deprecated',
        migration: 'Replace with axios for Node.js or fetch for browsers'
      }
    };

    Object.keys(dependencies).forEach(dep => {
      if (modernAlternatives[dep]) {
        alternatives.push({
          package: dep,
          ...modernAlternatives[dep]
        });
      }
    });

    return alternatives;
  }

  async analyzeBundleSize() {
    if (!this.packageJson) return [];

    const suggestions = [];
    const dependencies = this.packageJson.dependencies || {};

    // Packages known to be large
    const largePackages = [
      'lodash', 'moment', 'bootstrap', 'material-ui',
      'antd', 'react-router', 'styled-components'
    ];

    largePackages.forEach(pkg => {
      if (dependencies[pkg]) {
        suggestions.push({
          package: pkg,
          suggestion: this.getBundleSizeSuggestion(pkg),
          impact: 'bundle-size'
        });
      }
    });

    return suggestions;
  }

  getBundleSizeSuggestion(packageName) {
    const suggestions = {
      lodash: 'Use lodash-es for tree shaking or import specific functions',
      moment: 'Consider date-fns or dayjs for smaller bundle size',
      bootstrap: 'Import only needed components or use CSS-only version',
      'material-ui': 'Use tree shaking imports: import Button from "@mui/material/Button"',
      antd: 'Use babel-plugin-import for automatic tree shaking',
      'react-router': 'Code split routes for better performance',
      'styled-components': 'Consider CSS modules or Emotion for smaller runtime'
    };

    return suggestions[packageName] || 'Consider if this package is necessary for your use case';
  }

  async findDuplicateDependencies() {
    if (!this.packageJson) return [];

    const dependencies = this.packageJson.dependencies || {};
    const devDependencies = this.packageJson.devDependencies || {};

    const duplicates = [];
    const allDeps = { ...dependencies, ...devDependencies };

    // Find packages that might be duplicated
    Object.keys(allDeps).forEach(dep => {
      if (dependencies[dep] && devDependencies[dep]) {
        duplicates.push({
          package: dep,
          issue: 'Listed in both dependencies and devDependencies',
          recommendation: 'Choose appropriate section based on usage'
        });
      }
    });

    return duplicates;
  }

  formatRecommendations(analysis) {
    let output = `
# 📦 Dependency Recommendations

`;

    // Security Issues (highest priority)
    if (analysis.security.length > 0) {
      output += `## 🚨 Security Issues (${analysis.security.length})\n\n`;
      analysis.security.forEach(issue => {
        const severityIcon = this.getSeverityIcon(issue.severity);
        output += `### ${severityIcon} ${issue.package}\n`;
        output += `**Severity:** ${issue.severity.toUpperCase()}\n`;
        output += `**Issue:** ${issue.title}\n`;
        if (issue.fixAvailable) {
          output += `**Fix:** \`npm audit fix\`\n`;
        }
        output += `**More info:** [${issue.url}](${issue.url})\n\n`;
      });
      output += `**Quick fix:** Run \`npm audit fix\` to automatically fix issues.\n\n---\n\n`;
    }

    // Outdated Packages
    if (analysis.outdated.length > 0) {
      output += `## 📅 Outdated Packages (${analysis.outdated.length})\n\n`;

      const grouped = this.groupByRecommendation(analysis.outdated);

      Object.entries(grouped).forEach(([recommendation, packages]) => {
        const icon = this.getRecommendationIcon(recommendation);
        output += `### ${icon} ${this.getRecommendationTitle(recommendation)}\n\n`;

        packages.forEach(pkg => {
          output += `**${pkg.package}**: ${pkg.current} → ${pkg.latest} (${pkg.updateType})\n`;
          output += `- Risk: ${pkg.risk}\n`;
          output += `- Command: \`${pkg.command}\`\n`;
          output += `- Changes: ${pkg.changes}\n\n`;
        });

        output += `---\n\n`;
      });
    }

    // Performance Recommendations
    if (analysis.performance.length > 0) {
      output += `## ⚡ Performance Optimizations (${analysis.performance.length})\n\n`;

      analysis.performance.forEach(rec => {
        if (rec.type === 'alternative') {
          output += `### 🔄 Replace ${rec.package}\n`;
          output += `**Alternative:** ${rec.alternative}\n`;
          output += `**Benefit:** ${rec.reason}\n`;
          output += `**Impact:** ${rec.impact}\n\n`;
        } else if (rec.type === 'duplicate') {
          output += `### ⚠️ Duplicate Dependencies\n`;
          output += `**Packages:** ${rec.packages.join(', ')}\n`;
          output += `**Recommendation:** ${rec.recommendation}\n\n`;
        }
      });

      output += `---\n\n`;
    }

    // Bundle Size Optimizations
    if (analysis.bundleSize.length > 0) {
      output += `## 📊 Bundle Size Optimizations (${analysis.bundleSize.length})\n\n`;

      analysis.bundleSize.forEach(suggestion => {
        output += `### 📦 ${suggestion.package}\n`;
        output += `${suggestion.suggestion}\n\n`;
      });

      output += `---\n\n`;
    }

    // Modern Alternatives
    if (analysis.alternatives.length > 0) {
      output += `## 🆕 Modern Alternatives (${analysis.alternatives.length})\n\n`;

      analysis.alternatives.forEach(alt => {
        output += `### 🔄 ${alt.package}\n`;
        output += `**Modern Alternative:** ${alt.alternative}\n`;
        output += `**Reason:** ${alt.reason}\n`;
        output += `**Migration:** ${alt.migration}\n\n`;
      });

      output += `---\n\n`;
    }

    // Summary
    const totalIssues = analysis.security.length + analysis.outdated.length +
                       analysis.performance.length + analysis.bundleSize.length;

    if (totalIssues === 0) {
      output += `## 🎉 All Good!\n\nYour dependencies are up to date and secure. Great job! 👏\n`;
    } else {
      output += `## 📋 Summary\n\n`;
      output += `- **Security Issues:** ${analysis.security.length}\n`;
      output += `- **Outdated Packages:** ${analysis.outdated.length}\n`;
      output += `- **Performance Opportunities:** ${analysis.performance.length}\n`;
      output += `- **Bundle Size Optimizations:** ${analysis.bundleSize.length}\n\n`;

      output += `**Next Steps:**\n`;
      output += `1. Fix security issues first: \`npm audit fix\`\n`;
      output += `2. Update low-risk packages: \`npm update\`\n`;
      output += `3. Review major updates carefully\n`;
      output += `4. Consider performance optimizations\n`;
    }

    return output;
  }

  groupByRecommendation(outdated) {
    return outdated.reduce((acc, pkg) => {
      if (!acc[pkg.recommendation]) acc[pkg.recommendation] = [];
      acc[pkg.recommendation].push(pkg);
      return acc;
    }, {});
  }

  getSeverityIcon(severity) {
    const icons = {
      critical: '🔴',
      high: '🟠',
      moderate: '🟡',
      low: '🟢',
      info: 'ℹ️'
    };
    return icons[severity] || '⚪';
  }

  getRecommendationIcon(recommendation) {
    const icons = {
      recommended: '✅',
      review: '⚠️',
      'careful-review': '🔴',
      optional: '💡'
    };
    return icons[recommendation] || '📦';
  }

  getRecommendationTitle(recommendation) {
    const titles = {
      recommended: 'Safe to Update',
      review: 'Review Before Updating',
      'careful-review': 'Major Updates - Careful Review Required',
      optional: 'Optional Updates'
    };
    return titles[recommendation] || 'Updates Available';
  }
}

module.exports = async function dependencyRecommendations() {
  const engine = new DependencyRecommendationEngine();

  try {
    console.log('🔍 Analyzing dependencies...\n');

    const analysis = await engine.analyzeProject();
    const formattedOutput = engine.formatRecommendations(analysis);

    console.log(formattedOutput);

    return {
      success: true,
      securityIssues: analysis.security.length,
      outdatedPackages: analysis.outdated.length,
      performanceOpportunities: analysis.performance.length,
      analysis
    };
  } catch (error) {
    console.error('❌ Error analyzing dependencies:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
};