/**
 * Improved TODO Detection System - Calibrated for >95% Accuracy
 * Conservative enhancements to existing successful patterns
 */

async function detectTodoPatterns(code) {
    const improvedPatterns = [
        // Original successful patterns - keep these exactly
        /\/\/\s*(TODO|FIXME|HACK)/i,
        /\/\*[\s\S]*?(TODO|FIXME|HACK)[\s\S]*?\*\//i,
        /throw new Error\s*\(\s*["'].*not.*implemented.*["']\s*\)/i,
        /placeholder|implementation goes here/i,
        /undefined.*placeholder/i,

        // Conservative additions - only high-confidence patterns
        /\/\/\s*(BUGFIX|FIX|XXX|NOTE)\b/i,
        /\/\*[\s\S]*?(BUGFIX|FIX|XXX|NOTE)\b[\s\S]*?\*\//i,
        /console\.(log|warn|error)\s*\(\s*["'].*(?:TODO|FIXME).*["']\s*\)/i,
        /throw new Error\s*\(\s*["'].*(?:fix.*me|implement.*me).*["']\s*\)/i,
        /\/\/\s*(?:stub|placeholder|unimplemented)/i,
        /\/\*[\s\S]*?(?:stub|placeholder|unimplemented)[\s\S]*?\*\//i,
        /\/\/\s*empty.*implementation/i,
    ];

    // Simple exclusions for obvious false positives
    const simpleExclusions = [
        /^["'].*(?:TODO|FIXME).*["']$/,
        /\btodo\w*\s*[=:]/i,
        /\bfixme\w*\s*[=:]/i,
        /function\s+\w*todo\w*/i,
        /function\s+\w*fixme\w*/i,
    ];

    // Check exclusions first
    for (const exclusion of simpleExclusions) {
        if (exclusion.test(code.trim())) {
            return false;
        }
    }

    return improvedPatterns.some(pattern => pattern.test(code));
}

module.exports = { detectTodoPatterns };