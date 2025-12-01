/**
 * Security Test: Path Traversal Vulnerability (CVSS 9.1)
 *
 * Target: taskId validation in cfn-deliverable and test utilities
 * Vulnerability: Unsanitized taskId in file path construction
 * Attack Vector: Malicious taskId like "../../etc/passwd"
 * Impact: Arbitrary file write/read outside intended directory
 *
 * TDD Protocol: All tests MUST FAIL before fix, PASS after fix
 */
/**
 * Construct safe deliverable path
 * MUST validate taskId before path construction
 */
export declare function getDeliverablePath(taskId: string, filename: string): string;
//# sourceMappingURL=path-traversal-validation.test.d.ts.map