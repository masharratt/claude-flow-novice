/**
 * Babel configuration for Jest
 * Handles ES module transformation for .js test files
 */

module.exports = {
  presets: [
    [
      '@babel/preset-env',
      {
        targets: {
          node: 'current',
        },
        modules: 'auto', // Let Babel decide based on environment
      },
    ],
  ],
  plugins: [
    // Enable dynamic imports
    '@babel/plugin-syntax-dynamic-import',
    // Handle import.meta
    '@babel/plugin-syntax-import-meta',
  ],
  env: {
    test: {
      presets: [
        [
          '@babel/preset-env',
          {
            targets: {
              node: 'current',
            },
            modules: 'commonjs', // Transform to CommonJS for Jest
          },
        ],
      ],
    },
  },
};
