import { ACEReflector } from './ace-reflector.js';
import { ACECurator } from './ace-curator.js';
import { ACEGenerator } from './ace-generator.js';

export class ContextInjector {
  private reflector: ACEReflector;
  private curator: ACECurator;
  private generator: ACEGenerator;

  constructor() {
    this.reflector = new ACEReflector();
    this.curator = new ACECurator();
    this.generator = new ACEGenerator();
  }

  async injectContext<T>(
    target: T,
    contextOverrides: Record<string, any> = {}
  ): Promise<T> {
    // Reflection on current target
    const initialReflection = await this.reflector.reflect(
      { target, contextOverrides }
    );

    // Generate adaptive context
    const adaptedContext = await this.generator.generateContext(
      {
        ...initialReflection.context,
        ...contextOverrides
      }
    );

    // Dynamic context injection
    return this.dynamicInject(target, adaptedContext);
  }

  private dynamicInject<T>(
    target: T,
    context: Record<string, any>
  ): T {
    // Advanced context injection using Proxy
    return new Proxy(target as any, {
      get: (obj, prop) => {
        // Check if context has override for property
        if (context.hasOwnProperty(prop)) {
          return context[prop];
        }
        return Reflect.get(obj, prop);
      },
      set: (obj, prop, value) => {
        // Optional: Trigger reflection on state changes
        this.reflector.reflect({
          target: obj,
          property: prop,
          value
        });
        return Reflect.set(obj, prop, value);
      }
    }) as T;
  }

  // Advanced method for context-aware method execution
  async executeWithContext<T, R>(
    method: (target: T) => Promise<R>,
    target: T,
    contextOverrides: Record<string, any> = {}
  ): Promise<R> {
    const contextualizedTarget = await this.injectContext(
      target,
      contextOverrides
    );

    return method(contextualizedTarget);
  }
}

export default ContextInjector;