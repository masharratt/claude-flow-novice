/**
 * Shadcn MCP Adapter - Wrapper Layer for shadcn/ui MCP Server
 * Provides stable API for UI component generation within swarm teams
 */

import { EventEmitter } from 'events';
import { ShadcnComponentRequest } from '../types/index.js';
import { ILogger } from '../../core/logger.js';

export interface ShadcnMCPConfig {
  serverUrl?: string;
  timeout: number;
  retries: number;
  version: string;
  componentRegistry: string;
  defaultTheme: string;
  frameworks: string[];
}

export interface ComponentGenerationResult {
  success: boolean;
  component: {
    name: string;
    code: string;
    dependencies: string[];
    props: Record<string, any>;
    examples: string[];
  };
  files: {
    path: string;
    content: string;
    type: 'component' | 'style' | 'story' | 'test';
  }[];
  documentation: {
    usage: string;
    props: Record<string, any>;
    examples: string[];
  };
  error?: string;
}

export interface ThemeCustomization {
  colors: Record<string, string>;
  fonts: Record<string, string>;
  spacing: Record<string, string>;
  borderRadius: Record<string, string>;
  shadows: Record<string, string>;
}

export interface ComponentLibraryInfo {
  name: string;
  version: string;
  components: {
    name: string;
    category: string;
    description: string;
    variants: string[];
    props: Record<string, any>;
  }[];
}

export class ShadcnMCPAdapter extends EventEmitter {
  private config: ShadcnMCPConfig;
  private connected = false;
  private componentCache = new Map<string, ComponentGenerationResult>();
  private themeCache = new Map<string, ThemeCustomization>();

  constructor(
    config: Partial<ShadcnMCPConfig>,
    private logger: ILogger,
  ) {
    super();
    this.config = {
      serverUrl: 'http://localhost:8080/shadcn-mcp',
      timeout: 30000,
      retries: 3,
      version: '1.0.0',
      componentRegistry: 'official',
      defaultTheme: 'default',
      frameworks: ['react', 'next'],
      ...config,
    };
  }

  /**
   * Connect to shadcn MCP server
   */
  async connect(): Promise<void> {
    try {
      this.logger.info('Connecting to shadcn MCP Server', {
        version: this.config.version,
        registry: this.config.componentRegistry,
      });

      // Detect available components and capabilities
      const capabilities = await this.detectCapabilities();

      this.connected = true;
      this.emit('connected', { capabilities });

      this.logger.info('Connected to shadcn MCP Server', {
        componentsAvailable: capabilities.length,
      });
    } catch (error) {
      this.logger.error('Failed to connect to shadcn MCP Server', { error });
      throw new Error(`shadcn MCP connection failed: ${error.message}`);
    }
  }

  /**
   * Generate UI component with swarm coordination
   */
  async generateComponent(
    request: ShadcnComponentRequest & {
      swarmId?: string;
      agentId?: string;
      framework?: 'react' | 'vue' | 'svelte';
    },
  ): Promise<ComponentGenerationResult> {
    const cacheKey = this.generateCacheKey(request);

    // Check cache first
    if (this.componentCache.has(cacheKey)) {
      this.logger.debug('Component served from cache', { component: request.component });
      return this.componentCache.get(cacheKey)!;
    }

    try {
      const startTime = Date.now();

      // Generate component through shadcn MCP
      const result = await this.executeComponentGeneration(request);

      // Process and enhance the generated component
      const enhancedResult = await this.enhanceGeneratedComponent(result, request);

      // Cache successful results
      if (enhancedResult.success) {
        this.componentCache.set(cacheKey, enhancedResult);
      }

      const duration = Date.now() - startTime;
      this.logger.info('Component generated successfully', {
        component: request.component,
        duration,
        swarmId: request.swarmId,
        agentId: request.agentId,
      });

      // Emit event for swarm coordination
      this.emit('component-generated', {
        component: request.component,
        swarmId: request.swarmId,
        agentId: request.agentId,
        result: enhancedResult,
      });

      return enhancedResult;
    } catch (error) {
      this.logger.error('Component generation failed', {
        error,
        component: request.component,
        swarmId: request.swarmId,
      });

      return {
        success: false,
        component: {
          name: request.component,
          code: '',
          dependencies: [],
          props: {},
          examples: [],
        },
        files: [],
        documentation: {
          usage: '',
          props: {},
          examples: [],
        },
        error: error.message,
      };
    }
  }

  /**
   * Generate complete UI feature with multiple components
   */
  async generateUIFeature(featureSpec: {
    name: string;
    description: string;
    components: ShadcnComponentRequest[];
    layout: 'dashboard' | 'form' | 'landing' | 'admin' | 'ecommerce';
    theme?: string;
    responsive: boolean;
    accessibility: boolean;
    swarmId?: string;
    agentId?: string;
  }): Promise<{
    success: boolean;
    feature: {
      name: string;
      components: ComponentGenerationResult[];
      layout: string;
      theme: ThemeCustomization;
    };
    files: {
      path: string;
      content: string;
      type: string;
    }[];
    error?: string;
  }> {
    try {
      this.logger.info('Generating UI feature', {
        feature: featureSpec.name,
        componentCount: featureSpec.components.length,
        swarmId: featureSpec.swarmId,
      });

      // Generate all components in parallel
      const componentResults = await Promise.all(
        featureSpec.components.map((comp) =>
          this.generateComponent({
            ...comp,
            swarmId: featureSpec.swarmId,
            agentId: featureSpec.agentId,
          }),
        ),
      );

      // Generate or retrieve theme
      const theme = await this.getOrCreateTheme(featureSpec.theme || this.config.defaultTheme);

      // Create layout composition
      const layoutFiles = await this.generateLayoutFiles(featureSpec, componentResults, theme);

      // Generate documentation
      const documentationFiles = await this.generateFeatureDocumentation(
        featureSpec,
        componentResults,
      );

      // Combine all files
      const allFiles = [
        ...componentResults.flatMap((r) => r.files),
        ...layoutFiles,
        ...documentationFiles,
      ];

      const result = {
        success: true,
        feature: {
          name: featureSpec.name,
          components: componentResults,
          layout: featureSpec.layout,
          theme,
        },
        files: allFiles,
      };

      this.emit('feature-generated', {
        feature: featureSpec.name,
        swarmId: featureSpec.swarmId,
        agentId: featureSpec.agentId,
        result,
      });

      return result;
    } catch (error) {
      this.logger.error('UI feature generation failed', {
        error,
        feature: featureSpec.name,
        swarmId: featureSpec.swarmId,
      });

      return {
        success: false,
        feature: {
          name: featureSpec.name,
          components: [],
          layout: featureSpec.layout,
          theme: {} as ThemeCustomization,
        },
        files: [],
        error: error.message,
      };
    }
  }

  /**
   * Customize theme for swarm-specific branding
   */
  async customizeTheme(themeSpec: {
    name: string;
    baseTheme: string;
    customizations: Partial<ThemeCustomization>;
    swarmId?: string;
  }): Promise<ThemeCustomization> {
    const cacheKey = `theme:${themeSpec.name}:${themeSpec.baseTheme}`;

    if (this.themeCache.has(cacheKey)) {
      return this.themeCache.get(cacheKey)!;
    }

    try {
      // Get base theme
      const baseTheme = await this.getBaseTheme(themeSpec.baseTheme);

      // Apply customizations
      const customizedTheme: ThemeCustomization = {
        colors: { ...baseTheme.colors, ...themeSpec.customizations.colors },
        fonts: { ...baseTheme.fonts, ...themeSpec.customizations.fonts },
        spacing: { ...baseTheme.spacing, ...themeSpec.customizations.spacing },
        borderRadius: { ...baseTheme.borderRadius, ...themeSpec.customizations.borderRadius },
        shadows: { ...baseTheme.shadows, ...themeSpec.customizations.shadows },
      };

      // Cache customized theme
      this.themeCache.set(cacheKey, customizedTheme);

      this.emit('theme-customized', {
        themeName: themeSpec.name,
        swarmId: themeSpec.swarmId,
        theme: customizedTheme,
      });

      return customizedTheme;
    } catch (error) {
      this.logger.error('Theme customization failed', { error, theme: themeSpec.name });
      throw error;
    }
  }

  /**
   * Get available component library information
   */
  async getComponentLibrary(): Promise<ComponentLibraryInfo> {
    try {
      const library = await this.executeShadcnCommand({
        action: 'list_components',
        params: { registry: this.config.componentRegistry },
      });

      return {
        name: 'shadcn/ui',
        version: this.config.version,
        components: library.components.map((comp: any) => ({
          name: comp.name,
          category: comp.category || 'general',
          description: comp.description || '',
          variants: comp.variants || [],
          props: comp.props || {},
        })),
      };
    } catch (error) {
      this.logger.error('Failed to get component library', { error });
      throw error;
    }
  }

  /**
   * Search components by criteria
   */
  async searchComponents(query: {
    name?: string;
    category?: string;
    features?: string[];
    framework?: string;
  }): Promise<ComponentLibraryInfo['components']> {
    try {
      const library = await this.getComponentLibrary();

      return library.components.filter((comp) => {
        if (query.name && !comp.name.toLowerCase().includes(query.name.toLowerCase())) {
          return false;
        }
        if (query.category && comp.category !== query.category) {
          return false;
        }
        if (
          query.features &&
          !query.features.some((feature) =>
            comp.description.toLowerCase().includes(feature.toLowerCase()),
          )
        ) {
          return false;
        }
        return true;
      });
    } catch (error) {
      this.logger.error('Component search failed', { error, query });
      return [];
    }
  }

  /**
   * Validate generated component quality
   */
  async validateComponent(component: ComponentGenerationResult): Promise<{
    valid: boolean;
    issues: string[];
    suggestions: string[];
    score: number;
  }> {
    const issues: string[] = [];
    const suggestions: string[] = [];
    let score = 100;

    try {
      // Check TypeScript compilation
      if (!component.component.code.includes('interface') && component.component.props) {
        issues.push('Missing TypeScript interface for props');
        score -= 10;
      }

      // Check accessibility
      if (
        !component.component.code.includes('aria-') &&
        !component.component.code.includes('role=')
      ) {
        suggestions.push('Consider adding ARIA attributes for better accessibility');
        score -= 5;
      }

      // Check responsive design
      if (
        !component.component.code.includes('responsive') &&
        !component.component.code.includes('breakpoint')
      ) {
        suggestions.push('Consider adding responsive design features');
        score -= 5;
      }

      // Check for required dependencies
      if (component.component.dependencies.length === 0) {
        issues.push('No dependencies listed - component may not work correctly');
        score -= 15;
      }

      // Check documentation completeness
      if (!component.documentation.usage) {
        issues.push('Missing usage documentation');
        score -= 10;
      }

      const valid = issues.length === 0;

      return { valid, issues, suggestions, score };
    } catch (error) {
      this.logger.error('Component validation failed', { error });
      return {
        valid: false,
        issues: ['Validation process failed'],
        suggestions: [],
        score: 0,
      };
    }
  }

  /**
   * Core command execution with retry logic and version adaptation
   */
  private async executeShadcnCommand(command: {
    action: string;
    params: Record<string, any>;
    timeout?: number;
  }): Promise<any> {
    if (!this.connected) {
      await this.connect();
    }

    const startTime = Date.now();
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.config.retries; attempt++) {
      try {
        // Adapt command for current shadcn MCP version
        const adaptedCommand = this.adaptCommandForVersion(command);

        // Execute command (this would connect to actual shadcn MCP server)
        const result = await this.executeAdaptedCommand(adaptedCommand);

        const duration = Date.now() - startTime;
        this.logger.debug('shadcn MCP command executed', {
          action: command.action,
          duration,
          attempt: attempt + 1,
        });

        return result;
      } catch (error) {
        lastError = error;
        this.logger.warn(`shadcn MCP command failed (attempt ${attempt + 1})`, {
          action: command.action,
          error: error.message,
        });

        if (attempt < this.config.retries - 1) {
          await this.delay(1000 * Math.pow(2, attempt));
        }
      }
    }

    throw lastError || new Error('Command execution failed');
  }

  /**
   * Adapt commands for different shadcn MCP versions
   */
  private adaptCommandForVersion(command: any): any {
    const adapted = { ...command };

    // Version-specific adaptations would go here
    if (this.config.version.startsWith('1.0')) {
      // v1.0 compatibility
      if (command.action === 'generate_component') {
        adapted.params = {
          ...command.params,
          framework: command.params.framework || 'react',
        };
      }
    }

    return adapted;
  }

  /**
   * Execute adapted command against shadcn MCP server
   */
  private async executeAdaptedCommand(command: any): Promise<any> {
    // This would connect to actual shadcn MCP server
    // For now, simulate the interaction

    switch (command.action) {
      case 'generate_component':
        return this.simulateComponentGeneration(command.params);

      case 'list_components':
        return this.simulateComponentList();

      case 'get_theme':
        return this.simulateThemeRetrieval(command.params.theme);

      default:
        throw new Error(`Unsupported command: ${command.action}`);
    }
  }

  private simulateComponentGeneration(params: any): any {
    return {
      success: true,
      component: {
        name: params.component,
        code: `import { cn } from "@/lib/utils"\n\nexport interface ${params.component}Props {\n  className?: string\n}\n\nexport function ${params.component}({ className, ...props }: ${params.component}Props) {\n  return (\n    <div className={cn("", className)} {...props}>\n      {/* ${params.component} implementation */}\n    </div>\n  )\n}`,
        dependencies: ['@radix-ui/react-slot', 'class-variance-authority'],
        props: {
          className: 'string',
        },
      },
    };
  }

  private simulateComponentList(): any {
    return {
      components: [
        {
          name: 'Button',
          category: 'forms',
          description: 'A customizable button component',
          variants: ['default', 'destructive', 'outline', 'secondary', 'ghost', 'link'],
          props: { variant: 'string', size: 'string', asChild: 'boolean' },
        },
        {
          name: 'Card',
          category: 'layout',
          description: 'A container component with header, content, and footer',
          variants: [],
          props: { className: 'string' },
        },
      ],
    };
  }

  private simulateThemeRetrieval(themeName: string): ThemeCustomization {
    return {
      colors: {
        primary: '#000000',
        secondary: '#f1f5f9',
        accent: '#e2e8f0',
      },
      fonts: {
        default: 'Inter, sans-serif',
        heading: 'Inter, sans-serif',
      },
      spacing: {
        xs: '0.25rem',
        sm: '0.5rem',
        md: '1rem',
        lg: '2rem',
      },
      borderRadius: {
        sm: '0.25rem',
        md: '0.5rem',
        lg: '1rem',
      },
      shadows: {
        sm: '0 1px 2px rgba(0, 0, 0, 0.05)',
        md: '0 4px 6px rgba(0, 0, 0, 0.1)',
      },
    };
  }

  private async executeComponentGeneration(request: ShadcnComponentRequest): Promise<any> {
    return this.executeShadcnCommand({
      action: 'generate_component',
      params: request,
    });
  }

  private async enhanceGeneratedComponent(
    result: any,
    request: ShadcnComponentRequest,
  ): Promise<ComponentGenerationResult> {
    return {
      success: true,
      component: result.component,
      files: [
        {
          path: `components/${result.component.name.toLowerCase()}.tsx`,
          content: result.component.code,
          type: 'component',
        },
      ],
      documentation: {
        usage: `import { ${result.component.name} } from '@/components/${result.component.name.toLowerCase()}'`,
        props: result.component.props,
        examples: [`<${result.component.name} />`],
      },
    };
  }

  private generateCacheKey(request: ShadcnComponentRequest): string {
    return `${request.component}:${request.variant}:${JSON.stringify(request.props)}`;
  }

  private async detectCapabilities(): Promise<string[]> {
    return ['generate_component', 'list_components', 'customize_theme', 'validate_component'];
  }

  private async getOrCreateTheme(themeName: string): Promise<ThemeCustomization> {
    if (this.themeCache.has(themeName)) {
      return this.themeCache.get(themeName)!;
    }

    const theme = await this.getBaseTheme(themeName);
    this.themeCache.set(themeName, theme);
    return theme;
  }

  private async getBaseTheme(themeName: string): Promise<ThemeCustomization> {
    return this.simulateThemeRetrieval(themeName);
  }

  private async generateLayoutFiles(
    featureSpec: any,
    componentResults: ComponentGenerationResult[],
    theme: ThemeCustomization,
  ): Promise<any[]> {
    return [
      {
        path: `layouts/${featureSpec.name.toLowerCase()}-layout.tsx`,
        content: `// Layout for ${featureSpec.name}`,
        type: 'layout',
      },
    ];
  }

  private async generateFeatureDocumentation(
    featureSpec: any,
    componentResults: ComponentGenerationResult[],
  ): Promise<any[]> {
    return [
      {
        path: `docs/${featureSpec.name.toLowerCase()}.md`,
        content: `# ${featureSpec.name}\n\n${featureSpec.description}`,
        type: 'documentation',
      },
    ];
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    this.emit('disconnected');
    this.logger.info('Disconnected from shadcn MCP Server');
  }

  getStatus(): {
    connected: boolean;
    version: string;
    registry: string;
    cachedComponents: number;
    cachedThemes: number;
  } {
    return {
      connected: this.connected,
      version: this.config.version,
      registry: this.config.componentRegistry,
      cachedComponents: this.componentCache.size,
      cachedThemes: this.themeCache.size,
    };
  }
}
