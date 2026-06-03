import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Source uses NodeNext-style ".js" import specifiers; map them to ".ts".
  resolve: {
    extensionAlias: { '.js': ['.ts', '.js'] },
  },
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
  },
});
