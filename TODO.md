# Async Test Migration TODO

## Remaining Tasks
- [ ] Manually migrate `legacy/v1/tests/performance/fleet-scale-1000-agents.test.js`
- [ ] Manually migrate `legacy/v1/tests/portal-troubleshooting/minimal-server-reproduction.test.js`
- [ ] Manually migrate `legacy/v1/tests/production/integration-validation.test.ts`
- [ ] Manually migrate `legacy/v1/tests/web-portal/portal-integration.test.js`
- [ ] Review `packages/web-portal/node_modules/bcrypt/test/promise.test.js`
- [ ] Review `packages/web-portal/node_modules/bcrypt/test/repetitions.test.js`

## Migration Guidelines
1. Convert `.then()` chains to `async/await`
2. Add proper error handling with try/catch
3. Ensure complete promise resolution
4. Add meaningful logging
5. Verify test behavior post-migration

## Confidence Metrics
- Async Pattern Conversion: 0.90
- Error Handling: 0.85
- Test Isolation: 0.80

**Last Updated:** 2025-10-24
**Priority:** High