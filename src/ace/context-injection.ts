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
    // Validate target is not null or undefined
    if (target === null || target === undefined) {
      throw new Error('Target cannot be null or undefined');
    }

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

    // Context overrides take highest priority, then adapted context
    const finalContext = { ...adaptedContext, ...contextOverrides };

    // Check if target is frozen - if so, return a new merged object
    if (Object.isFrozen(target)) {
      return { ...target as any, ...finalContext } as T;
    }

    // Dynamic context injection via Proxy
    return this.dynamicInject(target, finalContext);
  }

  private dynamicInject<T>(
    target: T,
    context: Record<string, any>
  ): T {
    // Advanced context injection using Proxy
    return new Proxy(target as any, {
      get: (obj, prop) => {
        // Check property descriptor to respect frozen/sealed properties
        const descriptor = Object.getOwnPropertyDescriptor(obj, prop);

        // If property is non-configurable and non-writable, must return actual value
        if (descriptor && !descriptor.configurable && !descriptor.writable) {
          return Reflect.get(obj, prop);
        }

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