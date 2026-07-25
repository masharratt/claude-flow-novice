// Stub: dependency tracker (JavaScript)
// Created to satisfy test imports

export class DependencyTracker {
  constructor() {
    this.dependencies = new Map();
  }

  track(resourceId, dependencies) {
    this.dependencies.set(resourceId, dependencies);
  }

  getDependencies(resourceId) {
    return this.dependencies.get(resourceId) || [];
  }

  hasDependency(resourceId, dependencyId) {
    const deps = this.getDependencies(resourceId);
    return deps.includes(dependencyId);
  }

  clear(resourceId) {
    this.dependencies.delete(resourceId);
  }
}
