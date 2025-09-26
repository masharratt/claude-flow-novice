/**
 * IntelligentDefaults - Context-aware intelligent defaults system
 * Provides smart defaults based on project type, user history, and best practices
 */

import { ProjectContext } from '../intelligence/IntelligenceEngine.js';
import { UserTier } from '../core/TierManager.js';

export interface DefaultsProfile {
  projectType: string;
  framework?: string;
  language: string[];
  preferences: UserPreferences;
  templates: TemplateConfig[];
  agentDefaults: AgentDefaults;
}

export interface UserPreferences {
  packageManager: 'npm' | 'yarn' | 'pnpm';
  testing: 'jest' | 'vitest' | 'mocha' | 'none';
  linting: 'eslint' | 'none';
  formatting: 'prettier' | 'none';
  bundler: 'vite' | 'webpack' | 'rollup' | 'auto';
  typescript: boolean;
  gitHooks: boolean;
  ci: 'github' | 'gitlab' | 'none';
}

export interface TemplateConfig {
  name: string;
  description: string;
  files: TemplateFile[];
  dependencies: string[];
  devDependencies: string[];
  scripts: Record<string, string>;
}

export interface TemplateFile {
  path: string;
  content: string;
  executable?: boolean;
}

export interface AgentDefaults {
  primary: string;
  secondary: string[];
  workflow: string;
  parallel: boolean;
  maxAgents: number;
}

export interface FrameworkDefaults {
  [key: string]: {
    dependencies: string[];
    devDependencies: string[];
    scripts: Record<string, string>;
    structure: string[];
    configFiles: TemplateFile[];
  };
}

export class IntelligentDefaults {
  private userPreferences: UserPreferences;
  private projectHistory: Map<string, DefaultsProfile> = new Map();
  private frameworkDefaults: FrameworkDefaults;

  constructor() {
    this.initializeDefaults();
    this.loadUserPreferences();
    this.loadProjectHistory();
  }

  /**
   * Get intelligent defaults for a new project
   */
  getProjectDefaults(projectType: string, framework?: string, userInput?: string): DefaultsProfile {
    const baseDefaults = this.getBaseDefaults(projectType);
    const frameworkDefaults = framework ? this.getFrameworkDefaults(framework) : null;
    const intelligentEnhancements = this.applyIntelligentEnhancements(
      projectType,
      framework,
      userInput,
    );

    return this.mergeDefaults(baseDefaults, frameworkDefaults, intelligentEnhancements);
  }

  /**
   * Get build command defaults based on task analysis
   */
  getBuildDefaults(
    taskDescription: string,
    projectContext: ProjectContext | null,
    userTier: UserTier,
  ): {
    agents: string[];
    workflow: string;
    parallel: boolean;
    estimatedTime: string;
    complexity: number;
  } {
    const taskAnalysis = this.analyzeTaskForDefaults(taskDescription);
    const contextualDefaults = this.getContextualBuildDefaults(projectContext);
    const tierDefaults = this.getTierBasedDefaults(userTier);

    return {
      agents: this.selectDefaultAgents(taskAnalysis, contextualDefaults, tierDefaults),
      workflow: this.selectDefaultWorkflow(taskAnalysis, userTier),
      parallel: this.shouldUseParallel(taskAnalysis, userTier),
      estimatedTime: this.estimateDefaultTime(taskAnalysis),
      complexity: taskAnalysis.complexity,
    };
  }

  /**
   * Get intelligent agent selection defaults
   */
  getAgentDefaults(domain: string, complexity: number, userTier: UserTier): AgentDefaults {
    const baseAgents = this.getBaseAgentSelection(domain, userTier);
    const complexityAdjusted = this.adjustForComplexity(baseAgents, complexity);
    const tierOptimized = this.optimizeForTier(complexityAdjusted, userTier);

    return tierOptimized;
  }

  /**
   * Update user preferences based on usage patterns
   */
  updatePreferences(action: string, context: any): void {
    // Learn from user behavior
    if (action === 'package_manager_used') {
      this.userPreferences.packageManager = context.manager;
    }

    if (action === 'testing_framework_chosen') {
      this.userPreferences.testing = context.framework;
    }

    if (action === 'typescript_enabled') {
      this.userPreferences.typescript = true;
    }

    this.saveUserPreferences();
  }

  /**
   * Get smart suggestions based on project state
   */
  getSmartSuggestions(projectContext: ProjectContext | null): string[] {
    const suggestions = [];

    if (!projectContext) {
      return ['Start with: claude-flow init to create a new project'];
    }

    // Analyze project and suggest improvements
    if (!projectContext.hasTests) {
      suggestions.push('Add testing: claude-flow build "setup comprehensive testing"');
    }

    if (!projectContext.hasCi) {
      suggestions.push('Setup CI/CD: claude-flow build "configure continuous integration"');
    }

    if (!projectContext.gitInitialized) {
      suggestions.push('Initialize git: claude-flow init --git-setup');
    }

    // Framework-specific suggestions
    if (
      projectContext.framework === 'react' &&
      !projectContext.dependencies.includes('react-router')
    ) {
      suggestions.push('Add routing: claude-flow build "setup React Router navigation"');
    }

    if (projectContext.type === 'api' && !projectContext.dependencies.includes('express')) {
      suggestions.push('Add web framework: claude-flow build "setup Express.js server"');
    }

    return suggestions.slice(0, 3); // Top 3 suggestions
  }

  /**
   * Get framework-specific intelligent defaults
   */
  getFrameworkSpecificDefaults(framework: string): any {
    return this.frameworkDefaults[framework] || null;
  }

  // Private implementation methods

  private initializeDefaults(): void {
    this.frameworkDefaults = {
      react: {
        dependencies: ['react@^18.0.0', 'react-dom@^18.0.0'],
        devDependencies: [
          'vite@^4.0.0',
          '@types/react@^18.0.0',
          '@types/react-dom@^18.0.0',
          '@vitejs/plugin-react@^4.0.0',
        ],
        scripts: {
          dev: 'vite',
          build: 'vite build',
          preview: 'vite preview',
          test: 'vitest',
        },
        structure: [
          'src/components',
          'src/pages',
          'src/hooks',
          'src/utils',
          'src/styles',
          'public',
        ],
        configFiles: [
          {
            path: 'vite.config.ts',
            content: this.getViteConfig('react'),
          },
          {
            path: 'src/App.tsx',
            content: this.getReactAppTemplate(),
          },
          {
            path: 'src/main.tsx',
            content: this.getReactMainTemplate(),
          },
        ],
      },

      vue: {
        dependencies: ['vue@^3.3.0'],
        devDependencies: ['vite@^4.0.0', '@vitejs/plugin-vue@^4.0.0', 'vue-tsc@^1.0.0'],
        scripts: {
          dev: 'vite',
          build: 'vue-tsc && vite build',
          preview: 'vite preview',
        },
        structure: [
          'src/components',
          'src/views',
          'src/composables',
          'src/utils',
          'src/assets',
          'public',
        ],
        configFiles: [
          {
            path: 'vite.config.ts',
            content: this.getViteConfig('vue'),
          },
        ],
      },

      express: {
        dependencies: ['express@^4.18.0', 'cors@^2.8.5', 'helmet@^7.0.0', 'dotenv@^16.0.0'],
        devDependencies: [
          '@types/express@^4.17.0',
          '@types/cors@^2.8.0',
          'nodemon@^3.0.0',
          'tsx@^3.0.0',
        ],
        scripts: {
          dev: 'nodemon --exec tsx src/server.ts',
          build: 'tsc',
          start: 'node dist/server.js',
          test: 'jest',
        },
        structure: [
          'src/routes',
          'src/middleware',
          'src/models',
          'src/services',
          'src/utils',
          'src/types',
        ],
        configFiles: [
          {
            path: 'src/server.ts',
            content: this.getExpressServerTemplate(),
          },
        ],
      },

      fastapi: {
        dependencies: ['fastapi[all]>=0.104.0', 'uvicorn[standard]>=0.24.0', 'pydantic>=2.4.0'],
        devDependencies: ['pytest>=7.4.0', 'black>=23.9.0', 'isort>=5.12.0'],
        scripts: {
          dev: 'uvicorn main:app --reload',
          start: 'uvicorn main:app',
          test: 'pytest',
          format: 'black . && isort .',
        },
        structure: ['app/routers', 'app/models', 'app/services', 'app/core', 'tests'],
        configFiles: [
          {
            path: 'main.py',
            content: this.getFastAPIMainTemplate(),
          },
        ],
      },
    };
  }

  private loadUserPreferences(): void {
    // Load from user config file or use sensible defaults
    this.userPreferences = {
      packageManager: 'npm',
      testing: 'jest',
      linting: 'eslint',
      formatting: 'prettier',
      bundler: 'vite',
      typescript: true,
      gitHooks: true,
      ci: 'github',
    };

    // Try to load saved preferences
    try {
      // Implementation would load from ~/.claude-flow/preferences.json
    } catch (error) {
      // Use defaults
    }
  }

  private loadProjectHistory(): void {
    try {
      // Implementation would load project history from local storage
    } catch (error) {
      // Start with empty history
    }
  }

  private getBaseDefaults(projectType: string): DefaultsProfile {
    const profiles: Record<string, DefaultsProfile> = {
      web: {
        projectType: 'web',
        framework: 'react',
        language: ['typescript', 'javascript'],
        preferences: { ...this.userPreferences },
        templates: [],
        agentDefaults: {
          primary: 'coder',
          secondary: ['reviewer'],
          workflow: 'iterative',
          parallel: false,
          maxAgents: 2,
        },
      },

      api: {
        projectType: 'api',
        framework: 'express',
        language: ['typescript', 'javascript'],
        preferences: { ...this.userPreferences },
        templates: [],
        agentDefaults: {
          primary: 'backend-dev',
          secondary: ['tester', 'reviewer'],
          workflow: 'tdd',
          parallel: true,
          maxAgents: 3,
        },
      },

      mobile: {
        projectType: 'mobile',
        framework: 'react-native',
        language: ['typescript', 'javascript'],
        preferences: { ...this.userPreferences },
        templates: [],
        agentDefaults: {
          primary: 'mobile-dev',
          secondary: ['tester'],
          workflow: 'iterative',
          parallel: false,
          maxAgents: 2,
        },
      },
    };

    return profiles[projectType] || profiles.web;
  }

  private getFrameworkDefaults(framework: string): any {
    return this.frameworkDefaults[framework];
  }

  private applyIntelligentEnhancements(
    projectType: string,
    framework?: string,
    userInput?: string,
  ): Partial<DefaultsProfile> {
    const enhancements: Partial<DefaultsProfile> = {};

    // Analyze user input for preferences
    if (userInput) {
      if (userInput.toLowerCase().includes('typescript')) {
        enhancements.language = ['typescript'];
      }

      if (userInput.toLowerCase().includes('testing')) {
        enhancements.preferences = {
          ...this.userPreferences,
          testing: 'jest',
        };
      }

      if (userInput.toLowerCase().includes('api') || userInput.toLowerCase().includes('backend')) {
        enhancements.agentDefaults = {
          primary: 'backend-dev',
          secondary: ['tester', 'reviewer'],
          workflow: 'tdd',
          parallel: true,
          maxAgents: 3,
        };
      }
    }

    return enhancements;
  }

  private mergeDefaults(
    base: DefaultsProfile,
    framework: any,
    enhancements: Partial<DefaultsProfile>,
  ): DefaultsProfile {
    return {
      ...base,
      ...enhancements,
      preferences: {
        ...base.preferences,
        ...enhancements.preferences,
      },
      agentDefaults: {
        ...base.agentDefaults,
        ...enhancements.agentDefaults,
      },
    };
  }

  private analyzeTaskForDefaults(taskDescription: string): {
    domain: string;
    complexity: number;
    keywords: string[];
    intent: string;
  } {
    const text = taskDescription.toLowerCase();

    // Determine domain
    let domain = 'general';
    if (text.includes('api') || text.includes('backend') || text.includes('server'))
      domain = 'backend';
    if (text.includes('ui') || text.includes('frontend') || text.includes('react'))
      domain = 'frontend';
    if (text.includes('test') || text.includes('testing')) domain = 'testing';
    if (text.includes('deploy') || text.includes('ci')) domain = 'deployment';

    // Assess complexity
    let complexity = 2;
    if (text.includes('simple') || text.includes('basic')) complexity = 1;
    if (text.includes('advanced') || text.includes('complex') || text.includes('enterprise'))
      complexity = 4;
    if (text.includes('architecture') || text.includes('system') || text.includes('scale'))
      complexity = 5;

    // Extract keywords
    const keywords = text
      .split(/\s+/)
      .filter((word) =>
        ['auth', 'database', 'api', 'react', 'vue', 'testing', 'deploy'].includes(word),
      );

    // Determine intent
    let intent = 'implement';
    if (text.includes('create') || text.includes('new')) intent = 'create';
    if (text.includes('fix') || text.includes('bug')) intent = 'fix';
    if (text.includes('optimize') || text.includes('improve')) intent = 'optimize';
    if (text.includes('test')) intent = 'test';

    return { domain, complexity, keywords, intent };
  }

  private getContextualBuildDefaults(projectContext: ProjectContext | null): any {
    if (!projectContext) {
      return {
        agents: ['coder'],
        parallel: false,
      };
    }

    const defaults: any = {
      agents: ['coder'],
      parallel: false,
    };

    // Adapt based on project type
    if (projectContext.type === 'api') {
      defaults.agents = ['backend-dev', 'tester'];
      defaults.parallel = true;
    }

    if (projectContext.type === 'web') {
      defaults.agents = ['coder'];
      if (projectContext.framework === 'react') {
        defaults.agents.push('frontend-dev');
      }
    }

    // Add testing agent if tests exist
    if (projectContext.hasTests) {
      defaults.agents.push('tester');
    }

    return defaults;
  }

  private getTierBasedDefaults(userTier: UserTier): any {
    switch (userTier) {
      case UserTier.NOVICE:
        return {
          maxAgents: 1,
          parallel: false,
          workflow: 'simple',
        };
      case UserTier.INTERMEDIATE:
        return {
          maxAgents: 3,
          parallel: true,
          workflow: 'standard',
        };
      case UserTier.EXPERT:
        return {
          maxAgents: 5,
          parallel: true,
          workflow: 'advanced',
        };
      default:
        return {
          maxAgents: 1,
          parallel: false,
          workflow: 'simple',
        };
    }
  }

  private selectDefaultAgents(
    taskAnalysis: any,
    contextDefaults: any,
    tierDefaults: any,
  ): string[] {
    const agents = [...contextDefaults.agents];

    // Add domain-specific agents based on tier
    if (taskAnalysis.domain === 'testing' && !agents.includes('tester')) {
      agents.push('tester');
    }

    if (taskAnalysis.domain === 'backend' && !agents.includes('backend-dev')) {
      agents.unshift('backend-dev');
    }

    // Limit based on tier
    return agents.slice(0, tierDefaults.maxAgents);
  }

  private selectDefaultWorkflow(taskAnalysis: any, userTier: UserTier): string {
    if (taskAnalysis.intent === 'test') return 'tdd';
    if (taskAnalysis.complexity >= 4) return 'architecture-first';
    if (userTier === UserTier.NOVICE) return 'guided';
    if (userTier === UserTier.EXPERT) return 'autonomous';
    return 'standard';
  }

  private shouldUseParallel(taskAnalysis: any, userTier: UserTier): boolean {
    if (userTier === UserTier.NOVICE) return false;
    if (taskAnalysis.complexity >= 3) return true;
    if (taskAnalysis.domain === 'backend') return true;
    return false;
  }

  private estimateDefaultTime(taskAnalysis: any): string {
    const baseTime = taskAnalysis.complexity * 10; // minutes
    const hours = Math.floor(baseTime / 60);
    const minutes = baseTime % 60;

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else {
      return `${minutes}m`;
    }
  }

  private getBaseAgentSelection(domain: string, userTier: UserTier): AgentDefaults {
    const selections: Record<string, AgentDefaults> = {
      frontend: {
        primary: userTier === UserTier.NOVICE ? 'coder' : 'frontend-dev',
        secondary: userTier === UserTier.NOVICE ? [] : ['reviewer'],
        workflow: 'iterative',
        parallel: userTier !== UserTier.NOVICE,
        maxAgents: userTier === UserTier.NOVICE ? 1 : 3,
      },
      backend: {
        primary: userTier === UserTier.NOVICE ? 'coder' : 'backend-dev',
        secondary: userTier === UserTier.NOVICE ? [] : ['tester', 'reviewer'],
        workflow: 'tdd',
        parallel: userTier !== UserTier.NOVICE,
        maxAgents: userTier === UserTier.NOVICE ? 1 : 3,
      },
      testing: {
        primary: 'tester',
        secondary: userTier === UserTier.NOVICE ? [] : ['coder'],
        workflow: 'tdd',
        parallel: false,
        maxAgents: userTier === UserTier.NOVICE ? 1 : 2,
      },
    };

    return selections[domain] || selections.frontend;
  }

  private adjustForComplexity(baseAgents: AgentDefaults, complexity: number): AgentDefaults {
    const adjusted = { ...baseAgents };

    if (complexity >= 4) {
      if (!adjusted.secondary.includes('researcher')) {
        adjusted.secondary.unshift('researcher');
      }
      if (!adjusted.secondary.includes('architect')) {
        adjusted.secondary.push('architect');
      }
      adjusted.maxAgents = Math.max(adjusted.maxAgents, 4);
    }

    if (complexity <= 2) {
      adjusted.secondary = [];
      adjusted.maxAgents = 1;
      adjusted.parallel = false;
    }

    return adjusted;
  }

  private optimizeForTier(agentDefaults: AgentDefaults, userTier: UserTier): AgentDefaults {
    const optimized = { ...agentDefaults };

    switch (userTier) {
      case UserTier.NOVICE:
        optimized.secondary = [];
        optimized.maxAgents = 1;
        optimized.parallel = false;
        optimized.workflow = 'guided';
        break;
      case UserTier.INTERMEDIATE:
        optimized.maxAgents = Math.min(optimized.maxAgents, 3);
        break;
      case UserTier.EXPERT:
        // No restrictions for experts
        break;
    }

    return optimized;
  }

  private saveUserPreferences(): void {
    try {
      // Implementation would save to ~/.claude-flow/preferences.json
    } catch (error) {
      console.warn('Could not save user preferences');
    }
  }

  // Template generation methods

  private getViteConfig(framework: string): string {
    if (framework === 'react') {
      return `import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    open: true
  }
})`;
    }

    if (framework === 'vue') {
      return `import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 3000,
    open: true
  }
})`;
    }

    return '';
  }

  private getReactAppTemplate(): string {
    return `import React from 'react'
import './App.css'

function App() {
  return (
    <div className="App">
      <header className="App-header">
        <h1>Welcome to Claude Flow</h1>
        <p>Your AI-powered React app is ready!</p>
        <p>
          Edit <code>src/App.tsx</code> and save to reload.
        </p>
      </header>
    </div>
  )
}

export default App`;
  }

  private getReactMainTemplate(): string {
    return `import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)`;
  }

  private getExpressServerTemplate(): string {
    return `import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import dotenv from 'dotenv'

dotenv.config()

const app = express()
const port = process.env.PORT || 3000

// Middleware
app.use(helmet())
app.use(cors())
app.use(express.json())

// Routes
app.get('/', (req, res) => {
  res.json({
    message: 'Welcome to your Claude Flow API!',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  })
})

app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    uptime: process.uptime(),
    memory: process.memoryUsage()
  })
})

app.listen(port, () => {
  console.log(\`🚀 Server running on port \${port}\`)
})`;
  }

  private getFastAPIMainTemplate(): string {
    return `from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import uvicorn
from datetime import datetime

app = FastAPI(
    title="Claude Flow API",
    description="Your AI-powered FastAPI application",
    version="1.0.0"
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
async def root():
    return {
        "message": "Welcome to your Claude Flow API!",
        "timestamp": datetime.now().isoformat(),
        "version": "1.0.0"
    }

@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "timestamp": datetime.now().isoformat()
    }

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)`;
  }
}
