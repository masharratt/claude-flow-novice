#!/usr/bin/env node

/**
 * Smart Dependency Analyzer
 * Advanced dependency analysis with progressive validation and agent coordination
 */

const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);

class SmartDependencyAnalyzer {
    constructor() {
        this.config = this.loadConfig();
        this.dependencyCache = new Map();
        this.validationQueue = [];
        this.agentTasks = [];
    }

    loadConfig() {
        try {
            const configPath = path.join(process.cwd(), 'config', 'hooks', 'pipeline-config.json');
            return JSON.parse(fs.readFileSync(configPath, 'utf8'));
        } catch (error) {
            return this.getDefaultConfig();
        }
    }

    getDefaultConfig() {
        return {
            progressiveValidation: {
                enabled: true,
                completenessThresholds: {
                    syntax: 0.0,
                    interface: 0.3,
                    integration: 0.7,
                    full: 0.9
                }
            },
            agentSpawning: {
                missingDependencyThreshold: 0.3,
                testFailureThreshold: 3,
                securityIssueThreshold: 1,
                spawnAgentTypes: {
                    dependencies: "coder",
                    tests: "tester",
                    security: "reviewer",
                    documentation: "api-docs"
                }
            }
        };
    }

    async analyzeFile(filePath) {
        const language = this.detectLanguage(filePath);
        const content = fs.readFileSync(filePath, 'utf8');

        console.log(`\n🔍 DEPENDENCY ANALYSIS FOR: ${path.basename(filePath)}`);
        console.log(`📋 Language: ${language.toUpperCase()}`);

        const analysis = {
            file: filePath,
            language,
            dependencies: await this.extractDependencies(content, language, filePath),
            exports: await this.extractExports(content, language),
            complexity: this.calculateComplexity(content, language),
            timestamp: new Date().toISOString()
        };

        // Check dependency existence
        await this.validateDependencies(analysis);

        // Determine validation tier
        const tier = this.determineValidationTier(analysis);
        analysis.validationTier = tier;

        // Generate recommendations
        analysis.recommendations = await this.generateRecommendations(analysis);

        // Spawn agents if needed
        if (analysis.dependencies.missing.length > 0) {
            analysis.agentTasks = await this.planAgentTasks(analysis);
        }

        this.printAnalysisReport(analysis);
        return analysis;
    }

    detectLanguage(filePath) {
        const ext = path.extname(filePath).toLowerCase();
        const languageMap = {
            '.js': 'javascript',
            '.jsx': 'javascript',
            '.ts': 'typescript',
            '.tsx': 'typescript',
            '.py': 'python',
            '.rs': 'rust',
            '.go': 'go',
            '.java': 'java',
            '.cpp': 'cpp',
            '.c': 'c',
            '.php': 'php',
            '.rb': 'ruby',
            '.cs': 'csharp'
        };
        return languageMap[ext] || 'unknown';
    }

    async extractDependencies(content, language, filePath) {
        const dependencies = {
            imports: [],
            internal: [],
            external: [],
            missing: [],
            circular: []
        };

        switch (language) {
            case 'javascript':
            case 'typescript':
                dependencies.imports = this.extractJSImports(content);
                break;
            case 'python':
                dependencies.imports = this.extractPythonImports(content);
                break;
            case 'rust':
                dependencies.imports = this.extractRustUses(content);
                break;
            case 'go':
                dependencies.imports = this.extractGoImports(content);
                break;
        }

        // Categorize dependencies
        for (const dep of dependencies.imports) {
            if (this.isInternalDependency(dep, filePath)) {
                dependencies.internal.push(dep);
                if (!(await this.dependencyExists(dep, language, filePath))) {
                    dependencies.missing.push(dep);
                }
            } else {
                dependencies.external.push(dep);
            }
        }

        // Check for circular dependencies
        dependencies.circular = await this.detectCircularDependencies(filePath, dependencies.internal);

        return dependencies;
    }

    extractJSImports(content) {
        const patterns = [
            /import\s+.*?\s+from\s+['"`]([^'"`]+)['"`]/g,
            /import\s+['"`]([^'"`]+)['"`]/g,
            /require\(['"`]([^'"`]+)['"`]\)/g,
            /import\(['"`]([^'"`]+)['"`]\)/g
        ];

        const imports = new Set();

        for (const pattern of patterns) {
            let match;
            while ((match = pattern.exec(content)) !== null) {
                imports.add(match[1]);
            }
        }

        return Array.from(imports);
    }

    extractPythonImports(content) {
        const patterns = [
            /^from\s+([^\s]+)/gm,
            /^import\s+([^\s,]+)/gm
        ];

        const imports = new Set();

        for (const pattern of patterns) {
            let match;
            while ((match = pattern.exec(content)) !== null) {
                imports.add(match[1].split('.')[0]);
            }
        }

        return Array.from(imports);
    }

    extractRustUses(content) {
        const pattern = /^use\s+([^;]+);/gm;
        const imports = new Set();
        let match;

        while ((match = pattern.exec(content)) !== null) {
            const fullPath = match[1];
            if (fullPath.includes('::')) {
                imports.add(fullPath.split('::')[0]);
            } else {
                imports.add(fullPath);
            }
        }

        return Array.from(imports);
    }

    extractGoImports(content) {
        const importBlocks = content.match(/import\s+\(([\s\S]*?)\)/g) || [];
        const singleImports = content.match(/import\s+"([^"]+)"/g) || [];

        const imports = new Set();

        // Process import blocks
        for (const block of importBlocks) {
            const lines = block.match(/"([^"]+)"/g) || [];
            for (const line of lines) {
                imports.add(line.replace(/"/g, ''));
            }
        }

        // Process single imports
        for (const imp of singleImports) {
            const match = imp.match(/import\s+"([^"]+)"/);
            if (match) imports.add(match[1]);
        }

        return Array.from(imports);
    }

    extractExports(content, language) {
        const exports = {
            functions: [],
            classes: [],
            constants: [],
            types: []
        };

        switch (language) {
            case 'javascript':
            case 'typescript':
                exports.functions = this.extractJSFunctions(content);
                exports.classes = this.extractJSClasses(content);
                exports.constants = this.extractJSConstants(content);
                if (language === 'typescript') {
                    exports.types = this.extractTSTypes(content);
                }
                break;
            case 'python':
                exports.functions = this.extractPythonFunctions(content);
                exports.classes = this.extractPythonClasses(content);
                break;
        }

        return exports;
    }

    extractJSFunctions(content) {
        const patterns = [
            /export\s+(?:async\s+)?function\s+(\w+)/g,
            /export\s+const\s+(\w+)\s*=\s*(?:async\s+)?\(/g,
            /exports\.(\w+)\s*=\s*(?:async\s+)?function/g
        ];

        return this.extractWithPatterns(content, patterns);
    }

    extractJSClasses(content) {
        const patterns = [
            /export\s+(?:default\s+)?class\s+(\w+)/g,
            /class\s+(\w+)/g
        ];

        return this.extractWithPatterns(content, patterns);
    }

    extractJSConstants(content) {
        const patterns = [
            /export\s+const\s+(\w+)\s*=/g,
            /module\.exports\.(\w+)\s*=/g
        ];

        return this.extractWithPatterns(content, patterns);
    }

    extractTSTypes(content) {
        const patterns = [
            /export\s+(?:type|interface)\s+(\w+)/g,
            /type\s+(\w+)\s*=/g,
            /interface\s+(\w+)/g
        ];

        return this.extractWithPatterns(content, patterns);
    }

    extractPythonFunctions(content) {
        const pattern = /def\s+(\w+)\s*\(/g;
        return this.extractWithPatterns(content, [pattern]);
    }

    extractPythonClasses(content) {
        const pattern = /class\s+(\w+)\s*[:\(]/g;
        return this.extractWithPatterns(content, [pattern]);
    }

    extractWithPatterns(content, patterns) {
        const items = new Set();

        for (const pattern of patterns) {
            let match;
            while ((match = pattern.exec(content)) !== null) {
                items.add(match[1]);
            }
        }

        return Array.from(items);
    }

    calculateComplexity(content, language) {
        const lines = content.split('\n').length;
        const characters = content.length;

        let cyclomaticComplexity = 1; // Base complexity

        // Count control flow statements
        const controlFlowPatterns = [
            /\bif\b/g, /\belse\b/g, /\bfor\b/g, /\bwhile\b/g,
            /\bswitch\b/g, /\bcase\b/g, /\btry\b/g, /\bcatch\b/g,
            /\b&&\b/g, /\b\|\|\b/g, /\?\s*:/g
        ];

        for (const pattern of controlFlowPatterns) {
            const matches = content.match(pattern) || [];
            cyclomaticComplexity += matches.length;
        }

        return {
            lines,
            characters,
            cyclomaticComplexity,
            category: this.categorizeComplexity(cyclomaticComplexity)
        };
    }

    categorizeComplexity(complexity) {
        if (complexity <= 5) return 'simple';
        if (complexity <= 10) return 'moderate';
        if (complexity <= 20) return 'complex';
        return 'very_complex';
    }

    isInternalDependency(dependency, filePath) {
        return dependency.startsWith('.') || dependency.startsWith('/') ||
               !dependency.includes('/') || dependency.startsWith('@');
    }

    async dependencyExists(dependency, language, filePath) {
        const cacheKey = `${dependency}:${language}:${path.dirname(filePath)}`;

        if (this.dependencyCache.has(cacheKey)) {
            return this.dependencyCache.get(cacheKey);
        }

        let exists = false;

        if (this.isInternalDependency(dependency, filePath)) {
            exists = await this.checkInternalDependency(dependency, filePath);
        } else {
            exists = await this.checkExternalDependency(dependency, language);
        }

        this.dependencyCache.set(cacheKey, exists);
        return exists;
    }

    async checkInternalDependency(dependency, filePath) {
        const baseDir = path.dirname(filePath);
        let targetPath;

        if (dependency.startsWith('.')) {
            targetPath = path.resolve(baseDir, dependency);
        } else {
            targetPath = path.join(baseDir, dependency);
        }

        // Try different extensions
        const extensions = ['.js', '.jsx', '.ts', '.tsx', '.py', '.rs', '.go', '.java'];

        for (const ext of extensions) {
            if (fs.existsSync(targetPath + ext)) return true;
            if (fs.existsSync(path.join(targetPath, 'index' + ext))) return true;
        }

        return fs.existsSync(targetPath);
    }

    async checkExternalDependency(dependency, language) {
        const projectDir = this.findProjectRoot();

        switch (language) {
            case 'javascript':
            case 'typescript':
                return fs.existsSync(path.join(projectDir, 'node_modules', dependency));
            case 'python':
                try {
                    await execAsync(`python -c "import ${dependency}"`);
                    return true;
                } catch {
                    return false;
                }
            case 'rust':
                try {
                    const cargoToml = path.join(projectDir, 'Cargo.toml');
                    if (fs.existsSync(cargoToml)) {
                        const content = fs.readFileSync(cargoToml, 'utf8');
                        return content.includes(dependency);
                    }
                } catch {
                    return false;
                }
                return false;
            default:
                return true; // Assume exists for unknown languages
        }
    }

    async detectCircularDependencies(filePath, internalDeps) {
        const circular = [];
        const visited = new Set();
        const recursionStack = new Set();

        const detectCycle = async (currentFile, targetFile) => {
            if (recursionStack.has(currentFile)) {
                return [currentFile];
            }

            if (visited.has(currentFile)) {
                return null;
            }

            visited.add(currentFile);
            recursionStack.add(currentFile);

            // Get dependencies of current file
            try {
                const content = fs.readFileSync(currentFile, 'utf8');
                const language = this.detectLanguage(currentFile);
                const deps = await this.extractDependencies(content, language, currentFile);

                for (const dep of deps.internal) {
                    const depPath = this.resolveDependencyPath(dep, currentFile);
                    if (depPath && fs.existsSync(depPath)) {
                        const cycle = await detectCycle(depPath, targetFile);
                        if (cycle) {
                            cycle.unshift(currentFile);
                            return cycle;
                        }
                    }
                }
            } catch (error) {
                // Ignore files that can't be read
            }

            recursionStack.delete(currentFile);
            return null;
        };

        for (const dep of internalDeps) {
            const depPath = this.resolveDependencyPath(dep, filePath);
            if (depPath && fs.existsSync(depPath)) {
                visited.clear();
                recursionStack.clear();
                const cycle = await detectCycle(depPath, filePath);
                if (cycle && cycle.includes(filePath)) {
                    circular.push(cycle);
                }
            }
        }

        return circular;
    }

    resolveDependencyPath(dependency, fromFile) {
        const baseDir = path.dirname(fromFile);
        let targetPath;

        if (dependency.startsWith('.')) {
            targetPath = path.resolve(baseDir, dependency);
        } else {
            targetPath = path.join(baseDir, dependency);
        }

        // Try different extensions
        const extensions = ['.js', '.jsx', '.ts', '.tsx', '.py', '.rs', '.go', '.java'];

        for (const ext of extensions) {
            const withExt = targetPath + ext;
            if (fs.existsSync(withExt)) return withExt;

            const indexPath = path.join(targetPath, 'index' + ext);
            if (fs.existsSync(indexPath)) return indexPath;
        }

        return fs.existsSync(targetPath) ? targetPath : null;
    }

    async validateDependencies(analysis) {
        const total = analysis.dependencies.imports.length;
        const existing = total - analysis.dependencies.missing.length;

        analysis.dependencyStats = {
            total,
            existing,
            missing: analysis.dependencies.missing.length,
            completeness: total > 0 ? existing / total : 1.0
        };
    }

    determineValidationTier(analysis) {
        const completeness = analysis.dependencyStats.completeness;
        const thresholds = this.config.progressiveValidation.completenessThresholds;

        if (completeness >= thresholds.full) return 'full';
        if (completeness >= thresholds.integration) return 'integration';
        if (completeness >= thresholds.interface) return 'interface';
        return 'syntax';
    }

    async generateRecommendations(analysis) {
        const recommendations = [];

        // Missing dependencies
        if (analysis.dependencies.missing.length > 0) {
            recommendations.push({
                type: 'missing_dependencies',
                priority: 'high',
                message: `${analysis.dependencies.missing.length} missing dependencies detected`,
                action: 'Create missing dependency files or install packages',
                dependencies: analysis.dependencies.missing
            });
        }

        // Circular dependencies
        if (analysis.dependencies.circular.length > 0) {
            recommendations.push({
                type: 'circular_dependencies',
                priority: 'medium',
                message: `${analysis.dependencies.circular.length} circular dependency cycles detected`,
                action: 'Refactor to break circular dependencies',
                cycles: analysis.dependencies.circular
            });
        }

        // Complexity issues
        if (analysis.complexity.category === 'very_complex') {
            recommendations.push({
                type: 'high_complexity',
                priority: 'medium',
                message: `High cyclomatic complexity (${analysis.complexity.cyclomaticComplexity})`,
                action: 'Consider breaking down into smaller functions/modules'
            });
        }

        // Validation tier upgrade
        if (analysis.validationTier !== 'full') {
            recommendations.push({
                type: 'validation_tier',
                priority: 'low',
                message: `Current validation: ${analysis.validationTier.toUpperCase()}`,
                action: `Implement ${analysis.dependencies.missing.length} missing dependencies for full validation`
            });
        }

        return recommendations;
    }

    async planAgentTasks(analysis) {
        const tasks = [];
        const missingThreshold = this.config.agentSpawning.missingDependencyThreshold;
        const missingRatio = analysis.dependencies.missing.length / analysis.dependencies.imports.length;

        if (missingRatio > missingThreshold) {
            // Spawn coder agent for missing dependencies
            for (const dep of analysis.dependencies.missing) {
                tasks.push({
                    type: 'create_dependency',
                    agent: this.config.agentSpawning.spawnAgentTypes.dependencies,
                    priority: 'high',
                    description: `Create missing dependency: ${dep}`,
                    command: `Task("Create ${dep}", "Implement missing dependency ${dep} based on usage patterns in ${path.basename(analysis.file)}", "coder")`,
                    dependency: dep
                });
            }
        }

        return tasks;
    }

    findProjectRoot() {
        const markers = ['package.json', 'Cargo.toml', 'go.mod', 'pyproject.toml', 'setup.py'];
        let dir = process.cwd();

        while (dir !== path.dirname(dir)) {
            if (markers.some(marker => fs.existsSync(path.join(dir, marker)))) {
                return dir;
            }
            dir = path.dirname(dir);
        }

        return process.cwd();
    }

    printAnalysisReport(analysis) {
        console.log('\n' + '='.repeat(60));
        console.log('🔍 DEPENDENCY ANALYSIS REPORT');
        console.log('='.repeat(60));

        // Dependency stats
        console.log(`📊 DEPENDENCY STATUS:`);
        console.log(`  ✅ ${analysis.dependencyStats.existing}/${analysis.dependencyStats.total} dependencies exist`);
        console.log(`  ⏳ Missing: ${analysis.dependencies.missing.join(', ') || 'None'}`);
        console.log(`  📈 Completeness: ${(analysis.dependencyStats.completeness * 100).toFixed(1)}%`);

        // Validation tier
        console.log(`\n📋 CURRENT VALIDATION: ${analysis.validationTier.toUpperCase()} checking only`);

        // Complexity
        console.log(`\n🧮 COMPLEXITY ANALYSIS:`);
        console.log(`  📏 Lines: ${analysis.complexity.lines}`);
        console.log(`  🔄 Cyclomatic Complexity: ${analysis.complexity.cyclomaticComplexity} (${analysis.complexity.category})`);

        // Circular dependencies
        if (analysis.dependencies.circular.length > 0) {
            console.log(`\n⚠️  CIRCULAR DEPENDENCIES DETECTED:`);
            analysis.dependencies.circular.forEach((cycle, i) => {
                console.log(`  ${i + 1}. ${cycle.map(f => path.basename(f)).join(' → ')}`);
            });
        }

        // Recommendations
        if (analysis.recommendations.length > 0) {
            console.log(`\n💡 RECOMMENDATIONS:`);
            analysis.recommendations.forEach(rec => {
                const emoji = rec.priority === 'high' ? '🚨' : rec.priority === 'medium' ? '⚠️' : 'ℹ️';
                console.log(`  ${emoji} ${rec.message}`);
                console.log(`     → ${rec.action}`);
            });
        }

        // Agent tasks
        if (analysis.agentTasks && analysis.agentTasks.length > 0) {
            console.log(`\n🤖 SPAWNING AGENTS:`);
            analysis.agentTasks.forEach(task => {
                console.log(`  🎯 ${task.description}`);
                console.log(`     Agent: ${task.agent} | Priority: ${task.priority}`);
            });
        }

        console.log('\n' + '='.repeat(60));
    }
}

// Hook execution
async function main() {
    const filePath = process.argv[2];

    if (!filePath) {
        console.error('Usage: smart-dependency-analyzer.js <file-path>');
        process.exit(1);
    }

    if (!fs.existsSync(filePath)) {
        console.error(`File not found: ${filePath}`);
        process.exit(1);
    }

    const analyzer = new SmartDependencyAnalyzer();
    const analysis = await analyzer.analyzeFile(filePath);

    // Output agent commands if any
    if (analysis.agentTasks && analysis.agentTasks.length > 0) {
        console.log('\n🚀 EXECUTE THESE COMMANDS TO SPAWN AGENTS:');
        analysis.agentTasks.forEach(task => {
            console.log(task.command);
        });
    }

    // Exit with appropriate code
    const hasErrors = analysis.dependencies.missing.length > 0 ||
                     analysis.dependencies.circular.length > 0;
    process.exit(hasErrors ? 1 : 0);
}

if (require.main === module) {
    main().catch(error => {
        console.error('Analysis error:', error);
        process.exit(1);
    });
}

module.exports = SmartDependencyAnalyzer;