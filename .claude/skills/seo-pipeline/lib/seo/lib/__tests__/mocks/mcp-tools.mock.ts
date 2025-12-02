/**
 * MCP Tools Mock for Testing
 *
 * @module planning/seo/lib/__tests__/mocks/mcp-tools.mock
 * @description Mock implementations of WebSearch and WebFetch MCP tools
 */

/**
 * Mock WebSearch result structure
 */
export interface MockWebSearchResult {
  results: Array<{
    title: string;
    url: string;
    description?: string;
    snippet?: string;
    position?: number;
    features?: string[];
  }>;
}

/**
 * Mock WebFetch result structure
 */
export interface MockWebFetchResult {
  url: string;
  title: string;
  content?: string;
  text?: string;
  html?: string;
  statusCode: number;
}

/**
 * Default mock WebSearch implementation
 * Returns realistic SERP data
 */
export const createMockWebSearchResult = (overrides?: Partial<MockWebSearchResult>): MockWebSearchResult => {
  return {
    results: [
      {
        title: 'TypeScript Utility Types | Official Handbook',
        url: 'https://www.typescriptlang.org/docs/handbook/utility-types.html',
        description: 'TypeScript provides several utility types to facilitate common type transformations.',
        position: 1,
        features: ['featured-snippet']
      },
      {
        title: 'Advanced TypeScript Types Cheat Sheet',
        url: 'https://www.sitepen.com/blog/advanced-typescript-types-cheat-sheet',
        snippet: 'A comprehensive guide to advanced TypeScript types and patterns.',
        position: 2
      },
      {
        title: 'TypeScript Deep Dive - Utility Types',
        url: 'https://basarat.gitbook.io/typescript/type-system/utility-types',
        description: 'Deep dive into TypeScript utility types with examples.',
        position: 3
      }
    ],
    ...overrides
  };
};

/**
 * Default mock WebFetch implementation
 * Returns realistic page content
 */
export const createMockWebFetchResult = (overrides?: Partial<MockWebFetchResult>): MockWebFetchResult => {
  return {
    url: 'https://www.typescriptlang.org/docs/handbook/utility-types.html',
    title: 'TypeScript Utility Types | Official Handbook',
    content: 'TypeScript provides several utility types to facilitate common type transformations. These utilities are available globally. Partial<Type>, Required<Type>, Readonly<Type>, Record<Keys, Type>, Pick<Type, Keys>, Omit<Type, Keys>.',
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <title>TypeScript Utility Types | Official Handbook</title>
        </head>
        <body>
          <h1>Utility Types</h1>
          <h2>Partial&lt;Type&gt;</h2>
          <p>Constructs a type with all properties of Type set to optional.</p>
          <h2>Required&lt;Type&gt;</h2>
          <p>Constructs a type with all properties of Type set to required.</p>
          <h3>Example</h3>
          <p>Here is an example of using Required.</p>
          <a href="/docs">Internal Link</a>
          <a href="https://example.com">External Link</a>
          <img src="logo.png" alt="Logo" />
          <script type="application/ld+json">
            {"@type": "Article", "headline": "Utility Types"}
          </script>
        </body>
      </html>
    `,
    statusCode: 200,
    ...overrides
  };
};

/**
 * Mock WebSearch function (returns Promise)
 * Note: jest is available in test environment
 */
export const mockWebSearch = (query: string, options?: Record<string, unknown>) => {
  return Promise.resolve(createMockWebSearchResult());
};

/**
 * Mock WebFetch function (returns Promise)
 * Note: jest is available in test environment
 */
export const mockWebFetch = (url: string, options?: Record<string, unknown>) => {
  return Promise.resolve(createMockWebFetchResult({ url }));
};

/**
 * Mock factory for empty SERP results
 */
export const createEmptyWebSearchResult = (): MockWebSearchResult => ({
  results: []
});

/**
 * Mock factory for failed WebFetch (404)
 */
export const createFailedWebFetchResult = (url: string): MockWebFetchResult => ({
  url,
  title: 'Not Found',
  content: '',
  html: '<html><body><h1>404 Not Found</h1></body></html>',
  statusCode: 404
});

/**
 * Mock factory for rate limited response
 */
export const createRateLimitedWebSearchError = () => {
  const error = new Error('Rate limit exceeded');
  (error as any).code = 'RATE_LIMIT_EXCEEDED';
  return error;
};

/**
 * Mock factory for timeout error
 */
export const createTimeoutError = () => {
  const error = new Error('Request timeout');
  (error as any).code = 'TIMEOUT_ERROR';
  return error;
};

/**
 * Reset all mocks to default state
 * Note: This is a placeholder for test environment
 */
export const resetMockTools = () => {
  // Reset logic handled by Jest in test environment
};
