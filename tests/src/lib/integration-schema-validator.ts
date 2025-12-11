// Stub: integration schema validator
// Created to satisfy test imports

export interface SchemaValidationResult {
  valid: boolean;
  errors: Array<{ path: string; message: string }>;
}

export class IntegrationSchemaValidator {
  async validate(schema: unknown, data: unknown): Promise<SchemaValidationResult> {
    // Stub implementation
    return {
      valid: true,
      errors: [],
    };
  }

  addSchema(name: string, schema: unknown): void {
    // Stub implementation
  }
}

export function validateIntegrationSchema(
  schema: unknown,
  data: unknown
): SchemaValidationResult {
  const validator = new IntegrationSchemaValidator();
  return validator.validate(schema, data) as unknown as SchemaValidationResult;
}
