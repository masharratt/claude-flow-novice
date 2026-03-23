/**
 * Base SlashCommand class for claude-flow-novice
 */

export class SlashCommand {
  constructor(name, description) {
    this.name = name;
    this.description = description;
  }

  async execute(args, context) {
    throw new Error(`Command ${this.name} must implement execute method`);
  }

  getHelp() {
    return {
      name: this.name,
      description: this.description,
      usage: `/${this.name} <args>`
    };
  }
}

export default SlashCommand;