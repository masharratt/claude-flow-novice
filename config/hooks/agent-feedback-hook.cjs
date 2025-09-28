#!/usr/bin/env node

/**
 * Agent Feedback Hook
 * Returns dependency analysis results to the calling subagent for direct action
 * Instead of spawning new agents, provides structured feedback for self-execution
 */

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

class AgentFeedbackHook {
    constructor() {
        this.memoryPath = path.join(process.cwd(), '.claude-flow', 'agent-memory.json');
        this.ensureMemoryFile();
    }

    ensureMemoryFile() {
        const memoryDir = path.dirname(this.memoryPath);
        if (!fs.existsSync(memoryDir)) {
            fs.mkdirSync(memoryDir, { recursive: true });
        }
        if (!fs.existsSync(this.memoryPath)) {
            fs.writeFileSync(this.memoryPath, JSON.stringify({ sessions: {} }, null, 2));
        }
    }

    async analyzeDependenciesForAgent(filePath) {
        console.log(`\n🤖 AGENT FEEDBACK ANALYSIS: ${path.basename(filePath)}`);

        const analysis = {
            file: filePath,
            timestamp: new Date().toISOString(),
            language: this.detectLanguage(filePath),
            dependencies: await this.extractDependencies(filePath),
            actionItems: [],
            recommendations: {},
            agentTasks: []
        };

        // Determine what the calling agent should do
        await this.generateAgentActions(analysis);

        // Store in agent memory for retrieval
        await this.storeInAgentMemory(analysis);

        // Return structured feedback
        this.printAgentFeedback(analysis);

        return analysis;
    }

    detectLanguage(filePath) {
        const ext = path.extname(filePath).toLowerCase();
        const langMap = {
            '.js': 'javascript',
            '.jsx': 'javascript',
            '.ts': 'typescript',
            '.tsx': 'typescript',
            '.py': 'python',
            '.rs': 'rust'
        };
        return langMap[ext] || 'unknown';
    }

    async extractDependencies(filePath) {
        const content = fs.readFileSync(filePath, 'utf8');
        const language = this.detectLanguage(filePath);

        const dependencies = {
            imports: [],
            internal: [],
            external: [],
            missing: [],
            usage: {}
        };

        switch (language) {
            case 'javascript':
            case 'typescript':
                this.analyzeJSDependencies(content, dependencies, filePath);
                break;
            case 'python':
                this.analyzePythonDependencies(content, dependencies, filePath);
                break;
        }

        return dependencies;
    }

    analyzeJSDependencies(content, dependencies, filePath) {
        // Extract require/import statements
        const importPatterns = [
            /(?:const|let|var)\s+.*?\s*=\s*require\(['"`]([^'"`]+)['"`]\)/g,
            /import.*?from\s+['"`]([^'"`]+)['"`]/g
        ];

        for (const pattern of importPatterns) {
            let match;
            while ((match = pattern.exec(content)) !== null) {
                const dep = match[1];
                dependencies.imports.push(dep);

                if (this.isInternalDependency(dep)) {
                    dependencies.internal.push(dep);

                    // Check if file exists
                    if (!this.dependencyExists(dep, filePath)) {
                        dependencies.missing.push(dep);

                        // Analyze usage to understand what needs to be implemented
                        const usage = this.analyzeUsage(content, dep);
                        dependencies.usage[dep] = usage;
                    }
                } else {
                    dependencies.external.push(dep);
                }
            }
        }
    }

    analyzePythonDependencies(content, dependencies, filePath) {
        const importPatterns = [
            /^from\s+([^\s]+)\s+import/gm,
            /^import\s+([^\s,]+)/gm
        ];

        for (const pattern of importPatterns) {
            let match;
            while ((match = pattern.exec(content)) !== null) {
                const dep = match[1];
                dependencies.imports.push(dep);

                if (this.isInternalDependency(dep)) {
                    dependencies.internal.push(dep);

                    if (!this.dependencyExists(dep, filePath)) {
                        dependencies.missing.push(dep);
                        const usage = this.analyzeUsage(content, dep);
                        dependencies.usage[dep] = usage;
                    }
                } else {
                    dependencies.external.push(dep);
                }
            }
        }
    }

    isInternalDependency(dep) {
        return dep.startsWith('./') || dep.startsWith('../') ||
               (!dep.includes('/') && dep.startsWith('missing-'));
    }

    dependencyExists(dep, fromFile) {
        if (dep.startsWith('./') || dep.startsWith('../')) {
            const basePath = path.dirname(fromFile);
            const fullPath = path.resolve(basePath, dep);

            // Try different extensions
            const extensions = ['.js', '.ts', '.py', '.rs'];
            for (const ext of extensions) {
                if (fs.existsSync(fullPath + ext)) return true;
            }
            return fs.existsSync(fullPath);
        }

        // For missing-* dependencies, check in current directory
        if (dep.startsWith('missing-')) {
            const fileName = dep + '.js';
            return fs.existsSync(path.join(path.dirname(fromFile), fileName));
        }

        return false;
    }

    analyzeUsage(content, dependency) {
        const usage = {
            className: null,
            methods: [],
            properties: [],
            constructorArgs: [],
            implementationHints: []
        };

        // Extract class name from dependency
        const depName = dependency.replace(/^\.\//, '').replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
        const className = depName.charAt(0).toUpperCase() + depName.slice(1);

        // Find the variable name used for this class
        const requireMatch = content.match(new RegExp(`(?:const|let|var)\\s+(\\w+)\\s*=\\s*require\\(['"\`]${dependency.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"\`]\\)`));
        const variableName = requireMatch ? requireMatch[1] : className.toLowerCase();

        usage.className = className;

        // Look for usage patterns
        const lines = content.split('\n');

        for (const line of lines) {
            // Constructor usage: new ClassName() or this.varName = new ClassName()
            const constructorPattern = new RegExp(`(?:new\\s+${className}|=\\s*new\\s+${className})\\s*\\(([^)]*)\\)`);
            const constructorMatch = line.match(constructorPattern);
            if (constructorMatch) {
                if (constructorMatch[1].trim()) {
                    usage.constructorArgs = constructorMatch[1].split(',').map(arg => arg.trim());
                }
            }

            // Method calls: variableName.methodName() or this.varName.methodName()
            const methodPattern = new RegExp(`(?:this\\.${variableName}|${variableName})\\.([a-zA-Z_][\\w]*)\\s*\\(`, 'g');
            let methodMatch;
            while ((methodMatch = methodPattern.exec(line)) !== null) {
                usage.methods.push(methodMatch[1]);
            }

            // Property access: variableName.property
            const propertyPattern = new RegExp(`(?:this\\.${variableName}|${variableName})\\.([a-zA-Z_][\\w]*)(?!\\s*\\()`, 'g');
            let propertyMatch;
            while ((propertyMatch = propertyPattern.exec(line)) !== null) {
                usage.properties.push(propertyMatch[1]);
            }

            // Await patterns
            if (line.includes('await') && (line.includes(`${variableName}.`) || line.includes(`this.${variableName}.`))) {
                usage.implementationHints.push('async methods required');
            }

            // Error handling patterns
            if ((line.includes('try') || line.includes('catch')) && (line.includes(variableName) || content.includes(`this.${variableName}`))) {
                usage.implementationHints.push('error handling needed');
            }

            // Parameter analysis for understanding method signatures
            if (line.includes(`${variableName}.`) && line.includes('{')) {
                usage.implementationHints.push('methods accept object parameters');
            }
        }

        // Remove duplicates
        usage.methods = [...new Set(usage.methods)];
        usage.properties = [...new Set(usage.properties)];
        usage.implementationHints = [...new Set(usage.implementationHints)];

        return usage;
    }

    async generateAgentActions(analysis) {
        for (const missingDep of analysis.dependencies.missing) {
            const usage = analysis.dependencies.usage[missingDep];

            const actionItem = {
                type: 'create_dependency',
                dependency: missingDep,
                priority: 'high',
                className: usage.className,
                requiredMethods: usage.methods,
                requiredProperties: usage.properties,
                constructorArgs: usage.constructorArgs,
                implementationHints: usage.implementationHints,
                suggestedFilename: this.generateFilename(missingDep, analysis.language),
                template: this.generateTemplate(usage, analysis.language)
            };

            analysis.actionItems.push(actionItem);
        }

        // Generate recommendations for the agent
        analysis.recommendations = {
            implementationOrder: this.prioritizeImplementations(analysis.actionItems),
            estimatedEffort: this.estimateEffort(analysis.actionItems),
            suggestedApproach: this.suggestApproach(analysis)
        };
    }

    generateFilename(dependency, language) {
        const base = dependency.replace(/^\.\//, '');
        const extensions = {
            javascript: '.js',
            typescript: '.ts',
            python: '.py',
            rust: '.rs'
        };
        return base + (extensions[language] || '.js');
    }

    generateTemplate(usage, language) {
        if (language === 'javascript' || language === 'typescript') {
            return this.generateJSTemplate(usage);
        } else if (language === 'python') {
            return this.generatePythonTemplate(usage);
        }
        return null;
    }

    generateJSTemplate(usage) {
        const className = usage.className || 'UnknownClass';
        const constructorParams = usage.constructorArgs.length > 0
            ? usage.constructorArgs.join(', ')
            : 'options = {}';

        let template = `class ${className} {\n`;
        template += `    constructor(${constructorParams}) {\n`;
        template += `        // Initialize based on constructor usage\n`;

        // Add properties based on usage
        for (const prop of usage.properties) {
            template += `        this.${prop} = null;\n`;
        }

        template += `    }\n\n`;

        // Add methods based on usage
        for (const method of usage.methods) {
            const isAsync = usage.implementationHints.includes('async methods required');
            template += `    ${isAsync ? 'async ' : ''}${method}() {\n`;
            template += `        // TODO: Implement ${method}\n`;
            template += `        throw new Error('${method} not implemented');\n`;
            template += `    }\n\n`;
        }

        template += `}\n\nmodule.exports = ${className};`;
        return template;
    }

    generatePythonTemplate(usage) {
        const className = usage.className || 'UnknownClass';

        let template = `class ${className}:\n`;
        template += `    def __init__(self`;
        if (usage.constructorArgs.length > 0) {
            template += `, ${usage.constructorArgs.join(', ')}`;
        }
        template += `):\n`;
        template += `        # Initialize based on constructor usage\n`;

        for (const prop of usage.properties) {
            template += `        self.${prop} = None\n`;
        }

        template += `\n`;

        for (const method of usage.methods) {
            const isAsync = usage.implementationHints.includes('async methods required');
            template += `    ${isAsync ? 'async ' : ''}def ${method}(self):\n`;
            template += `        # TODO: Implement ${method}\n`;
            template += `        raise NotImplementedError('${method} not implemented')\n\n`;
        }

        return template;
    }

    prioritizeImplementations(actionItems) {
        // Sort by complexity (fewer methods first)
        return actionItems.sort((a, b) => {
            const aComplexity = a.requiredMethods.length + a.requiredProperties.length;
            const bComplexity = b.requiredMethods.length + b.requiredProperties.length;
            return aComplexity - bComplexity;
        });
    }

    estimateEffort(actionItems) {
        const totalMethods = actionItems.reduce((sum, item) => sum + item.requiredMethods.length, 0);
        const totalProperties = actionItems.reduce((sum, item) => sum + item.requiredProperties.length, 0);

        return {
            totalFiles: actionItems.length,
            totalMethods,
            totalProperties,
            estimatedMinutes: (actionItems.length * 5) + (totalMethods * 2) + (totalProperties * 1)
        };
    }

    suggestApproach(analysis) {
        const missingCount = analysis.dependencies.missing.length;

        if (missingCount === 0) {
            return 'No dependencies to implement';
        } else if (missingCount <= 2) {
            return 'Implement dependencies directly in sequence';
        } else if (missingCount <= 5) {
            return 'Create stub implementations first, then enhance iteratively';
        } else {
            return 'Consider breaking down into smaller, focused implementations';
        }
    }

    async storeInAgentMemory(analysis) {
        const memory = JSON.parse(fs.readFileSync(this.memoryPath, 'utf8'));

        const sessionId = 'dependency-analysis-' + Date.now();
        memory.sessions[sessionId] = {
            ...analysis,
            agentType: 'dependency-analyzer',
            status: 'ready-for-action'
        };

        fs.writeFileSync(this.memoryPath, JSON.stringify(memory, null, 2));

        console.log(`💾 Stored analysis in agent memory: ${sessionId}`);
        return sessionId;
    }

    printAgentFeedback(analysis) {
        console.log('\n' + '='.repeat(60));
        console.log('🤖 AGENT FEEDBACK: DEPENDENCIES TO IMPLEMENT');
        console.log('='.repeat(60));

        if (analysis.actionItems.length === 0) {
            console.log('✅ No missing dependencies found - all good!');
            return;
        }

        console.log(`📊 SUMMARY:`);
        console.log(`  📁 File analyzed: ${path.basename(analysis.file)}`);
        console.log(`  🔍 Missing dependencies: ${analysis.dependencies.missing.length}`);
        console.log(`  ⏱️  Estimated effort: ${analysis.recommendations.estimatedEffort.estimatedMinutes} minutes`);
        console.log(`  💡 Suggested approach: ${analysis.recommendations.suggestedApproach}`);

        console.log('\n🎯 ACTION ITEMS FOR AGENT:');

        analysis.actionItems.forEach((item, index) => {
            console.log(`\n${index + 1}. CREATE: ${item.suggestedFilename}`);
            console.log(`   Class: ${item.className}`);
            console.log(`   Methods needed: ${item.requiredMethods.join(', ') || 'None'}`);
            console.log(`   Properties: ${item.requiredProperties.join(', ') || 'None'}`);
            if (item.constructorArgs.length > 0) {
                console.log(`   Constructor args: ${item.constructorArgs.join(', ')}`);
            }
            if (item.implementationHints.length > 0) {
                console.log(`   Hints: ${item.implementationHints.join(', ')}`);
            }
        });

        console.log('\n🚀 READY FOR AGENT EXECUTION:');
        console.log('The calling agent can now implement these dependencies directly.');
        console.log('Templates and usage analysis are available in agent memory.');

        console.log('='.repeat(60));
    }
}

// Hook execution
async function main() {
    const filePath = process.argv[2];
    const action = process.argv[3] || 'analyze';

    if (!filePath) {
        console.error('Usage: agent-feedback-hook.cjs <file-path> [action]');
        console.error('Actions: analyze, memory-retrieve');
        process.exit(1);
    }

    const hook = new AgentFeedbackHook();

    switch (action) {
        case 'analyze':
            if (!fs.existsSync(filePath)) {
                console.error(`File not found: ${filePath}`);
                process.exit(1);
            }

            const analysis = await hook.analyzeDependenciesForAgent(filePath);

            // Exit with error code if dependencies are missing (signal to agent)
            process.exit(analysis.dependencies.missing.length > 0 ? 2 : 0);
            break;

        case 'memory-retrieve':
            const memory = JSON.parse(fs.readFileSync(hook.memoryPath, 'utf8'));
            console.log(JSON.stringify(memory, null, 2));
            break;

        default:
            console.error(`Unknown action: ${action}`);
            process.exit(1);
    }
}

if (require.main === module) {
    main().catch(error => {
        console.error('Agent feedback hook error:', error);
        process.exit(1);
    });
}

module.exports = AgentFeedbackHook;