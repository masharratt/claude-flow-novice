/**
 * API Contract Validator - Validates API contracts and detects breaking changes
 * Implements OpenAPI schema validation and contract testing
 */

import { EventEmitter } from 'events';
import { ILogger } from '../../core/logger.js';

export interface APIContract {
  version: string;
  basePath: string;
  endpoints: APIEndpoint[];
  schemas: Map<string, Schema>;
  securitySchemes?: SecurityScheme[];
}

export interface APIEndpoint {
  path: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  operationId: string;
  summary?: string;
  description?: string;
  parameters: Parameter[];
  requestBody?: RequestBody;
  responses: Map<number, Response>;
  security?: string[];
  tags?: string[];
}

export interface Parameter {
  name: string;
  in: 'path' | 'query' | 'header' | 'cookie';
  required: boolean;
  schema: Schema;
  description?: string;
  deprecated?: boolean;
}

export interface RequestBody {
  required: boolean;
  content: Map<string, MediaType>;
  description?: string;
}

export interface Response {
  description: string;
  content?: Map<string, MediaType>;
  headers?: Map<string, Header>;
}

export interface MediaType {
  schema: Schema;
  examples?: Map<string, any>;
}

export interface Schema {
  type: string;
  properties?: Map<string, Schema>;
  required?: string[];
  items?: Schema;
  format?: string;
  pattern?: string;
  minimum?: number;
  maximum?: number;
  enum?: any[];
  additionalProperties?: boolean | Schema;
}

export interface Header {
  description?: string;
  schema: Schema;
  required?: boolean;
}

export interface SecurityScheme {
  type: 'apiKey' | 'http' | 'oauth2' | 'openIdConnect';
  name?: string;
  in?: 'query' | 'header' | 'cookie';
  scheme?: string;
  bearerFormat?: string;
}

export interface ValidationResult {
  valid: boolean;
  endpoint: string;
  method: string;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  timestamp: string;
}

export interface ValidationError {
  type: 'request' | 'response' | 'schema' | 'security';
  severity: 'critical' | 'high' | 'medium' | 'low';
  message: string;
  path: string;
  expected?: any;
  actual?: any;
}

export interface ValidationWarning {
  type: 'deprecation' | 'optimization' | 'best-practice';
  message: string;
  recommendation?: string;
}

export interface ContractDiff {
  breaking: BreakingChange[];
  nonBreaking: Change[];
  additions: Addition[];
  deprecations: Deprecation[];
}

export interface BreakingChange {
  type: 'removed-endpoint' | 'removed-field' | 'type-change' | 'required-added' | 'enum-reduced';
  endpoint: string;
  path: string;
  oldValue: any;
  newValue: any;
  impact: 'high' | 'medium';
}

export interface Change {
  type: 'description-change' | 'example-change' | 'default-change';
  endpoint: string;
  path: string;
  oldValue: any;
  newValue: any;
}

export interface Addition {
  type: 'new-endpoint' | 'new-field' | 'new-enum-value';
  endpoint: string;
  path: string;
  value: any;
}

export interface Deprecation {
  endpoint: string;
  path: string;
  deprecatedAt: string;
  removeAt?: string;
  replacement?: string;
}

export class APIContractValidator extends EventEmitter {
  private contracts: Map<string, APIContract> = new Map();
  private validationHistory: ValidationResult[] = [];

  constructor(private logger: ILogger) {
    super();
  }

  /**
   * Register API contract
   */
  registerContract(name: string, contract: APIContract): void {
    this.logger.info('Registering API contract', { name, version: contract.version });

    // Validate contract structure
    this.validateContractStructure(contract);

    this.contracts.set(name, contract);
    this.emit('contract-registered', { name, contract });
  }

  /**
   * Validate API request/response against contract
   */
  async validateRequest(
    contractName: string,
    endpoint: string,
    method: string,
    request: {
      params?: Record<string, any>;
      query?: Record<string, any>;
      headers?: Record<string, any>;
      body?: any;
    },
  ): Promise<ValidationResult> {
    this.logger.debug('Validating request', { contractName, endpoint, method });

    const contract = this.contracts.get(contractName);
    if (!contract) {
      throw new Error(`Contract ${contractName} not found`);
    }

    const apiEndpoint = this.findEndpoint(contract, endpoint, method);
    if (!apiEndpoint) {
      return {
        valid: false,
        endpoint,
        method,
        errors: [
          {
            type: 'request',
            severity: 'critical',
            message: `Endpoint ${method} ${endpoint} not found in contract`,
            path: endpoint,
          },
        ],
        warnings: [],
        timestamp: new Date().toISOString(),
      };
    }

    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // Validate path parameters
    if (request.params) {
      const paramErrors = this.validateParameters(
        apiEndpoint.parameters.filter((p) => p.in === 'path'),
        request.params,
        'path',
      );
      errors.push(...paramErrors);
    }

    // Validate query parameters
    if (request.query) {
      const queryErrors = this.validateParameters(
        apiEndpoint.parameters.filter((p) => p.in === 'query'),
        request.query,
        'query',
      );
      errors.push(...queryErrors);
    }

    // Validate headers
    if (request.headers) {
      const headerErrors = this.validateParameters(
        apiEndpoint.parameters.filter((p) => p.in === 'header'),
        request.headers,
        'header',
      );
      errors.push(...headerErrors);
    }

    // Validate request body
    if (request.body && apiEndpoint.requestBody) {
      const bodyErrors = this.validateRequestBody(apiEndpoint.requestBody, request.body);
      errors.push(...bodyErrors);
    }

    // Check for deprecated fields
    warnings.push(...this.checkDeprecations(apiEndpoint, request));

    const result: ValidationResult = {
      valid: errors.length === 0,
      endpoint,
      method,
      errors,
      warnings,
      timestamp: new Date().toISOString(),
    };

    this.validationHistory.push(result);
    this.emit('request-validated', result);

    return result;
  }

  /**
   * Validate API response against contract
   */
  async validateResponse(
    contractName: string,
    endpoint: string,
    method: string,
    statusCode: number,
    response: {
      headers?: Record<string, any>;
      body?: any;
    },
  ): Promise<ValidationResult> {
    this.logger.debug('Validating response', { contractName, endpoint, method, statusCode });

    const contract = this.contracts.get(contractName);
    if (!contract) {
      throw new Error(`Contract ${contractName} not found`);
    }

    const apiEndpoint = this.findEndpoint(contract, endpoint, method);
    if (!apiEndpoint) {
      return {
        valid: false,
        endpoint,
        method,
        errors: [
          {
            type: 'response',
            severity: 'critical',
            message: `Endpoint ${method} ${endpoint} not found in contract`,
            path: endpoint,
          },
        ],
        warnings: [],
        timestamp: new Date().toISOString(),
      };
    }

    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    const expectedResponse = apiEndpoint.responses.get(statusCode);
    if (!expectedResponse) {
      errors.push({
        type: 'response',
        severity: 'high',
        message: `Status code ${statusCode} not defined in contract`,
        path: `${endpoint}.responses.${statusCode}`,
      });
    } else {
      // Validate response body
      if (response.body && expectedResponse.content) {
        const contentType = 'application/json'; // Assume JSON for simplicity
        const mediaType = expectedResponse.content.get(contentType);

        if (mediaType) {
          const bodyErrors = this.validateAgainstSchema(
            response.body,
            mediaType.schema,
            `${endpoint}.response.body`,
          );
          errors.push(...bodyErrors);
        }
      }

      // Validate response headers
      if (response.headers && expectedResponse.headers) {
        const headerErrors = this.validateResponseHeaders(
          expectedResponse.headers,
          response.headers,
        );
        errors.push(...headerErrors);
      }
    }

    const result: ValidationResult = {
      valid: errors.length === 0,
      endpoint,
      method,
      errors,
      warnings,
      timestamp: new Date().toISOString(),
    };

    this.validationHistory.push(result);
    this.emit('response-validated', result);

    return result;
  }

  /**
   * Compare two contracts to detect breaking changes
   */
  compareContracts(oldContract: APIContract, newContract: APIContract): ContractDiff {
    this.logger.info('Comparing contracts', {
      oldVersion: oldContract.version,
      newVersion: newContract.version,
    });

    const diff: ContractDiff = {
      breaking: [],
      nonBreaking: [],
      additions: [],
      deprecations: [],
    };

    // Compare endpoints
    const oldEndpoints = new Map(oldContract.endpoints.map((e) => [`${e.method} ${e.path}`, e]));
    const newEndpoints = new Map(newContract.endpoints.map((e) => [`${e.method} ${e.path}`, e]));

    // Check for removed endpoints (breaking)
    oldEndpoints.forEach((oldEndpoint, key) => {
      if (!newEndpoints.has(key)) {
        diff.breaking.push({
          type: 'removed-endpoint',
          endpoint: key,
          path: oldEndpoint.path,
          oldValue: oldEndpoint,
          newValue: null,
          impact: 'high',
        });
      }
    });

    // Check for added endpoints (non-breaking)
    newEndpoints.forEach((newEndpoint, key) => {
      if (!oldEndpoints.has(key)) {
        diff.additions.push({
          type: 'new-endpoint',
          endpoint: key,
          path: newEndpoint.path,
          value: newEndpoint,
        });
      }
    });

    // Compare existing endpoints
    oldEndpoints.forEach((oldEndpoint, key) => {
      const newEndpoint = newEndpoints.get(key);
      if (newEndpoint) {
        const endpointDiff = this.compareEndpoints(oldEndpoint, newEndpoint);
        diff.breaking.push(...endpointDiff.breaking);
        diff.nonBreaking.push(...endpointDiff.nonBreaking);
        diff.additions.push(...endpointDiff.additions);
      }
    });

    this.emit('contracts-compared', { diff });

    return diff;
  }

  /**
   * Generate OpenAPI specification from contract
   */
  generateOpenAPISpec(contract: APIContract): any {
    this.logger.info('Generating OpenAPI specification', { version: contract.version });

    const spec = {
      openapi: '3.0.3',
      info: {
        version: contract.version,
        title: 'API Contract',
      },
      servers: [
        {
          url: contract.basePath,
        },
      ],
      paths: this.generatePaths(contract),
      components: {
        schemas: this.generateSchemas(contract.schemas),
        securitySchemes: this.generateSecuritySchemes(contract.securitySchemes),
      },
    };

    return spec;
  }

  /**
   * Validate contract structure
   */
  private validateContractStructure(contract: APIContract): void {
    if (!contract.version) {
      throw new Error('Contract must have a version');
    }

    if (!contract.basePath) {
      throw new Error('Contract must have a basePath');
    }

    if (!contract.endpoints || contract.endpoints.length === 0) {
      throw new Error('Contract must have at least one endpoint');
    }
  }

  /**
   * Find endpoint in contract
   */
  private findEndpoint(
    contract: APIContract,
    path: string,
    method: string,
  ): APIEndpoint | undefined {
    return contract.endpoints.find((e) => e.path === path && e.method === method);
  }

  /**
   * Validate parameters
   */
  private validateParameters(
    parameters: Parameter[],
    values: Record<string, any>,
    location: string,
  ): ValidationError[] {
    const errors: ValidationError[] = [];

    // Check required parameters
    parameters
      .filter((p) => p.required)
      .forEach((param) => {
        if (values[param.name] === undefined) {
          errors.push({
            type: 'request',
            severity: 'critical',
            message: `Missing required ${location} parameter: ${param.name}`,
            path: `${location}.${param.name}`,
          });
        }
      });

    // Validate parameter values
    Object.entries(values).forEach(([name, value]) => {
      const param = parameters.find((p) => p.name === name);
      if (param) {
        const schemaErrors = this.validateAgainstSchema(value, param.schema, `${location}.${name}`);
        errors.push(...schemaErrors);
      }
    });

    return errors;
  }

  /**
   * Validate request body
   */
  private validateRequestBody(requestBody: RequestBody, body: any): ValidationError[] {
    const errors: ValidationError[] = [];

    if (requestBody.required && !body) {
      errors.push({
        type: 'request',
        severity: 'critical',
        message: 'Request body is required',
        path: 'body',
      });
      return errors;
    }

    const contentType = 'application/json';
    const mediaType = requestBody.content.get(contentType);

    if (mediaType) {
      const schemaErrors = this.validateAgainstSchema(body, mediaType.schema, 'body');
      errors.push(...schemaErrors);
    }

    return errors;
  }

  /**
   * Validate response headers
   */
  private validateResponseHeaders(
    expectedHeaders: Map<string, Header>,
    actualHeaders: Record<string, any>,
  ): ValidationError[] {
    const errors: ValidationError[] = [];

    expectedHeaders.forEach((header, name) => {
      if (header.required && actualHeaders[name] === undefined) {
        errors.push({
          type: 'response',
          severity: 'high',
          message: `Missing required response header: ${name}`,
          path: `headers.${name}`,
        });
      }

      if (actualHeaders[name] !== undefined) {
        const schemaErrors = this.validateAgainstSchema(
          actualHeaders[name],
          header.schema,
          `headers.${name}`,
        );
        errors.push(...schemaErrors);
      }
    });

    return errors;
  }

  /**
   * Validate value against schema
   */
  private validateAgainstSchema(value: any, schema: Schema, path: string): ValidationError[] {
    const errors: ValidationError[] = [];

    // Type validation
    const actualType = Array.isArray(value) ? 'array' : typeof value;
    if (schema.type && actualType !== schema.type) {
      errors.push({
        type: 'schema',
        severity: 'critical',
        message: `Type mismatch at ${path}`,
        path,
        expected: schema.type,
        actual: actualType,
      });
      return errors;
    }

    // Format validation
    if (schema.format && typeof value === 'string') {
      // Add format validation logic
    }

    // Pattern validation
    if (schema.pattern && typeof value === 'string') {
      const regex = new RegExp(schema.pattern);
      if (!regex.test(value)) {
        errors.push({
          type: 'schema',
          severity: 'high',
          message: `Value does not match pattern at ${path}`,
          path,
          expected: schema.pattern,
          actual: value,
        });
      }
    }

    // Range validation
    if (typeof value === 'number') {
      if (schema.minimum !== undefined && value < schema.minimum) {
        errors.push({
          type: 'schema',
          severity: 'high',
          message: `Value below minimum at ${path}`,
          path,
          expected: `>= ${schema.minimum}`,
          actual: value,
        });
      }

      if (schema.maximum !== undefined && value > schema.maximum) {
        errors.push({
          type: 'schema',
          severity: 'high',
          message: `Value above maximum at ${path}`,
          path,
          expected: `<= ${schema.maximum}`,
          actual: value,
        });
      }
    }

    // Enum validation
    if (schema.enum && !schema.enum.includes(value)) {
      errors.push({
        type: 'schema',
        severity: 'high',
        message: `Value not in enum at ${path}`,
        path,
        expected: schema.enum,
        actual: value,
      });
    }

    // Object validation
    if (schema.type === 'object' && schema.properties) {
      // Check required properties
      if (schema.required) {
        schema.required.forEach((requiredProp) => {
          if (value[requiredProp] === undefined) {
            errors.push({
              type: 'schema',
              severity: 'critical',
              message: `Missing required property: ${requiredProp}`,
              path: `${path}.${requiredProp}`,
            });
          }
        });
      }

      // Validate properties
      schema.properties.forEach((propSchema, propName) => {
        if (value[propName] !== undefined) {
          const propErrors = this.validateAgainstSchema(
            value[propName],
            propSchema,
            `${path}.${propName}`,
          );
          errors.push(...propErrors);
        }
      });
    }

    // Array validation
    if (schema.type === 'array' && schema.items && Array.isArray(value)) {
      value.forEach((item, index) => {
        const itemErrors = this.validateAgainstSchema(item, schema.items!, `${path}[${index}]`);
        errors.push(...itemErrors);
      });
    }

    return errors;
  }

  /**
   * Check for deprecated fields
   */
  private checkDeprecations(endpoint: APIEndpoint, request: any): ValidationWarning[] {
    const warnings: ValidationWarning[] = [];

    endpoint.parameters
      .filter((p) => p.deprecated)
      .forEach((param) => {
        if (request.params?.[param.name] || request.query?.[param.name]) {
          warnings.push({
            type: 'deprecation',
            message: `Parameter ${param.name} is deprecated`,
            recommendation: param.description,
          });
        }
      });

    return warnings;
  }

  /**
   * Compare two endpoints
   */
  private compareEndpoints(
    oldEndpoint: APIEndpoint,
    newEndpoint: APIEndpoint,
  ): Omit<ContractDiff, 'deprecations'> {
    const diff: Omit<ContractDiff, 'deprecations'> = {
      breaking: [],
      nonBreaking: [],
      additions: [],
    };

    // Compare parameters
    const oldParams = new Map(oldEndpoint.parameters.map((p) => [p.name, p]));
    const newParams = new Map(newEndpoint.parameters.map((p) => [p.name, p]));

    // Check for removed parameters (breaking)
    oldParams.forEach((oldParam, name) => {
      if (!newParams.has(name) && oldParam.required) {
        diff.breaking.push({
          type: 'removed-field',
          endpoint: `${oldEndpoint.method} ${oldEndpoint.path}`,
          path: `parameters.${name}`,
          oldValue: oldParam,
          newValue: null,
          impact: 'high',
        });
      }
    });

    // Check for new required parameters (breaking)
    newParams.forEach((newParam, name) => {
      if (!oldParams.has(name) && newParam.required) {
        diff.breaking.push({
          type: 'required-added',
          endpoint: `${newEndpoint.method} ${newEndpoint.path}`,
          path: `parameters.${name}`,
          oldValue: null,
          newValue: newParam,
          impact: 'medium',
        });
      }
    });

    return diff;
  }

  /**
   * Generate OpenAPI paths
   */
  private generatePaths(contract: APIContract): any {
    const paths: any = {};

    contract.endpoints.forEach((endpoint) => {
      if (!paths[endpoint.path]) {
        paths[endpoint.path] = {};
      }

      paths[endpoint.path][endpoint.method.toLowerCase()] = {
        operationId: endpoint.operationId,
        summary: endpoint.summary,
        description: endpoint.description,
        parameters: this.generatePathParameters(endpoint.parameters),
        requestBody: endpoint.requestBody
          ? this.generateRequestBody(endpoint.requestBody)
          : undefined,
        responses: this.generateResponses(endpoint.responses),
        security: endpoint.security,
        tags: endpoint.tags,
      };
    });

    return paths;
  }

  private generatePathParameters(parameters: Parameter[]): any[] {
    return parameters.map((param) => ({
      name: param.name,
      in: param.in,
      required: param.required,
      description: param.description,
      deprecated: param.deprecated,
      schema: this.schemaToOpenAPI(param.schema),
    }));
  }

  private generateRequestBody(requestBody: RequestBody): any {
    const content: any = {};

    requestBody.content.forEach((mediaType, contentType) => {
      content[contentType] = {
        schema: this.schemaToOpenAPI(mediaType.schema),
        examples: mediaType.examples,
      };
    });

    return {
      required: requestBody.required,
      description: requestBody.description,
      content,
    };
  }

  private generateResponses(responses: Map<number, Response>): any {
    const openAPIResponses: any = {};

    responses.forEach((response, statusCode) => {
      const content: any = {};

      if (response.content) {
        response.content.forEach((mediaType, contentType) => {
          content[contentType] = {
            schema: this.schemaToOpenAPI(mediaType.schema),
            examples: mediaType.examples,
          };
        });
      }

      openAPIResponses[statusCode] = {
        description: response.description,
        content: Object.keys(content).length > 0 ? content : undefined,
      };
    });

    return openAPIResponses;
  }

  private generateSchemas(schemas: Map<string, Schema>): any {
    const openAPISchemas: any = {};

    schemas.forEach((schema, name) => {
      openAPISchemas[name] = this.schemaToOpenAPI(schema);
    });

    return openAPISchemas;
  }

  private generateSecuritySchemes(securitySchemes?: SecurityScheme[]): any {
    if (!securitySchemes) return undefined;

    const schemes: any = {};

    securitySchemes.forEach((scheme, index) => {
      schemes[`scheme${index}`] = scheme;
    });

    return schemes;
  }

  private schemaToOpenAPI(schema: Schema): any {
    const openAPISchema: any = {
      type: schema.type,
    };

    if (schema.properties) {
      openAPISchema.properties = {};
      schema.properties.forEach((propSchema, propName) => {
        openAPISchema.properties[propName] = this.schemaToOpenAPI(propSchema);
      });
    }

    if (schema.required) {
      openAPISchema.required = schema.required;
    }

    if (schema.items) {
      openAPISchema.items = this.schemaToOpenAPI(schema.items);
    }

    if (schema.format) openAPISchema.format = schema.format;
    if (schema.pattern) openAPISchema.pattern = schema.pattern;
    if (schema.minimum !== undefined) openAPISchema.minimum = schema.minimum;
    if (schema.maximum !== undefined) openAPISchema.maximum = schema.maximum;
    if (schema.enum) openAPISchema.enum = schema.enum;
    if (schema.additionalProperties !== undefined) {
      openAPISchema.additionalProperties =
        typeof schema.additionalProperties === 'boolean'
          ? schema.additionalProperties
          : this.schemaToOpenAPI(schema.additionalProperties);
    }

    return openAPISchema;
  }

  /**
   * Get validation statistics
   */
  getValidationStats(): {
    totalValidations: number;
    successfulValidations: number;
    failedValidations: number;
    successRate: number;
  } {
    const total = this.validationHistory.length;
    const successful = this.validationHistory.filter((v) => v.valid).length;

    return {
      totalValidations: total,
      successfulValidations: successful,
      failedValidations: total - successful,
      successRate: total > 0 ? successful / total : 0,
    };
  }
}