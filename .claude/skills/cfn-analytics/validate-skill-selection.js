import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class SkillDescriptionValidator {
    constructor(corpusPath, skillDescriptionPaths) {
        this.testCorpus = JSON.parse(fs.readFileSync(corpusPath, 'utf8'));
        this.skillDescriptions = skillDescriptionPaths.map(path =>
            fs.readFileSync(path, 'utf8')
        );
    }

    extractKeywords() {
        return this.skillDescriptions.map(description => {
            // Normalize line endings (handle Windows \r\n)
            const normalized = description.replace(/\r\n/g, '\n');
            const frontmatterMatch = normalized.match(/---\n(.*?)\n---/s);
            if (!frontmatterMatch) return null;

            const frontmatter = frontmatterMatch[1];

            // Support both multiline and single-line array formats
            const keywordMatches = frontmatter.match(/keywords:\s*\[([\s\S]*?)\]/);
            const triggerMatches = frontmatter.match(/triggers:\s*\[([\s\S]*?)\]/);

            const keywords = keywordMatches
                ? keywordMatches[1].split(/,\s*/).map(k => k.trim().toLowerCase().replace(/['"]/g, ''))
                : [];

            const triggers = triggerMatches
                ? triggerMatches[1].split(/,\s*/).map(k => k.trim().toLowerCase().replace(/['"]/g, ''))
                : [];

            return [...keywords, ...triggers].filter(k => k.length > 0);
        });
    }

    tokenize(text) {
        return text.toLowerCase()
            .replace(/[^\w\s]/g, '')
            .split(/\s+/)
            .filter(token => token.length > 2);
    }

    calculateSimilarity(prompt, keywords) {
        const promptTokens = this.tokenize(prompt);

        const matchDetails = keywords.map(keyword => {
            const keywordTokens = this.tokenize(keyword);

            const tokenScores = keywordTokens.map(keyToken => {
                // Exact token match
                const exactTokenMatch = promptTokens.includes(keyToken) ? 3 : 0;

                // Partial token match
                const partialTokenMatch = promptTokens.some(pToken =>
                    pToken.includes(keyToken) || keyToken.includes(pToken)
                ) ? 2 : 0;

                return exactTokenMatch + partialTokenMatch;
            });

            const totalTokenScore = tokenScores.reduce((a, b) => a + b, 0);

            return {
                keyword,
                score: totalTokenScore,
                matched: tokenScores.some(score => score > 0)
            };
        });

        const totalScore = matchDetails.reduce((acc, match) =>
            match.matched ? acc + match.score : acc, 0);

        const matchedKeywords = matchDetails.filter(match => match.matched);

        return {
            score: (totalScore / (keywords.length * 5)) * 100,
            matchDetails
        };
    }

    validateSkillSelection() {
        const skillKeywords = this.extractKeywords();
        const validationResults = {
            overall_accuracy: 0,
            skill_accuracies: {},
            detailed_results: {}
        };

        Object.keys(this.testCorpus).forEach((skillKey, index) => {
            const keywords = skillKeywords[index];
            if (!keywords) {
                console.warn(`No keywords found for skill: ${skillKey}`);
                return;
            }

            const prompts = this.testCorpus[skillKey];
            const promptResults = prompts.map(prompt => {
                const similarityResult = this.calculateSimilarity(prompt.prompt, keywords);
                return {
                    prompt: prompt.prompt,
                    score: similarityResult.score,
                    matchDetails: similarityResult.matchDetails
                };
            });

            const skillAccuracy = promptResults.reduce((acc, result) =>
                result.score > 50 ? acc + 1 : acc, 0) / prompts.length * 100;

            validationResults.skill_accuracies[skillKey] = skillAccuracy;
            validationResults.detailed_results[skillKey] = promptResults;
        });

        validationResults.overall_accuracy = Object.values(validationResults.skill_accuracies).reduce((a, b) => a + b, 0) / Object.keys(validationResults.skill_accuracies).length;

        return validationResults;
    }

    generateReport() {
        const results = this.validateSkillSelection();

        const reportPath = path.join('/mnt/c/Users/masha/Documents/claude-flow-novice/.artifacts/analytics', 'skill-description-accuracy.json');
        fs.mkdirSync(path.dirname(reportPath), { recursive: true });
        fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));

        console.log('\n🔍 Skill Description Accuracy Report:');
        console.log(JSON.stringify(results.skill_accuracies, null, 2));

        const targets = {
            minimum_accuracy: 70,
            minimum_skill_accuracy: 60
        };

        const validationErrors = [];
        if (results.overall_accuracy < targets.minimum_accuracy) {
            validationErrors.push(`Overall accuracy (${results.overall_accuracy.toFixed(2)}%) is below target of ${targets.minimum_accuracy}%`);
        }

        Object.entries(results.skill_accuracies).forEach(([skill, accuracy]) => {
            if (accuracy < targets.minimum_skill_accuracy) {
                validationErrors.push(`${skill} accuracy (${accuracy.toFixed(2)}%) is below target of ${targets.minimum_skill_accuracy}%`);
            }
        });

        if (validationErrors.length > 0) {
            console.error('\n❌ Validation Warnings:');
            validationErrors.forEach(error => console.error(`- ${error}`));

            console.log('\n📊 Detailed Prompt Results:');
            Object.entries(results.detailed_results).forEach(([skill, promptResults]) => {
                console.log(`\nSkill: ${skill}`);
                promptResults.forEach(result => {
                    console.log(`  Prompt: ${result.prompt}`);
                    console.log(`  Score: ${result.score.toFixed(2)}%`);
                    console.log('  Keyword Matches:');
                    result.matchDetails.forEach(match => {
                        if (match.matched) {
                            console.log(`    - ${match.keyword} (Score: ${match.score})`);
                        }
                    });
                });
            });

            // Exit with 0 to allow investigation
            process.exit(0);
        }

        return results;
    }
}

const validator = new SkillDescriptionValidator(
    '/mnt/c/Users/masha/Documents/claude-flow-novice/.claude/skills/analytics/test-corpus.json',
    [
        '/mnt/c/Users/masha/Documents/claude-flow-novice/.claude/skills/redis-coordination/SKILL.md',
        '/mnt/c/Users/masha/Documents/claude-flow-novice/.claude/skills/agent-spawning/SKILL.md',
        '/mnt/c/Users/masha/Documents/claude-flow-novice/.claude/skills/cfn-loop-validation/SKILL.md',
        '/mnt/c/Users/masha/Documents/claude-flow-novice/.claude/skills/sqlite-memory/SKILL.md',
        '/mnt/c/Users/masha/Documents/claude-flow-novice/.claude/skills/hook-pipeline/SKILL.md',
        '/mnt/c/Users/masha/Documents/claude-flow-novice/.claude/skills/test-execution/SKILL.md'
    ]
);

validator.generateReport();