/**
 * Precise TODO Detection Fix
 * Based on exact original test cases from scenario-testing.cjs
 * Target: Fix the 1 failing case to achieve >95% accuracy (18/18 = 100%)
 */

const fs = require('fs');
const path = require('path');

class PreciseTodoDetectionFix {
    constructor() {
        this.minimumAccuracyRequired = 95;
    }

    // Original detection method from scenario-testing.cjs
    async detectTodoPatternsOriginal(code) {
        const todoPatterns = [
            /\/\/\s*(TODO|FIXME|HACK)/i,
            /\/\*[\s\S]*?(TODO|FIXME|HACK)[\s\S]*?\*\//i,
            /throw new Error\s*\(\s*["'].*not.*implemented.*["']\s*\)/i,
            /placeholder|implementation goes here/i,
            /undefined.*placeholder/i
        ];

        return todoPatterns.some(pattern => pattern.test(code));
    }

    // Fixed detection method - only fix the failing pattern
    async detectTodoPatternsFixed(code) {
        const fixedPatterns = [
            /\/\/\s*(TODO|FIXME|HACK)/i,
            /\/\*[\s\S]*?(TODO|FIXME|HACK)[\s\S]*?\*\//i,
            /throw new Error\s*\(\s*["'].*not.*implemented.*["']\s*\)/i,
            /placeholder|implementation goes here/i,
            /undefined.*placeholder/i,

            // Fix for the failing console.log TODO pattern
            /console\.(log|warn|error)\s*\(\s*["'].*TODO.*["']\s*\)/i
        ];

        return fixedPatterns.some(pattern => pattern.test(code));
    }

    // Exact original test cases from scenario-testing.cjs
    getOriginalTestCases() {
        return [
            // Positive cases (should detect)
            { code: 'function test() { // TODO: implement this function }', expectedDetection: true, category: 'standard-todo' },
            { code: 'class User { /* FIXME: broken authentication */ }', expectedDetection: true, category: 'fixme-comment' },
            { code: 'const value = undefined; // placeholder for future implementation', expectedDetection: true, category: 'placeholder' },
            { code: 'throw new Error("Not implemented yet");', expectedDetection: true, category: 'not-implemented' },
            { code: 'return null; // TODO: return actual data', expectedDetection: true, category: 'todo-return' },
            { code: '// HACK: temporary solution', expectedDetection: true, category: 'hack-comment' },
            { code: 'console.log("TODO: remove debug code");', expectedDetection: true, category: 'debug-todo' },
            { code: 'if (false) { // TODO: implement condition }', expectedDetection: true, category: 'conditional-todo' },

            // Negative cases (should not detect)
            { code: 'function complete() { return "finished implementation"; }', expectedDetection: false, category: 'complete-function' },
            { code: 'class CompleteUser { login() { return authenticate(this.credentials); } }', expectedDetection: false, category: 'complete-class' },
            { code: 'const API_ENDPOINT = "https://api.example.com";', expectedDetection: false, category: 'constant' },
            { code: 'return data.filter(item => item.active).map(item => item.id);', expectedDetection: false, category: 'functional-code' },
            { code: '// This function handles user authentication properly', expectedDetection: false, category: 'descriptive-comment' },
            { code: 'export default { name: "TodoApp", description: "A complete todo application" };', expectedDetection: false, category: 'config-object' },

            // Edge cases
            { code: 'const todoList = ["buy milk", "walk dog"];', expectedDetection: false, category: 'todo-data' },
            { code: '"TODO: this is just a string, not a comment"', expectedDetection: false, category: 'string-content' },
            { code: '/* multi-line comment with TODO inside should be detected */', expectedDetection: true, category: 'multiline-todo' },
            { code: 'function doSomething() { /* implementation goes here */ }', expectedDetection: true, category: 'implementation-comment' }
        ];
    }

    async runPreciseAnalysis() {
        console.log('🎯 Precise TODO Detection Fix Analysis');
        console.log('=' .repeat(50));

        const testCases = this.getOriginalTestCases();
        console.log(`📋 Total test cases: ${testCases.length} (exact original set)`);

        let originalCorrect = 0;
        let fixedCorrect = 0;
        const failures = [];
        const improvements = [];

        console.log('\n🧪 Testing each case...');

        for (let i = 0; i < testCases.length; i++) {
            const testCase = testCases[i];

            const originalResult = await this.detectTodoPatternsOriginal(testCase.code);
            const fixedResult = await this.detectTodoPatternsFixed(testCase.code);

            const originalIsCorrect = originalResult === testCase.expectedDetection;
            const fixedIsCorrect = fixedResult === testCase.expectedDetection;

            if (originalIsCorrect) originalCorrect++;
            if (fixedIsCorrect) fixedCorrect++;

            console.log(`${i + 1}. [${testCase.category}] Original: ${originalIsCorrect ? '✅' : '❌'} Fixed: ${fixedIsCorrect ? '✅' : '❌'}`);

            if (!originalIsCorrect) {
                failures.push({
                    index: i + 1,
                    code: testCase.code,
                    expected: testCase.expectedDetection,
                    got: originalResult,
                    category: testCase.category
                });
            }

            if (!originalIsCorrect && fixedIsCorrect) {
                improvements.push({
                    index: i + 1,
                    code: testCase.code,
                    expected: testCase.expectedDetection,
                    original: originalResult,
                    fixed: fixedResult,
                    category: testCase.category
                });
            }
        }

        const originalAccuracy = (originalCorrect / testCases.length) * 100;
        const fixedAccuracy = (fixedCorrect / testCases.length) * 100;
        const improvement = fixedAccuracy - originalAccuracy;

        console.log('\n📊 Precision Analysis Results:');
        console.log(`Original System: ${originalAccuracy.toFixed(2)}% (${originalCorrect}/${testCases.length})`);
        console.log(`Fixed System: ${fixedAccuracy.toFixed(2)}% (${fixedCorrect}/${testCases.length})`);
        console.log(`Improvement: ${improvement >= 0 ? '+' : ''}${improvement.toFixed(2)}%`);
        console.log(`Required: >${this.minimumAccuracyRequired}%`);
        console.log(`Meets Requirements: ${fixedAccuracy >= this.minimumAccuracyRequired ? '✅ YES' : '❌ NO'}`);

        if (failures.length > 0) {
            console.log('\n❌ Original System Failures:');
            failures.forEach(failure => {
                console.log(`${failure.index}. [${failure.category}] "${failure.code}"`);
                console.log(`   Expected: ${failure.expected}, Got: ${failure.got}`);
            });
        }

        if (improvements.length > 0) {
            console.log('\n✅ Improvements Made:');
            improvements.forEach(improvement => {
                console.log(`${improvement.index}. [${improvement.category}] "${improvement.code}"`);
                console.log(`   ${improvement.original} → ${improvement.fixed} (Expected: ${improvement.expected})`);
            });
        } else {
            console.log('\n✅ All original failures have been fixed!');
        }

        return {
            totalCases: testCases.length,
            originalAccuracy,
            fixedAccuracy,
            improvement,
            meetsRequirements: fixedAccuracy >= this.minimumAccuracyRequired,
            failures,
            improvements
        };
    }

    generateFixedImplementation() {
        return `/**
 * Fixed TODO Detection System - Achieves >95% Accuracy
 * Minimal fix to the original patterns to handle console.log TODO patterns
 */

async function detectTodoPatterns(code) {
    const fixedPatterns = [
        // Original successful patterns - keep unchanged
        /\\/\\/\\s*(TODO|FIXME|HACK)/i,
        /\\/\\*[\\s\\S]*?(TODO|FIXME|HACK)[\\s\\S]*?\\*\\//i,
        /throw new Error\\s*\\(\\s*["'].*not.*implemented.*["']\\s*\\)/i,
        /placeholder|implementation goes here/i,
        /undefined.*placeholder/i,

        // Fix for console.log TODO patterns (the missing case)
        /console\\.(log|warn|error)\\s*\\(\\s*["'].*TODO.*["']\\s*\\)/i
    ];

    return fixedPatterns.some(pattern => pattern.test(code));
}

async function detectIncompleteImplementation(code) {
    const incompletePatterns = [
        /function\\s+\\w+\\s*\\([^)]*\\)\\s*\\{\\s*\\}/,
        /class\\s+\\w+\\s*\\{\\s*\\}/,
        /throw new Error\\s*\\(\\s*["'].*not.*implemented.*["']\\s*\\)/i,
        /=>\\s*\\{\\s*\\}/
    ];

    return incompletePatterns.some(pattern => pattern.test(code));
}

module.exports = { detectTodoPatterns, detectIncompleteImplementation };`;
    }
}

// Execute precise analysis
if (require.main === module) {
    (async () => {
        const fixer = new PreciseTodoDetectionFix();
        const results = await fixer.runPreciseAnalysis();

        console.log('\n📋 Generating Fixed Implementation...');
        const fixedCode = fixer.generateFixedImplementation();

        const outputPath = path.join(__dirname, 'fixed-todo-detector.js');
        fs.writeFileSync(outputPath, fixedCode);
        console.log(`💾 Fixed implementation saved to: ${outputPath}`);

        console.log('\n🏁 Precise Fix Complete');
        console.log(`Target Accuracy: ${results.meetsRequirements ? '✅ ACHIEVED' : '❌ FAILED'}`);
        console.log(`Final Accuracy: ${results.fixedAccuracy.toFixed(2)}%`);

        if (results.meetsRequirements) {
            console.log('\n🎯 SUCCESS: TODO detection accuracy improved to >95% requirement!');
        }

        process.exit(results.meetsRequirements ? 0 : 1);
    })();
}

module.exports = { PreciseTodoDetectionFix };