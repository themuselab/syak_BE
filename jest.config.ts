import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts', '**/*.test.ts'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/server.ts',
    '!src/**/*.d.ts',
    '!src/app/composition-root.ts',
    '!src/**/infrastructure/**',   // DB/외부 의존 — E2E에서 검증
    '!src/**/*.routes.ts',         // 라우팅 배선 — E2E에서 검증
    '!src/shared/lib/database.ts',           // pg Pool 설정 — E2E에서 검증
    '!src/shared/lib/slotListener.ts',       // pg LISTEN 인프라 — 별도 mock 테스트 존재
    '!src/shared/middleware/httpLogger.middleware.ts', // pino-http 설정
    '!src/app/router.ts',                    // 라우트 배선 — E2E에서 검증
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
};

export default config;
