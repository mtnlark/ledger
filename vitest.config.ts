import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
	plugins: [svelte({ hot: !process.env.VITEST })],
	test: {
		include: ['src/**/*.{test,spec}.{js,ts}'],
		environment: 'jsdom',
		globals: true,
		setupFiles: ['src/tests/setup.ts'],
		coverage: {
			provider: 'v8',
			reporter: ['text', 'html', 'lcov'],
			exclude: [
				'node_modules/**',
				'src-tauri/**',
				'src/tests/**',
				'**/*.d.ts',
				'**/*.config.*',
				'**/types.ts',
				'src/lib/components/**/*.svelte',
				'src/routes/**'
			],
			thresholds: {
				statements: 60,
				branches: 55,
				functions: 60,
				lines: 60
			}
		}
	},
	resolve: {
		// Resolve Svelte's client build so rendered component tests can mount
		conditions: ['browser'],
		alias: {
			$lib: '/src/lib',
			'$app/navigation': '/src/tests/__mocks__/$app/navigation.ts',
			'$app/stores': '/src/tests/__mocks__/$app/stores.ts'
		}
	}
});
