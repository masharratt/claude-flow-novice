// Stub: agent output parser
// Created to satisfy test imports

export interface ParsedAgentOutput {
  success: boolean;
  data?: unknown;
  error?: string;
  metadata?: Record<string, unknown>;
}

export class AgentOutputParser {
  parse(output: string): ParsedAgentOutput {
    // Stub implementation
    try {
      const data = JSON.parse(output);
      return { success: true, data };
    } catch {
      return { success: true, data: output };
    }
  }
}

export function parseAgentOutput(output: string): ParsedAgentOutput {
  const parser = new AgentOutputParser();
  return parser.parse(output);
}
