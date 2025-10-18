#!/usr/bin/env node

/**
 * Fullstack Slash Command
 *
 * Full-stack development workflow automation
 */

export class FullstackCommand {
  constructor() {
    this.name = 'fullstack';
    this.description = 'Full-stack development workflow automation';
    this.usage = '/fullstack <action> [project-name] [options]';
  }

  /**
   * Execute the fullstack command
   * @param {Array<string>} args - Command arguments
   * @param {Object} context - Execution context
   */
  async execute(args, context = {}) {
    if (args.length === 0) {
      return {
        success: false,
        error: 'Action required. Use: init, build, test, deploy, scaffold, analyze'
      };
    }

    const action = args[0];
    const projectName = args[1];
    const options = this.parseArgs(args.slice(2));

    try {
      let result;

      switch (action) {
        case 'init':
          result = await this.initFullstack(projectName, options, context);
          break;
        case 'scaffold':
          result = await this.scaffoldProject(projectName, options, context);
          break;
        case 'build':
          result = await this.buildProject(options, context);
          break;
        case 'test':
          result = await this.testProject(options, context);
          break;
        case 'deploy':
          result = await this.deployProject(options, context);
          break;
        case 'analyze':
          result = await this.analyzeProject(options, context);
          break;
        default:
          result = {
            success: false,
            error: `Unknown action: ${action}. Use: init, scaffold, build, test, deploy, analyze`
          };
      }

      return {
        success: result.success,
        action: action,
        projectName: projectName,
        options: options,
        ...result,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        success: false,
        error: `Fullstack command failed: ${error.message}`,
        action: action,
        projectName: projectName
      };
    }
  }

  /**
   * Parse command arguments
   * @param {Array<string>} args - Command arguments
   */
  parseArgs(args) {
    const options = {
      framework: null,
      database: null,
      deployment: null,
      testing: true,
      ci: false,
      docker: false,
      frontend: null,
      backend: null,
      template: null
    };

    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      if (arg.startsWith('--')) {
        const [key, value] = arg.substring(2).split('=');
        if (key === 'framework') {
          options.framework = value;
        } else if (key === 'database') {
          options.database = value;
        } else if (key === 'deployment') {
          options.deployment = value;
        } else if (key === 'no-testing') {
          options.testing = false;
        } else if (key === 'ci') {
          options.ci = true;
        } else if (key === 'docker') {
          options.docker = true;
        } else if (key === 'frontend') {
          options.frontend = value;
        } else if (key === 'backend') {
          options.backend = value;
        } else if (key === 'template') {
          options.template = value;
        }
      }
    }

    return options;
  }

  /**
   * Initialize fullstack project setup
   * @param {string} projectName - Project name
   * @param {Object} options - Options
   * @param {Object} context - Context
   */
  async initFullstack(projectName, options, context) {
    if (!projectName) {
      return {
        success: false,
        error: 'Project name required for initialization'
      };
    }

    const steps = [];

    // Create project directory
    const fs = await import('fs/promises');
    const path = await import('path');

    try {
      await fs.mkdir(path.resolve(projectName), { recursive: true });
      steps.push(`Created project directory: ${projectName}`);
    } catch (error) {
      return {
        success: false,
        error: `Failed to create project directory: ${error.message}`
      };
    }

    // Initialize package.json
    const packageJson = {
      name: projectName,
      version: '1.0.0',
      description: `Fullstack project: ${projectName}`,
      scripts: {
        dev: 'concurrently "npm run dev:server" "npm run dev:client"',
        'dev:server': 'cd server && npm run dev',
        'dev:client': 'cd client && npm run dev',
        build: 'npm run build:server && npm run build:client',
        'build:server': 'cd server && npm run build',
        'build:client': 'cd client && npm run build',
        test: 'npm run test:server && npm run test:client',
        'test:server': 'cd server && npm test',
        'test:client': 'cd client && npm test',
        deploy: 'npm run build && npm run deploy:server',
        'deploy:server': 'cd server && npm run deploy'
      },
      devDependencies: {
        concurrently: '^8.2.0'
      }
    };

    await fs.writeFile(
      path.resolve(projectName, 'package.json'),
      JSON.stringify(packageJson, null, 2)
    );
    steps.push('Created root package.json');

    // Create directory structure
    const dirs = ['client', 'server', 'shared', 'docs', 'scripts'];
    for (const dir of dirs) {
      await fs.mkdir(path.resolve(projectName, dir), { recursive: true });
    }
    steps.push('Created directory structure');

    // Create README
    const readme = `# ${projectName}

Full-stack application built with automated tooling.

## Structure

- \`client/\` - Frontend application
- \`server/\` - Backend API server
- \`shared/\` - Shared types and utilities
- \`docs/\` - Project documentation
- \`scripts/\` - Build and deployment scripts

## Development

\`\`\`bash
npm install
npm run dev
\`\`\`

## Deployment

\`\`\`bash
npm run deploy
\`\`\`
`;

    await fs.writeFile(path.resolve(projectName, 'README.md'), readme);
    steps.push('Created README.md');

    // Initialize git if requested
    if (options.ci || options.docker) {
      try {
        const { spawn } = await import('child_process');
        await new Promise((resolve, reject) => {
          const git = spawn('git', ['init'], { cwd: path.resolve(projectName) });
          git.on('close', (code) => {
            if (code === 0) resolve();
            else reject(new Error(`Git init failed with code ${code}`));
          });
        });
        steps.push('Initialized git repository');
      } catch (error) {
        steps.push(`Git init skipped: ${error.message}`);
      }
    }

    return {
      success: true,
      steps: steps,
      projectPath: path.resolve(projectName),
      message: `Fullstack project '${projectName}' initialized successfully`
    };
  }

  /**
   * Scaffold project with specific frameworks
   * @param {string} projectName - Project name
   * @param {Object} options - Options
   * @param {Object} context - Context
   */
  async scaffoldProject(projectName, options, context) {
    if (!projectName) {
      return {
        success: false,
        error: 'Project name required for scaffolding'
      };
    }

    const steps = [];
    const fs = await import('fs/promises');
    const path = await import('path');

    // Default frameworks if not specified
    const frontend = options.frontend || options.framework || 'react';
    const backend = options.backend || options.framework || 'express';

    // Scaffold frontend
    if (frontend) {
      steps.push(`Scaffolding ${frontend} frontend...`);
      const frontendSteps = await this.scaffoldFrontend(
        projectName,
        frontend,
        options
      );
      steps.push(...frontendSteps);
    }

    // Scaffold backend
    if (backend) {
      steps.push(`Scaffolding ${backend} backend...`);
      const backendSteps = await this.scaffoldBackend(
        projectName,
        backend,
        options
      );
      steps.push(...backendSteps);
    }

    // Scaffold shared types
    steps.push('Scaffolding shared types...');
    const sharedSteps = await this.scaffoldShared(projectName, options);
    steps.push(...sharedSteps);

    // Add database support if requested
    if (options.database) {
      steps.push(`Adding ${options.database} database support...`);
      const dbSteps = await this.addDatabase(projectName, options.database, options);
      steps.push(...dbSteps);
    }

    // Add testing setup
    if (options.testing) {
      steps.push('Setting up testing framework...');
      const testSteps = await this.setupTesting(projectName, options);
      steps.push(...testSteps);
    }

    // Add CI/CD if requested
    if (options.ci) {
      steps.push('Setting up CI/CD pipeline...');
      const ciSteps = await this.setupCI(projectName, options);
      steps.push(...ciSteps);
    }

    // Add Docker if requested
    if (options.docker) {
      steps.push('Adding Docker configuration...');
      const dockerSteps = await this.addDocker(projectName, options);
      steps.push(...dockerSteps);
    }

    return {
      success: true,
      steps: steps,
      frontend: frontend,
      backend: backend,
      database: options.database,
      message: `Project '${projectName}' scaffolded successfully`
    };
  }

  /**
   * Scaffold frontend application
   * @param {string} projectName - Project name
   * @param {string} framework - Frontend framework
   * @param {Object} options - Options
   */
  async scaffoldFrontend(projectName, framework, options) {
    const steps = [];
    const fs = await import('fs/promises');
    const path = await import('path');

    const clientDir = path.resolve(projectName, 'client');

    switch (framework.toLowerCase()) {
      case 'react':
      case 'react-ts':
        // Create React package.json
        const reactPackageJson = {
          name: `${projectName}-client`,
          version: '1.0.0',
          private: true,
          dependencies: {
            react: '^18.2.0',
            'react-dom': '^18.2.0',
            'react-router-dom': '^6.8.0',
            axios: '^1.3.0'
          },
          devDependencies: {
            '@types/react': '^18.0.0',
            '@types/react-dom': '^18.0.0',
            '@vitejs/plugin-react': '^3.1.0',
            typescript: '^4.9.0',
            vite: '^4.1.0'
          },
          scripts: {
            dev: 'vite',
            build: 'vite build',
            preview: 'vite preview',
            test: 'vitest'
          }
        };

        await fs.writeFile(
          path.join(clientDir, 'package.json'),
          JSON.stringify(reactPackageJson, null, 2)
        );

        // Create Vite config
        const viteConfig = `import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true
      }
    }
  }
})
`;

        await fs.writeFile(path.join(clientDir, 'vite.config.ts'), viteConfig);

        // Create basic React components
        await this.createReactApp(clientDir, projectName);
        steps.push('Created React frontend with Vite');
        break;

      case 'vue':
      case 'vue-ts':
        // Vue implementation would go here
        steps.push('Vue frontend scaffolding not yet implemented');
        break;

      default:
        steps.push(`Unknown frontend framework: ${framework}`);
    }

    return steps;
  }

  /**
   * Scaffold backend application
   * @param {string} projectName - Project name
   * @param {string} framework - Backend framework
   * @param {Object} options - Options
   */
  async scaffoldBackend(projectName, framework, options) {
    const steps = [];
    const fs = await import('fs/promises');
    const path = await import('path');

    const serverDir = path.resolve(projectName, 'server');

    switch (framework.toLowerCase()) {
      case 'express':
      case 'express-ts':
        // Create Express package.json
        const expressPackageJson = {
          name: `${projectName}-server`,
          version: '1.0.0',
          main: 'dist/index.js',
          scripts: {
            dev: 'tsx watch src/index.ts',
            build: 'tsc',
            start: 'node dist/index.js',
            test: 'jest'
          },
          dependencies: {
            express: '^4.18.0',
            cors: '^2.8.5',
            helmet: '^6.0.0',
            morgan: '^1.10.0',
            dotenv: '^16.0.0'
          },
          devDependencies: {
            '@types/express': '^4.17.0',
            '@types/cors': '^2.8.0',
            '@types/morgan': '^1.9.0',
            '@types/node': '^18.0.0',
            tsx: '^3.12.0',
            typescript: '^4.9.0',
            jest: '^29.0.0',
            '@types/jest': '^29.0.0'
          }
        };

        await fs.writeFile(
          path.join(serverDir, 'package.json'),
          JSON.stringify(expressPackageJson, null, 2)
        );

        // Create TypeScript config
        const tsConfig = {
          compilerOptions: {
            target: 'ES2020',
            module: 'commonjs',
            lib: ['ES2020'],
            outDir: './dist',
            rootDir: './src',
            strict: true,
            esModuleInterop: true,
            skipLibCheck: true,
            forceConsistentCasingInFileNames: true,
            resolveJsonModule: true
          },
          include: ['src/**/*'],
          exclude: ['node_modules', 'dist']
        };

        await fs.writeFile(
          path.join(serverDir, 'tsconfig.json'),
          JSON.stringify(tsConfig, null, 2)
        );

        // Create basic Express app
        await this.createExpressApp(serverDir, projectName);
        steps.push('Created Express backend with TypeScript');
        break;

      default:
        steps.push(`Unknown backend framework: ${framework}`);
    }

    return steps;
  }

  /**
   * Create basic React application structure
   * @param {string} clientDir - Client directory
   * @param {string} projectName - Project name
   */
  async createReactApp(clientDir, projectName) {
    const fs = await import('fs/promises');
    const path = await import('path');

    // Create src directory
    await fs.mkdir(path.join(clientDir, 'src'), { recursive: true });

    // Create main App component
    const appTsx = `import React from 'react'
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import './App.css'

function App() {
  return (
    <Router>
      <div className="App">
        <header className="App-header">
          <h1>${projectName}</h1>
          <p>Full-stack application</p>
        </header>
        <main>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/about" element={<About />} />
          </Routes>
        </main>
      </div>
    </Router>
  )
}

function Home() {
  return (
    <div>
      <h2>Welcome to ${projectName}</h2>
      <p>This is a full-stack application.</p>
    </div>
  )
}

function About() {
  return (
    <div>
      <h2>About</h2>
      <p>Built with React and Express.</p>
    </div>
  )
}

export default App
`;

    await fs.writeFile(path.join(clientDir, 'src', 'App.tsx'), appTsx);

    // Create main entry point
    const mainTsx = `import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
`;

    await fs.writeFile(path.join(clientDir, 'src', 'main.tsx'), mainTsx);

    // Create index.html
    const indexHtml = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/vite.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${projectName}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`;

    await fs.writeFile(path.join(clientDir, 'index.html'), indexHtml);

    // Create basic CSS
    const appCss = `#root {
  max-width: 1280px;
  margin: 0 auto;
  padding: 2rem;
  text-align: center;
}

.App-header {
  padding: 20px;
  background-color: #282c34;
  color: white;
  margin-bottom: 2rem;
}

main {
  text-align: left;
}
`;

    await fs.writeFile(path.join(clientDir, 'src', 'App.css'), appCss);
  }

  /**
   * Create basic Express application
   * @param {string} serverDir - Server directory
   * @param {string} projectName - Project name
   */
  async createExpressApp(serverDir, projectName) {
    const fs = await import('fs/promises');
    const path = await import('path');

    // Create src directory
    await fs.mkdir(path.join(serverDir, 'src'), { recursive: true });

    // Create main server file
    const indexTs = `import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'
import dotenv from 'dotenv'

dotenv.config()

const app = express()
const PORT = process.env.PORT || 3001

// Middleware
app.use(helmet())
app.use(cors())
app.use(morgan('combined'))
app.use(express.json())

// Routes
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    project: '${projectName}',
    timestamp: new Date().toISOString()
  })
})

app.get('/api', (req, res) => {
  res.json({
    message: 'Welcome to ${projectName} API',
    version: '1.0.0'
  })
})

// Error handling
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error(err.stack)
  res.status(500).json({ error: 'Something went wrong!' })
})

app.listen(PORT, () => {
  console.log(\`🚀 Server running on port \${PORT}\`)
})
`;

    await fs.writeFile(path.join(serverDir, 'src', 'index.ts'), indexTs);

    // Create environment file
    const env = `PORT=3001
NODE_ENV=development
`;

    await fs.writeFile(path.join(serverDir, '.env'), env);

    // Create environment example
    const envExample = `PORT=3001
NODE_ENV=production
`;

    await fs.writeFile(path.join(serverDir, '.env.example'), envExample);
  }

  /**
   * Scaffold shared types and utilities
   * @param {string} projectName - Project name
   * @param {Object} options - Options
   */
  async scaffoldShared(projectName, options) {
    const steps = [];
    const fs = await import('fs/promises');
    const path = await import('path');

    const sharedDir = path.resolve(projectName, 'shared');

    // Create shared package.json
    const sharedPackageJson = {
      name: `${projectName}-shared`,
      version: '1.0.0',
      main: 'dist/index.js',
      types: 'dist/index.d.ts',
      scripts: {
        build: 'tsc',
        dev: 'tsc --watch'
      },
      devDependencies: {
        typescript: '^4.9.0'
      }
    };

    await fs.writeFile(
      path.join(sharedDir, 'package.json'),
      JSON.stringify(sharedPackageJson, null, 2)
    );

    // Create TypeScript config
    const tsConfig = {
      compilerOptions: {
        target: 'ES2020',
        module: 'commonjs',
        lib: ['ES2020'],
        outDir: './dist',
        rootDir: './src',
        strict: true,
        esModuleInterop: true,
        skipLibCheck: true,
        forceConsistentCasingInFileNames: true,
        declaration: true,
        declarationMap: true
      },
      include: ['src/**/*'],
      exclude: ['node_modules', 'dist']
    };

    await fs.writeFile(
      path.join(sharedDir, 'tsconfig.json'),
      JSON.stringify(tsConfig, null, 2)
    );

    // Create src directory and basic types
    await fs.mkdir(path.join(sharedDir, 'src'), { recursive: true });

    // Create basic types
    const typesTs = `// Shared types for ${projectName}

export interface User {
  id: string
  email: string
  name: string
  createdAt: Date
  updatedAt: Date
}

export interface ApiResponse<T = any> {
  success: boolean
  data?: T
  error?: string
  message?: string
}

export interface PaginationParams {
  page: number
  limit: number
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}
`;

    await fs.writeFile(path.join(sharedDir, 'src', 'types.ts'), typesTs);

    // Create index file
    const indexTs = `export * from './types'
`;

    await fs.writeFile(path.join(sharedDir, 'src', 'index.ts'), indexTs);

    steps.push('Created shared types and utilities');
    return steps;
  }

  /**
   * Add database support
   * @param {string} projectName - Project name
   * @param {string} database - Database type
   * @param {Object} options - Options
   */
  async addDatabase(projectName, database, options) {
    const steps = [];
    const fs = await import('fs/promises');
    const path = await import('path');

    const serverDir = path.resolve(projectName, 'server');

    switch (database.toLowerCase()) {
      case 'postgresql':
      case 'postgres':
        // Add PostgreSQL dependencies to server package.json
        const serverPackagePath = path.join(serverDir, 'package.json');
        const packageJson = JSON.parse(
          await fs.readFile(serverPackagePath, 'utf8')
        );

        packageJson.dependencies = {
          ...packageJson.dependencies,
          pg: '^8.9.0',
          'pg-pool': '^3.6.0'
        };

        packageJson.devDependencies = {
          ...packageJson.devDependencies,
          '@types/pg': '^8.6.0'
        };

        await fs.writeFile(
          serverPackagePath,
          JSON.stringify(packageJson, null, 2)
        );

        // Create database config
        const dbConfig = `import { Pool } from 'pg'

const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || '${projectName}',
  password: process.env.DB_PASSWORD || 'password',
  port: parseInt(process.env.DB_PORT || '5432'),
})

export default pool
`;

        await fs.mkdir(path.join(serverDir, 'src', 'config'), { recursive: true });
        await fs.writeFile(path.join(serverDir, 'src', 'config', 'database.ts'), dbConfig);

        steps.push('Added PostgreSQL database support');
        break;

      case 'mongodb':
      case 'mongo':
        // MongoDB implementation would go here
        steps.push('MongoDB support not yet implemented');
        break;

      default:
        steps.push(`Unknown database: ${database}`);
    }

    return steps;
  }

  /**
   * Setup testing framework
   * @param {string} projectName - Project name
   * @param {Object} options - Options
   */
  async setupTesting(projectName, options) {
    const steps = [];
    const fs = await import('fs/promises');
    const path = await import('path');

    // Client testing setup
    const clientDir = path.resolve(projectName, 'client');
    const vitestConfig = `import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true
  }
})
`;

    await fs.writeFile(path.join(clientDir, 'vitest.config.ts'), vitestConfig);

    // Server testing setup
    const serverDir = path.resolve(projectName, 'server');
    const jestConfig = `module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.ts', '**/?(*.)+(spec|test).ts'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts'
  ]
}
`;

    await fs.writeFile(path.join(serverDir, 'jest.config.js'), jestConfig);

    steps.push('Setup testing frameworks (Vitest for client, Jest for server)');
    return steps;
  }

  /**
   * Setup CI/CD pipeline
   * @param {string} projectName - Project name
   * @param {Object} options - Options
   */
  async setupCI(projectName, options) {
    const steps = [];
    const fs = await import('fs/promises');
    const path = await import('path');

    // Create GitHub Actions workflow
    const workflowsDir = path.resolve(projectName, '.github', 'workflows');
    await fs.mkdir(workflowsDir, { recursive: true });

    const ciYml = `name: CI/CD Pipeline

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main ]

jobs:
  test:
    runs-on: ubuntu-latest

    strategy:
      matrix:
        node-version: [18.x, 20.x]

    steps:
    - uses: actions/checkout@v3

    - name: Use Node.js \${{ matrix.node-version }}
      uses: actions/setup-node@v3
      with:
        node-version: \${{ matrix.node-version }}
        cache: 'npm'

    - name: Install dependencies
      run: |
        npm ci
        cd client && npm ci
        cd ../server && npm ci
        cd ../shared && npm ci

    - name: Build shared types
      run: cd shared && npm run build

    - name: Run tests
      run: |
        npm test
        cd client && npm test
        cd ../server && npm test

    - name: Build applications
      run: |
        cd client && npm run build
        cd ../server && npm run build

  deploy:
    needs: test
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'

    steps:
    - uses: actions/checkout@v3

    - name: Deploy to production
      run: |
        echo "Deployment step would go here"
        # Add your deployment commands here
`;

    await fs.writeFile(path.join(workflowsDir, 'ci.yml'), ciYml);

    steps.push('Setup GitHub Actions CI/CD pipeline');
    return steps;
  }

  /**
   * Add Docker configuration
   * @param {string} projectName - Project name
   * @param {Object} options - Options
   */
  async addDocker(projectName, options) {
    const steps = [];
    const fs = await import('fs/promises');
    const path = await import('path');

    // Create Dockerfile for client
    const clientDockerfile = `FROM node:18-alpine as build

WORKDIR /app
COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/nginx.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
`;

    await fs.writeFile(
      path.join(projectName, 'client', 'Dockerfile'),
      clientDockerfile
    );

    // Create nginx config for client
    const nginxConfig = `events {
    worker_connections 1024;
}

http {
    include       /etc/nginx/mime.types;
    default_type  application/octet-stream;

    server {
        listen 80;
        server_name localhost;
        root /usr/share/nginx/html;
        index index.html;

        location / {
            try_files $uri $uri/ /index.html;
        }

        location /api {
            proxy_pass http://server:3001;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
        }
    }
}
`;

    await fs.writeFile(
      path.join(projectName, 'client', 'nginx.conf'),
      nginxConfig
    );

    // Create Dockerfile for server
    const serverDockerfile = `FROM node:18-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build

EXPOSE 3001
CMD ["node", "dist/index.js"]
`;

    await fs.writeFile(
      path.join(projectName, 'server', 'Dockerfile'),
      serverDockerfile
    );

    // Create docker-compose.yml
    const dockerCompose = `version: '3.8'

services:
  client:
    build: ./client
    ports:
      - "3000:80"
    depends_on:
      - server

  server:
    build: ./server
    ports:
      - "3001:3001"
    environment:
      - NODE_ENV=production
      - PORT=3001
    depends_on:
      - db

  db:
    image: postgres:15-alpine
    environment:
      - POSTGRES_DB=${projectName}
      - POSTGRES_USER=postgres
      - POSTGRES_PASSWORD=password
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"

volumes:
  postgres_data:
`;

    await fs.writeFile(
      path.join(projectName, 'docker-compose.yml'),
      dockerCompose
    );

    // Create .dockerignore
    const dockerIgnore = `node_modules
npm-debug.log
.git
.gitignore
README.md
.env
.nyc_output
coverage
.nyc_output
.coverage
.cache
dist
.DS_Store
`;

    await fs.writeFile(
      path.join(projectName, '.dockerignore'),
      dockerIgnore
    );

    steps.push('Added Docker configuration for development and production');
    return steps;
  }

  /**
   * Build project
   * @param {Object} options - Options
   * @param {Object} context - Context
   */
  async buildProject(options, context) {
    const steps = [];
    const { spawn } = await import('child_process');

    // Build shared types first
    steps.push('Building shared types...');
    await this.runCommand('npm', ['run', 'build'], { cwd: './shared' });

    // Build client
    steps.push('Building client...');
    await this.runCommand('npm', ['run', 'build'], { cwd: './client' });

    // Build server
    steps.push('Building server...');
    await this.runCommand('npm', ['run', 'build'], { cwd: './server' });

    return {
      success: true,
      steps: steps,
      message: 'Project built successfully'
    };
  }

  /**
   * Test project
   * @param {Object} options - Options
   * @param {Object} context - Context
   */
  async testProject(options, context) {
    const steps = [];
    const results = {};

    // Test client
    try {
      steps.push('Testing client...');
      await this.runCommand('npm', ['test'], { cwd: './client' });
      results.client = 'passed';
    } catch (error) {
      results.client = 'failed';
      steps.push(`Client tests failed: ${error.message}`);
    }

    // Test server
    try {
      steps.push('Testing server...');
      await this.runCommand('npm', ['test'], { cwd: './server' });
      results.server = 'passed';
    } catch (error) {
      results.server = 'failed';
      steps.push(`Server tests failed: ${error.message}`);
    }

    return {
      success: Object.values(results).every(r => r === 'passed'),
      steps: steps,
      results: results,
      message: results.client === 'passed' && results.server === 'passed' ?
        'All tests passed' : 'Some tests failed'
    };
  }

  /**
   * Deploy project
   * @param {Object} options - Options
   * @param {Object} context - Context
   */
  async deployProject(options, context) {
    const steps = [];

    // Build first
    const buildResult = await this.buildProject(options, context);
    if (!buildResult.success) {
      return {
        success: false,
        error: 'Build failed, cannot deploy',
        steps: steps
      };
    }
    steps.push(...buildResult.steps);

    // Deployment logic would go here
    steps.push('Deployment logic not yet implemented');
    steps.push('Would typically deploy to Vercel, Netlify, AWS, etc.');

    return {
      success: true,
      steps: steps,
      message: 'Deployment completed (simulation)'
    };
  }

  /**
   * Analyze project structure and dependencies
   * @param {Object} options - Options
   * @param {Object} context - Context
   */
  async analyzeProject(options, context) {
    const fs = await import('fs/promises');
    const path = await import('path');

    const analysis = {
      structure: {},
      dependencies: {},
      scripts: {},
      size: {}
    };

    try {
      // Analyze root structure
      const rootFiles = await fs.readdir('.', { withFileTypes: true });
      analysis.structure.root = rootFiles
        .filter(f => f.isDirectory())
        .map(f => f.name);

      // Analyze client if exists
      if (await this.directoryExists('./client')) {
        const clientPackage = JSON.parse(
          await fs.readFile('./client/package.json', 'utf8')
        );
        analysis.dependencies.client = {
          ...clientPackage.dependencies,
          ...clientPackage.devDependencies
        };
        analysis.scripts.client = clientPackage.scripts;

        // Calculate client size
        analysis.size.client = await this.calculateDirectorySize('./client');
      }

      // Analyze server if exists
      if (await this.directoryExists('./server')) {
        const serverPackage = JSON.parse(
          await fs.readFile('./server/package.json', 'utf8')
        );
        analysis.dependencies.server = {
          ...serverPackage.dependencies,
          ...serverPackage.devDependencies
        };
        analysis.scripts.server = serverPackage.scripts;

        // Calculate server size
        analysis.size.server = await this.calculateDirectorySize('./server');
      }

      // Analyze shared if exists
      if (await this.directoryExists('./shared')) {
        const sharedPackage = JSON.parse(
          await fs.readFile('./shared/package.json', 'utf8')
        );
        analysis.dependencies.shared = {
          ...sharedPackage.dependencies,
          ...sharedPackage.devDependencies
        };

        // Calculate shared size
        analysis.size.shared = await this.calculateDirectorySize('./shared');
      }

      return {
        success: true,
        analysis: analysis,
        recommendations: this.generateRecommendations(analysis),
        message: 'Project analysis completed'
      };
    } catch (error) {
      return {
        success: false,
        error: `Project analysis failed: ${error.message}`
      };
    }
  }

  /**
   * Run command and return promise
   * @param {string} command - Command to run
   * @param {Array<string>} args - Command arguments
   * @param {Object} options - Execution options
   */
  async runCommand(command, args, options = {}) {
    const { spawn } = await import('child_process');

    return new Promise((resolve, reject) => {
      const child = spawn(command, args, {
        stdio: 'inherit',
        ...options
      });

      child.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Command failed with exit code ${code}`));
        }
      });

      child.on('error', reject);
    });
  }

  /**
   * Check if directory exists
   * @param {string} dirPath - Directory path
   */
  async directoryExists(dirPath) {
    try {
      const fs = await import('fs/promises');
      const stat = await fs.stat(dirPath);
      return stat.isDirectory();
    } catch {
      return false;
    }
  }

  /**
   * Calculate directory size
   * @param {string} dirPath - Directory path
   */
  async calculateDirectorySize(dirPath) {
    const fs = await import('fs/promises');
    const path = await import('path');

    let totalSize = 0;

    async function calculateSize(currentPath) {
      const items = await fs.readdir(currentPath);

      for (const item of items) {
        const itemPath = path.join(currentPath, item);
        const stat = await fs.stat(itemPath);

        if (stat.isDirectory()) {
          await calculateSize(itemPath);
        } else {
          totalSize += stat.size;
        }
      }
    }

    await calculateSize(dirPath);
    return this.formatBytes(totalSize);
  }

  /**
   * Format bytes to human readable format
   * @param {number} bytes - Bytes
   */
  formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Generate recommendations based on analysis
   * @param {Object} analysis - Project analysis
   */
  generateRecommendations(analysis) {
    const recommendations = [];

    // Check for common missing dependencies
    if (analysis.dependencies.client && !analysis.dependencies.client.husky) {
      recommendations.push('Consider adding husky for git hooks');
    }

    if (analysis.dependencies.server && !analysis.dependencies.server.winston) {
      recommendations.push('Consider adding winston for logging');
    }

    // Check for testing setup
    const hasTesting = Object.values(analysis.dependencies).some(deps =>
      Object.keys(deps).some(dep => dep.includes('test') || dep.includes('jest') || dep.includes('vitest'))
    );

    if (!hasTesting) {
      recommendations.push('Consider adding testing framework');
    }

    // Check for CI/CD
    if (!analysis.structure.root.includes('.github')) {
      recommendations.push('Consider setting up CI/CD pipeline');
    }

    return recommendations;
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
        '/fullstack init my-app',
        '/fullstack scaffold my-blog --framework react --backend express --database postgresql',
        '/fullstack build',
        '/fullstack test',
        '/fullstack deploy',
        '/fullstack analyze'
      ],
      actions: [
        {
          name: 'init',
          description: 'Initialize a new fullstack project'
        },
        {
          name: 'scaffold',
          description: 'Scaffold project with specific frameworks'
        },
        {
          name: 'build',
          description: 'Build the entire project'
        },
        {
          name: 'test',
          description: 'Run all tests'
        },
        {
          name: 'deploy',
          description: 'Deploy the project'
        },
        {
          name: 'analyze',
          description: 'Analyze project structure and dependencies'
        }
      ],
      options: [
        {
          name: '--framework',
          description: 'Framework to use (react, vue, express, etc.)'
        },
        {
          name: '--frontend',
          description: 'Frontend framework (react, vue, etc.)'
        },
        {
          name: '--backend',
          description: 'Backend framework (express, fastify, etc.)'
        },
        {
          name: '--database',
          description: 'Database to use (postgresql, mongodb, etc.)'
        },
        {
          name: '--ci',
          description: 'Setup CI/CD pipeline'
        },
        {
          name: '--docker',
          description: 'Add Docker configuration'
        },
        {
          name: '--no-testing',
          description: 'Skip testing setup'
        }
      ]
    };
  }
}

export default FullstackCommand;