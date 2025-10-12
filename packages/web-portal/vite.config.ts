import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src/client'),
      '@shared': path.resolve(__dirname, './src/shared'),
      '@components': path.resolve(__dirname, '../web-components/src'),
    }
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/__tests__/setup.ts',
    testTimeout: 15000,
    hookTimeout: 10000,
    teardownTimeout: 10000,
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
        isolate: true
      }
    },
    maxConcurrency: 1,
    fileParallelism: false,
    sequence: {
      shuffle: false,
      concurrent: false
    },
    bail: false,
    isolate: true,
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.{idea,git,cache,output,temp}/**',
      '**/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build}.config.*',
      '**/src/__tests__/e2e/**/*.spec.ts'
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/**',
        'dist/**',
        '**/*.d.ts',
        '**/*.config.*',
        '**/mocks/**',
        '**/__tests__/**'
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80
      }
    }
  },
  server: {
    port: 3001,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true
      },
      '/socket.io': {
        target: 'http://localhost:3000',
        ws: true
      }
    }
  },
  build: {
    outDir: 'dist/client',
    sourcemap: process.env.NODE_ENV === 'production' ? 'hidden' : true,
    target: 'es2020',
    minify: 'esbuild',
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          // Vendor chunk for core React dependencies
          if (id.includes('node_modules/react') ||
              id.includes('node_modules/react-dom') ||
              id.includes('node_modules/react-router-dom')) {
            return 'vendor';
          }
          // MUI chunk for Material UI components
          if (id.includes('node_modules/@mui') ||
              id.includes('node_modules/@emotion')) {
            return 'mui';
          }
          // Charts chunk for visualization libraries
          if (id.includes('node_modules/recharts') ||
              id.includes('node_modules/chart.js')) {
            return 'charts';
          }
          // Socket.io chunk for real-time communication
          if (id.includes('node_modules/socket.io-client')) {
            return 'socket';
          }
          // Editor chunk for Monaco editor
          if (id.includes('node_modules/monaco-editor') ||
              id.includes('node_modules/@monaco-editor')) {
            return 'editor';
          }
          // Utilities chunk for lodash and date-fns
          if (id.includes('node_modules/lodash') ||
              id.includes('node_modules/date-fns')) {
            return 'utils';
          }
        },
        assetFileNames: (assetInfo) => {
          const info = assetInfo.name.split('.');
          let extType = info[info.length - 1];
          if (/png|jpe?g|svg|gif|tiff|bmp|ico/i.test(extType)) {
            return `assets/images/[name]-[hash][extname]`;
          } else if (/woff|woff2|eot|ttf|otf/i.test(extType)) {
            return `assets/fonts/[name]-[hash][extname]`;
          }
          return `assets/[name]-[hash][extname]`;
        },
        chunkFileNames: 'js/[name]-[hash].js',
        entryFileNames: 'js/[name]-[hash].js',
      },
    },
    cssCodeSplit: true,
    assetsInlineLimit: 4096, // Inline assets smaller than 4kb
    reportCompressedSize: false, // Faster builds
  },
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      '@mui/material',
      'recharts'
    ]
  }
});
