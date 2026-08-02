import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Tests open their own in-memory databases; nothing shared, so they can run
    // in parallel without interfering.
    isolate: true,
    // node:sqlite is still flagged experimental and announces itself on every
    // worker. The status is recorded in DECISIONS.md rather than hidden; this
    // only keeps it out of the test output.
    execArgv: ['--disable-warning=ExperimentalWarning'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.ts'],
      // index.ts binds a port and installs signal handlers, so it is exercised
      // by running the server rather than by a unit test. Everything it calls
      // is covered directly.
      exclude: ['src/index.ts', 'src/test/**', 'src/**/*.test.ts'],
    },
  },
});
