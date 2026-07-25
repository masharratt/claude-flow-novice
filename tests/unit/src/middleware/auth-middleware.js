// Stub: auth middleware (JavaScript)
// Created to satisfy test imports

export function authMiddleware(options = {}) {
  return async (req, res, next) => {
    // Stub implementation - just pass through
    if (next) next();
  };
}

export function requireAuth(req, res, next) {
  // Stub implementation - just pass through
  if (next) next();
}

export class AuthMiddleware {
  constructor(options = {}) {
    this.options = options;
  }

  handle(req, res, next) {
    if (next) next();
  }
}
