/**
 * Tool Definitions for CLI-Spawned Agents
 *
 * Converts agent markdown tool names to Anthropic API tool definitions.
 * Implements core tools: Read, Write, Edit, Bash, TodoWrite
 */

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, any>;
    required: string[];
  };
}

/**
 * Tool registry mapping agent tool names to Anthropic API format
 */
const TOOL_REGISTRY: Record<string, ToolDefinition> = {
  Read: {
    name: 'Read',
    description: 'Reads a file from the local filesystem. Can access any file by absolute path.',
    input_schema: {
      type: 'object',
      properties: {
        file_path: {
          type: 'string',
          description: 'The absolute path to the file to read'
        },
        limit: {
          type: 'number',
          description: 'Optional: The number of lines to read (for large files)'
        },
        offset: {
          type: 'number',
          description: 'Optional: The line number to start reading from'
        }
      },
      required: ['file_path']
    }
  },

  Write: {
    name: 'Write',
    description: 'Writes content to a file. Creates new file or overwrites existing file.',
    input_schema: {
      type: 'object',
      properties: {
        file_path: {
          type: 'string',
          description: 'The absolute path to the file to write (must be absolute, not relative)'
        },
        content: {
          type: 'string',
          description: 'The content to write to the file'
        }
      },
      required: ['file_path', 'content']
    }
  },

  Edit: {
    name: 'Edit',
    description: 'Performs exact string replacement in files. Must read file first before editing.',
    input_schema: {
      type: 'object',
      properties: {
        file_path: {
          type: 'string',
          description: 'The absolute path to the file to modify'
        },
        old_string: {
          type: 'string',
          description: 'The exact text to replace (must be unique in file)'
        },
        new_string: {
          type: 'string',
          description: 'The text to replace it with'
        },
        replace_all: {
          type: 'boolean',
          description: 'Optional: Replace all occurrences (default false)'
        }
      },
      required: ['file_path', 'old_string', 'new_string']
    }
  },

  Bash: {
    name: 'Bash',
    description: 'Executes bash commands in a persistent shell session. For terminal operations like git, npm, docker.',
    input_schema: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: 'The bash command to execute'
        },
        description: {
          type: 'string',
          description: 'Clear, concise description of what this command does (5-10 words)'
        },
        timeout: {
          type: 'number',
          description: 'Optional timeout in milliseconds (max 600000, default 120000)'
        },
        run_in_background: {
          type: 'boolean',
          description: 'Optional: Run command in background (default false)'
        }
      },
      required: ['command']
    }
  },

  TodoWrite: {
    name: 'TodoWrite',
    description: 'Creates and manages structured task list for tracking progress.',
    input_schema: {
      type: 'object',
      properties: {
        todos: {
          type: 'array',
          description: 'Array of todo items with content, status, and activeForm',
          items: {
            type: 'object',
            properties: {
              content: {
                type: 'string',
                description: 'Task description in imperative form (e.g., "Run tests")'
              },
              status: {
                type: 'string',
                enum: ['pending', 'in_progress', 'completed'],
                description: 'Task status'
              },
              activeForm: {
                type: 'string',
                description: 'Present continuous form shown during execution (e.g., "Running tests")'
              }
            },
            required: ['content', 'status', 'activeForm']
          }
        }
      },
      required: ['todos']
    }
  },

  Glob: {
    name: 'Glob',
    description: 'Fast file pattern matching. Supports glob patterns like "**/*.js".',
    input_schema: {
      type: 'object',
      properties: {
        pattern: {
          type: 'string',
          description: 'The glob pattern to match files against'
        },
        path: {
          type: 'string',
          description: 'Optional: Directory to search in (defaults to current working directory)'
        }
      },
      required: ['pattern']
    }
  },

  Grep: {
    name: 'Grep',
    description: 'Powerful search tool built on ripgrep. Supports regex patterns.',
    input_schema: {
      type: 'object',
      properties: {
        pattern: {
          type: 'string',
          description: 'The regular expression pattern to search for'
        },
        path: {
          type: 'string',
          description: 'Optional: File or directory to search in'
        },
        output_mode: {
          type: 'string',
          enum: ['content', 'files_with_matches', 'count'],
          description: 'Output mode (default: files_with_matches)'
        },
        glob: {
          type: 'string',
          description: 'Optional: Glob pattern to filter files'
        },
        type: {
          type: 'string',
          description: 'Optional: File type (js, py, rust, etc.)'
        },
        '-i': {
          type: 'boolean',
          description: 'Case insensitive search'
        },
        '-n': {
          type: 'boolean',
          description: 'Show line numbers (requires output_mode: content)'
        },
        '-A': {
          type: 'number',
          description: 'Lines to show after match (requires output_mode: content)'
        },
        '-B': {
          type: 'number',
          description: 'Lines to show before match (requires output_mode: content)'
        },
        '-C': {
          type: 'number',
          description: 'Lines to show before and after match (requires output_mode: content)'
        }
      },
      required: ['pattern']
    }
  }
};

/**
 * Convert agent tool names to Anthropic API tool definitions
 */
export function convertToolNames(toolNames: string[]): ToolDefinition[] {
  const definitions: ToolDefinition[] = [];

  for (const toolName of toolNames) {
    const definition = TOOL_REGISTRY[toolName];
    if (definition) {
      definitions.push(definition);
    } else {
      console.warn(`[tool-definitions] Unknown tool: ${toolName}`);
    }
  }

  return definitions;
}

/**
 * Get tool definition by name
 */
export function getToolDefinition(toolName: string): ToolDefinition | undefined {
  return TOOL_REGISTRY[toolName];
}

/**
 * Check if tool name is valid
 */
export function isValidTool(toolName: string): boolean {
  return toolName in TOOL_REGISTRY;
}

/**
 * Get all available tool names
 */
export function getAvailableTools(): string[] {
  return Object.keys(TOOL_REGISTRY);
}
