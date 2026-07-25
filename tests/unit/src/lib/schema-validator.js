// Stub: schema validator (JavaScript)
// Created to satisfy test imports

export function validateSchema(schema, data) {
  // Stub implementation
  return { valid: true, errors: [] };
}

export class SchemaValidator {
  constructor(schema) {
    this.schema = schema;
  }

  validate(data) {
    return validateSchema(this.schema, data);
  }

  addSchema(name, schema) {
    // Stub implementation
  }
}
