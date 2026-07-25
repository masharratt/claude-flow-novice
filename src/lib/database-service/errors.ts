// Stub: database error types
// Created to satisfy test imports

export class DatabaseError extends Error {
  constructor(message: string, public code?: string) {
    super(message);
    this.name = 'DatabaseError';
  }
}

export class ConnectionError extends DatabaseError {
  constructor(message: string) {
    super(message, 'CONNECTION_ERROR');
    this.name = 'ConnectionError';
  }
}

export class TransactionError extends DatabaseError {
  constructor(message: string) {
    super(message, 'TRANSACTION_ERROR');
    this.name = 'TransactionError';
  }
}

export class QueryError extends DatabaseError {
  constructor(message: string) {
    super(message, 'QUERY_ERROR');
    this.name = 'QueryError';
  }
}
