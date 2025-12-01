# SEO Analysis Package - Setup Guide

Complete setup instructions for the Competitor Deep Analyst Agent Phase 2 Sprint 1.

## Pre-requisites

- Node.js >= 18.0.0
- npm >= 9.0.0
- Git access to claude-flow-novice repository

## 1. Installation

### From Within the Project

```bash
cd /mnt/c/Users/masha/Documents/claude-flow-novice/packages/seo-analysis
npm install
```

### As a Monorepo Dependency

```bash
npm install @claude-flow-novice/seo-analysis
```

## 2. API Key Setup

### Step 1: Get Firecrawl API Key

1. Visit [https://www.firecrawl.dev](https://www.firecrawl.dev)
2. Click "Sign Up" (free tier available)
3. Complete account creation
4. Navigate to API Keys dashboard
5. Copy your API key (starts with `sk_`)

### Step 2: Configure Environment Variables

Create `.env` in your project root:

```bash
# Copy from template
cp .env.example .env

# Edit .env file
FIRECRAWL_API_KEY=sk_your_actual_key_here
FIRECRAWL_API_URL=https://api.firecrawl.dev
MAX_URLS_PER_DOMAIN=100
REQUEST_TIMEOUT=30000
MAX_RETRIES=3
```

### Step 3: Verify Configuration

```bash
# Check that dotenv can load your .env
node -e "require('dotenv').config(); console.log('API Key loaded:', !!process.env.FIRECRAWL_API_KEY)"
```

## 3. TypeScript Configuration

The package includes:
- `tsconfig.json` - Compiler settings for ES2020
- Strict type checking enabled
- Declaration file generation enabled

### Build the Package

```bash
npm run build
```

This will generate:
- `dist/index.js` - CommonJS entry point
- `dist/index.mjs` - ES module entry point
- `dist/index.d.ts` - TypeScript type definitions

### Watch Mode (Development)

```bash
npm run dev
```

Automatically rebuilds on file changes.

## 4. Testing Setup

### Run Tests

```bash
npm test
```

### Watch Mode

```bash
npm run test:watch
```

### Coverage Report

```bash
npm run test:coverage
```

Generates coverage report in `coverage/` directory.

**Coverage Threshold**: 70% minimum across all metrics

### Test Configuration

Tests are configured in `jest.config.js`:
- Preset: `ts-jest` (TypeScript support)
- Environment: Node.js
- Timeout: 30 seconds per test (for API calls)
- Coverage: 70% threshold

## 5. Code Quality

### Linting

```bash
npm run lint
```

### Fix Linting Issues

```bash
npm run lint:fix
```

### Type Checking

```bash
npm run type-check
```

## 6. Development Workflow

### Creating New Modules

1. Create file in `src/`
2. Add exports to `src/index.ts`
3. Create tests in `src/__tests__/`
4. Update `DEPENDENCIES.md` if adding external deps

### Example: Adding a New Analyzer

```typescript
// src/my-analyzer.ts
import { CrawlResult } from './types';

export class MyAnalyzer {
  analyze(result: CrawlResult): unknown {
    // Implementation
  }
}

// Update src/index.ts
export { MyAnalyzer } from './my-analyzer';
```

### Testing Your Code

```typescript
// src/__tests__/my-analyzer.test.ts
import { MyAnalyzer } from '../my-analyzer';

describe('MyAnalyzer', () => {
  it('should analyze results', () => {
    const analyzer = new MyAnalyzer();
    // Test
  });
});
```

## 7. Building for Production

### Full Production Build

```bash
npm run build
npm test
npm run type-check
```

### Pre-publish Checklist

```bash
# Verify package contents
npm pack --dry-run

# Check size
ls -lh *.tgz

# Verify types
npm run type-check

# Run full test suite
npm test
```

### Publishing to npm

```bash
# Update version
npm version patch  # or minor/major

# This automatically:
# - Builds the package
# - Runs tests
# - Checks types
# - Creates git commit with tag

npm publish --access public
```

## 8. Environment Variables Reference

### Required

- `FIRECRAWL_API_KEY`: Your Firecrawl SDK key (get from dashboard)

### Optional (Defaults Provided)

```bash
# API Configuration
FIRECRAWL_API_URL=https://api.firecrawl.dev  # Production URL
MAX_URLS_PER_DOMAIN=100                      # Rate limiting
REQUEST_TIMEOUT=30000                         # 30 seconds
MAX_RETRIES=3                                 # Retry attempts
RETRY_DELAY_MS=1000                          # Delay between retries

# Optional Network
HTTP_PROXY=                                   # HTTP proxy (optional)
HTTPS_PROXY=                                  # HTTPS proxy (optional)
CUSTOM_USER_AGENT=                           # Custom User-Agent header

# Logging
LOG_LEVEL=info                               # debug|info|warn|error
```

## 9. Security Checklist

### Before Using in Production

- [ ] `.env` file is in `.gitignore` (prevents accidental commits)
- [ ] API key is NOT visible in code, tests, or docs
- [ ] Using environment variables for API key injection
- [ ] `.env.example` only has placeholders (`[REDACTED]`)
- [ ] No secrets in git history (if added accidentally, rotate key)
- [ ] Firecrawl API key has minimal necessary permissions
- [ ] Rate limiting configured appropriately
- [ ] Monitoring/alerting set up for API quota

### If API Key Is Compromised

1. Delete the compromised key from Firecrawl dashboard
2. Generate new key
3. Update `FIRECRAWL_API_KEY` in all environments
4. Rotate any other potentially affected credentials

## 10. Troubleshooting

### "FIRECRAWL_API_KEY is not set"

**Symptom**: Error when running code
```
Error: FIRECRAWL_API_KEY environment variable is required
```

**Solution**:
1. Ensure `.env` file exists in root of your project
2. Verify `FIRECRAWL_API_KEY=sk_xxx` is set
3. Load with: `require('dotenv').config()`
4. Check that dotenv is installed: `npm install dotenv`

### "Invalid API Key"

**Symptom**: 401 Unauthorized from Firecrawl
```
Error: Unauthorized - Invalid API key
```

**Solution**:
1. Verify key format: should start with `sk_`
2. Copy key directly from [Firecrawl Dashboard](https://www.firecrawl.dev)
3. Check for trailing spaces: `FIRECRAWL_API_KEY=sk_xxx ` (space at end)
4. If still failing, generate a new key in dashboard

### "Rate Limit Exceeded"

**Symptom**: 429 Too Many Requests
```
Error: 429 Too Many Requests - Rate limit exceeded
```

**Solution**:
1. Check your Firecrawl plan (Free: 2 concurrent, 600/month)
2. Reduce `MAX_URLS_PER_DOMAIN` from 100 to 50
3. Implement backoff: increase `RETRY_DELAY_MS` to 2000-5000
4. Upgrade to Pro plan ($25/month) for 50,000 requests

### "Timeout Errors"

**Symptom**: Requests hang then fail
```
Error: Request timeout after 30000ms
```

**Solution**:
1. Increase `REQUEST_TIMEOUT=60000` (60 seconds)
2. Check network connectivity
3. Reduce crawl scope: `MAX_URLS_PER_DOMAIN=50`
4. Check Firecrawl status page for outages

### Tests Not Running

**Symptom**: `npm test` fails with TypeScript errors
```
Error: Cannot find module 'jest' or TypeScript compilation fails
```

**Solution**:
1. Install dependencies: `npm install`
2. Clean build: `rm -rf dist node_modules && npm install`
3. Check Node version: `node --version` (should be 18+)
4. Verify jest config: `npm test -- --showConfig`

## 11. File Structure

```
packages/seo-analysis/
├── src/
│   ├── index.ts              # Main entry point
│   ├── types.ts              # Type definitions
│   ├── crawlers.ts           # Firecrawl integration
│   ├── analysis.ts           # Analysis logic
│   ├── patterns.ts           # Pattern extraction
│   └── __tests__/            # Test files (TBD)
├── dist/                     # Built output (generated)
│   ├── index.js              # CommonJS
│   ├── index.mjs             # ES modules
│   └── index.d.ts            # TypeScript definitions
├── package.json              # Package configuration
├── tsconfig.json             # TypeScript config
├── jest.config.js            # Jest test config
├── .env.example              # Environment template
├── .eslintrc.json            # Linting config
├── .gitignore                # Git ignore rules
├── LICENSE                   # MIT license
├── README.md                 # User documentation
├── DEPENDENCIES.md           # Detailed dependency analysis
└── SETUP_GUIDE.md           # This file
```

## 12. Next Steps for Phase 2

Once setup is complete:

1. **Implement Crawlers**
   - Integrate Firecrawl SDK in `src/crawlers.ts`
   - Support bulk URL crawling
   - Implement caching strategy

2. **Implement Analysis**
   - Add pattern extraction in `src/patterns.ts`
   - Implement competitor comparison
   - Generate recommendations

3. **Add Tests**
   - Unit tests for each module
   - Integration tests with Firecrawl API
   - Mocks for development

4. **Documentation**
   - API documentation
   - Usage examples
   - Architecture decisions

## 13. Getting Help

- **Firecrawl Issues**: [GitHub Discussions](https://github.com/firecrawl/firecrawl/discussions)
- **Package Issues**: Claude Flow Novice GitHub Issues
- **TypeScript Help**: [TypeScript Docs](https://www.typescriptlang.org/docs/)
- **Jest Testing**: [Jest Docs](https://jestjs.io/docs/getting-started)

## 14. Support

For issues or questions:
1. Check this guide first
2. Review `DEPENDENCIES.md` for architecture
3. Check existing GitHub issues
4. Create new issue with reproduction steps
