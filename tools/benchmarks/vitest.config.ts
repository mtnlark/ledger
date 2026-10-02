import config from '../../vitest.config';
import { defineConfig } from 'vitest/config';
export default defineConfig({ ...config, test: { ...config.test, include: ['tools/benchmarks/audit.benchmark.ts'], silent: false, reporters: ['verbose'] } });
