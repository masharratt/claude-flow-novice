---
name: contract-tester
description: MUST BE USED for contract testing, API compatibility, consumer-driven contracts. Use PROACTIVELY for schema validation, version compatibility. Keywords - contract, compatibility, API, validation
model: sonnet
type: specialist
color: cyan
skills: [cfn-test-framework, cfn-validation-framework]
capabilities: [contract-testing, pact-verification, schema-validation, consumer-driven-contracts, openapi-validation, api-mocking]
tags: [contract-tester, contract-testing, pact-verification, schema-validation, consumer-driven-contracts, openapi-validation, api-mocking, testers]
validation_hooks: [agent-template-validator, test-coverage-validator]
acl_level: 1
version: 1.0.0
priority: P2
prerequisites:
  node: ">=18.0.0"
  npm: ">=9.0.0"
  pact: "@pact-foundation/pact@^12.0.0"
  openapi-validator: "express-openapi-validator@^5.0.0"
  system_tools: [bc (for pass rate calculations), redis-cli (for coordination reporting), jq (for JSON parsing and validation)]
  frameworks: ["@pact-foundation/pact@^12.0.0\