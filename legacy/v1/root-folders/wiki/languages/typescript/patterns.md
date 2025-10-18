# Advanced TypeScript Patterns with Claude Flow

Master complex TypeScript patterns using intelligent agent coordination. This guide covers advanced type system features, design patterns, and architectural approaches optimized for agent-assisted development.

## 🎯 Advanced Type System Patterns

### Generic Programming with Agents
```typescript
// Advanced generic patterns
interface Repository<T, K extends keyof T> {
  findById(id: T[K]): Promise<T | null>;
  findByField<F extends keyof T>(field: F, value: T[F]): Promise<T[]>;
  create(entity: Omit<T, K>): Promise<T>;
  update(id: T[K], updates: Partial<Omit<T, K>>): Promise<T>;
  delete(id: T[K]): Promise<void>;
}

// Constraint-based generics
interface Timestamped {
  createdAt: Date;
  updatedAt: Date;
}

interface SoftDeletable {
  deletedAt: Date | null;
}

class AuditableRepository<T extends Timestamped & SoftDeletable, K extends keyof T>
  implements Repository<T, K> {

  async findById(id: T[K]): Promise<T | null> {
    // Agent-generated implementation with audit logging
  }
}

// Agent workflow for generic patterns
Task("Generic Pattern Architect", "Design flexible generic interfaces and constraints", "system-architect")
Task("Implementation Generator", "Generate concrete implementations from generic patterns", "coder")
Task("Type Constraint Validator", "Ensure generic constraints are properly applied", "reviewer")
```

### Template Literal Types and Mapped Types
```typescript
// Advanced template literal types
type HTTPMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
type APIVersion = 'v1' | 'v2' | 'v3';
type ResourcePath = `users` | `posts` | `comments`;

type APIEndpoint = `/${APIVersion}/${ResourcePath}`;
type HTTPEndpoint = `${HTTPMethod} ${APIEndpoint}`;

// Mapped types for API contracts
type APIRoutes = {
  [K in HTTPEndpoint]: K extends `${infer Method} ${infer Path}`
    ? Method extends HTTPMethod
      ? {
          method: Method;
          path: Path;
          handler: RequestHandler<any, any, any>;
        }
      : never
    : never;
};

// Agent-generated type utilities
type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

type PickByType<T, U> = {
  [K in keyof T as T[K] extends U ? K : never]: T[K];
};

// Agent workflow for complex types
Task("Template Literal Designer", "Create type-safe string literal patterns", "system-architect")
Task("Mapped Type Generator", "Generate utility types for common patterns", "code-analyzer")
Task("Type Transformation Specialist", "Implement complex type transformations", "coder")
```

### Conditional Types and Type Guards
```typescript
// Advanced conditional types
type NonNullable<T> = T extends null | undefined ? never : T;

type FunctionPropertyNames<T> = {
  [K in keyof T]: T[K] extends Function ? K : never;
}[keyof T];

type FunctionProperties<T> = Pick<T, FunctionPropertyNames<T>>;

// Discriminated unions with exhaustive checking
interface LoadingState {
  status: 'loading';
}

interface SuccessState {
  status: 'success';
  data: unknown;
}

interface ErrorState {
  status: 'error';
  error: string;
}

type AsyncState = LoadingState | SuccessState | ErrorState;

// Type-safe state handlers
function handleAsyncState(state: AsyncState): string {
  switch (state.status) {
    case 'loading':
      return 'Loading...';
    case 'success':
      return `Success: ${JSON.stringify(state.data)}`;
    case 'error':
      return `Error: ${state.error}`;
    default:
      // TypeScript ensures this is unreachable
      const exhaustiveCheck: never = state;
      throw new Error(`Unhandled state: ${exhaustiveCheck}`);
  }
}

// Agent workflow for type guards and conditionals
Task("Type Guard Generator", "Create comprehensive type guard functions", "coder")
Task("Discriminated Union Designer", "Design type-safe union types", "system-architect")
Task("Exhaustiveness Checker", "Ensure complete pattern matching", "reviewer")
```

## 🏗️ Architectural Patterns

### Domain-Driven Design with TypeScript
```typescript
// Value Objects
class Email {
  private constructor(private readonly value: string) {}

  static create(email: string): Either<ValidationError, Email> {
    if (!this.isValid(email)) {
      return left(new ValidationError('Invalid email format'));
    }
    return right(new Email(email));
  }

  static isValid(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  toString(): string {
    return this.value;
  }
}

// Aggregate Root
class User {
  private constructor(
    private readonly id: UserId,
    private email: Email,
    private profile: UserProfile,
    private events: DomainEvent[] = []
  ) {}

  static create(data: CreateUserData): Either<ValidationError, User> {
    // Agent-generated validation and creation logic
  }

  changeEmail(newEmail: Email): Either<DomainError, void> {
    this.email = newEmail;
    this.addEvent(new UserEmailChangedEvent(this.id, newEmail));
    return right(undefined);
  }

  private addEvent(event: DomainEvent): void {
    this.events.push(event);
  }
}

// Agent workflow for DDD patterns
Task("Domain Model Architect", "Design domain entities and value objects", "system-architect")
Task("Aggregate Designer", "Create aggregate roots with business logic", "coder")
Task("Event System Developer", "Implement domain events and handlers", "backend-dev")
Task("Repository Pattern Implementer", "Create type-safe repository interfaces", "code-analyzer")
```

### Hexagonal Architecture Implementation
```typescript
// Port (Interface)
interface UserRepository {
  findById(id: UserId): Promise<Option<User>>;
  save(user: User): Promise<Either<RepositoryError, void>>;
  findByEmail(email: Email): Promise<Option<User>>;
}

// Adapter (Implementation)
class PostgreSQLUserRepository implements UserRepository {
  constructor(private readonly db: Database) {}

  async findById(id: UserId): Promise<Option<User>> {
    // Type-safe database operations
    const result = await this.db.query<UserRow>(
      'SELECT * FROM users WHERE id = $1',
      [id.toString()]
    );

    return result.rows.length > 0
      ? some(this.toDomain(result.rows[0]))
      : none();
  }

  private toDomain(row: UserRow): User {
    // Agent-generated mapping logic
  }
}

// Use Case
class CreateUserUseCase {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly emailService: EmailService,
    private readonly eventBus: EventBus
  ) {}

  async execute(request: CreateUserRequest): Promise<Either<UseCaseError, User>> {
    // Type-safe use case implementation
  }
}

// Agent workflow for hexagonal architecture
Task("Port Designer", "Define clean interfaces for all external interactions", "system-architect")
Task("Adapter Implementer", "Implement adapters for external systems", "backend-dev")
Task("Use Case Developer", "Create application use cases with type safety", "coder")
Task("Dependency Injection Configurator", "Setup DI container with type safety", "code-analyzer")
```

### Event Sourcing Patterns
```typescript
// Event Store Pattern
interface DomainEvent {
  readonly aggregateId: string;
  readonly eventType: string;
  readonly eventVersion: number;
  readonly timestamp: Date;
  readonly data: unknown;
}

class UserCreatedEvent implements DomainEvent {
  readonly eventType = 'UserCreated';
  readonly eventVersion = 1;

  constructor(
    readonly aggregateId: string,
    readonly timestamp: Date,
    readonly data: {
      email: string;
      profile: UserProfile;
    }
  ) {}
}

// Event Store
interface EventStore {
  appendEvents(
    aggregateId: string,
    events: DomainEvent[],
    expectedVersion: number
  ): Promise<Either<ConcurrencyError, void>>;

  getEvents(
    aggregateId: string,
    fromVersion?: number
  ): Promise<DomainEvent[]>;
}

// Aggregate from Events
class User {
  private constructor(
    private readonly id: UserId,
    private email: Email,
    private profile: UserProfile,
    private version: number = 0
  ) {}

  static fromEvents(events: DomainEvent[]): User {
    if (events.length === 0) {
      throw new Error('Cannot create aggregate from empty event stream');
    }

    let user: User | null = null;

    for (const event of events) {
      if (event.eventType === 'UserCreated') {
        user = this.applyUserCreatedEvent(event);
      } else if (user && event.eventType === 'UserEmailChanged') {
        user = user.applyEmailChangedEvent(event);
      }
      // Handle other events...
    }

    return user!;
  }
}

// Agent workflow for event sourcing
Task("Event Schema Designer", "Design comprehensive event schemas", "system-architect")
Task("Event Store Implementer", "Implement type-safe event storage", "backend-dev")
Task("Projection Builder", "Create read model projections from events", "coder")
Task("Saga Coordinator", "Implement process managers and sagas", "code-analyzer")
```

## 🔧 Utility Type Patterns

### Advanced Type Utilities
```typescript
// Deep property access types
type Path<T> = T extends object
  ? {
      [K in keyof T]: K extends string
        ? T[K] extends object
          ? K | `${K}.${Path<T[K]>}`
          : K
        : never;
    }[keyof T]
  : never;

type PathValue<T, P extends Path<T>> = P extends keyof T
  ? T[P]
  : P extends `${infer K}.${infer Rest}`
  ? K extends keyof T
    ? Rest extends Path<T[K]>
      ? PathValue<T[K], Rest>
      : never
    : never
  : never;

// Usage example
interface User {
  profile: {
    personal: {
      name: string;
      age: number;
    };
    preferences: {
      theme: 'light' | 'dark';
    };
  };
}

type UserPath = Path<User>; // 'profile' | 'profile.personal' | 'profile.personal.name' | etc.
type UserName = PathValue<User, 'profile.personal.name'>; // string

// Agent-generated utilities
Task("Type Utility Generator", "Generate advanced utility types for common patterns", "code-analyzer")
Task("Path Type Creator", "Create type-safe object path utilities", "coder")
Task("Type Operation Designer", "Design complex type manipulation utilities", "system-architect")
```

### Builder Pattern with Types
```typescript
// Type-safe builder pattern
interface UserBuilder {
  email(email: string): UserBuilder;
  name(first: string, last: string): UserBuilder;
  age(age: number): UserBuilder;
  build(): User;
}

// Advanced builder with required fields tracking
type RequiredFields<T> = {
  [K in keyof T]-?: {} extends Pick<T, K> ? never : K;
}[keyof T];

type OptionalFields<T> = {
  [K in keyof T]-?: {} extends Pick<T, K> ? K : never;
}[keyof T];

interface FluentUserBuilder<T = {}> {
  email<E extends string>(email: E): FluentUserBuilder<T & { email: E }>;
  name<F extends string, L extends string>(
    first: F,
    last: L
  ): FluentUserBuilder<T & { firstName: F; lastName: L }>;
  age<A extends number>(age: A): FluentUserBuilder<T & { age: A }>;

  build(): RequiredFields<User> extends keyof T
    ? User
    : `Missing required fields: ${RequiredFields<User> & keyof T}`;
}

// Agent workflow for builder patterns
Task("Builder Pattern Designer", "Create type-safe builder interfaces", "system-architect")
Task("Fluent API Developer", "Implement fluent APIs with compile-time validation", "coder")
Task("Required Field Tracker", "Track required fields at compile time", "reviewer")
```

## 🎨 Functional Programming Patterns

### Monadic Patterns
```typescript
// Maybe/Option monad
abstract class Maybe<T> {
  abstract map<U>(f: (value: T) => U): Maybe<U>;
  abstract flatMap<U>(f: (value: T) => Maybe<U>): Maybe<U>;
  abstract filter(predicate: (value: T) => boolean): Maybe<T>;
  abstract getOrElse(defaultValue: T): T;
  abstract isSome(): this is Some<T>;
  abstract isNone(): this is None<T>;
}

class Some<T> extends Maybe<T> {
  constructor(private readonly value: T) {
    super();
  }

  map<U>(f: (value: T) => U): Maybe<U> {
    return new Some(f(this.value));
  }

  flatMap<U>(f: (value: T) => Maybe<U>): Maybe<U> {
    return f(this.value);
  }

  filter(predicate: (value: T) => boolean): Maybe<T> {
    return predicate(this.value) ? this : new None<T>();
  }

  getOrElse(_defaultValue: T): T {
    return this.value;
  }

  isSome(): this is Some<T> {
    return true;
  }

  isNone(): this is None<T> {
    return false;
  }
}

// Either monad for error handling
abstract class Either<L, R> {
  abstract map<U>(f: (value: R) => U): Either<L, U>;
  abstract flatMap<U>(f: (value: R) => Either<L, U>): Either<L, U>;
  abstract mapLeft<U>(f: (error: L) => U): Either<U, R>;
  abstract fold<U>(onLeft: (error: L) => U, onRight: (value: R) => U): U;
  abstract isLeft(): this is Left<L, R>;
  abstract isRight(): this is Right<L, R>;
}

// Agent workflow for functional patterns
Task("Monad Designer", "Design monadic patterns for error handling and composition", "system-architect")
Task("Functional Utility Creator", "Create functional programming utilities", "coder")
Task("Pipeline Composer", "Implement function composition and pipelines", "code-analyzer")
```

### Immutable Data Patterns
```typescript
// Immutable data structures with structural sharing
interface ImmutableUser {
  readonly id: string;
  readonly email: string;
  readonly profile: {
    readonly name: string;
    readonly age: number;
    readonly preferences: {
      readonly theme: 'light' | 'dark';
      readonly notifications: ReadonlyArray<string>;
    };
  };
}

// Lens pattern for immutable updates
type Lens<S, A> = {
  get: (s: S) => A;
  set: (a: A) => (s: S) => S;
};

const nameLens: Lens<ImmutableUser, string> = {
  get: user => user.profile.name,
  set: name => user => ({
    ...user,
    profile: {
      ...user.profile,
      name
    }
  })
};

// Update utilities
function updateUser<K extends keyof ImmutableUser>(
  user: ImmutableUser,
  key: K,
  value: ImmutableUser[K]
): ImmutableUser {
  return { ...user, [key]: value };
}

// Agent workflow for immutable patterns
Task("Immutable Structure Designer", "Design immutable data structures", "system-architect")
Task("Lens Pattern Implementer", "Create lens patterns for deep updates", "coder")
Task("Update Utility Generator", "Generate type-safe update utilities", "code-analyzer")
```

## 🔍 Metaprogramming Patterns

### Decorator Patterns with Types
```typescript
// Method decorator with type safety
function LogExecution<T extends (...args: any[]) => any>(
  target: any,
  propertyKey: string,
  descriptor: TypedPropertyDescriptor<T>
): TypedPropertyDescriptor<T> {
  const originalMethod = descriptor.value;

  if (!originalMethod) return descriptor;

  descriptor.value = (async function(this: any, ...args: Parameters<T>) {
    console.log(`Executing ${propertyKey} with args:`, args);
    const result = await originalMethod.apply(this, args);
    console.log(`Completed ${propertyKey} with result:`, result);
    return result;
  }) as T;

  return descriptor;
}

// Class decorator for dependency injection
function Injectable<T extends new (...args: any[]) => any>(constructor: T) {
  return class extends constructor {
    static readonly injectable = true;
    static readonly dependencies = Reflect.getMetadata('design:paramtypes', constructor) || [];
  };
}

// Property decorator for validation
function Validate<T>(validator: (value: T) => boolean, message?: string) {
  return function(target: any, propertyKey: string): void {
    const privateKey = `_${propertyKey}`;

    Object.defineProperty(target, propertyKey, {
      get() {
        return this[privateKey];
      },
      set(value: T) {
        if (!validator(value)) {
          throw new Error(message || `Invalid value for ${propertyKey}`);
        }
        this[privateKey] = value;
      },
      enumerable: true,
      configurable: true
    });
  };
}

// Agent workflow for metaprogramming
Task("Decorator Pattern Designer", "Create type-safe decorator patterns", "system-architect")
Task("Reflection Utility Developer", "Implement type-aware reflection utilities", "coder")
Task("Metadata Manager", "Design metadata systems with type safety", "code-analyzer")
```

### Plugin System Architecture
```typescript
// Plugin interface with type constraints
interface Plugin<T = unknown> {
  readonly name: string;
  readonly version: string;
  readonly dependencies?: ReadonlyArray<string>;
  initialize(context: PluginContext): Promise<T>;
  cleanup?(): Promise<void>;
}

// Plugin context with dependency injection
interface PluginContext {
  readonly services: ServiceContainer;
  readonly config: PluginConfig;
  readonly logger: Logger;
}

// Type-safe plugin registry
class PluginRegistry {
  private plugins = new Map<string, Plugin>();
  private instances = new Map<string, unknown>();

  register<T>(plugin: Plugin<T>): void {
    this.validatePlugin(plugin);
    this.plugins.set(plugin.name, plugin);
  }

  async load<T>(name: string): Promise<T> {
    const plugin = this.plugins.get(name);
    if (!plugin) {
      throw new Error(`Plugin ${name} not found`);
    }

    if (!this.instances.has(name)) {
      const instance = await plugin.initialize(this.createContext());
      this.instances.set(name, instance);
    }

    return this.instances.get(name) as T;
  }
}

// Agent workflow for plugin systems
Task("Plugin Architecture Designer", "Design extensible plugin system with types", "system-architect")
Task("Plugin Registry Implementer", "Create type-safe plugin registry", "backend-dev")
Task("Plugin Loader Developer", "Implement dynamic plugin loading", "coder")
Task("Dependency Resolver", "Create plugin dependency resolution system", "code-analyzer")
```

## 🚀 Performance Optimization Patterns

### Lazy Loading and Memoization
```typescript
// Lazy evaluation with types
class Lazy<T> {
  private value?: T;
  private computed = false;

  constructor(private readonly computation: () => T) {}

  get(): T {
    if (!this.computed) {
      this.value = this.computation();
      this.computed = true;
    }
    return this.value!;
  }

  map<U>(f: (value: T) => U): Lazy<U> {
    return new Lazy(() => f(this.get()));
  }
}

// Memoization with type safety
function memoize<Args extends readonly unknown[], Return>(
  fn: (...args: Args) => Return
): (...args: Args) => Return {
  const cache = new Map<string, Return>();

  return (...args: Args): Return => {
    const key = JSON.stringify(args);

    if (cache.has(key)) {
      return cache.get(key)!;
    }

    const result = fn(...args);
    cache.set(key, result);
    return result;
  };
}

// Agent workflow for performance patterns
Task("Lazy Loading Designer", "Create lazy loading patterns with type safety", "performance-benchmarker")
Task("Memoization Implementer", "Implement type-safe memoization utilities", "coder")
Task("Cache Strategy Developer", "Design caching strategies with type awareness", "code-analyzer")
```

## 📋 Pattern Implementation Checklist

### Type Safety Verification
- [ ] All patterns maintain strict type safety
- [ ] Generic constraints are properly applied
- [ ] No use of `any` types
- [ ] Runtime validation where needed
- [ ] Comprehensive error handling

### Agent Coordination
- [ ] Patterns support agent-generated code
- [ ] Type definitions enable intelligent assistance
- [ ] Interfaces allow for automated implementation
- [ ] Pattern templates are agent-friendly
- [ ] Documentation supports code generation

### Performance Considerations
- [ ] Compile-time optimizations applied
- [ ] Runtime performance measured
- [ ] Memory usage optimized
- [ ] Bundle size impact assessed
- [ ] Development experience optimized

---

**Next Steps:**
- Explore [Framework Integration](frameworks.md) for applying patterns to specific frameworks
- Learn [Automation](automation.md) for automated pattern application
- Check [Enterprise Patterns](enterprise.md) for large-scale applications

**Ready to implement advanced patterns?**
- Start with a single pattern that addresses your current needs
- Use agents to generate boilerplate implementations
- Gradually adopt more complex patterns as your application grows