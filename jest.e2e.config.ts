import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/e2e'],
  testMatch: ['**/*.e2e.test.ts'],
  testTimeout: 30000,
  forceExit: true,
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
};

export default config;
