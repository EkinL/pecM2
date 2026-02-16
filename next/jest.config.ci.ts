import type { Config } from 'jest';
import baseConfig from './jest.config';

const config: Config = {
  ...baseConfig,
  watch: false,
  watchAll: false,
  bail: 1,
  maxWorkers: '50%',
  collectCoverage: true,
  coverageReporters: ['json', 'lcov', 'text', 'text-summary', 'html'],
  coverageDirectory: 'coverage',
};

export default config;
