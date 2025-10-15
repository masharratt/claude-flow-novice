#!/usr/bin/env node

/**
 * Launch Web Dashboard Slash Command
 *
 * Launch the web dashboard for monitoring and management
 */

export class LaunchWebDashboardCommand {
  constructor() {
    this.name = 'launch-web-dashboard';
    this.description = 'Launch the web dashboard for monitoring and management';
    this.usage = '/launch-web-dashboard [--port number] [--host address] [--dev]';
  }

  /**
   * Execute the launch web dashboard command
   * @param {Array<string>} args - Command arguments
   * @param {Object} context - Execution context
   */
  async execute(args, context = {}) {
    const options = this.parseArgs(args);

    try {
      // Check if dashboard files exist
      const dashboardExists = await this.checkDashboardFiles();

      if (!dashboardExists) {
        return {
          success: false,
          error: 'Web dashboard not found. Run setup first or check installation.',
          suggestion: 'The web dashboard may need to be installed or built first.'
        };
      }

      // Launch dashboard
      const dashboardUrl = await this.launchDashboard(options);

      return {
        success: true,
        url: dashboardUrl,
        port: options.port || 3000,
        host: options.host || 'localhost',
        dev: options.dev || false,
        message: `Web dashboard launched at ${dashboardUrl}`
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to launch web dashboard: ${error.message}`,
        options: options
      };
    }
  }

  /**
   * Parse command arguments
   * @param {Array<string>} args - Command arguments
   */
  parseArgs(args) {
    const options = {
      port: null,
      host: null,
      dev: false
    };

    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      if (arg.startsWith('--')) {
        const [key, value] = arg.substring(2).split('=');
        if (key === 'port') {
          options.port = parseInt(value) || null;
        } else if (key === 'host') {
          options.host = value;
        } else if (key === 'dev') {
          options.dev = true;
        }
      }
    }

    return options;
  }

  /**
   * Check if dashboard files exist
   */
  async checkDashboardFiles() {
    const fs = await import('fs/promises');
    const path = await import('path');

    const possiblePaths = [
      './dist/web-dashboard/index.html',
      './web-dashboard/index.html',
      './src/web-dashboard/index.html',
      './dashboard/index.html'
    ];

    for (const dashboardPath of possiblePaths) {
      try {
        await fs.access(path.resolve(dashboardPath));
        return true;
      } catch {
        // Continue checking other paths
      }
    }

    return false;
  }

  /**
   * Launch the web dashboard
   * @param {Object} options - Launch options
   */
  async launchDashboard(options) {
    const { spawn } = await import('child_process');
    const path = await import('path');

    const port = options.port || 3000;
    const host = options.host || 'localhost';

    // Try different methods to launch the dashboard

    // Method 1: Check if there's a dedicated dashboard server script
    const serverScripts = [
      './scripts/start-dashboard.js',
      './scripts/dashboard-server.js',
      './dist/scripts/start-dashboard.js'
    ];

    for (const script of serverScripts) {
      try {
        await import('fs/promises').then(fs => fs.access(path.resolve(script)));

        // Launch the dedicated server
        const child = spawn('node', [script, '--port', port.toString()], {
          stdio: 'inherit',
          detached: true
        });

        child.unref();

        return `http://${host}:${port}`;
      } catch {
        // Script doesn't exist, try next method
      }
    }

    // Method 2: Try to use a simple HTTP server
    const fs = await import('fs/promises');

    // Find the dashboard directory
    const dashboardDirs = [
      './dist/web-dashboard',
      './web-dashboard',
      './src/web-dashboard',
      './dashboard'
    ];

    let dashboardDir = null;
    for (const dir of dashboardDirs) {
      try {
        await fs.access(path.resolve(dir));
        dashboardDir = dir;
        break;
      } catch {
        // Continue checking
      }
    }

    if (dashboardDir) {
      // Try to use a simple Node.js HTTP server
      const serverScript = this.createSimpleServer(dashboardDir, port);
      const tempScriptPath = path.resolve('./temp-dashboard-server.js');

      await fs.writeFile(tempScriptPath, serverScript);

      const child = spawn('node', [tempScriptPath], {
        stdio: 'inherit',
        detached: true
      });

      child.unref();

      // Clean up temp file after a delay
      setTimeout(() => {
        fs.unlink(tempScriptPath).catch(() => {
          // Ignore cleanup errors
        });
      }, 5000);

      return `http://${host}:${port}`;
    }

    // Method 3: Fall back to external tools
    try {
      // Try to use Python's built-in HTTP server
      const pythonProcess = spawn('python3', ['-m', 'http.server', port.toString()], {
        cwd: dashboardDir || '.',
        stdio: 'inherit',
        detached: true
      });

      pythonProcess.unref();

      return `http://${host}:${port}`;
    } catch {
      // Try Python 2
      try {
        const pythonProcess = spawn('python', ['-m', 'SimpleHTTPServer', port.toString()], {
          cwd: dashboardDir || '.',
          stdio: 'inherit',
          detached: true
        });

        pythonProcess.unref();

        return `http://${host}:${port}`;
      } catch {
        // Try npx serve
        try {
          const serveProcess = spawn('npx', ['serve', '-l', port.toString(), dashboardDir || '.'], {
            stdio: 'inherit',
            detached: true
          });

          serveProcess.unref();

          return `http://${host}:${port}`;
        } catch {
          throw new Error('Failed to launch dashboard server. No suitable server found.');
        }
      }
    }
  }

  /**
   * Create a simple HTTP server script
   * @param {string} dir - Directory to serve
   * @param {number} port - Port to listen on
   */
  createSimpleServer(dir, port) {
    return `
const http = require('http');
const fs = require('fs');
const path = require('path');

const directory = path.resolve('${dir}');
const PORT = ${port};

const mimeTypes = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.wav': 'audio/wav',
  '.mp4': 'video/mp4',
  '.woff': 'application/font-woff',
  '.ttf': 'application/font-ttf',
  '.eot': 'application/vnd.ms-fontobject',
  '.otf': 'application/font-otf',
  '.wasm': 'application/wasm'
};

const server = http.createServer((req, res) => {
  console.log(\`Request: \${req.method} \${req.url}\`);

  // Handle CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  let filePath = path.join(directory, req.url === '/' ? 'index.html' : req.url);

  // Security check - prevent directory traversal
  if (!filePath.startsWith(directory)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  const extname = String(path.extname(filePath)).toLowerCase();
  const mimeType = mimeTypes[extname] || 'application/octet-stream';

  fs.readFile(filePath, (error, content) => {
    if (error) {
      if (error.code === 'ENOENT') {
        // Try to find index.html in subdirectory
        const indexPath = path.join(filePath, 'index.html');
        fs.readFile(indexPath, (indexError, indexContent) => {
          if (indexError) {
            res.writeHead(404);
            res.end('File not found');
          } else {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(indexContent, 'utf-8');
          }
        });
      } else {
        res.writeHead(500);
        res.end('Server error');
      }
    } else {
      res.writeHead(200, { 'Content-Type': mimeType });
      res.end(content, 'utf-8');
    }
  });
});

server.listen(PORT, () => {
  console.log(\`Dashboard server running at http://localhost:\${PORT}\`);
  console.log(\`Serving directory: \${directory}\`);
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down gracefully');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('Received SIGINT, shutting down gracefully');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
`;
  }

  /**
   * Get help information
   */
  getHelp() {
    return {
      name: this.name,
      description: this.description,
      usage: this.usage,
      examples: [
        '/launch-web-dashboard',
        '/launch-web-dashboard --port 8080',
        '/launch-web-dashboard --host 0.0.0.0 --port 3000',
        '/launch-web-dashboard --dev'
      ],
      options: [
        {
          name: '--port',
          description: 'Port number for the dashboard (default: 3000)'
        },
        {
          name: '--host',
          description: 'Host address for the dashboard (default: localhost)'
        },
        {
          name: '--dev',
          description: 'Launch in development mode with hot reload'
        }
      ],
      notes: [
        'The dashboard provides real-time monitoring of agents, tasks, and system metrics.',
        'Requires the web dashboard to be built or installed.',
        'Automatically detects and uses the best available server method.'
      ]
    };
  }
}

export default LaunchWebDashboardCommand;