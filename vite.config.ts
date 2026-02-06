import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	server: {
		port: 5174
	},
	plugins: [tailwindcss(), sveltekit()],
	build: {
		rollupOptions: {
			output: {
				manualChunks(id) {
					if (id.includes('node_modules/chart.js') || id.includes('node_modules/chartjs-plugin-annotation')) {
						return 'chart';
					}
					if (id.includes('node_modules/xlsx')) {
						return 'excel';
					}
					if (id.includes('node_modules/dexie')) {
						return 'db';
					}
				}
			}
		}
	}
});
