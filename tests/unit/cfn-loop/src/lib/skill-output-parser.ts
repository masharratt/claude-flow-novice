// Stub: skill output parser
// Created to satisfy test imports

export interface ParsedOutput {
  type: 'success' | 'error' | 'warning';
  message: string;
  data?: unknown;
  metadata?: Record<string, unknown>;
}

export class SkillOutputParser {
  parse(output: string): ParsedOutput {
    // Stub implementation
    return {
      type: 'success',
      message: output,
    };
  }

  parseJson(output: string): unknown {
    try {
      return JSON.parse(output);
    } catch {
      return { error: 'Invalid JSON', raw: output };
    }
  }
}

export function parseSkillOutput(output: string): ParsedOutput {
  const parser = new SkillOutputParser();
  return parser.parse(output);
}
