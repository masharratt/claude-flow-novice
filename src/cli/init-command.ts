import { Command } from 'commander';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function registerInitCommand(program: Command) {
  program
    .command('init')
    .description('Initialize Claude Flow Novice CFN project')
    .action(async () => {
      try {
        // Dynamically import the init-project script
        const { default: initializeCfnProject } = await import(
          path.resolve(__dirname, '../../scripts/init-project.js')
        );

        // Execute initialization
        await initializeCfnProject();
      } catch (error) {
        console.error('CFN Initialization Error:', error);
        process.exit(1);
      }
    });
}

export default registerInitCommand;