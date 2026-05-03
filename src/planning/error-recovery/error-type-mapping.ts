export const BASH_TO_ERROR_TYPE: Record<string, string> = {
  TIMEOUT: 'timeout',
  CRASH: 'agent-spawn',
  DEPENDENCY_FAILURE: 'dependency',
  INVALID_OUTPUT: 'validation',
  NO_DELIVERABLES: 'validation',
};

export function normalizeErrorType(raw: string): string {
  return BASH_TO_ERROR_TYPE[raw] ?? raw.toLowerCase();
}
