module.exports = {
  testEnvironment: 'node',
  coveragePathIgnorePatterns: ['/node_modules/'],
  testMatch: ['**/tests/**/*.test.js'],
  setupFiles: ['<rootDir>/tests/setup/testEnv.js'],
  verbose: true,
  forceExit: true,
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true,
  testTimeout: 10000,
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/server.js',
    '!src/config/**',
  ],
  // Transform ESM packages that Jest can't handle by default
  transformIgnorePatterns: [
    '/node_modules/(?!(uuid)/)',
  ],
  transform: {
    '^.+\\.(js|jsx)$': 'babel-jest',
  },
};
