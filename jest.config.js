module.exports = {
  projects: [
    {
      displayName: 'node',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/src/**/*.test.ts'],
      testPathIgnorePatterns: ['<rootDir>/src/utils/domHelpers.test.ts'],
      moduleNameMapper: { '^obsidian$': '<rootDir>/__mocks__/obsidian.ts' },
      transform: { '^.+\\.ts$': 'ts-jest' },
      clearMocks: true
    },
    {
      displayName: 'jsdom',
      testEnvironment: 'jsdom',
      testMatch: ['<rootDir>/src/utils/domHelpers.test.ts', '<rootDir>/src/views/**/*.test.ts'],
      moduleNameMapper: { '^obsidian$': '<rootDir>/__mocks__/obsidian.ts' },
      setupFiles: ['<rootDir>/jest.setup-jsdom.ts'],
      transform: { '^.+\\.ts$': 'ts-jest' },
      clearMocks: true
    }
  ]
};
