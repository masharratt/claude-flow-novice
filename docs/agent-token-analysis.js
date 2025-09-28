#!/usr/bin/env node

/**
 * Agent Token Analysis Script
 * Analyzes token usage across all agent description fields in .claude/agents directory
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class AgentTokenAnalyzer {
    constructor() {
        this.agentData = [];
        this.tokenStats = {
            totalTokens: 0,
            avgTokens: 0,
            minTokens: Infinity,
            maxTokens: 0,
            minDescription: '',
            maxDescription: '',
            tokenDistribution: {},
            componentAnalysis: {}
        };
    }

    // Extract description from agent file content
    extractDescription(fileContent, filePath) {
        try {
            // Look for YAML frontmatter description
            const yamlMatch = fileContent.match(/^---\s*\n([\s\S]*?)\n---/);
            if (yamlMatch) {
                const yamlContent = yamlMatch[1];

                // Try to extract description from YAML
                const descMatch = yamlContent.match(/description:\s*["']?(.*?)["']?\s*$/m);
                if (descMatch) {
                    return descMatch[1].trim();
                }

                // Try to extract from metadata section
                const metadataMatch = yamlContent.match(/metadata:\s*\n([\s\S]*?)(?=\n\w|$)/);
                if (metadataMatch) {
                    const metadataContent = metadataMatch[1];
                    const metaDescMatch = metadataContent.match(/description:\s*["']?(.*?)["']?\s*$/m);
                    if (metaDescMatch) {
                        return metaDescMatch[1].trim();
                    }
                }
            }

            // Fallback: look for description anywhere in the file
            const generalDescMatch = fileContent.match(/description:\s*["']?(.*?)["']?\s*$/m);
            if (generalDescMatch) {
                return generalDescMatch[1].trim();
            }

            return null;
        } catch (error) {
            console.error(`Error extracting description from ${filePath}:`, error);
            return null;
        }
    }

    // Calculate approximate token count (4 chars per token rule)
    calculateTokens(text) {
        if (!text) return 0;
        return Math.ceil(text.length / 4);
    }

    // Analyze what makes descriptions context-heavy
    analyzeContextHeaviness(description) {
        if (!description) return {};

        const components = {
            technicalTerms: this.countTechnicalTerms(description),
            sentenceComplexity: this.analyzeSentenceComplexity(description),
            domainSpecificWords: this.countDomainWords(description),
            exampleCode: this.hasCodeExamples(description),
            listItems: this.countListItems(description)
        };

        return components;
    }

    countTechnicalTerms(text) {
        const technicalTerms = [
            'consensus', 'byzantine', 'raft', 'pbft', 'crdt', 'gossip', 'quorum',
            'distributed', 'protocol', 'algorithm', 'cryptographic', 'threshold',
            'synchronization', 'replication', 'coordination', 'orchestration',
            'neural', 'performance', 'security', 'api', 'microservices',
            'authentication', 'optimization', 'refactoring', 'architecture'
        ];

        let count = 0;
        technicalTerms.forEach(term => {
            const regex = new RegExp(`\\b${term}\\b`, 'gi');
            const matches = text.match(regex);
            if (matches) count += matches.length;
        });

        return count;
    }

    analyzeSentenceComplexity(text) {
        const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
        const avgWordsPerSentence = sentences.reduce((sum, sentence) => {
            return sum + sentence.trim().split(/\s+/).length;
        }, 0) / sentences.length;

        return {
            sentenceCount: sentences.length,
            avgWordsPerSentence: Math.round(avgWordsPerSentence * 100) / 100
        };
    }

    countDomainWords(text) {
        const domainWords = [
            'agent', 'swarm', 'coordination', 'orchestration', 'management',
            'analysis', 'monitoring', 'optimization', 'implementation',
            'validation', 'verification', 'processing', 'execution'
        ];

        let count = 0;
        domainWords.forEach(word => {
            const regex = new RegExp(`\\b${word}\\b`, 'gi');
            const matches = text.match(regex);
            if (matches) count += matches.length;
        });

        return count;
    }

    hasCodeExamples(text) {
        return /```|`[^`]+`/.test(text);
    }

    countListItems(text) {
        const listMatches = text.match(/^\s*[-*+]\s/gm);
        return listMatches ? listMatches.length : 0;
    }

    // Process a single agent file
    processAgentFile(filePath) {
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            const description = this.extractDescription(content, filePath);

            if (!description) {
                console.warn(`No description found in ${filePath}`);
                return null;
            }

            const tokens = this.calculateTokens(description);
            const contextAnalysis = this.analyzeContextHeaviness(description);

            const agentInfo = {
                filePath: filePath,
                fileName: path.basename(filePath, '.md'),
                description: description,
                tokenCount: tokens,
                characterCount: description.length,
                contextAnalysis: contextAnalysis
            };

            // Update global statistics
            this.tokenStats.totalTokens += tokens;

            if (tokens < this.tokenStats.minTokens) {
                this.tokenStats.minTokens = tokens;
                this.tokenStats.minDescription = description;
                this.tokenStats.minAgent = agentInfo.fileName;
            }

            if (tokens > this.tokenStats.maxTokens) {
                this.tokenStats.maxTokens = tokens;
                this.tokenStats.maxDescription = description;
                this.tokenStats.maxAgent = agentInfo.fileName;
            }

            return agentInfo;
        } catch (error) {
            console.error(`Error processing ${filePath}:`, error);
            return null;
        }
    }

    // Find all agent files recursively
    findAgentFiles(dir) {
        const agentFiles = [];

        function walkDir(currentDir) {
            const items = fs.readdirSync(currentDir);

            for (const item of items) {
                const fullPath = path.join(currentDir, item);
                const stat = fs.statSync(fullPath);

                if (stat.isDirectory()) {
                    walkDir(fullPath);
                } else if (item.endsWith('.md') && item !== 'README.md' && item !== 'MIGRATION_SUMMARY.md') {
                    agentFiles.push(fullPath);
                }
            }
        }

        walkDir(dir);
        return agentFiles;
    }

    // Analyze all agent files
    analyzeAllAgents(agentsDir) {
        console.log(`Starting analysis of agents in ${agentsDir}...`);

        const agentFiles = this.findAgentFiles(agentsDir);
        console.log(`Found ${agentFiles.length} agent files`);

        let successCount = 0;
        let failCount = 0;

        for (const filePath of agentFiles) {
            const result = this.processAgentFile(filePath);
            if (result) {
                this.agentData.push(result);
                successCount++;
            } else {
                failCount++;
            }
        }

        console.log(`Processed ${successCount} agents successfully, ${failCount} failed`);

        // Calculate final statistics
        this.calculateFinalStatistics();

        return this.agentData;
    }

    calculateFinalStatistics() {
        if (this.agentData.length === 0) {
            console.warn('No agent data to analyze');
            return;
        }

        // Average tokens
        this.tokenStats.avgTokens = Math.round(this.tokenStats.totalTokens / this.agentData.length * 100) / 100;

        // Token distribution (group by token ranges)
        const tokenRanges = {
            '0-10': 0,
            '11-20': 0,
            '21-30': 0,
            '31-50': 0,
            '51-100': 0,
            '100+': 0
        };

        this.agentData.forEach(agent => {
            const tokens = agent.tokenCount;
            if (tokens <= 10) tokenRanges['0-10']++;
            else if (tokens <= 20) tokenRanges['11-20']++;
            else if (tokens <= 30) tokenRanges['21-30']++;
            else if (tokens <= 50) tokenRanges['31-50']++;
            else if (tokens <= 100) tokenRanges['51-100']++;
            else tokenRanges['100+']++;
        });

        this.tokenStats.tokenDistribution = tokenRanges;

        // Component analysis aggregation
        const componentTotals = {
            technicalTerms: 0,
            sentenceCount: 0,
            avgWordsPerSentence: 0,
            domainSpecificWords: 0,
            hasCodeExamples: 0,
            listItems: 0
        };

        this.agentData.forEach(agent => {
            const analysis = agent.contextAnalysis;
            componentTotals.technicalTerms += analysis.technicalTerms || 0;
            componentTotals.sentenceCount += analysis.sentenceComplexity?.sentenceCount || 0;
            componentTotals.avgWordsPerSentence += analysis.sentenceComplexity?.avgWordsPerSentence || 0;
            componentTotals.domainSpecificWords += analysis.domainSpecificWords || 0;
            componentTotals.hasCodeExamples += analysis.exampleCode ? 1 : 0;
            componentTotals.listItems += analysis.listItems || 0;
        });

        this.tokenStats.componentAnalysis = {
            avgTechnicalTerms: Math.round(componentTotals.technicalTerms / this.agentData.length * 100) / 100,
            avgSentenceCount: Math.round(componentTotals.sentenceCount / this.agentData.length * 100) / 100,
            avgWordsPerSentence: Math.round(componentTotals.avgWordsPerSentence / this.agentData.length * 100) / 100,
            avgDomainWords: Math.round(componentTotals.domainSpecificWords / this.agentData.length * 100) / 100,
            percentWithCodeExamples: Math.round(componentTotals.hasCodeExamples / this.agentData.length * 100),
            avgListItems: Math.round(componentTotals.listItems / this.agentData.length * 100) / 100
        };
    }

    // Generate comprehensive report
    generateReport() {
        const report = {
            summary: {
                totalAgents: this.agentData.length,
                totalTokens: this.tokenStats.totalTokens,
                averageTokensPerAgent: this.tokenStats.avgTokens,
                contextOverheadEstimate: Math.round(this.tokenStats.totalTokens * 1.2) // 20% overhead for selection logic
            },
            extremes: {
                shortest: {
                    agent: this.tokenStats.minAgent,
                    tokens: this.tokenStats.minTokens,
                    description: this.tokenStats.minDescription
                },
                longest: {
                    agent: this.tokenStats.maxAgent,
                    tokens: this.tokenStats.maxTokens,
                    description: this.tokenStats.maxDescription.substring(0, 200) + '...'
                }
            },
            distribution: this.tokenStats.tokenDistribution,
            contextComponents: this.tokenStats.componentAnalysis,
            topHeavyAgents: this.agentData
                .sort((a, b) => b.tokenCount - a.tokenCount)
                .slice(0, 10)
                .map(agent => ({
                    name: agent.fileName,
                    tokens: agent.tokenCount,
                    description: agent.description.substring(0, 100) + '...'
                }))
        };

        return report;
    }

    // Save detailed results to JSON
    saveResults(outputPath) {
        const results = {
            metadata: {
                analysisDate: new Date().toISOString(),
                totalAgentsAnalyzed: this.agentData.length,
                analyzer: 'AgentTokenAnalyzer v1.0'
            },
            summary: this.generateReport(),
            detailedData: this.agentData.map(agent => ({
                fileName: agent.fileName,
                tokenCount: agent.tokenCount,
                characterCount: agent.characterCount,
                description: agent.description,
                contextAnalysis: agent.contextAnalysis
            }))
        };

        fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
        console.log(`Results saved to ${outputPath}`);
    }
}

// Main execution
function main() {
    const analyzer = new AgentTokenAnalyzer();
    const agentsDir = path.join(__dirname, '../.claude/agents');
    const outputPath = path.join(__dirname, 'agent-token-analysis-results.json');

    console.log('='.repeat(60));
    console.log('AGENT TOKEN USAGE ANALYSIS');
    console.log('='.repeat(60));

    // Analyze all agents
    analyzer.analyzeAllAgents(agentsDir);

    // Generate and display report
    const report = analyzer.generateReport();

    console.log('\n📊 ANALYSIS RESULTS:');
    console.log('='.repeat(40));
    console.log(`Total Agents Analyzed: ${report.summary.totalAgents}`);
    console.log(`Total Tokens Across All Descriptions: ${report.summary.totalTokens}`);
    console.log(`Average Tokens Per Description: ${report.summary.averageTokensPerAgent}`);
    console.log(`Estimated Context Overhead: ${report.summary.contextOverheadEstimate} tokens`);

    console.log('\n🔍 DESCRIPTION LENGTH EXTREMES:');
    console.log('='.repeat(40));
    console.log(`Shortest: ${report.extremes.shortest.agent} (${report.extremes.shortest.tokens} tokens)`);
    console.log(`  "${report.extremes.shortest.description}"`);
    console.log(`\nLongest: ${report.extremes.longest.agent} (${report.extremes.longest.tokens} tokens)`);
    console.log(`  "${report.extremes.longest.description}"`);

    console.log('\n📈 TOKEN DISTRIBUTION:');
    console.log('='.repeat(40));
    Object.entries(report.distribution).forEach(([range, count]) => {
        const percentage = Math.round(count / report.summary.totalAgents * 100);
        console.log(`${range.padEnd(8)}: ${count.toString().padStart(3)} agents (${percentage}%)`);
    });

    console.log('\n🧠 CONTEXT COMPLEXITY ANALYSIS:');
    console.log('='.repeat(40));
    console.log(`Average Technical Terms: ${report.contextComponents.avgTechnicalTerms}`);
    console.log(`Average Sentences: ${report.contextComponents.avgSentenceCount}`);
    console.log(`Average Words Per Sentence: ${report.contextComponents.avgWordsPerSentence}`);
    console.log(`Average Domain-Specific Words: ${report.contextComponents.avgDomainWords}`);
    console.log(`Descriptions with Code Examples: ${report.contextComponents.percentWithCodeExamples}%`);
    console.log(`Average List Items: ${report.contextComponents.avgListItems}`);

    console.log('\n🏆 TOP 10 MOST TOKEN-HEAVY AGENTS:');
    console.log('='.repeat(40));
    report.topHeavyAgents.forEach((agent, index) => {
        console.log(`${(index + 1).toString().padStart(2)}. ${agent.name.padEnd(25)} - ${agent.tokens} tokens`);
        console.log(`    "${agent.description}"`);
    });

    console.log('\n💡 CLAUDE CODE CONTEXT IMPACT:');
    console.log('='.repeat(40));
    console.log(`If Claude Code loads all agent descriptions for selection:`);
    console.log(`- Base description tokens: ${report.summary.totalTokens}`);
    console.log(`- With selection logic overhead: ~${report.summary.contextOverheadEstimate} tokens`);
    console.log(`- Percentage of typical context window (8K): ${Math.round(report.summary.contextOverheadEstimate / 8000 * 100)}%`);
    console.log(`- Percentage of large context window (32K): ${Math.round(report.summary.contextOverheadEstimate / 32000 * 100)}%`);

    // Save detailed results
    analyzer.saveResults(outputPath);

    console.log('\n✅ Analysis complete!');
    console.log(`Detailed results saved to: ${outputPath}`);
}

main();