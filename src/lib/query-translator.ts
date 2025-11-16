/**
 * Query Translator
 *
 * Translates between SQL queries and Redis commands for cross-backend compatibility.
 * Includes query optimization and backend recommendation logic.
 *
 * Part of Phase 2, Task P2-3.1: Unified Query API
 *
 * Features:
 * - SQL to Redis translation
 * - Redis to SQL translation
 * - Query optimization
 * - Backend recommendation based on query patterns
 * - Performance monitoring (<50ms translation time)
 *
 * @example
 * ```typescript
 * const translator = new QueryTranslator();
 *
 * // Translate SQL to Redis
 * const redisCmd = translator.translateSQLToRedis(
 *   'SELECT * FROM tasks WHERE id = ?',
 *   ['task-123']
 * );
 *
 * // Translate Redis to SQL
 * const sqlQuery = translator.translateRedisToSQL({
 *   command: 'HGETALL',
 *   key: 'task:123'
 * });
 * ```
 */

import { BackendType, QueryRequest } from './unified-query-api';

/**
 * Redis command structure
 */
export interface RedisCommand {
  command: string;
  key?: string;
  fields?: Record<string, any>;
  args?: any[];
}

/**
 * Translation result
 */
export interface TranslationResult {
  success: boolean;
  redisCommand?: RedisCommand;
  sqlQuery?: string;
  sqlParams?: any[];
  executionTime: number;
  recommendedBackend?: BackendType;
  warnings?: string[];
}

/**
 * Query optimization result
 */
export interface OptimizationResult {
  indexed?: string[];
  executionPlan?: string;
  estimatedCost?: number;
  recommendations?: string[];
}

/**
 * SQL query parser
 */
class SQLParser {
  /**
   * Parse SQL SELECT statement
   */
  parseSelect(sql: string): {
    table?: string;
    fields?: string[];
    where?: { field: string; operator: string; value?: any }[];
    joins?: Array<{ table: string; on: string }>;
  } {
    const result: any = {};

    // Extract table name
    const tableMatch = sql.match(/FROM\s+(\w+)/i);
    if (tableMatch) {
      result.table = tableMatch[1];
    }

    // Extract fields
    const fieldsMatch = sql.match(/SELECT\s+(.*?)\s+FROM/i);
    if (fieldsMatch) {
      const fields = fieldsMatch[1].trim();
      result.fields = fields === '*' ? ['*'] : fields.split(',').map(f => f.trim());
    }

    // Extract WHERE clause
    const whereMatch = sql.match(/WHERE\s+(.*?)(?:ORDER BY|GROUP BY|LIMIT|$)/i);
    if (whereMatch) {
      const whereClause = whereMatch[1].trim();
      result.where = this.parseWhereClause(whereClause);
    }

    // Extract JOINs
    const joinMatches = sql.matchAll(/(?:INNER |LEFT |RIGHT |)?JOIN\s+(\w+)\s+ON\s+(.*?)(?:WHERE|ORDER BY|GROUP BY|LIMIT|JOIN|$)/gi);
    result.joins = [];
    for (const match of joinMatches) {
      result.joins.push({
        table: match[1],
        on: match[2].trim(),
      });
    }

    return result;
  }

  /**
   * Parse WHERE clause
   */
  parseWhereClause(whereClause: string): Array<{ field: string; operator: string; value?: any }> {
    const conditions: Array<{ field: string; operator: string; value?: any }> = [];

    // Simple parser for basic conditions
    // Format: field = ? OR field LIKE ? etc.
    const parts = whereClause.split(/\s+AND\s+/i);

    for (const part of parts) {
      const match = part.match(/(\w+)\s*(=|!=|>|>=|<|<=|LIKE)\s*(.+)/i);
      if (match) {
        conditions.push({
          field: match[1],
          operator: match[2].toLowerCase(),
          value: match[3] === '?' ? undefined : match[3],
        });
      }
    }

    return conditions;
  }

  /**
   * Parse SQL INSERT statement
   */
  parseInsert(sql: string): {
    table?: string;
    fields?: string[];
    values?: any[];
  } {
    const result: any = {};

    // Extract table name
    const tableMatch = sql.match(/INSERT INTO\s+(\w+)/i);
    if (tableMatch) {
      result.table = tableMatch[1];
    }

    // Extract fields
    const fieldsMatch = sql.match(/\(([^)]+)\)\s+VALUES/i);
    if (fieldsMatch) {
      result.fields = fieldsMatch[1].split(',').map(f => f.trim());
    }

    return result;
  }

  /**
   * Parse SQL UPDATE statement
   */
  parseUpdate(sql: string): {
    table?: string;
    fields?: string[];
    where?: { field: string; operator: string; value?: any }[];
  } {
    const result: any = {};

    // Extract table name
    const tableMatch = sql.match(/UPDATE\s+(\w+)/i);
    if (tableMatch) {
      result.table = tableMatch[1];
    }

    // Extract SET clause
    const setMatch = sql.match(/SET\s+(.*?)\s+WHERE/i);
    if (setMatch) {
      const setParts = setMatch[1].split(',');
      result.fields = setParts.map(p => p.split('=')[0].trim());
    }

    // Extract WHERE clause
    const whereMatch = sql.match(/WHERE\s+(.*?)$/i);
    if (whereMatch) {
      result.where = this.parseWhereClause(whereMatch[1].trim());
    }

    return result;
  }

  /**
   * Parse SQL DELETE statement
   */
  parseDelete(sql: string): {
    table?: string;
    where?: { field: string; operator: string; value?: any }[];
  } {
    const result: any = {};

    // Extract table name
    const tableMatch = sql.match(/DELETE FROM\s+(\w+)/i);
    if (tableMatch) {
      result.table = tableMatch[1];
    }

    // Extract WHERE clause
    const whereMatch = sql.match(/WHERE\s+(.*?)$/i);
    if (whereMatch) {
      result.where = this.parseWhereClause(whereMatch[1].trim());
    }

    return result;
  }
}

/**
 * Query Translator
 *
 * Provides bidirectional translation between SQL and Redis commands
 */
export class QueryTranslator {
  private parser: SQLParser;

  constructor() {
    this.parser = new SQLParser();
  }

  /**
   * Translate SQL query to Redis commands
   */
  translateSQLToRedis(sql: string, params: any[] = []): TranslationResult {
    const startTime = Date.now();
    const warnings: string[] = [];

    try {
      // Determine query type
      const queryType = this.getQueryType(sql);

      let redisCommand: RedisCommand | undefined;
      let recommendedBackend = BackendType.REDIS;

      switch (queryType) {
        case 'SELECT':
          const selectParsed = this.parser.parseSelect(sql);

          // Check if query is complex (has joins)
          if (selectParsed.joins && selectParsed.joins.length > 0) {
            warnings.push('Complex queries with JOINs are better suited for PostgreSQL');
            recommendedBackend = BackendType.POSTGRES;
          }

          // Translate to Redis HGETALL or GET
          if (selectParsed.where && selectParsed.where.length > 0) {
            const idCondition = selectParsed.where.find(w => w.field === 'id');
            if (idCondition) {
              const keyValue = params[0] || idCondition.value;
              const redisKey = `${selectParsed.table}:${keyValue}`;

              redisCommand = {
                command: selectParsed.fields?.[0] === '*' ? 'HGETALL' : 'HGET',
                key: redisKey,
              };
            }
          }
          break;

        case 'INSERT':
          const insertParsed = this.parser.parseInsert(sql);

          if (insertParsed.table && insertParsed.fields) {
            const idValue = params[0];
            const redisKey = `${insertParsed.table}:${idValue}`;

            // Build field-value pairs
            const fields: Record<string, any> = {};
            insertParsed.fields.forEach((field, index) => {
              fields[field] = params[index];
            });

            redisCommand = {
              command: 'HMSET',
              key: redisKey,
              fields,
            };
          }
          break;

        case 'UPDATE':
          const updateParsed = this.parser.parseUpdate(sql);

          if (updateParsed.table && updateParsed.where) {
            const idCondition = updateParsed.where.find(w => w.field === 'id');
            if (idCondition) {
              const keyValue = params[params.length - 1]; // ID is usually last param
              const redisKey = `${updateParsed.table}:${keyValue}`;

              redisCommand = {
                command: 'HSET',
                key: redisKey,
                args: params.slice(0, -1), // All params except ID
              };
            }
          }
          break;

        case 'DELETE':
          const deleteParsed = this.parser.parseDelete(sql);

          if (deleteParsed.table && deleteParsed.where) {
            const idCondition = deleteParsed.where.find(w => w.field === 'id');
            if (idCondition) {
              const keyValue = params[0];
              const redisKey = `${deleteParsed.table}:${keyValue}`;

              redisCommand = {
                command: 'DEL',
                key: redisKey,
              };
            }
          }
          break;

        default:
          warnings.push(`Unsupported SQL query type: ${queryType}`);
          recommendedBackend = BackendType.POSTGRES;
      }

      const executionTime = Date.now() - startTime;

      if (executionTime > 50) {
        warnings.push(`Translation took ${executionTime}ms (target: <50ms)`);
      }

      return {
        success: !!redisCommand,
        redisCommand,
        executionTime,
        recommendedBackend,
        warnings: warnings.length > 0 ? warnings : undefined,
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;

      return {
        success: false,
        executionTime,
        warnings: [`Translation failed: ${error instanceof Error ? error.message : 'Unknown error'}`],
      };
    }
  }

  /**
   * Translate Redis command to SQL query
   */
  translateRedisToSQL(command: RedisCommand): TranslationResult {
    const startTime = Date.now();
    const warnings: string[] = [];

    try {
      let sqlQuery: string | undefined;
      let sqlParams: any[] = [];

      // Parse Redis key to extract table and ID
      const keyParts = command.key?.split(':') || [];
      const table = keyParts[0] || 'unknown';
      const id = keyParts[1];

      switch (command.command.toUpperCase()) {
        case 'GET':
        case 'HGET':
        case 'HGETALL':
          sqlQuery = `SELECT * FROM ${table} WHERE id = ?`;
          sqlParams = [id];
          break;

        case 'SET':
        case 'HMSET':
          if (command.fields) {
            const fields = Object.keys(command.fields);
            const placeholders = fields.map(() => '?').join(', ');
            sqlQuery = `INSERT INTO ${table} (${fields.join(', ')}) VALUES (${placeholders})`;
            sqlParams = Object.values(command.fields);
          }
          break;

        case 'HSET':
          if (command.args && command.args.length > 0) {
            const field = command.args[0];
            sqlQuery = `UPDATE ${table} SET ${field} = ? WHERE id = ?`;
            sqlParams = [command.args[1], id];
          }
          break;

        case 'DEL':
          sqlQuery = `DELETE FROM ${table} WHERE id = ?`;
          sqlParams = [id];
          break;

        default:
          warnings.push(`Unsupported Redis command: ${command.command}`);
      }

      const executionTime = Date.now() - startTime;

      if (executionTime > 50) {
        warnings.push(`Translation took ${executionTime}ms (target: <50ms)`);
      }

      return {
        success: !!sqlQuery,
        sqlQuery,
        sqlParams,
        executionTime,
        warnings: warnings.length > 0 ? warnings : undefined,
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;

      return {
        success: false,
        executionTime,
        warnings: [`Translation failed: ${error instanceof Error ? error.message : 'Unknown error'}`],
      };
    }
  }

  /**
   * Optimize query and provide recommendations
   */
  optimizeQuery(request: QueryRequest): OptimizationResult & { indexes?: string[] } {
    const result: OptimizationResult & { indexes?: string[] } = {
      indexed: [],
      recommendations: [],
    };

    // Recommend indexes for filtered fields
    if (request.filters) {
      const indexFields = request.filters.map(f => String(f.field));
      result.indexed = indexFields;
      result.indexes = indexFields;
      result.recommendations?.push(`Consider adding indexes on: ${indexFields.join(', ')}`);
    }

    // Estimate query cost
    let cost = 1;
    if (request.joins) {
      cost += request.joins.length * 10; // JOINs are expensive
    }
    if (request.filters) {
      cost += request.filters.length * 2;
    }
    result.estimatedCost = cost;

    // Provide optimization recommendations
    if (request.joins && request.joins.length > 2) {
      result.recommendations?.push('Consider denormalizing data or using materialized views for complex joins');
    }

    if (request.filters && request.filters.length > 5) {
      result.recommendations?.push('Consider composite indexes for multiple filter conditions');
    }

    return result;
  }

  /**
   * Recommend backend based on query characteristics
   */
  recommendBackend(request: QueryRequest): BackendType {
    // Simple key-value access → Redis
    if (request.key && !request.joins) {
      return BackendType.REDIS;
    }

    // Complex queries with JOINs → PostgreSQL
    if (request.joins && request.joins.length > 0) {
      return BackendType.POSTGRES;
    }

    // Session/cache data → Redis
    if (request.dataType === 'cache' || request.dataType === 'session') {
      return BackendType.REDIS;
    }

    // Embedded/local data → SQLite
    if (request.dataType === 'embedded') {
      return BackendType.SQLITE;
    }

    // Default to PostgreSQL for structured data
    return BackendType.POSTGRES;
  }

  /**
   * Get query type from SQL string
   */
  private getQueryType(sql: string): string {
    const trimmed = sql.trim().toUpperCase();

    if (trimmed.startsWith('SELECT')) return 'SELECT';
    if (trimmed.startsWith('INSERT')) return 'INSERT';
    if (trimmed.startsWith('UPDATE')) return 'UPDATE';
    if (trimmed.startsWith('DELETE')) return 'DELETE';

    return 'UNKNOWN';
  }
}
