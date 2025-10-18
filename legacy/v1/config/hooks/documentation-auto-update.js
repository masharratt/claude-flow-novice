#!/usr/bin/env node

/**
 * Documentation Auto-Update Hook
 * Automatically updates documentation when code changes occur
 * Maintains: COMPONENTS.md, MILESTONES.md, ARCHITECTURE.md, DECISIONS.md, PATTERNS.md, TROUBLESHOOTING.md
 */

const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

class DocumentationAutoUpdater {
    constructor() {
        this.docsDir = path.join(process.cwd(), 'docs');
        this.config = this.loadConfig();
        this.documentStructure = {
            'COMPONENTS.md': {
                title: 'Component Catalog',
                description: 'Component catalog with usage examples',
                sections: ['Overview', 'Components', 'Usage Examples', 'API Reference']
            },
            'MILESTONES.md': {
                title: 'Development History',
                description: 'Development history and lessons learned',
                sections: ['Timeline', 'Major Releases', 'Lessons Learned', 'Future Plans']
            },
            'ARCHITECTURE.md': {
                title: 'System Architecture',
                description: 'How everything connects and why',
                sections: ['Overview', 'Core Components', 'Data Flow', 'Integration Points']
            },
            'DECISIONS.md': {
                title: 'Technical Decisions',
                description: 'Technical choices and their rationale',
                sections: ['Architecture Decisions', 'Technology Choices', 'Design Patterns', 'Trade-offs']
            },
            'PATTERNS.md': {
                title: 'Code Patterns',
                description: 'Reusable code patterns and conventions',
                sections: ['Design Patterns', 'Code Conventions', 'Best Practices', 'Anti-patterns']
            },
            'TROUBLESHOOTING.md': {
                title: 'Troubleshooting Guide',
                description: 'Common issues and solutions',
                sections: ['Common Issues', 'Error Messages', 'Debugging Steps', 'Performance Tips']
            }
        };
    }

    loadConfig() {
        return {
            // File patterns that trigger documentation updates
            triggerPatterns: {
                components: [
                    'src/**/*.{js,ts,jsx,tsx}',
                    'src/components/**/*',
                    'src/features/**/*'
                ],
                architecture: [
                    'src/core/**/*',
                    'src/services/**/*',
                    'src/utils/**/*',
                    'config/**/*'
                ],
                patterns: [
                    'src/**/*.{js,ts,jsx,tsx,py,rs}',
                    'examples/**/*'
                ]
            },
            // Documentation update strategies
            updateStrategies: {
                auto_scan: true,           // Automatically scan for changes
                preserve_manual: true,     // Preserve manually written content
                add_timestamps: true,      // Add last updated timestamps
                generate_toc: true,        // Generate table of contents
                link_to_source: true       // Link to source code
            }
        };
    }

    async updateDocumentation(changedFile, changeType = 'edit') {
        console.log(`\n📚 UPDATING DOCUMENTATION for: ${path.basename(changedFile)}`);

        const updateResults = {
            file: changedFile,
            changeType,
            timestamp: new Date().toISOString(),
            updatedDocs: [],
            newContent: [],
            errors: []
        };

        try {
            // Ensure docs directory exists
            await this.ensureDocsStructure();

            // Determine which docs need updating
            const docsToUpdate = this.determineDocsToUpdate(changedFile, changeType);

            // Update each relevant document
            for (const docType of docsToUpdate) {
                try {
                    await this.updateDocument(docType, changedFile, updateResults);
                    updateResults.updatedDocs.push(docType);
                } catch (error) {
                    updateResults.errors.push(`Failed to update ${docType}: ${error.message}`);
                }
            }

            // Update cross-references and links
            await this.updateCrossReferences(updateResults);

            // Generate summary report
            this.printUpdateReport(updateResults);

        } catch (error) {
            updateResults.errors.push(`Documentation update failed: ${error.message}`);
            console.error('Documentation update error:', error);
        }

        return updateResults;
    }

    async ensureDocsStructure() {
        // Create docs directory if it doesn't exist
        if (!fs.existsSync(this.docsDir)) {
            fs.mkdirSync(this.docsDir, { recursive: true });
        }

        // Create/initialize each documentation file
        for (const [filename, structure] of Object.entries(this.documentStructure)) {
            const filePath = path.join(this.docsDir, filename);

            if (!fs.existsSync(filePath)) {
                await this.createDocumentTemplate(filePath, structure);
            }
        }
    }

    async createDocumentTemplate(filePath, structure) {
        const template = `# ${structure.title}

> ${structure.description}

*Last updated: ${new Date().toISOString()}*

## Table of Contents

${structure.sections.map((section, index) => `${index + 1}. [${section}](#${section.toLowerCase().replace(/\s+/g, '-')})`).join('\n')}

---

${structure.sections.map(section => `## ${section}

<!-- Auto-generated content will be added here -->
*This section is automatically maintained by the documentation system.*

`).join('\n')}

---

*This document is automatically maintained. Manual edits in marked sections will be preserved.*
`;

        fs.writeFileSync(filePath, template);
        console.log(`📄 Created documentation template: ${path.basename(filePath)}`);
    }

    determineDocsToUpdate(changedFile, changeType) {
        const docsToUpdate = new Set();
        const relativeFile = path.relative(process.cwd(), changedFile);

        // Always update MILESTONES.md for significant changes
        if (changeType === 'add' || changeType === 'major_edit') {
            docsToUpdate.add('MILESTONES.md');
        }

        // Check file patterns
        if (this.matchesPattern(relativeFile, this.config.triggerPatterns.components)) {
            docsToUpdate.add('COMPONENTS.md');
        }

        if (this.matchesPattern(relativeFile, this.config.triggerPatterns.architecture)) {
            docsToUpdate.add('ARCHITECTURE.md');
        }

        if (this.matchesPattern(relativeFile, this.config.triggerPatterns.patterns)) {
            docsToUpdate.add('PATTERNS.md');
        }

        // Update DECISIONS.md for config changes
        if (relativeFile.includes('config/') || relativeFile.includes('.config.')) {
            docsToUpdate.add('DECISIONS.md');
        }

        // Update TROUBLESHOOTING.md for test failures or error handling
        if (relativeFile.includes('test') || relativeFile.includes('error') ||
            relativeFile.includes('exception') || changeType === 'fix') {
            docsToUpdate.add('TROUBLESHOOTING.md');
        }

        return Array.from(docsToUpdate);
    }

    matchesPattern(filePath, patterns) {
        return patterns.some(pattern => {
            // Simple glob matching - convert * to regex
            const regexPattern = pattern
                .replace(/\./g, '\\.')
                .replace(/\*\*/g, '.*')
                .replace(/\*/g, '[^/]*')
                .replace(/\{([^}]+)\}/g, '($1)');

            return new RegExp(regexPattern).test(filePath);
        });
    }

    async updateDocument(docType, changedFile, results) {
        const docPath = path.join(this.docsDir, docType);
        let content = fs.readFileSync(docPath, 'utf8');

        switch (docType) {
            case 'COMPONENTS.md':
                content = await this.updateComponentsDoc(content, changedFile);
                break;
            case 'MILESTONES.md':
                content = await this.updateMilestonesDoc(content, changedFile);
                break;
            case 'ARCHITECTURE.md':
                content = await this.updateArchitectureDoc(content, changedFile);
                break;
            case 'DECISIONS.md':
                content = await this.updateDecisionsDoc(content, changedFile);
                break;
            case 'PATTERNS.md':
                content = await this.updatePatternsDoc(content, changedFile);
                break;
            case 'TROUBLESHOOTING.md':
                content = await this.updateTroubleshootingDoc(content, changedFile);
                break;
        }

        // Update timestamp
        content = this.updateTimestamp(content);

        fs.writeFileSync(docPath, content);
        console.log(`📝 Updated: ${docType}`);
    }

    async updateComponentsDoc(content, changedFile) {
        // Scan for new components, classes, functions
        const analysis = await this.analyzeCodeFile(changedFile);

        if (analysis.components.length > 0 || analysis.functions.length > 0) {
            const componentsSection = this.extractSection(content, 'Components');
            let newComponentsSection = componentsSection;

            // Add new components
            for (const component of analysis.components) {
                if (!componentsSection.includes(component.name)) {
                    const componentEntry = `
### ${component.name}

**File:** \`${path.relative(process.cwd(), changedFile)}\`
**Type:** ${component.type}
**Description:** ${component.description || 'Auto-detected component'}

\`\`\`${component.language}
${component.signature}
\`\`\`

**Usage Example:**
\`\`\`${component.language}
// TODO: Add usage example
\`\`\`

---
`;
                    newComponentsSection += componentEntry;
                }
            }

            content = this.replaceSection(content, 'Components', newComponentsSection);
        }

        return content;
    }

    async updateMilestonesDoc(content, changedFile) {
        const timelineSection = this.extractSection(content, 'Timeline');
        const timestamp = new Date().toISOString().split('T')[0];

        const milestoneEntry = `
## ${timestamp}

**Modified:** \`${path.relative(process.cwd(), changedFile)}\`
**Change Type:** Code update
**Impact:** Component/feature modification

`;

        // Add to timeline if not already present
        if (!timelineSection.includes(timestamp)) {
            const newTimelineSection = milestoneEntry + timelineSection;
            content = this.replaceSection(content, 'Timeline', newTimelineSection);
        }

        return content;
    }

    async updateArchitectureDoc(content, changedFile) {
        // Analyze architectural changes
        const analysis = await this.analyzeCodeFile(changedFile);

        if (analysis.imports.length > 0 || analysis.exports.length > 0) {
            const integrationSection = this.extractSection(content, 'Integration Points');

            const dependencyInfo = `
### ${path.basename(changedFile, path.extname(changedFile))}

**File:** \`${path.relative(process.cwd(), changedFile)}\`
**Dependencies:** ${analysis.imports.slice(0, 5).join(', ')}${analysis.imports.length > 5 ? '...' : ''}
**Exports:** ${analysis.exports.slice(0, 5).join(', ')}${analysis.exports.length > 5 ? '...' : ''}
**Last Updated:** ${new Date().toISOString().split('T')[0]}

`;

            // Update or add dependency information
            const newIntegrationSection = this.updateOrAppendFileInfo(integrationSection, changedFile, dependencyInfo);
            content = this.replaceSection(content, 'Integration Points', newIntegrationSection);
        }

        return content;
    }

    async updateDecisionsDoc(content, changedFile) {
        // Check for configuration or significant architectural changes
        if (changedFile.includes('config') || changedFile.includes('.config.')) {
            const decisionsSection = this.extractSection(content, 'Technology Choices');

            const decisionEntry = `
### Configuration Update - ${new Date().toISOString().split('T')[0]}

**File:** \`${path.relative(process.cwd(), changedFile)}\`
**Type:** Configuration Change
**Rationale:** Configuration modification detected - manual documentation needed

*This entry was auto-generated. Please add rationale and impact analysis.*

`;

            const newDecisionsSection = decisionEntry + decisionsSection;
            content = this.replaceSection(content, 'Technology Choices', newDecisionsSection);
        }

        return content;
    }

    async updatePatternsDoc(content, changedFile) {
        const analysis = await this.analyzeCodeFile(changedFile);

        // Look for patterns (classes, interfaces, common code structures)
        if (analysis.patterns.length > 0) {
            const patternsSection = this.extractSection(content, 'Design Patterns');
            let newPatternsSection = patternsSection;

            for (const pattern of analysis.patterns) {
                if (!patternsSection.includes(pattern.name)) {
                    const patternEntry = `
### ${pattern.name}

**File:** \`${path.relative(process.cwd(), changedFile)}\`
**Type:** ${pattern.type}
**Usage:** ${pattern.usage || 'See source code'}

\`\`\`${pattern.language}
${pattern.example}
\`\`\`

---
`;
                    newPatternsSection += patternEntry;
                }
            }

            content = this.replaceSection(content, 'Design Patterns', newPatternsSection);
        }

        return content;
    }

    async updateTroubleshootingDoc(content, changedFile) {
        // Check for error handling patterns or test files
        if (changedFile.includes('test') || changedFile.includes('error') ||
            changedFile.includes('exception')) {

            const analysis = await this.analyzeCodeFile(changedFile);

            if (analysis.errors.length > 0) {
                const issuesSection = this.extractSection(content, 'Common Issues');

                const troubleshootingEntry = `
### Issue detected in ${path.basename(changedFile)}

**File:** \`${path.relative(process.cwd(), changedFile)}\`
**Error Types:** ${analysis.errors.join(', ')}
**Detection Date:** ${new Date().toISOString().split('T')[0]}

**Solution:** *Please document the solution when resolved*

---
`;

                const newIssuesSection = troubleshootingEntry + issuesSection;
                content = this.replaceSection(content, 'Common Issues', newIssuesSection);
            }
        }

        return content;
    }

    async analyzeCodeFile(filePath) {
        const analysis = {
            components: [],
            functions: [],
            imports: [],
            exports: [],
            patterns: [],
            errors: []
        };

        try {
            const content = fs.readFileSync(filePath, 'utf8');
            const language = this.detectLanguage(filePath);

            // Basic code analysis based on language
            switch (language) {
                case 'javascript':
                case 'typescript':
                    this.analyzeJSFile(content, analysis, language);
                    break;
                case 'python':
                    this.analyzePythonFile(content, analysis);
                    break;
                case 'rust':
                    this.analyzeRustFile(content, analysis);
                    break;
            }
        } catch (error) {
            analysis.errors.push(`Analysis error: ${error.message}`);
        }

        return analysis;
    }

    analyzeJSFile(content, analysis, language) {
        // Extract components (classes, functions, React components)
        const classMatches = content.match(/(?:export\s+)?(?:default\s+)?class\s+(\w+)/g) || [];
        classMatches.forEach(match => {
            const name = match.match(/class\s+(\w+)/)[1];
            analysis.components.push({
                name,
                type: 'class',
                language,
                signature: match,
                description: 'Auto-detected class'
            });
        });

        // Extract functions
        const functionMatches = content.match(/(?:export\s+)?(?:async\s+)?function\s+(\w+)/g) || [];
        functionMatches.forEach(match => {
            const name = match.match(/function\s+(\w+)/)[1];
            analysis.functions.push({
                name,
                type: 'function',
                signature: match
            });
        });

        // Extract imports/exports
        const importMatches = content.match(/import.*?from\s+['"`]([^'"`]+)['"`]/g) || [];
        importMatches.forEach(match => {
            const module = match.match(/from\s+['"`]([^'"`]+)['"`]/)[1];
            analysis.imports.push(module);
        });

        const exportMatches = content.match(/export\s+(?:default\s+)?(?:class|function|const|let|var)\s+(\w+)/g) || [];
        exportMatches.forEach(match => {
            const name = match.match(/(?:class|function|const|let|var)\s+(\w+)/)[1];
            analysis.exports.push(name);
        });

        // Detect patterns
        if (content.includes('React.Component') || content.includes('useState') || content.includes('useEffect')) {
            analysis.patterns.push({
                name: 'React Component Pattern',
                type: 'UI Component',
                language,
                example: 'React functional/class component detected',
                usage: 'UI rendering and state management'
            });
        }
    }

    analyzePythonFile(content, analysis) {
        // Extract classes
        const classMatches = content.match(/class\s+(\w+).*?:/g) || [];
        classMatches.forEach(match => {
            const name = match.match(/class\s+(\w+)/)[1];
            analysis.components.push({
                name,
                type: 'class',
                language: 'python',
                signature: match,
                description: 'Python class'
            });
        });

        // Extract functions
        const functionMatches = content.match(/def\s+(\w+).*?:/g) || [];
        functionMatches.forEach(match => {
            const name = match.match(/def\s+(\w+)/)[1];
            analysis.functions.push({
                name,
                type: 'function',
                signature: match
            });
        });

        // Extract imports
        const importMatches = content.match(/(?:from\s+\w+\s+)?import\s+([^\n]+)/g) || [];
        importMatches.forEach(match => {
            analysis.imports.push(match.trim());
        });
    }

    analyzeRustFile(content, analysis) {
        // Extract structs and enums
        const structMatches = content.match(/(?:pub\s+)?struct\s+(\w+)/g) || [];
        structMatches.forEach(match => {
            const name = match.match(/struct\s+(\w+)/)[1];
            analysis.components.push({
                name,
                type: 'struct',
                language: 'rust',
                signature: match,
                description: 'Rust struct'
            });
        });

        // Extract functions
        const functionMatches = content.match(/(?:pub\s+)?fn\s+(\w+)/g) || [];
        functionMatches.forEach(match => {
            const name = match.match(/fn\s+(\w+)/)[1];
            analysis.functions.push({
                name,
                type: 'function',
                signature: match
            });
        });

        // Extract use statements
        const useMatches = content.match(/use\s+([^;]+);/g) || [];
        useMatches.forEach(match => {
            const module = match.match(/use\s+([^;]+)/)[1];
            analysis.imports.push(module);
        });
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
        return langMap[ext] || 'text';
    }

    extractSection(content, sectionName) {
        const regex = new RegExp(`## ${sectionName}\\s*\\n([\\s\\S]*?)(?=\\n## |$)`);
        const match = content.match(regex);
        return match ? match[1].trim() : '';
    }

    replaceSection(content, sectionName, newContent) {
        const regex = new RegExp(`(## ${sectionName}\\s*\\n)[\\s\\S]*?(?=\\n## |$)`);
        return content.replace(regex, `$1\n${newContent}\n`);
    }

    updateOrAppendFileInfo(sectionContent, filePath, newInfo) {
        const fileName = path.basename(filePath, path.extname(filePath));
        const regex = new RegExp(`### ${fileName}[\\s\\S]*?(?=### |$)`);

        if (regex.test(sectionContent)) {
            return sectionContent.replace(regex, newInfo);
        } else {
            return newInfo + sectionContent;
        }
    }

    updateTimestamp(content) {
        const timestamp = new Date().toISOString();
        return content.replace(/\*Last updated:.*?\*/, `*Last updated: ${timestamp}*`);
    }

    async updateCrossReferences(results) {
        // Update cross-references between documents
        // This is a simplified implementation
        console.log('🔗 Updating cross-references...');
    }

    printUpdateReport(results) {
        console.log('\n' + '='.repeat(50));
        console.log('📚 DOCUMENTATION UPDATE REPORT');
        console.log('='.repeat(50));

        console.log(`📄 Trigger File: ${path.basename(results.file)}`);
        console.log(`🔄 Change Type: ${results.changeType}`);
        console.log(`⏰ Timestamp: ${results.timestamp}`);

        if (results.updatedDocs.length > 0) {
            console.log('\n✅ UPDATED DOCUMENTS:');
            results.updatedDocs.forEach(doc => {
                console.log(`  • ${doc}`);
            });
        }

        if (results.errors.length > 0) {
            console.log('\n❌ ERRORS:');
            results.errors.forEach(error => {
                console.log(`  • ${error}`);
            });
        }

        console.log('\n💡 NEXT STEPS:');
        console.log('  • Review auto-generated content for accuracy');
        console.log('  • Add manual descriptions where marked');
        console.log('  • Update usage examples as needed');

        console.log('='.repeat(50));
    }
}

// Hook execution - DISABLED
async function main() {
    const filePath = process.argv[2];
    const changeType = process.argv[3] || 'edit';

    // DISABLED: Documentation auto-update hook disabled to reduce excessive doc generation
    console.log('⚠️  Documentation auto-update hook is DISABLED');
    console.log('To re-enable, remove this early exit from documentation-auto-update.js');
    process.exit(0);

    if (!filePath) {
        console.error('Usage: documentation-auto-update.js <file-path> [change-type]');
        console.error('Change types: edit, add, delete, major_edit, fix');
        process.exit(1);
    }

    if (!fs.existsSync(filePath)) {
        console.error(`File not found: ${filePath}`);
        process.exit(1);
    }

    const updater = new DocumentationAutoUpdater();
    const results = await updater.updateDocumentation(filePath, changeType);

    // Exit with appropriate code
    process.exit(results.errors.length > 0 ? 1 : 0);
}

if (require.main === module) {
    main().catch(error => {
        console.error('Documentation update error:', error);
        process.exit(1);
    });
}

module.exports = DocumentationAutoUpdater;